import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { debug } from "./logger";
import {
  getClaudePaths,
  findProjectPaths,
  collectProjectFiles,
} from "./claude";
import { formatLocalDate } from "./formatters";

interface ErrnoError extends Error {
  code?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  /** Day caches only: the local time zone the day was bucketed in. */
  timeZone?: string;
  /** Day caches only: false while the day is still accumulating. */
  complete?: boolean;
}

/**
 * Longer than the widest usage window (a calendar month plus one day of scan
 * slack), so a cached day is never rebuilt while it can still be shown.
 */
const DAY_CACHE_RETENTION_DAYS = 45;
const DAY_CACHE_FILE = /^day-(\d{4}-\d{2}-\d{2})\.json$/;

export class CacheManager {
  /** Resolved on every access so tests can point it at a temporary directory. */
  private static get CACHE_DIR(): string {
    return (
      process.env.CLAUDE_POWERLINE_CACHE_DIR ||
      path.join(homedir(), ".claude", "powerline")
    );
  }
  private static get USAGE_CACHE_DIR(): string {
    return path.join(this.CACHE_DIR, "usage");
  }
  private static get LOCKS_DIR(): string {
    return path.join(this.CACHE_DIR, "locks");
  }

  private static isLocked(name: string): boolean {
    const lockFile = path.join(this.LOCKS_DIR, name);
    if (!fs.existsSync(lockFile)) {
      return false;
    }

    try {
      const lockContent = fs.readFileSync(lockFile, "utf-8");
      const pid = parseInt(lockContent.trim(), 10);

      if (isNaN(pid)) {
        debug(`Invalid PID in lock file ${name}, removing stale lock`);
        fs.unlinkSync(lockFile);
        return false;
      }

      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if ((error as ErrnoError).code === "ESRCH") {
          debug(`Removing stale lock file ${name} for dead process ${pid}`);
          fs.unlinkSync(lockFile);
          return false;
        }
        debug(`Error checking process ${pid} for lock ${name}:`, error);
        return true;
      }
    } catch (error) {
      debug(`Error reading lock file ${name}:`, error);
      return true;
    }
  }

  private static async acquireLock(
    name: string,
    timeout = 5000,
  ): Promise<boolean> {
    const RETRY_DELAY_MS = 50;
    const FILE_CREATE_FLAG = "wx";

    await this.ensureCacheDirectories();
    const lockFile = path.join(this.LOCKS_DIR, name);
    const startTime = Date.now();
    const lockContent = String(process.pid);

    while (Date.now() - startTime < timeout) {
      try {
        await fs.promises.writeFile(lockFile, lockContent, {
          flag: FILE_CREATE_FLAG,
        });
        debug(`Lock acquired for ${name}`);
        return true;
      } catch (error) {
        if ((error as ErrnoError).code === "EEXIST") {
          await setTimeout(RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }
    debug(`Failed to acquire lock for ${name} within ${timeout}ms`);
    return false;
  }

  private static async releaseLock(name: string): Promise<void> {
    const lockFile = path.join(this.LOCKS_DIR, name);
    try {
      await fs.promises.unlink(lockFile);
      debug(`Lock released for ${name}`);
    } catch (error) {
      if ((error as ErrnoError).code !== "ENOENT") {
        debug(`Error releasing lock for ${name}:`, error);
      }
    }
  }

  static async ensureCacheDirectories(): Promise<void> {
    try {
      await Promise.all([
        fs.promises.mkdir(this.CACHE_DIR, { recursive: true }),
        fs.promises.mkdir(this.USAGE_CACHE_DIR, { recursive: true }),
        fs.promises.mkdir(this.LOCKS_DIR, { recursive: true }),
      ]);
    } catch (error) {
      debug("Failed to create cache directories:", error);
    }
  }

  static createProjectHash(projectPath: string): string {
    return createHash("md5").update(projectPath).digest("hex").substring(0, 8);
  }

  /**
   * Reads `<name>.json` from the usage cache directory. A missing directory or
   * file is an ordinary miss, so nothing is created on the read path.
   */
  private static async readUsageCache(
    name: string,
    isValid: (entry: CacheEntry<unknown>) => boolean,
  ): Promise<unknown> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 75;

    const cachePath = path.join(this.USAGE_CACHE_DIR, `${name}.json`);
    const lockName = `${name}.usage.lock`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this.isLocked(lockName)) {
        debug(`Cache for ${name} is locked, waiting...`);
        await setTimeout(RETRY_DELAY_MS);
        continue;
      }

      try {
        const content = await fs.promises.readFile(cachePath, "utf-8");
        const cached: CacheEntry<unknown> = JSON.parse(content);

        if (isValid(cached)) {
          debug(`[CACHE-HIT] ${name} disk cache: found`);
          return this.deserializeDates(cached.data);
        }
        debug(`${name} cache outdated`);
        return null;
      } catch (error) {
        if ((error as ErrnoError).code === "ENOENT") {
          debug(`No ${name} usage cache found`);
          return null;
        }
        debug(
          `Attempt ${attempt + 1} failed to read ${name} cache: ${(error as Error).message}. Retrying...`,
        );
        await setTimeout(RETRY_DELAY_MS);
      }
    }

    debug(`Failed to read ${name} cache after ${MAX_RETRIES} attempts.`);
    return null;
  }

  private static async writeUsageCache(
    name: string,
    entry: CacheEntry<unknown>,
  ): Promise<void> {
    const lockName = `${name}.usage.lock`;
    if (!(await this.acquireLock(lockName))) {
      debug(`Could not acquire lock to set usage cache for ${name}`);
      return;
    }

    try {
      const cachePath = path.join(this.USAGE_CACHE_DIR, `${name}.json`);
      await fs.promises.writeFile(cachePath, JSON.stringify(entry), "utf-8");
      debug(`[CACHE-SET] ${name} disk cache stored`);
    } catch (error) {
      debug(`Failed to save ${name} usage cache:`, error);
    } finally {
      await this.releaseLock(lockName);
    }
  }

  private static deserializeDates(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }));
    }
    return data;
  }

  static getUsageCache(
    cacheType: "block" | "pricing",
    latestMtime?: number,
  ): Promise<unknown> {
    return this.readUsageCache(
      cacheType,
      (entry) => !latestMtime || entry.timestamp >= latestMtime,
    );
  }

  static setUsageCache(
    cacheType: "block" | "pricing",
    data: unknown,
    latestMtime?: number,
  ): Promise<void> {
    return this.writeUsageCache(cacheType, {
      data,
      timestamp: latestMtime || Date.now(),
    });
  }

  /**
   * Usage totals for one local calendar day. Pass `latestMtime` for the
   * current day: the entry is valid while no transcript is newer. Omit it for
   * a completed day: the entry is valid only if it was written after the day
   * ended, so a total captured mid-day is never mistaken for the whole day.
   * A time zone mismatch always invalidates, because the day boundaries move.
   */
  static getDayUsageCache(
    dateStr: string,
    timeZone: string,
    latestMtime?: number,
  ): Promise<unknown> {
    return this.readUsageCache(`day-${dateStr}`, (entry) => {
      if (entry.timeZone !== timeZone) return false;
      return latestMtime === undefined
        ? entry.complete === true
        : entry.timestamp >= latestMtime;
    });
  }

  static async setDayUsageCache(
    dateStr: string,
    data: unknown,
    timeZone: string,
    latestMtime?: number,
  ): Promise<void> {
    const complete = latestMtime === undefined;
    await this.writeUsageCache(`day-${dateStr}`, {
      data,
      timestamp: latestMtime ?? Date.now(),
      timeZone,
      complete,
    });
    if (complete) await this.pruneDayUsageCache();
  }

  private static async pruneDayUsageCache(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAY_CACHE_RETENTION_DAYS);
    const cutoffDateStr = formatLocalDate(cutoff);

    try {
      const files = await fs.promises.readdir(this.USAGE_CACHE_DIR);
      const stale = files.filter((file) => {
        const dateStr = DAY_CACHE_FILE.exec(file)?.[1];
        return dateStr !== undefined && dateStr < cutoffDateStr;
      });

      await Promise.all(
        stale.map((file) =>
          fs.promises.unlink(path.join(this.USAGE_CACHE_DIR, file)),
        ),
      );
      if (stale.length > 0) {
        debug(`Pruned ${stale.length} day usage cache file(s)`);
      }
    } catch (error) {
      debug("Failed to prune day usage cache:", error);
    }
  }

  /**
   * Newest mtime across every transcript the cost segments read. It must cover
   * the same files as collectProjectFiles: when it saw only top-level session
   * transcripts, agent usage could land without moving this timestamp, so the
   * today cache stayed valid while session cost had already grown past it
   * (issue #98).
   */
  static async getLatestTranscriptMtime(): Promise<number> {
    try {
      const claudePaths = getClaudePaths();
      const projectPaths = await findProjectPaths(claudePaths);

      const fileGroups = await Promise.all(
        projectPaths.map((projectPath) => collectProjectFiles(projectPath)),
      );

      return fileGroups
        .flat()
        .reduce((latest, file) => Math.max(latest, file.mtime.getTime()), 0);
    } catch (error) {
      debug("Failed to get latest transcript mtime:", error);
      return Date.now();
    }
  }
}
