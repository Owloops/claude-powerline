import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { debug } from "../utils/logger";
import type { ClaudeHookData } from "../utils/claude";

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const BETA_HEADER = "oauth-2025-04-20";
const CACHE_TTL_MS = 30_000;

export interface RateLimitsInfo {
  session?: {
    usedPercentage: number;
    resetsAt: string | null;
  };
  weekly?: {
    usedPercentage: number;
    resetsAt: string | null;
  };
  extraUsage?: {
    enabled: boolean;
    usedDollars: number;
    limitDollars: number;
    currency: string;
  };
}

interface OAuthUsageResponse {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number;
    used_credits?: number;
    utilization?: number;
    currency?: string;
  };
}

interface CredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    rateLimitTier?: string;
  };
}

interface CacheEntry {
  data: RateLimitsInfo;
  timestamp: number;
}

export class RateLimitsProvider {
  private static readonly cacheDir = join(tmpdir(), "claude-powerline");
  private static readonly cacheFile = join(
    RateLimitsProvider.cacheDir,
    "rate-limits-cache.json",
  );

  async getRateLimitsInfo(
    hookData: ClaudeHookData,
  ): Promise<RateLimitsInfo | null> {
    if (hookData.rate_limits) {
      const rl = hookData.rate_limits;
      return {
        session: rl.session
          ? {
              usedPercentage: rl.session.used_percentage,
              resetsAt: rl.session.resets_at,
            }
          : undefined,
        weekly: rl.weekly
          ? {
              usedPercentage: rl.weekly.used_percentage,
              resetsAt: rl.weekly.resets_at,
            }
          : undefined,
      };
    }

    return this.fetchFromOAuthAPI();
  }

  private async fetchFromOAuthAPI(): Promise<RateLimitsInfo | null> {
    const cached = await this.readCache();
    if (cached) return cached;

    const token = await this.loadAccessToken();
    if (!token) {
      debug("No OAuth access token found");
      return null;
    }

    try {
      const response = await fetch(USAGE_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "anthropic-beta": BETA_HEADER,
          "User-Agent": "claude-powerline",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        debug(
          `OAuth usage API returned ${response.status}: ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as OAuthUsageResponse;
      const info = this.parseUsageResponse(data);
      await this.writeCache(info);
      return info;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debug(`Failed to fetch OAuth usage: ${msg}`);
      return null;
    }
  }

  private parseUsageResponse(data: OAuthUsageResponse): RateLimitsInfo {
    const info: RateLimitsInfo = {};

    if (data.five_hour?.utilization !== undefined) {
      info.session = {
        usedPercentage: data.five_hour.utilization,
        resetsAt: data.five_hour.resets_at ?? null,
      };
    }

    if (data.seven_day?.utilization !== undefined) {
      info.weekly = {
        usedPercentage: data.seven_day.utilization,
        resetsAt: data.seven_day.resets_at ?? null,
      };
    }

    if (data.extra_usage?.is_enabled) {
      const usedCents = data.extra_usage.used_credits ?? 0;
      const limitCents = data.extra_usage.monthly_limit ?? 0;
      info.extraUsage = {
        enabled: true,
        usedDollars: usedCents / 100,
        limitDollars: limitCents / 100,
        currency: data.extra_usage.currency?.trim() || "USD",
      };
    }

    return info;
  }

  private async loadAccessToken(): Promise<string | null> {
    const credentialsPath = join(homedir(), ".claude", ".credentials.json");
    if (existsSync(credentialsPath)) {
      try {
        const content = await readFile(credentialsPath, "utf-8");
        const creds = JSON.parse(content) as CredentialsFile;
        const token = creds.claudeAiOauth?.accessToken;
        if (token) return token;
      } catch (err) {
        debug(`Failed to read credentials file: ${err}`);
      }
    }

    try {
      const token = await this.readFromKeychain();
      if (token) return token;
    } catch (err) {
      debug(`Failed to read from keychain: ${err}`);
    }

    return null;
  }

  private readFromKeychain(): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve(null);
            return;
          }
          try {
            const creds = JSON.parse(stdout.trim()) as CredentialsFile;
            resolve(creds.claudeAiOauth?.accessToken ?? null);
          } catch {
            resolve(null);
          }
        },
      );
    });
  }

  private async readCache(): Promise<RateLimitsInfo | null> {
    try {
      if (!existsSync(RateLimitsProvider.cacheFile)) return null;

      const content = await readFile(RateLimitsProvider.cacheFile, "utf-8");
      const entry = JSON.parse(content) as CacheEntry;

      if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;

      return entry.data;
    } catch {
      return null;
    }
  }

  private async writeCache(data: RateLimitsInfo): Promise<void> {
    try {
      if (!existsSync(RateLimitsProvider.cacheDir)) {
        await mkdir(RateLimitsProvider.cacheDir, { recursive: true });
      }

      const entry: CacheEntry = { data, timestamp: Date.now() };
      await writeFile(
        RateLimitsProvider.cacheFile,
        JSON.stringify(entry),
        "utf-8",
      );
    } catch (err) {
      debug(`Failed to write rate limits cache: ${err}`);
    }
  }
}
