import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import {
  findTranscriptFile,
  findAgentTranscripts,
  parseJsonlFile,
  type ParsedEntry,
  type ClaudeHookData,
} from "../utils/claude";
import { dirname } from "node:path";

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
    hookDurationMs?: number
  ): number | null {
    if (!cost || cost === 0) return null;

    // Prefer hook-provided duration
    if (hookDurationMs && hookDurationMs > 0) {
      return cost / (hookDurationMs / 3600000);
    }

    // Fallback: entry timestamps
    if (entries.length < 2) return null;
    const times = entries.map(e => new Date(e.timestamp).getTime()).sort((a,b) => a-b);
    const durationMs = times[times.length-1]! - times[0]!;
    if (durationMs < 60000) return null;  // Require at least 1 minute

    return cost / (durationMs / 3600000);
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
      hookData?.cost?.total_duration_ms
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
