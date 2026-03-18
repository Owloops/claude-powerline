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
  | "git"
  | "dir"
  | "version"
  | "tmux"
  | "metrics"
  | "activity"
  | "burn"
  | "env";

export const VALID_SEGMENT_NAMES: ReadonlySet<string> = new Set<SegmentName>([
  "context", "block", "session", "today", "git", "dir",
  "version", "tmux", "metrics", "activity", "burn", "env",
]);

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

export interface TuiGridConfig {
  widthReserve?: number;
  minWidth?: number;
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
