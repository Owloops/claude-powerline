import { readFile, stat } from "node:fs/promises";
import { debug } from "../utils/logger";
import type { ClaudeHookData } from "../utils/claude";

export interface CacheTimerInfo {
  elapsedSeconds: number;
  detectedTtlSeconds?: number;
}

interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    type?: string;
    usage?: {
      cache_creation?: {
        ephemeral_1h_input_tokens?: number;
        ephemeral_5m_input_tokens?: number;
      };
    };
  };
}

export class CacheTimerProvider {
  async getCacheTimerInfo(
    hookData: ClaudeHookData,
  ): Promise<CacheTimerInfo | null> {
    const path = hookData?.transcript_path;
    if (!path) {
      debug("CacheTimer: no transcript_path in hookData");
      return null;
    }

    const lines = await this.readTranscriptLines(path);
    const anchor =
      (lines && this.lastUserTimestamp(lines)) ?? (await this.fileMtime(path));
    if (anchor === null) return null;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - anchor) / 1000),
    );
    const detectedTtlSeconds = lines
      ? (this.detectTtlSeconds(lines) ?? undefined)
      : undefined;
    return { elapsedSeconds, detectedTtlSeconds };
  }

  private async readTranscriptLines(path: string): Promise<string[] | null> {
    try {
      const content = await readFile(path, "utf-8");
      return content.split("\n");
    } catch (error) {
      debug(`CacheTimer: readFile failed for ${path}: ${String(error)}`);
      return null;
    }
  }

  private lastUserTimestamp(lines: string[]): number | null {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        const messageType =
          entry.type || entry.message?.role || entry.message?.type;
        if (messageType !== "user") continue;
        if (!entry.timestamp) continue;
        const t = Date.parse(entry.timestamp);
        if (Number.isNaN(t)) continue;
        return t;
      } catch {
        continue;
      }
    }
    return null;
  }

  private detectTtlSeconds(lines: string[]): number | null {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        const role = entry.type || entry.message?.role || entry.message?.type;
        if (role !== "assistant") continue;
        const cc = entry.message?.usage?.cache_creation;
        if (!cc) continue;
        if ((cc.ephemeral_1h_input_tokens ?? 0) > 0) return 3600;
        if ((cc.ephemeral_5m_input_tokens ?? 0) > 0) return 300;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async fileMtime(path: string): Promise<number | null> {
    try {
      const { mtime } = await stat(path);
      return mtime.getTime();
    } catch (error) {
      debug(`CacheTimer: stat failed for ${path}: ${String(error)}`);
      return null;
    }
  }
}
