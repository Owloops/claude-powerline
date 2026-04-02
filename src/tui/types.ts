import type { UsageInfo } from "../segments/session";
import type { BlockInfo } from "../segments/block";
import type { TodayInfo } from "../segments/today";
import type { ContextInfo } from "../segments/context";
import type { MetricsInfo } from "../segments/metrics";
import type { GitInfo } from "../segments/git";
import type { ClaudeHookData } from "../utils/claude";
import type { PowerlineColors } from "../themes";

import { SYMBOLS, TEXT_SYMBOLS } from "../utils/constants";

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
  tmuxSessionId: string | null;
  colors: PowerlineColors;
}

export type SymbolSet = typeof SYMBOLS | typeof TEXT_SYMBOLS;

export type LayoutMode = "wide" | "medium" | "narrow";

export type SegmentName =
  | "context"
  | "block"
  | "session"
  | "today"
  | "weekly"
  | "git"
  | "dir"
  | "version"
  | "tmux"
  | "metrics"
  | "activity"
  | "burn"
  | "env";

export const VALID_SEGMENT_NAMES: ReadonlySet<string> = new Set<SegmentName>([
  "context", "block", "session", "today", "weekly", "git", "dir",
  "version", "tmux", "metrics", "activity", "burn", "env",
]);

export const SEGMENT_PARTS: Record<SegmentName, readonly string[]> = {
  session: ["icon", "cost", "tokens", "budget"],
  block: ["icon", "value", "time", "budget"],
  today: ["icon", "cost", "label", "budget"],
  weekly: ["icon", "pct", "time"],
  git: ["icon", "branch", "status", "ahead", "behind", "working", "head"],
  context: ["bar", "pct", "tokens"],
  metrics: ["response", "responseIcon", "responseVal", "lastResponse", "lastResponseIcon", "lastResponseVal", "added", "addedIcon", "addedVal", "removed", "removedIcon", "removedVal"],
  activity: ["duration", "durationIcon", "durationVal", "messages", "messagesIcon", "messagesVal"],
  burn: ["icon", "rate"],
  version: ["icon", "value"],
  tmux: ["label", "value"],
  dir: ["value"],
  env: ["prefix", "value"],
} as const;

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
  segment: string;    // segment name, "." for empty, "---" for divider
  spanStart: boolean; // true if this is the first cell of a span
  spanSize: number;   // number of columns this cell spans (1 if no span)
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

export interface TuiGridConfig {
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
  breakpoints: TuiGridBreakpoint[];
}

export interface RenderCtx {
  lines: string[];
  data: TuiData;
  box: BoxChars;
  contentWidth: number;
  innerWidth: number;
  sym: SymbolSet;
  config: import("../config/loader").PowerlineConfig;
  reset: string;
  colors: PowerlineColors;
}
