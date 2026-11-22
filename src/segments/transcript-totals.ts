import {
  createUniqueHash,
  parseTranscriptLine,
  type ParsedEntry,
} from "../utils/claude";
import { readIncrementally } from "../utils/incremental";
import { PricingService, type BillableTokens } from "./pricing";
import type { TokenBreakdown } from "./session";

/**
 * Restricts the totals to the entries of a window of time. Its key is saved
 * with the state, and a state saved under another key is read as a miss.
 */
export interface TotalsWindow {
  key: string;
  includes: (entry: ParsedEntry) => boolean;
}

/** Changed when the saved shape changes, so an older cache reads as a miss. */
const STATE_KEY = "totals-v2";

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

interface SavedTotals {
  /**
   * createUniqueHash of every entry counted. One set for all the transcripts,
   * because the same request can appear in several of them.
   */
  seen: string[];
  totals: TranscriptTotals;
}

interface State {
  seen: Set<string>;
  totals: TranscriptTotals;
}

function emptyState(): State {
  return {
    seen: new Set(),
    totals: {
      entries: 0,
      tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      recordedCost: 0,
      unpriced: {},
    },
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

/**
 * Token and cost totals over transcripts, reading only what was appended since
 * the last render.
 */
export async function readTranscriptTotals(
  name: string,
  transcriptPaths: string[],
  window?: TotalsWindow,
): Promise<TranscriptTotals> {
  const state = await readIncrementally<State>(
    {
      name,
      key: window ? `${STATE_KEY} ${window.key}` : STATE_KEY,
      empty: emptyState,
      save: (s): SavedTotals => ({ seen: [...s.seen], totals: s.totals }),
      load: (saved) => {
        const { seen, totals } = saved as SavedTotals;
        return { seen: new Set(seen), totals };
      },
      addLine: (s, line) => {
        const entry = parseTranscriptLine(line);
        if (entry && (!window || window.includes(entry))) addEntry(s, entry);
      },
    },
    transcriptPaths,
  );
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
