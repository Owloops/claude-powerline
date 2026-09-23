import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { debug } from "../utils/logger";
import { CacheManager } from "../utils/cache";
import {
  createUniqueHash,
  readTranscriptFrom,
  type ParsedEntry,
} from "../utils/claude";
import { PricingService, type BillableTokens } from "./pricing";
import type { TokenBreakdown } from "./session";

/** Bumped when the cached shape changes, so an older cache reads as a miss. */
const STATE_VERSION = 1;

/**
 * Enough of a transcript's start to tell it from another one: its first
 * records carry ids and prompt text unique to it.
 */
const HEAD_BYTES = 1024;

export interface TranscriptTotals {
  /** Usage entries counted, after deduplication. */
  entries: number;
  tokens: TokenBreakdown;
  /** The `costUSD` of the entries that carry one. */
  recordedCost: number;
  /**
   * Tokens of the entries without a `costUSD`, by model id. Kept as tokens and
   * priced on every render, so a pricing update reaches every entry counted.
   */
  unpriced: Record<string, BillableTokens>;
}

interface FileProgress {
  /** Bytes consumed so far, always just past a newline. */
  offset: number;
  ino: number;
  /** Hash of the first min(offset, HEAD_BYTES) bytes. */
  head: string;
}

interface CachedState {
  version: number;
  files: Record<string, FileProgress>;
  /**
   * createUniqueHash of every entry counted. One set for all the transcripts,
   * because the same request can appear in several of them.
   */
  seen: string[];
  totals: TranscriptTotals;
}

interface State {
  files: Record<string, FileProgress>;
  seen: Set<string>;
  totals: TranscriptTotals;
}

function emptyState(): State {
  return {
    files: {},
    seen: new Set(),
    totals: {
      entries: 0,
      tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      recordedCost: 0,
      unpriced: {},
    },
  };
}

function toState(cached: unknown): State | null {
  const state = cached as CachedState | null;
  if (state?.version !== STATE_VERSION) return null;
  return {
    files: state.files,
    seen: new Set(state.seen),
    totals: state.totals,
  };
}

function addEntry(state: State, entry: ParsedEntry): void {
  const usage = entry.message?.usage;
  if (!usage) return;

  // Same rule as deduplicateEntries: the first line read with a given hash is
  // the one counted. Across renders that is the first read, which can differ
  // from a full read's pick when a transcript listed earlier gets a copy of a
  // request after another transcript's copy was counted.
  const hash = createUniqueHash(entry);
  if (hash) {
    if (state.seen.has(hash)) return;
    state.seen.add(hash);
  }

  const { totals } = state;
  totals.entries++;
  totals.tokens.input += usage.input_tokens || 0;
  totals.tokens.output += usage.output_tokens || 0;
  totals.tokens.cacheCreation += usage.cache_creation_input_tokens || 0;
  totals.tokens.cacheRead += usage.cache_read_input_tokens || 0;

  if (entry.costUSD !== undefined) {
    totals.recordedCost += entry.costUSD;
    return;
  }

  const billable = PricingService.billableTokens(usage);
  const sum = (totals.unpriced[PricingService.extractModelId(entry.raw)] ??= {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
  });
  sum.input += billable.input;
  sum.output += billable.output;
  sum.cacheRead += billable.cacheRead;
  sum.cacheWrite5m += billable.cacheWrite5m;
  sum.cacheWrite1h += billable.cacheWrite1h;
}

async function hashHead(filePath: string, length: number): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(length, HEAD_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return createHash("sha1")
      .update(buffer.subarray(0, bytesRead))
      .digest("hex");
  } finally {
    await handle.close();
  }
}

/**
 * Reads what each transcript gained since `state` was saved and adds it in.
 * Returns the unterminated last lines, which count for this render only, or
 * null when a transcript no longer extends what was read from it: the totals
 * it contributed cannot be taken back out, so the caller starts over.
 */
async function advance(
  state: State,
  transcriptPaths: string[],
): Promise<{ tails: ParsedEntry[]; advanced: boolean } | null> {
  if (Object.keys(state.files).some((p) => !transcriptPaths.includes(p))) {
    return null;
  }

  const tails: ParsedEntry[] = [];
  let advanced = false;

  for (const filePath of transcriptPaths) {
    const { size, ino } = await stat(filePath);
    const known = state.files[filePath];

    if (known) {
      // Replaced, or truncated.
      if (ino !== known.ino || size < known.offset) return null;
      if (size === known.offset) continue;
      // Rewritten in place, and already longer than what was read.
      if ((await hashHead(filePath, known.offset)) !== known.head) return null;
    }

    const read = await readTranscriptFrom(filePath, known?.offset ?? 0);
    for (const entry of read.entries) addEntry(state, entry);
    if (read.tail) tails.push(read.tail);

    if (!known || read.end !== known.offset) {
      advanced = true;
      state.files[filePath] = {
        offset: read.end,
        ino,
        head:
          known && known.offset >= HEAD_BYTES
            ? known.head
            : await hashHead(filePath, read.end),
      };
    }
  }

  return { tails, advanced };
}

/**
 * Token and cost totals over transcripts, reading only what was appended since
 * the last render. The state is saved whole in one cache file per `name`, so
 * concurrent renders racing to save it lose work, never count anything twice.
 */
export async function readTranscriptTotals(
  name: string,
  transcriptPaths: string[],
): Promise<TranscriptTotals> {
  let state = toState(await CacheManager.getTotalsCache(name));
  if (!state) await CacheManager.pruneTotalsCache();

  let progress = state && (await advance(state, transcriptPaths));
  if (!state || !progress) {
    debug(`Reading every transcript for the ${name} totals`);
    state = emptyState();
    // An empty state has no offsets that a transcript could contradict.
    progress = (await advance(state, transcriptPaths))!;
  }

  if (progress.advanced) {
    const cached: CachedState = {
      version: STATE_VERSION,
      files: state.files,
      seen: [...state.seen],
      totals: state.totals,
    };
    // Awaited before the tails are added: the cache serializes the same
    // objects, and the tails must not be saved.
    await CacheManager.setTotalsCache(name, cached);
  }

  for (const entry of progress.tails) addEntry(state, entry);

  return state.totals;
}

/** The recorded cost plus the unpriced tokens at the current pricing. */
export async function priceTotals(totals: TranscriptTotals): Promise<number> {
  let cost = totals.recordedCost;
  for (const [modelId, tokens] of Object.entries(totals.unpriced)) {
    cost += await PricingService.calculateCost(modelId, tokens);
  }
  return cost;
}
