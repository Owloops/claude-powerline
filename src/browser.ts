/**
 * Browser-safe entry point for claude-powerline.
 *
 * Exports all rendering modules, themes, types, and utilities needed
 * to generate statusline output without any Node.js built-in modules.
 *
 * Data providers (git, session, metrics, etc.) are NOT exported here —
 * supply pre-built data objects to the rendering functions instead.
 */

// --- Types ---

export type { ClaudeHookData } from "./utils/claude";

export type {
  PowerlineConfig,
  DisplayConfig,
  LineConfig,
  BudgetConfig,
  BudgetItemConfig,
} from "./config/loader";

export type { ColorTheme, PowerlineColors, SegmentColor } from "./themes";

export type { GitInfo } from "./segments/git";
export type {
  UsageInfo,
  SessionInfo,
  TokenBreakdown,
} from "./segments/session";
export type { ContextInfo } from "./segments/context";
export type { MetricsInfo } from "./segments/metrics";
export type { BlockInfo } from "./segments/block";
export type { TodayInfo } from "./segments/today";

export type {
  SegmentConfig,
  AnySegmentConfig,
  DirectorySegmentConfig,
  GitSegmentConfig,
  UsageSegmentConfig,
  ContextSegmentConfig,
  MetricsSegmentConfig,
  BlockSegmentConfig,
  TodaySegmentConfig,
  VersionSegmentConfig,
  SessionIdSegmentConfig,
  EnvSegmentConfig,
  WeeklySegmentConfig,
  PowerlineSymbols,
  SegmentData,
  BarDisplayStyle,
} from "./segments/renderer";

export type {
  TuiData,
  BoxChars,
  TuiGridConfig,
  TuiGridBreakpoint,
  TuiTitleConfig,
  TuiFooterConfig,
  SegmentTemplate,
  SegmentName,
  AlignValue,
  LayoutMode,
  SymbolSet,
  RenderCtx,
  JustifyValue,
  GridCell,
} from "./tui/types";

// --- Rendering ---

export { SegmentRenderer } from "./segments/renderer";
export { renderTuiPanel } from "./tui/renderer";
export type { TuiPanelOptions } from "./tui/renderer";

// --- Themes ---

export { getTheme, BUILT_IN_THEMES } from "./themes";
export {
  darkTheme,
  darkAnsi256Theme,
  darkAnsiTheme,
  lightTheme,
  lightAnsi256Theme,
  lightAnsiTheme,
  nordTheme,
  nordAnsi256Theme,
  nordAnsiTheme,
  tokyoNightTheme,
  tokyoNightAnsi256Theme,
  tokyoNightAnsiTheme,
  rosePineTheme,
  rosePineAnsi256Theme,
  rosePineAnsiTheme,
  gruvboxTheme,
  gruvboxAnsi256Theme,
  gruvboxAnsiTheme,
} from "./themes";

// --- Constants ---

export {
  SYMBOLS,
  TEXT_SYMBOLS,
  RESET_CODE,
  BOX_CHARS,
  BOX_CHARS_TEXT,
  BOX_PRESETS,
} from "./utils/constants";

// --- Pure utilities ---

export {
  hexToAnsi,
  extractBgToFg,
  hexTo256Ansi,
  hexToBasicAnsi,
  hexColorDistance,
} from "./utils/colors";
export { stripAnsi, visibleLength, ESC } from "./utils/terminal";
export {
  formatCost,
  formatTokens,
  formatTokenBreakdown,
  formatTimeSince,
  formatDuration,
  formatModelName,
  abbreviateFishStyle,
  formatResponseTime,
  formatTokenCount,
  formatBurnRate,
  collapseHome,
  formatTimeRemaining,
  formatLongTimeRemaining,
  minutesUntilReset,
} from "./utils/formatters";
export { getBudgetStatus } from "./utils/budget";

// --- TUI components ---

export {
  contentRow,
  bottomBorder,
  divider,
  spreadEven,
  spreadTwo,
  colorize,
  truncateAnsi,
  padRight,
  padLeft,
  padCenter,
} from "./tui/primitives";
export {
  buildTitleBar,
  buildContextLine,
  buildContextBar,
  buildBlockBar,
  buildWeeklyBar,
  resolveSegments,
  composeTemplate,
  resolveTitleToken,
  collectMetricSegments,
  collectActivityParts,
  collectWorkspaceParts,
  collectFooterParts,
} from "./tui/sections";
export {
  renderWideMetrics,
  renderWideBottom,
  renderMediumMetrics,
  renderMediumBottom,
  renderNarrowMetrics,
  renderNarrowBottom,
} from "./tui/layouts";

// --- TUI grid helpers ---

export {
  parseAreas,
  cullMatrix,
  calculateColumnWidths,
  selectBreakpoint,
  solveFitContentLayout,
  renderGrid,
  DIVIDER,
  EMPTY_CELL,
  LATE_RESOLVE_SEGMENTS,
} from "./tui/grid";
export type { GridResult } from "./tui/grid";

// --- Config defaults ---

export { DEFAULT_CONFIG } from "./config/defaults";

// --- Segment ref validation ---

export {
  isValidSegmentRef,
  VALID_SEGMENT_NAMES,
  SEGMENT_PARTS,
} from "./tui/types";
