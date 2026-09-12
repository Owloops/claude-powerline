import type { ParsedEntry } from "../utils/claude";
import type { TokenBreakdown } from "./session";

import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { CacheManager } from "../utils/cache";
import { loadEntriesFromProjects } from "../utils/claude";
import { formatLocalDate } from "../utils/formatters";

/** Aggregated usage for a window of time; the segments only ever show sums. */
export interface WindowUsage {
  cost: number;
  entryCount: number;
  tokenBreakdown: TokenBreakdown;
}

export interface UsageSummary {
  cost: number | null;
  tokens: number | null;
  tokenBreakdown: TokenBreakdown | null;
}

function emptyUsage(): WindowUsage {
  return {
    cost: 0,
    entryCount: 0,
    tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
  };
}

export function getTotalTokens(breakdown: TokenBreakdown): number {
  return (
    breakdown.input +
    breakdown.output +
    breakdown.cacheCreation +
    breakdown.cacheRead
  );
}

function addUsage(target: WindowUsage, source: WindowUsage): void {
  target.cost += source.cost;
  target.entryCount += source.entryCount;
  target.tokenBreakdown.input += source.tokenBreakdown.input;
  target.tokenBreakdown.output += source.tokenBreakdown.output;
  target.tokenBreakdown.cacheCreation += source.tokenBreakdown.cacheCreation;
  target.tokenBreakdown.cacheRead += source.tokenBreakdown.cacheRead;
}

async function usageOfEntry(entry: ParsedEntry): Promise<WindowUsage | null> {
  const usage = entry.message?.usage;
  if (!usage) return null;

  let cost = entry.costUSD || 0;
  if (!cost && entry.raw) {
    cost = await PricingService.calculateCostForEntry(entry.raw);
  }

  return {
    cost,
    entryCount: 1,
    tokenBreakdown: {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheCreation: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
    },
  };
}

/** Null fields when the window holds no usage, so the segment can hide itself. */
export function summarizeUsage(
  usage: WindowUsage,
  label: string,
): UsageSummary {
  if (usage.entryCount === 0) {
    return { cost: null, tokens: null, tokenBreakdown: null };
  }

  const tokens = getTotalTokens(usage.tokenBreakdown);
  debug(`${label} segment: $${usage.cost.toFixed(2)}, ${tokens} tokens total`);
  return { cost: usage.cost, tokens, tokenBreakdown: usage.tokenBreakdown };
}

export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseDayString(dayStr: string): Date {
  const [year, month, day] = dayStr.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function enumerateDayStrings(windowStart: Date, today: Date): string[] {
  const days: string[] = [];
  const cursor = startOfDay(windowStart);
  const last = startOfDay(today);
  while (cursor.getTime() <= last.getTime()) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Parses every transcript that may hold entries for the given days. */
async function scanDays(
  dayStrings: string[],
): Promise<Map<string, WindowUsage>> {
  const scanStart = parseDayString(dayStrings[0]!);

  // One day of slack before the scan boundary: a transcript's mtime can trail
  // the timestamps of the entries it contains, so a file untouched since just
  // before the boundary could still hold entries from just after it.
  const fileFilterCutoff = new Date(scanStart);
  fileFilterCutoff.setDate(fileFilterCutoff.getDate() - 1);

  const parsedEntries = await loadEntriesFromProjects(
    (entry) => entry.timestamp >= scanStart,
    (_filePath, modTime) => modTime >= fileFilterCutoff,
    true,
  );

  const buckets = new Map<string, WindowUsage>();
  for (const dayStr of dayStrings) buckets.set(dayStr, emptyUsage());

  for (const entry of parsedEntries) {
    const bucket = buckets.get(formatLocalDate(entry.timestamp));
    if (!bucket) continue;
    const usage = await usageOfEntry(entry);
    if (usage) addUsage(bucket, usage);
  }

  debug(
    `Usage window: scanned ${parsedEntries.length} entries across ${dayStrings.length} day(s) from ${dayStrings[0]}`,
  );

  return buckets;
}

async function loadTodayUsage(): Promise<WindowUsage> {
  const todayStr = formatLocalDate(new Date());
  const timeZone = currentTimeZone();
  const latestMtime = await CacheManager.getLatestTranscriptMtime();

  const cached = (await CacheManager.getDayUsageCache(
    todayStr,
    timeZone,
    latestMtime,
  )) as WindowUsage | null;
  if (cached) return cached;

  const fresh = (await scanDays([todayStr])).get(todayStr)!;
  await CacheManager.setDayUsageCache(todayStr, fresh, timeZone, latestMtime);
  return fresh;
}

let todayUsageInFlight: Promise<WindowUsage> | null = null;

/**
 * Today is the one bucket every window re-reads, and the TUI asks for `today`
 * and `month` concurrently, so concurrent callers share a single scan.
 */
function getTodayUsage(): Promise<WindowUsage> {
  if (!todayUsageInFlight) {
    todayUsageInFlight = loadTodayUsage().finally(() => {
      todayUsageInFlight = null;
    });
  }
  return todayUsageInFlight;
}

/**
 * Completed days are cached as totals and trusted until pruned: transcripts
 * are appended with real-time timestamps, so a past day cannot grow. Today is
 * cached against the newest transcript mtime, as the `today` segment always
 * was. Transcripts copied in from elsewhere after a day was cached are not
 * picked up; deleting `~/.claude/powerline/usage` rebuilds the cache.
 */
async function loadWindowUsage(windowStart: Date): Promise<WindowUsage> {
  const now = new Date();
  const todayStr = formatLocalDate(now);
  const timeZone = currentTimeZone();
  const completedDays = enumerateDayStrings(windowStart, now).filter(
    (dayStr) => dayStr !== todayStr,
  );

  const total = emptyUsage();
  addUsage(total, await getTodayUsage());

  const cachedDays = await Promise.all(
    completedDays.map(
      (dayStr) =>
        CacheManager.getDayUsageCache(
          dayStr,
          timeZone,
        ) as Promise<WindowUsage | null>,
    ),
  );

  const missing: string[] = [];
  completedDays.forEach((dayStr, index) => {
    const cached = cachedDays[index];
    if (cached) {
      addUsage(total, cached);
    } else {
      missing.push(dayStr);
    }
  });

  if (missing.length > 0) {
    const fresh = await scanDays(missing);
    await Promise.all(
      [...fresh].map(([dayStr, usage]) => {
        addUsage(total, usage);
        return CacheManager.setDayUsageCache(dayStr, usage, timeZone);
      }),
    );
  }

  return total;
}

export async function getWindowUsage(windowStart: Date): Promise<WindowUsage> {
  try {
    return await loadWindowUsage(windowStart);
  } catch (error) {
    debug("Error loading usage window:", error);
    return emptyUsage();
  }
}
