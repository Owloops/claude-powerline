import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import {
  findTranscriptFile,
  findAgentTranscripts,
  parseJsonlFile,
  type ParsedEntry,
  type ClaudeHookData,
} from "../utils/claude";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

// Burn rate configuration
const BURN_RATE_CONFIG = {
  windowMs: 15 * 60 * 1000,        // 15-minute sliding window
  emaAlpha: 0.3,                    // Smoothing factor (higher = more responsive)
  minWindowEntries: 2,              // Minimum entries for windowed calculation
  minDurationMs: 60000,             // Require at least 1 minute
  staleThresholdMs: 5 * 60 * 1000,  // Reset EMA if >5 minutes between updates
};

// Cache file for cross-process EMA persistence (CODEX-1 FIX)
const EMA_CACHE_DIR = join(homedir(), ".cache", "claude-powerline");
const EMA_CACHE_FILE = join(EMA_CACHE_DIR, "ema-state.json");

interface EmaState {
  previousBurnRate: number | null;
  lastSessionId: string | null;
  lastTimestamp: number;
}

function isValidEmaState(obj: unknown): obj is EmaState {
  if (typeof obj !== 'object' || obj === null) return false;
  const state = obj as Record<string, unknown>;

  // previousBurnRate must be null or a finite number
  if (state.previousBurnRate !== null &&
      (typeof state.previousBurnRate !== 'number' || !isFinite(state.previousBurnRate))) {
    return false;
  }

  // lastSessionId must be null or string
  if (state.lastSessionId !== null && typeof state.lastSessionId !== 'string') {
    return false;
  }

  // lastTimestamp must be a finite number
  if (typeof state.lastTimestamp !== 'number' || !isFinite(state.lastTimestamp)) {
    return false;
  }

  return true;
}

function readEmaState(): EmaState {
  try {
    if (existsSync(EMA_CACHE_FILE)) {
      const data = readFileSync(EMA_CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      // Validate shape to prevent NaN from corrupted cache
      if (isValidEmaState(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted or missing - return defaults
  }
  return { previousBurnRate: null, lastSessionId: null, lastTimestamp: 0 };
}

function writeEmaState(state: EmaState): void {
  try {
    if (!existsSync(EMA_CACHE_DIR)) {
      mkdirSync(EMA_CACHE_DIR, { recursive: true });
    }
    writeFileSync(EMA_CACHE_FILE, JSON.stringify(state), "utf-8");
  } catch {
    // Best effort - don't fail render if cache write fails
  }
}

export interface SessionUsageEntry {
  timestamp: string;
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  costUSD?: number;
}

export interface SessionUsage {
  totalCost: number;
  entries: SessionUsageEntry[];
}

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface SessionInfo {
  cost: number | null;
  calculatedCost: number | null;
  officialCost: number | null;
  tokens: number | null;
  tokenBreakdown: TokenBreakdown | null;
  cacheHitRate: number | null;   // 0-100
  burnRate: number | null;       // $/hour
  isOutputEstimated: boolean;    // true if any entry used output estimation
}

export interface UsageInfo {
  session: SessionInfo;
}

function convertToSessionEntry(entry: ParsedEntry): SessionUsageEntry {
  return {
    timestamp: entry.timestamp.toISOString(),
    message: {
      usage: {
        input_tokens: entry.message?.usage?.input_tokens || 0,
        output_tokens: entry.message?.usage?.output_tokens || 0,
        cache_creation_input_tokens:
          entry.message?.usage?.cache_creation_input_tokens,
        cache_read_input_tokens: entry.message?.usage?.cache_read_input_tokens,
      },
    },
    costUSD: entry.costUSD,
  };
}

export class SessionProvider {
  async getSessionUsage(sessionId: string): Promise<SessionUsage | null> {
    try {
      const transcriptPath = await findTranscriptFile(sessionId);
      if (!transcriptPath) {
        debug(`No transcript found for session: ${sessionId}`);
        return null;
      }

      debug(`Found transcript at: ${transcriptPath}`);

      const parsedEntries = await parseJsonlFile(transcriptPath);
      const projectPath = dirname(transcriptPath);
      const agentTranscripts = await findAgentTranscripts(sessionId, projectPath);

      debug(`Found ${agentTranscripts.length} agent transcripts for session`);

      for (const agentPath of agentTranscripts) {
        const agentEntries = await parseJsonlFile(agentPath);
        parsedEntries.push(...agentEntries);
      }

      if (parsedEntries.length === 0) {
        return { totalCost: 0, entries: [] };
      }

      const entries: SessionUsageEntry[] = [];
      let totalCost = 0;

      for (const entry of parsedEntries) {
        if (entry.message?.usage) {
          const sessionEntry = convertToSessionEntry(entry);

          if (sessionEntry.costUSD !== undefined) {
            totalCost += sessionEntry.costUSD;
          } else {
            const cost = await PricingService.calculateCostForEntry(entry.raw);
            sessionEntry.costUSD = cost;
            totalCost += cost;
          }

          entries.push(sessionEntry);
        }
      }

      debug(
        `Parsed ${entries.length} usage entries, total cost: $${totalCost.toFixed(4)}`
      );
      return { totalCost, entries };
    } catch (error) {
      debug(`Error reading session usage for ${sessionId}:`, error);
      return null;
    }
  }

  calculateTokenBreakdown(entries: SessionUsageEntry[]): TokenBreakdown {
    return entries.reduce(
      (breakdown, entry) => ({
        input: breakdown.input + (entry.message.usage.input_tokens || 0),
        output: breakdown.output + (entry.message.usage.output_tokens || 0),
        cacheCreation:
          breakdown.cacheCreation +
          (entry.message.usage.cache_creation_input_tokens || 0),
        cacheRead:
          breakdown.cacheRead +
          (entry.message.usage.cache_read_input_tokens || 0),
      }),
      { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
    );
  }

  private calculateBurnRate(
    cost: number | null,
    entries: SessionUsageEntry[],
    hookDurationMs?: number,
    sessionId?: string
  ): number | null {
    if (!cost || cost === 0) return null;

    // CODEX-1 FIX: Read state from file (cross-process persistence)
    const emaState = readEmaState();
    const now = Date.now();

    // Reset EMA if session changed or stale
    if (
      sessionId !== emaState.lastSessionId ||
      now - emaState.lastTimestamp > BURN_RATE_CONFIG.staleThresholdMs
    ) {
      emaState.previousBurnRate = null;
      emaState.lastSessionId = sessionId || null;
    }
    emaState.lastTimestamp = now;

    let rawRate: number | null = null;

    // CODEX-5 FIX: Prefer sliding window when entries sufficient, hookDuration as fallback
    if (entries.length >= BURN_RATE_CONFIG.minWindowEntries) {
      // Primary: Sliding window over recent entries
      const windowStart = now - BURN_RATE_CONFIG.windowMs;
      const recentEntries = entries.filter(e => new Date(e.timestamp).getTime() > windowStart);

      if (recentEntries.length >= BURN_RATE_CONFIG.minWindowEntries) {
        // Calculate windowed cost and duration
        const windowCost = recentEntries.reduce((sum, e) => sum + (e.costUSD || 0), 0);
        const windowTimes = recentEntries.map(e => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
        const windowDurationMs = Math.max(
          windowTimes[windowTimes.length - 1]! - windowTimes[0]!,
          BURN_RATE_CONFIG.minDurationMs
        );
        rawRate = windowCost / (windowDurationMs / 3600000);
      } else {
        // Fallback within entries: full duration
        const times = entries.map(e => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
        const durationMs = times[times.length - 1]! - times[0]!;
        if (durationMs >= BURN_RATE_CONFIG.minDurationMs) {
          rawRate = cost / (durationMs / 3600000);
        }
      }
    }

    // Final fallback: hook-provided duration (when timestamps/entries insufficient)
    if (rawRate === null && hookDurationMs && hookDurationMs > 0) {
      rawRate = cost / (hookDurationMs / 3600000);
    }

    if (rawRate === null) return null;

    // Apply EMA smoothing
    if (emaState.previousBurnRate === null) {
      emaState.previousBurnRate = rawRate;
      writeEmaState(emaState);  // CODEX-1 FIX: Persist to file
      return rawRate;
    }

    const smoothedRate = rawRate * BURN_RATE_CONFIG.emaAlpha +
                         emaState.previousBurnRate * (1 - BURN_RATE_CONFIG.emaAlpha);
    emaState.previousBurnRate = smoothedRate;
    writeEmaState(emaState);  // CODEX-1 FIX: Persist to file
    return smoothedRate;
  }

  private calculateCacheHitRate(breakdown: TokenBreakdown): number | null {
    const total = breakdown.input + breakdown.cacheCreation + breakdown.cacheRead;
    if (total === 0) return null;
    return (breakdown.cacheRead / total) * 100;
  }

  async getSessionInfo(
    sessionId: string,
    hookData?: ClaudeHookData
  ): Promise<SessionInfo> {
    const sessionUsage = await this.getSessionUsage(sessionId);

    if (!sessionUsage || sessionUsage.entries.length === 0) {
      return {
        cost: null,
        calculatedCost: null,
        officialCost: null,
        tokens: null,
        tokenBreakdown: null,
        cacheHitRate: null,
        burnRate: null,
        isOutputEstimated: false,
      };
    }

    const tokenBreakdown = this.calculateTokenBreakdown(sessionUsage.entries);
    const totalTokens =
      tokenBreakdown.input +
      tokenBreakdown.output +
      tokenBreakdown.cacheCreation +
      tokenBreakdown.cacheRead;

    const calculatedCost = sessionUsage.totalCost;
    const hookDataCost = hookData?.cost?.total_cost_usd ?? null;
    const cost = calculatedCost ?? hookDataCost;

    const cacheHitRate = this.calculateCacheHitRate(tokenBreakdown);
    const burnRate = this.calculateBurnRate(
      cost,
      sessionUsage.entries,
      hookData?.cost?.total_duration_ms,
      sessionId  // Pass session ID for EMA state management
    );

    return {
      cost,
      calculatedCost,
      officialCost: hookDataCost,
      tokens: totalTokens,
      tokenBreakdown,
      cacheHitRate,
      burnRate,
      isOutputEstimated: false,  // TODO: Track from detailed cost calculation
    };
  }
}

export class UsageProvider {
  private sessionProvider = new SessionProvider();

  async getUsageInfo(
    sessionId: string,
    hookData?: ClaudeHookData
  ): Promise<UsageInfo> {
    try {
      debug(`Starting usage info retrieval for session: ${sessionId}`);

      const sessionInfo = await this.sessionProvider.getSessionInfo(
        sessionId,
        hookData
      );

      return {
        session: sessionInfo,
      };
    } catch (error) {
      debug(`Error getting usage info for session ${sessionId}:`, error);
      return {
        session: {
          cost: null,
          calculatedCost: null,
          officialCost: null,
          tokens: null,
          tokenBreakdown: null,
          cacheHitRate: null,
          burnRate: null,
          isOutputEstimated: false,
        },
      };
    }
  }
}
