import { darkTheme, darkAnsi256Theme, darkAnsiTheme } from "./dark";
import { lightTheme, lightAnsi256Theme, lightAnsiTheme } from "./light";
import { nordTheme, nordAnsi256Theme, nordAnsiTheme } from "./nord";
import {
  tokyoNightTheme,
  tokyoNightAnsi256Theme,
  tokyoNightAnsiTheme,
} from "./tokyo-night";
import {
  rosePineTheme,
  rosePineAnsi256Theme,
  rosePineAnsiTheme,
} from "./rose-pine";
import { gruvboxTheme, gruvboxAnsi256Theme, gruvboxAnsiTheme } from "./gruvbox";

export interface SegmentColor {
  bg: string;
  fg: string;
  bold?: boolean;
}

export interface ColorTheme {
  directory: SegmentColor;
  git: SegmentColor;
  model: SegmentColor;
  session: SegmentColor;
  block: SegmentColor;
  today: SegmentColor;
  tmux: SegmentColor;
  context: SegmentColor;
  contextWarning: SegmentColor;
  contextCritical: SegmentColor;
  metrics: SegmentColor;
  version: SegmentColor;
  env: SegmentColor;
  weekly: SegmentColor;
  agent: SegmentColor;
  thinking: SegmentColor;
  cacheTimer: SegmentColor;
  proxyBudget: SegmentColor;
}

export interface PowerlineColors {
  reset: string;
  modeBg: string;
  modeFg: string;
  modeBold: boolean;
  gitBg: string;
  gitFg: string;
  gitBold: boolean;
  modelBg: string;
  modelFg: string;
  modelBold: boolean;
  sessionBg: string;
  sessionFg: string;
  sessionBold: boolean;
  blockBg: string;
  blockFg: string;
  blockBold: boolean;
  todayBg: string;
  todayFg: string;
  todayBold: boolean;
  tmuxBg: string;
  tmuxFg: string;
  tmuxBold: boolean;
  contextBg: string;
  contextFg: string;
  contextBold: boolean;
  contextWarningBg: string;
  contextWarningFg: string;
  contextWarningBold: boolean;
  contextCriticalBg: string;
  contextCriticalFg: string;
  contextCriticalBold: boolean;
  metricsBg: string;
  metricsFg: string;
  metricsBold: boolean;
  versionBg: string;
  versionFg: string;
  versionBold: boolean;
  envBg: string;
  envFg: string;
  envBold: boolean;
  weeklyBg: string;
  weeklyFg: string;
  weeklyBold: boolean;
  agentBg: string;
  agentFg: string;
  agentBold: boolean;
  thinkingBg: string;
  thinkingFg: string;
  thinkingBold: boolean;
  cacheTimerBg: string;
  cacheTimerFg: string;
  cacheTimerBold: boolean;
  proxyBudgetBg: string;
  proxyBudgetFg: string;
  proxyBudgetBold: boolean;
  partFg: Record<string, string>;
}

export const BUILT_IN_THEMES: Record<string, ColorTheme> = {
  dark: darkTheme,
  "dark-ansi256": darkAnsi256Theme,
  "dark-ansi": darkAnsiTheme,
  light: lightTheme,
  "light-ansi256": lightAnsi256Theme,
  "light-ansi": lightAnsiTheme,
  nord: nordTheme,
  "nord-ansi256": nordAnsi256Theme,
  "nord-ansi": nordAnsiTheme,
  "tokyo-night": tokyoNightTheme,
  "tokyo-night-ansi256": tokyoNightAnsi256Theme,
  "tokyo-night-ansi": tokyoNightAnsiTheme,
  "rose-pine": rosePineTheme,
  "rose-pine-ansi256": rosePineAnsi256Theme,
  "rose-pine-ansi": rosePineAnsiTheme,
  gruvbox: gruvboxTheme,
  "gruvbox-ansi256": gruvboxAnsi256Theme,
  "gruvbox-ansi": gruvboxAnsiTheme,
};

export function getTheme(
  themeName: string,
  colorSupport?: "none" | "ansi" | "ansi256" | "truecolor",
): ColorTheme | null {
  const baseTheme = BUILT_IN_THEMES[themeName];
  if (!baseTheme) return null;

  if (colorSupport === "none" || colorSupport === "ansi") {
    const ansiVariant = BUILT_IN_THEMES[`${themeName}-ansi`];
    if (ansiVariant) return ansiVariant;
  }

  if (colorSupport === "ansi256") {
    const ansi256Variant = BUILT_IN_THEMES[`${themeName}-ansi256`];
    if (ansi256Variant) return ansi256Variant;
  }

  return baseTheme;
}

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
};
