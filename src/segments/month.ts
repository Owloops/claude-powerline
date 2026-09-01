import type { ParsedEntry } from "../utils/claude";
import type { TokenBreakdown } from "./session";

import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { CacheManager } from "../utils/cache";
import { loadEntriesFromProjects } from "../utils/claude";

export interface MonthUsageEntry {
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

export interface MonthInfo {
  cost: number | null;
  tokens: number | null;
  tokenBreakdown: TokenBreakdown | null;
  month: string;
  daysRemaining: number;
  dailyAverage: number | null;
}

function formatMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function startOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getDaysRemaining(date: Date): number {
  return getDaysInMonth(date) - date.getDate();
}

function getDailyAverage(cost: number | null, date: Date): number | null {
  if (cost === null) return null;
  return cost / date.getDate();
}

function getTotalTokens(usage: MonthUsageEntry["usage"]): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens
  );
}

function convertToMonthEntry(entry: ParsedEntry): MonthUsageEntry {
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

export class MonthProvider {
  private async loadMonthEntries(): Promise<MonthUsageEntry[]> {
    const now = new Date();
    const monthString = formatMonth(now);

    debug(`Month segment: Loading entries for month ${monthString}`);

    const latestMtime = await CacheManager.getLatestTranscriptMtime();

    const sharedCached = (await CacheManager.getUsageCache(
      "month",
      latestMtime,
    )) as MonthUsageEntry[] | null;
    if (sharedCached) {
      debug("Using shared month usage cache");
      return sharedCached;
    }

    const monthStart = startOfMonth(now);

    // One day of slack before the month boundary, mirroring the today
    // segment's cutoff: a transcript's mtime can trail the timestamps of the
    // entries it contains, so a file untouched since just before the
    // boundary could still hold entries from just after it.
    const fileFilterCutoff = new Date(monthStart);
    fileFilterCutoff.setDate(fileFilterCutoff.getDate() - 1);

    const fileFilter = (_filePath: string, modTime: Date): boolean => {
      return modTime >= fileFilterCutoff;
    };

    const timeFilter = (entry: ParsedEntry): boolean => {
      return entry.timestamp >= monthStart;
    };

    const parsedEntries = await loadEntriesFromProjects(
      timeFilter,
      fileFilter,
      true,
    );
    const monthEntries: MonthUsageEntry[] = [];

    let entriesFound = 0;

    for (const entry of parsedEntries) {
      const entryMonthString = formatMonth(entry.timestamp);

      if (entryMonthString === monthString && entry.message?.usage) {
        const monthEntry = convertToMonthEntry(entry);

        if (!monthEntry.costUSD && entry.raw) {
          monthEntry.costUSD = await PricingService.calculateCostForEntry(
            entry.raw,
          );
        }

        monthEntries.push(monthEntry);
        entriesFound++;
      }
    }

    debug(
      `Month segment: Found ${entriesFound} entries for month (${monthString})`,
    );

    await CacheManager.setUsageCache("month", monthEntries, latestMtime);

    return monthEntries;
  }

  private async getMonthEntries(): Promise<MonthUsageEntry[]> {
    try {
      return await this.loadMonthEntries();
    } catch (error) {
      debug("Error loading month's entries:", error);
      return [];
    }
  }

  async getMonthInfo(): Promise<MonthInfo> {
    const now = new Date();
    const daysRemaining = getDaysRemaining(now);

    try {
      const entries = await this.getMonthEntries();

      if (entries.length === 0) {
        return {
          cost: null,
          tokens: null,
          tokenBreakdown: null,
          month: formatMonth(now),
          daysRemaining,
          dailyAverage: null,
        };
      }

      const totalCost = entries.reduce((sum, entry) => sum + entry.costUSD, 0);
      const totalTokens = entries.reduce(
        (sum, entry) => sum + getTotalTokens(entry.usage),
        0,
      );

      const tokenBreakdown = entries.reduce(
        (breakdown, entry) => ({
          input: breakdown.input + entry.usage.inputTokens,
          output: breakdown.output + entry.usage.outputTokens,
          cacheCreation:
            breakdown.cacheCreation + entry.usage.cacheCreationInputTokens,
          cacheRead: breakdown.cacheRead + entry.usage.cacheReadInputTokens,
        }),
        {
          input: 0,
          output: 0,
          cacheCreation: 0,
          cacheRead: 0,
        },
      );

      debug(
        `Month segment: $${totalCost.toFixed(2)}, ${totalTokens} tokens total`,
      );

      return {
        cost: totalCost,
        tokens: totalTokens,
        tokenBreakdown,
        month: formatMonth(now),
        daysRemaining,
        dailyAverage: getDailyAverage(totalCost, now),
      };
    } catch (error) {
      debug("Error getting month's info:", error);
      return {
        cost: null,
        tokens: null,
        tokenBreakdown: null,
        month: formatMonth(now),
        daysRemaining,
        dailyAverage: null,
      };
    }
  }
}
