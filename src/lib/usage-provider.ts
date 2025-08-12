import {
  loadSessionUsageById,
  loadDailyUsageData,
  loadSessionBlockData,
  getClaudePaths,
} from "ccusage/data-loader";
import { calculateTotals, getTotalTokens } from "ccusage/calculate-cost";
import { logger } from "ccusage/logger";

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface SessionBlockInfo {
  cost: number;
  tokens: number;
  timeRemaining: number;
  burnRate: number | null;
  tokenBurnRate: number | null;
  isActive: boolean;
  tokenLimit: number;
}

export interface UsageInfo {
  session: {
    cost: number | null;
    tokens: number | null;
    tokenBreakdown: TokenBreakdown | null;
  };
  daily: {
    cost: number;
    tokens: number;
    tokenBreakdown: TokenBreakdown | null;
  };
}

export class UsageProvider {
  async getSessionBlockInfo(): Promise<SessionBlockInfo | null> {
    const originalLevel = logger.level;
    logger.level = 0;

    try {
      const blocks = await loadSessionBlockData({
        mode: "auto",
        sessionDurationHours: 5,
      });

      const activeBlock = blocks.find((block) => block.isActive);

      if (!activeBlock) {
        return null;
      }

      const now = new Date();
      const timeRemaining = Math.round(
        (activeBlock.endTime.getTime() - now.getTime()) / (1000 * 60)
      );

      const elapsed = Math.round(
        (now.getTime() - activeBlock.startTime.getTime()) / (1000 * 60)
      );

      const totalTokens =
        (activeBlock.tokenCounts?.inputTokens || 0) +
        (activeBlock.tokenCounts?.outputTokens || 0) +
        (activeBlock.tokenCounts?.cacheCreationInputTokens || 0) +
        (activeBlock.tokenCounts?.cacheReadInputTokens || 0);

      const burnRate =
        elapsed > 0 ? (activeBlock.costUSD / elapsed) * 60 : null;
      const tokenBurnRate = elapsed > 0 ? (totalTokens / elapsed) * 60 : null;

      return {
        cost: activeBlock.costUSD,
        tokens: totalTokens,
        timeRemaining: Math.max(0, timeRemaining),
        burnRate,
        tokenBurnRate,
        isActive: true,
        tokenLimit: activeBlock.tokenLimit || 18477345, // fallback to typical daily limit
      };
    } catch {
      return null;
    } finally {
      logger.level = originalLevel;
    }
  }

  async getUsageInfo(sessionId: string): Promise<UsageInfo> {
    const originalLevel = logger.level;
    logger.level = 0;

    try {
      const claudePaths = getClaudePaths();
      if (claudePaths.length === 0) {
        return {
          session: { cost: null, tokens: null, tokenBreakdown: null },
          daily: { cost: 0, tokens: 0, tokenBreakdown: null },
        };
      }

      const [sessionData, dailyData] = await Promise.all([
        this.getSessionData(sessionId),
        this.getDailyData(),
      ]);

      return {
        session: sessionData,
        daily: dailyData,
      };
    } catch {
      return {
        session: { cost: null, tokens: null, tokenBreakdown: null },
        daily: { cost: 0, tokens: 0, tokenBreakdown: null },
      };
    } finally {
      logger.level = originalLevel;
    }
  }

  private async getSessionData(sessionId: string) {
    try {
      const sessionData = await loadSessionUsageById(sessionId, {
        mode: "auto",
      });

      if (!sessionData) {
        return { cost: null, tokens: null, tokenBreakdown: null };
      }

      const breakdown = sessionData.entries.reduce(
        (acc, entry) => {
          const usage = entry.message.usage;
          return {
            input: acc.input + usage.input_tokens,
            output: acc.output + usage.output_tokens,
            cacheCreation:
              acc.cacheCreation + (usage.cache_creation_input_tokens || 0),
            cacheRead: acc.cacheRead + (usage.cache_read_input_tokens || 0),
          };
        },
        { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
      );

      const totalTokens =
        breakdown.input +
        breakdown.output +
        breakdown.cacheCreation +
        breakdown.cacheRead;

      return {
        cost: sessionData.totalCost,
        tokens: totalTokens,
        tokenBreakdown: breakdown,
      };
    } catch {
      return { cost: null, tokens: null, tokenBreakdown: null };
    }
  }

  private async getDailyData() {
    try {
      const today = new Date();
      const todayStr =
        today.toISOString().split("T")[0]?.replace(/-/g, "") ?? "";

      const dailyData = await loadDailyUsageData({
        since: todayStr,
        until: todayStr,
        mode: "auto",
      });

      if (dailyData.length === 0) {
        return { cost: 0, tokens: 0, tokenBreakdown: null };
      }

      const totals = calculateTotals(dailyData);
      const breakdown = dailyData.reduce(
        (acc, entry) => {
          return {
            input: acc.input + (entry.inputTokens || 0),
            output: acc.output + (entry.outputTokens || 0),
            cacheCreation: acc.cacheCreation + (entry.cacheCreationTokens || 0),
            cacheRead: acc.cacheRead + (entry.cacheReadTokens || 0),
          };
        },
        { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
      );

      return {
        cost: totals.totalCost,
        tokens: getTotalTokens(totals),
        tokenBreakdown: breakdown,
      };
    } catch {
      return { cost: 0, tokens: 0, tokenBreakdown: null };
    }
  }
}
