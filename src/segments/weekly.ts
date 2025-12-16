import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { loadEntriesFromProjects, type ParsedEntry } from "../utils/claude";
import { getRealtimeUsage } from "../utils/oauth";
import type { TokenBreakdown } from "./session";

export interface WeeklyUsageEntry {
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

export interface WeeklyInfo {
  cost: number | null;
  tokens: number | null;
  tokenBreakdown: TokenBreakdown | null;
  daysIncluded: number;
  weekProgressPercent: number;
  realtimePercentUsed: number | null;  // From OAuth API when in realtime mode
  realtimeResetAt: Date | null;        // Reset time from OAuth API
  isRealtime: boolean;                 // Whether data came from realtime API
}

function getTotalTokens(usage: WeeklyUsageEntry["usage"]): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens
  );
}

function convertToWeeklyEntry(entry: ParsedEntry): WeeklyUsageEntry {
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

export class WeeklyProvider {
  private async loadWeeklyEntries(): Promise<WeeklyUsageEntry[]> {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    debug(`Weekly segment: Loading entries from last 7 days`);

    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    eightDaysAgo.setHours(0, 0, 0, 0);

    const fileFilter = (_filePath: string, modTime: Date): boolean => {
      return modTime >= eightDaysAgo;
    };

    const timeFilter = (entry: ParsedEntry): boolean => {
      return entry.timestamp >= sevenDaysAgo;
    };

    const parsedEntries = await loadEntriesFromProjects(
      timeFilter,
      fileFilter,
      true
    );
    const weeklyEntries: WeeklyUsageEntry[] = [];

    let entriesFound = 0;

    for (const entry of parsedEntries) {
      if (entry.timestamp >= sevenDaysAgo && entry.message?.usage) {
        const weeklyEntry = convertToWeeklyEntry(entry);

        if (!weeklyEntry.costUSD && entry.raw) {
          weeklyEntry.costUSD = await PricingService.calculateCostForEntry(
            entry.raw
          );
        }

        weeklyEntries.push(weeklyEntry);
        entriesFound++;
      }
    }

    debug(`Weekly segment: Found ${entriesFound} entries for the last 7 days`);

    return weeklyEntries;
  }

  private async getWeeklyEntries(): Promise<WeeklyUsageEntry[]> {
    try {
      return await this.loadWeeklyEntries();
    } catch (error) {
      debug("Error loading weekly entries:", error);
      return [];
    }
  }

  private calculateWeekProgress(
    resetDay?: number,
    resetHour?: number,
    resetMinute?: number
  ): number {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Default to Monday 00:00 if no reset time specified
    const targetDay = resetDay ?? 1; // Monday
    const targetHour = resetHour ?? 0;
    const targetMinute = resetMinute ?? 0;

    // Calculate days since last reset
    // If we're before the reset time on reset day, we're still in the previous week
    let daysSinceReset = (dayOfWeek - targetDay + 7) % 7;

    // Check if we're on reset day but before reset time
    if (daysSinceReset === 0) {
      const currentMinutes = hours * 60 + minutes;
      const resetMinutes = targetHour * 60 + targetMinute;
      if (currentMinutes < resetMinutes) {
        daysSinceReset = 7; // Still in previous week's period
      }
    }

    // Calculate hours into the current week period
    const hoursIntoWeek =
      daysSinceReset * 24 +
      hours -
      targetHour +
      (minutes - targetMinute) / 60;

    const totalHoursInWeek = 7 * 24;

    // Clamp to 0-100%
    const progress = Math.max(0, Math.min(100, (hoursIntoWeek / totalHoursInWeek) * 100));
    return Math.round(progress);
  }

  async getWeeklyInfo(
    resetDay?: number,
    resetHour?: number,
    resetMinute?: number,
    trackingMode?: "estimate" | "realtime",
    pollInterval?: number
  ): Promise<WeeklyInfo> {
    // If realtime mode, try to get data from OAuth API
    if (trackingMode === "realtime") {
      const realtimeInfo = await this.getRealtimeWeeklyInfo(pollInterval);
      if (realtimeInfo) {
        return realtimeInfo;
      }
      // Fall back to estimate mode if realtime fails
      debug("Realtime mode failed, falling back to estimate mode");
    }

    try {
      const entries = await this.getWeeklyEntries();
      const weekProgressPercent = this.calculateWeekProgress(resetDay, resetHour, resetMinute);

      if (entries.length === 0) {
        return {
          cost: null,
          tokens: null,
          tokenBreakdown: null,
          daysIncluded: 7,
          weekProgressPercent,
          realtimePercentUsed: null,
          realtimeResetAt: null,
          isRealtime: false,
        };
      }

      const totalCost = entries.reduce((sum, entry) => sum + entry.costUSD, 0);
      const totalTokens = entries.reduce(
        (sum, entry) => sum + getTotalTokens(entry.usage),
        0
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
        }
      );

      debug(
        `Weekly segment: $${totalCost.toFixed(2)}, ${totalTokens} tokens total`
      );

      return {
        cost: totalCost,
        tokens: totalTokens,
        tokenBreakdown,
        daysIncluded: 7,
        weekProgressPercent,
        realtimePercentUsed: null,
        realtimeResetAt: null,
        isRealtime: false,
      };
    } catch (error) {
      debug("Error getting weekly info:", error);
      return {
        cost: null,
        tokens: null,
        tokenBreakdown: null,
        daysIncluded: 7,
        weekProgressPercent: this.calculateWeekProgress(resetDay, resetHour, resetMinute),
        realtimePercentUsed: null,
        realtimeResetAt: null,
        isRealtime: false,
      };
    }
  }

  private async getRealtimeWeeklyInfo(
    pollInterval?: number
  ): Promise<WeeklyInfo | null> {
    try {
      const usage = await getRealtimeUsage(pollInterval ?? 15);
      if (!usage || !usage.sevenDay) {
        debug("No realtime weekly usage data available");
        return null;
      }

      const sevenDay = usage.sevenDay;

      // Calculate week progress based on API's reset time
      const weekProgressPercent = this.calculateWeekProgressFromResetTime(sevenDay.resetAt);

      debug(
        `Weekly segment (realtime): ${sevenDay.percentUsed}% used, resets at ${sevenDay.resetAt.toISOString()}`
      );

      return {
        cost: null,
        tokens: null,
        tokenBreakdown: null,
        daysIncluded: 7,
        weekProgressPercent,
        realtimePercentUsed: sevenDay.percentUsed,
        realtimeResetAt: sevenDay.resetAt,
        isRealtime: true,
      };
    } catch (error) {
      debug("Error getting realtime weekly info:", error);
      return null;
    }
  }

  private calculateWeekProgressFromResetTime(resetAt: Date): number {
    const now = new Date();
    const resetTime = new Date(resetAt);

    // Calculate the start of this period (7 days before reset)
    const periodStart = new Date(resetTime);
    periodStart.setDate(periodStart.getDate() - 7);

    // If we're past the reset time, the period started at the last reset
    if (now > resetTime) {
      // We're in a new period, reset was the start
      const newPeriodStart = resetTime;
      const newResetTime = new Date(resetTime);
      newResetTime.setDate(newResetTime.getDate() + 7);

      const totalMs = newResetTime.getTime() - newPeriodStart.getTime();
      const elapsedMs = now.getTime() - newPeriodStart.getTime();
      return Math.round((elapsedMs / totalMs) * 100);
    }

    // Calculate progress through current period
    const totalMs = resetTime.getTime() - periodStart.getTime();
    const elapsedMs = now.getTime() - periodStart.getTime();

    const progress = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
    return Math.round(progress);
  }
}
