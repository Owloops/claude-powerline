import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { loadEntriesFromProjects, type ParsedEntry } from "../utils/claude";

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
  timeRemaining: number | null;
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
  private async loadUsageEntries(): Promise<UsageEntry[]> {
    const now = new Date();

    const hoursSinceMidnight = now.getHours();
    const blockNumber = Math.floor(hoursSinceMidnight / 5);
    const blockStart = new Date();
    blockStart.setHours(blockNumber * 5, 0, 0, 0);
    const blockEnd = new Date();
    blockEnd.setHours((blockNumber + 1) * 5, 0, 0, 0);

    debug(
      `Block segment: Current block ${blockNumber} (${blockStart.toLocaleString()} - ${blockEnd.toLocaleString()})`
    );

    const fileFilter = (_filePath: string, modTime: Date): boolean => {
      return modTime >= blockStart;
    };

    const parsedEntries = await loadEntriesFromProjects(
      undefined,
      fileFilter,
      true
    );
    const usageEntries: UsageEntry[] = [];

    let entriesInBlock = 0;

    for (const entry of parsedEntries) {
      if (
        entry.message?.usage &&
        entry.timestamp >= blockStart &&
        entry.timestamp < blockEnd
      ) {
        const usageEntry = convertToUsageEntry(entry);

        if (!usageEntry.costUSD && entry.raw) {
          usageEntry.costUSD = await PricingService.calculateCostForEntry(
            entry.raw
          );
        }

        usageEntries.push(usageEntry);
        entriesInBlock++;
      }
    }

    debug(`Block segment: Found ${entriesInBlock} entries in current block`);
    return usageEntries;
  }

  async getActiveBlockInfo(): Promise<BlockInfo> {
    try {
      const entries = await this.loadUsageEntries();

      if (entries.length === 0) {
        debug("Block segment: No entries in current block");
        return { cost: null, tokens: null, timeRemaining: null };
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

      const now = new Date();
      const hoursSinceMidnight = now.getHours();
      const blockNumber = Math.floor(hoursSinceMidnight / 5);
      const blockEnd = new Date();
      blockEnd.setHours((blockNumber + 1) * 5, 0, 0, 0);

      const timeRemaining = Math.max(
        0,
        Math.round((blockEnd.getTime() - now.getTime()) / (1000 * 60))
      );

      debug(
        `Block segment: $${totalCost.toFixed(2)}, ${totalTokens} tokens, ${timeRemaining}m remaining`
      );

      return {
        cost: totalCost,
        tokens: totalTokens,
        timeRemaining,
      };
    } catch (error) {
      debug("Error getting active block info:", error);
      return { cost: null, tokens: null, timeRemaining: null };
    }
  }
}
