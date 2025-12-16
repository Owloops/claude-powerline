import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { loadEntriesFromProjects, type ParsedEntry } from "../utils/claude";
import { getRealtimeUsage } from "../utils/oauth";

export interface UsageEntry {
  timestamp: Date;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  costUSD: number;
  model: string;
}

export interface BlockInfo {
  cost: number | null;
  tokens: number | null;
  weightedTokens: number | null;
  timeRemaining: number | null;
  burnRate: number | null;
  tokenBurnRate: number | null;
  realtimePercentUsed: number | null;  // From OAuth API when in realtime mode
  realtimeResetAt: Date | null;        // Reset time from OAuth API
  isRealtime: boolean;                 // Whether data came from realtime API
}

function getModelRateLimitWeight(model: string): number {
  if (model.includes("opus")) return 5;
  if (model.includes("sonnet")) return 1;
  if (model.includes("haiku")) return 1;
  return 1;
}

function convertToUsageEntry(entry: ParsedEntry): UsageEntry {
  return {
    timestamp: entry.timestamp,
    usage: {
      inputTokens: entry.message?.usage?.input_tokens || 0,
      outputTokens: entry.message?.usage?.output_tokens || 0,
      cacheCreationInputTokens:
        entry.message?.usage?.cache_creation_input_tokens || 0,
      cacheReadInputTokens: entry.message?.usage?.cache_read_input_tokens || 0,
    },
    costUSD: entry.costUSD || 0,
    model: entry.message?.model || "unknown",
  };
}

export class BlockProvider {
  private readonly sessionDurationHours = 5;

  private floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
  }

  private identifySessionBlocks(entries: UsageEntry[]): UsageEntry[][] {
    if (entries.length === 0) return [];

    const sessionDurationMs = this.sessionDurationHours * 60 * 60 * 1000;
    const blocks: UsageEntry[][] = [];
    const sortedEntries = [...entries].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    let currentBlockStart: Date | null = null;
    let currentBlockEntries: UsageEntry[] = [];

    for (const entry of sortedEntries) {
      const entryTime = entry.timestamp;

      if (currentBlockStart == null) {
        currentBlockStart = this.floorToHour(entryTime);
        currentBlockEntries = [entry];
      } else {
        const timeSinceBlockStart =
          entryTime.getTime() - currentBlockStart.getTime();
        const lastEntry = currentBlockEntries[currentBlockEntries.length - 1];
        if (lastEntry == null) {
          continue;
        }
        const lastEntryTime = lastEntry.timestamp;
        const timeSinceLastEntry =
          entryTime.getTime() - lastEntryTime.getTime();

        if (
          timeSinceBlockStart > sessionDurationMs ||
          timeSinceLastEntry > sessionDurationMs
        ) {
          blocks.push(currentBlockEntries);

          currentBlockStart = this.floorToHour(entryTime);
          currentBlockEntries = [entry];
        } else {
          currentBlockEntries.push(entry);
        }
      }
    }

    if (currentBlockStart != null && currentBlockEntries.length > 0) {
      blocks.push(currentBlockEntries);
    }

    return blocks;
  }

  private createBlockInfo(
    startTime: Date,
    entries: UsageEntry[]
  ): { block: UsageEntry[]; isActive: boolean } {
    const now = new Date();
    const sessionDurationMs = this.sessionDurationHours * 60 * 60 * 1000;
    const endTime = new Date(startTime.getTime() + sessionDurationMs);
    const lastEntry = entries[entries.length - 1];
    const actualEndTime = lastEntry != null ? lastEntry.timestamp : startTime;

    const isActive =
      now.getTime() - actualEndTime.getTime() < sessionDurationMs &&
      now < endTime;

    return { block: entries, isActive };
  }

  private findActiveBlock(blocks: UsageEntry[][]): UsageEntry[] | null {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (!block || block.length === 0) continue;

      const firstEntry = block[0];
      if (!firstEntry) continue;

      const blockStartTime = this.floorToHour(firstEntry.timestamp);
      const blockInfo = this.createBlockInfo(blockStartTime, block);

      if (blockInfo.isActive) {
        return blockInfo.block;
      }
    }

    return null;
  }

  private async loadUsageEntries(): Promise<UsageEntry[]> {
    try {
      debug(`Block segment: Loading entries for dynamic session blocks`);

      const dayAgo = new Date();
      dayAgo.setDate(dayAgo.getDate() - 1);

      const fileFilter = (_filePath: string, modTime: Date): boolean => {
        return modTime >= dayAgo;
      };

      const parsedEntries = await loadEntriesFromProjects(
        undefined,
        fileFilter,
        true
      );

      const allUsageEntries: UsageEntry[] = [];

      for (const entry of parsedEntries) {
        if (entry.message?.usage) {
          const usageEntry = convertToUsageEntry(entry);

          if (!usageEntry.costUSD && entry.raw) {
            usageEntry.costUSD = await PricingService.calculateCostForEntry(
              entry.raw
            );
          }

          allUsageEntries.push(usageEntry);
        }
      }

      const sessionBlocks = this.identifySessionBlocks(allUsageEntries);
      debug(`Block segment: Found ${sessionBlocks.length} session blocks`);

      const activeBlock = this.findActiveBlock(sessionBlocks);

      let result: UsageEntry[] = [];
      if (activeBlock && activeBlock.length > 0) {
        debug(
          `Block segment: Found active block with ${activeBlock.length} entries`
        );
        const blockStart = activeBlock[0];
        const blockEnd = activeBlock[activeBlock.length - 1];
        if (blockStart && blockEnd) {
          debug(
            `Block segment: Active block from ${blockStart.timestamp.toISOString()} to ${blockEnd.timestamp.toISOString()}`
          );
        }
        result = activeBlock;
      } else {
        debug(`Block segment: No active block found`);
        result = [];
      }

      return result;
    } catch (error) {
      debug("Error loading block entries:", error);
      return [];
    }
  }

  async getActiveBlockInfo(
    trackingMode?: "estimate" | "realtime",
    pollInterval?: number
  ): Promise<BlockInfo> {
    // If realtime mode, try to get data from OAuth API
    if (trackingMode === "realtime") {
      const realtimeInfo = await this.getRealtimeBlockInfo(pollInterval);
      if (realtimeInfo) {
        return realtimeInfo;
      }
      // Fall back to estimate mode if realtime fails
      debug("Realtime mode failed, falling back to estimate mode");
    }

    try {
      const entries = await this.loadUsageEntries();

      if (entries.length === 0) {
        debug("Block segment: No entries in current block");
        return {
          cost: null,
          tokens: null,
          weightedTokens: null,
          timeRemaining: null,
          burnRate: null,
          tokenBurnRate: null,
          realtimePercentUsed: null,
          realtimeResetAt: null,
          isRealtime: false,
        };
      }

      const totalCost = entries.reduce((sum, entry) => sum + entry.costUSD, 0);
      const totalTokens = entries.reduce((sum, entry) => {
        return (
          sum +
          entry.usage.inputTokens +
          entry.usage.outputTokens +
          entry.usage.cacheCreationInputTokens +
          entry.usage.cacheReadInputTokens
        );
      }, 0);

      const weightedTokens = entries.reduce((sum, entry) => {
        const entryTokens =
          entry.usage.inputTokens +
          entry.usage.outputTokens +
          entry.usage.cacheCreationInputTokens +
          entry.usage.cacheReadInputTokens;
        const weight = getModelRateLimitWeight(entry.model);
        return sum + entryTokens * weight;
      }, 0);

      const now = new Date();
      let timeRemaining: number | null = null;

      if (entries.length > 0) {
        const firstEntry = entries[0];
        if (firstEntry) {
          const sessionDurationMs = this.sessionDurationHours * 60 * 60 * 1000;
          const blockStartTime = this.floorToHour(firstEntry.timestamp);
          const sessionEndTime = new Date(
            blockStartTime.getTime() + sessionDurationMs
          );

          timeRemaining = Math.max(
            0,
            Math.round((sessionEndTime.getTime() - now.getTime()) / (1000 * 60))
          );
        }
      }

      let burnRate: number | null = null;
      let tokenBurnRate: number | null = null;

      if (entries.length >= 1 && (totalCost > 0 || totalTokens > 0)) {
        const timestamps = entries
          .map((entry) => entry.timestamp)
          .sort((a, b) => a.getTime() - b.getTime());
        const firstEntry = timestamps[0];
        const lastEntry = timestamps[timestamps.length - 1];

        if (firstEntry && lastEntry) {
          const durationMinutes =
            (lastEntry.getTime() - firstEntry.getTime()) / (1000 * 60);

          if (durationMinutes > 0) {
            if (totalCost > 0) {
              burnRate = (totalCost / durationMinutes) * 60;
            }

            if (totalTokens > 0) {
              tokenBurnRate = (totalTokens / durationMinutes) * 60;
            }
          }
        }
      }

      debug(
        `Block segment: $${totalCost.toFixed(2)}, ${totalTokens} tokens, ${timeRemaining}m remaining, burn rate: ${burnRate ? "$" + burnRate.toFixed(2) + "/hr" : "N/A"}`
      );

      return {
        cost: totalCost,
        tokens: totalTokens,
        weightedTokens,
        timeRemaining,
        burnRate,
        tokenBurnRate,
        realtimePercentUsed: null,
        realtimeResetAt: null,
        isRealtime: false,
      };
    } catch (error) {
      debug("Error getting active block info:", error);
      return {
        cost: null,
        tokens: null,
        weightedTokens: null,
        timeRemaining: null,
        burnRate: null,
        tokenBurnRate: null,
        realtimePercentUsed: null,
        realtimeResetAt: null,
        isRealtime: false,
      };
    }
  }

  private async getRealtimeBlockInfo(
    pollInterval?: number
  ): Promise<BlockInfo | null> {
    try {
      const usage = await getRealtimeUsage(pollInterval ?? 15);
      if (!usage || !usage.fiveHour) {
        debug("No realtime block usage data available");
        return null;
      }

      const fiveHour = usage.fiveHour;

      // Calculate time remaining from reset time
      const now = new Date();
      const resetAt = new Date(fiveHour.resetAt);
      const timeRemaining = Math.max(
        0,
        Math.round((resetAt.getTime() - now.getTime()) / (1000 * 60))
      );

      debug(
        `Block segment (realtime): ${fiveHour.percentUsed}% used, resets at ${fiveHour.resetAt.toISOString()}, ${timeRemaining}m remaining`
      );

      return {
        cost: null,
        tokens: null,
        weightedTokens: null,
        timeRemaining,
        burnRate: null,
        tokenBurnRate: null,
        realtimePercentUsed: fiveHour.percentUsed,
        realtimeResetAt: fiveHour.resetAt,
        isRealtime: true,
      };
    } catch (error) {
      debug("Error getting realtime block info:", error);
      return null;
    }
  }
}
