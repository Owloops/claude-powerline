import type { UsageInfo } from "../segments/session";
import type { BlockInfo } from "../segments/block";
import type { TodayInfo } from "../segments/today";
import type { ContextInfo } from "../segments/context";
import type { MetricsInfo } from "../segments/metrics";
import type { GitInfo } from "../segments/git";
import type { CacheTimerInfo } from "../segments/cacheTimer";
import type { ClaudeHookData } from "../utils/claude";
import type { PowerlineColors } from "../themes";
import type { PowerlineConfig } from "../config/loader";

import type { SYMBOLS, TEXT_SYMBOLS } from "../utils/constants";

export interface BoxChars {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  readonly teeLeft: string;
  readonly teeRight: string;
}

export interface TuiData {
  hookData: ClaudeHookData;
  usageInfo: UsageInfo | null;
  blockInfo: BlockInfo | null;
  todayInfo: TodayInfo | null;
  contextInfo: ContextInfo | null;
  metricsInfo: MetricsInfo | null;
  gitInfo: GitInfo | null;
  cacheTimerInfo: CacheTimerInfo | null;
  tmuxSessionId: string | null;
  colors: PowerlineColors;
}

export type SymbolSet = typeof SYMBOLS | typeof TEXT_SYMBOLS;

export type LayoutMode = "wide" | "medium" | "narrow";

const SEGMENT_NAME_LIST = [
  "context",
  "block",
  "session",
  "today",
  "weekly",
  "git",
  "dir",
  "model",
  "version",
  "tmux",
  "metrics",
  "activity",
  "env",
  "agent",
  "thinking",
  "cacheTimer",
  "outputStyle",
] as const;

export type SegmentName = (typeof SEGMENT_NAME_LIST)[number];

export const VALID_SEGMENT_NAMES: ReadonlySet<string> = new Set<SegmentName>(
  SEGMENT_NAME_LIST,
);

/**
 * Every part name a segment publishes as a `segment.part` token. This is the
 * single source of truth: `addParts` publishes exactly these keys and
 * `isValidSegmentRef` accepts exactly these refs, so the resolvable namespace
 * and the validated namespace cannot disagree.
 *
 * Literal-typed for `SegmentParts<S>`; consumers should use `SEGMENT_PARTS`,
 * which exposes the same value under a stable widened type.
 */
const SEGMENT_PART_NAMES = {
  session: ["icon", "label", "cost", "tokens", "budget"],
  block: ["icon", "label", "value", "time", "budget", "bar"],
  today: ["icon", "cost", "label", "budget"],
  weekly: ["icon", "label", "pct", "time", "bar"],
  git: [
    "icon",
    "headVal",
    "branch",
    "status",
    "ahead",
    "behind",
    "working",
    "worktree",
    "head",
  ],
  context: ["icon", "label", "bar", "pct", "tokens"],
  metrics: [
    "response",
    "responseIcon",
    "responseVal",
    "lastResponse",
    "lastResponseIcon",
    "lastResponseVal",
    "added",
    "addedIcon",
    "addedVal",
    "removed",
    "removedIcon",
    "removedVal",
  ],
  activity: [
    "icon",
    "duration",
    "durationIcon",
    "durationVal",
    "messages",
    "messagesIcon",
    "messagesVal",
  ],
  model: ["icon", "value"],
  version: ["icon", "value"],
  tmux: ["label", "value"],
  dir: ["icon", "value"],
  env: ["prefix", "value"],
  agent: ["icon", "name"],
  thinking: ["icon", "enabled", "effort"],
  cacheTimer: ["icon", "value"],
  outputStyle: ["icon", "name"],
} as const satisfies Record<SegmentName, readonly string[]>;

export const SEGMENT_PARTS: Record<SegmentName, readonly string[]> =
  SEGMENT_PART_NAMES;

export function segmentPartNames<S extends SegmentName>(
  segment: S,
): (typeof SEGMENT_PART_NAMES)[S] {
  return SEGMENT_PART_NAMES[segment];
}

/**
 * The part names a segment's formatter must produce. Annotating every
 * `format*Parts` return with this makes the compiler reject a formatter that
 * omits a listed part, or that adds an unlisted one in an object literal.
 */
export type SegmentParts<S extends SegmentName> = Record<
  (typeof SEGMENT_PART_NAMES)[S][number],
  string
>;

export function isValidSegmentRef(name: string): boolean {
  if (name === "." || name === "---") return true;
  if (VALID_SEGMENT_NAMES.has(name)) return true;
  const dotIdx = name.indexOf(".");
  if (dotIdx === -1) return false;
  const seg = name.slice(0, dotIdx);
  const part = name.slice(dotIdx + 1);
  if (!seg || !part) return false;
  const parts = SEGMENT_PARTS[seg as SegmentName];
  return parts ? parts.includes(part) : false;
}

export type AlignValue = "left" | "center" | "right";

export interface GridCell {
  segment: string; // segment name, "." for empty, "---" for divider
  spanStart: boolean; // true if this is the first cell of a span
  spanSize: number; // number of columns this cell spans (1 if no span)
}

export interface TuiGridBreakpoint {
  minWidth: number;
  areas: string[];
  columns: string[];
  align?: AlignValue[];
}

export type JustifyValue = "start" | "between";

export interface SegmentTemplate {
  items: string[];
  gap?: number;
  justify?: JustifyValue;
}

export interface TuiTitleConfig {
  left?: string;
  right?: string;
}

export interface TuiFooterConfig {
  left?: string;
  right?: string;
}

export interface TuiGridConfig {
  terminalWidth?: number;
  widthReserve?: number;
  minWidth?: number;
  maxWidth?: number;
  fitContent?: boolean;
  padding?: { horizontal?: number };
  segments?: Record<string, SegmentTemplate>;
  separator?: {
    column?: string;
    divider?: string;
  };
  box?: string | Partial<BoxChars>;
  title?: TuiTitleConfig;
  footer?: TuiFooterConfig;
  breakpoints: TuiGridBreakpoint[];
}

export interface RenderCtx {
  lines: string[];
  data: TuiData;
  box: BoxChars;
  contentWidth: number;
  innerWidth: number;
  sym: SymbolSet;
  config: PowerlineConfig;
  reset: string;
  colors: PowerlineColors;
}
