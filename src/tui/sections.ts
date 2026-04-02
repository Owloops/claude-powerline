import type { PowerlineConfig } from "../config/loader";
import type { PowerlineColors } from "../themes";
import type { TuiData, SymbolSet, BoxChars, SegmentName, RenderCtx, SegmentTemplate, JustifyValue } from "./types";
import { SEGMENT_PARTS } from "./types";
import { visibleLength } from "../utils/terminal";

import {
  formatCost,
  formatTokens,
  formatDuration,
  formatModelName,
  formatResponseTime,
  formatTimeRemaining,
  formatLongTimeRemaining,
  minutesUntilReset,
  abbreviateFishStyle,
} from "../utils/formatters";
import { getBudgetStatus } from "../utils/budget";
import { colorize } from "./primitives";

export function buildTitleBar(
  data: TuiData,
  box: BoxChars,
  innerWidth: number,
): string {
  const rawName = data.hookData.model?.display_name || "Claude";
  const modelName = formatModelName(rawName).toLowerCase();
  const toolName = "claude-powerline";

  const leftText = ` ${modelName} `;
  const rightText = ` ${toolName} `;
  const fillCount = innerWidth - 1 - leftText.length - rightText.length;

  if (fillCount < 2) {
    const simpleFill = innerWidth - 1 - leftText.length;
    return (
      box.topLeft +
      box.horizontal +
      leftText +
      box.horizontal.repeat(Math.max(0, simpleFill)) +
      box.topRight
    );
  }

  return (
    box.topLeft +
    box.horizontal +
    leftText +
    box.horizontal.repeat(fillCount) +
    rightText +
    box.topRight
  );
}

export function formatContextParts(
  data: TuiData,
  sym: SymbolSet,
): Record<string, string> {
  if (!data.contextInfo) return { bar: "", pct: "", tokens: "" };

  const usedPct = data.contextInfo.usablePercentage;
  const tokenStr = formatTokens(data.contextInfo.totalTokens).replace(" tokens", "");
  const maxStr = formatTokens(data.contextInfo.maxTokens).replace(" tokens", "");

  return {
    bar: " ",
    pct: `${usedPct}%`,
    tokens: `${tokenStr}/${maxStr}`,
  };
}

export function buildContextBar(
  data: TuiData,
  barWidth: number,
  sym: SymbolSet,
  reset: string,
  colors: PowerlineColors,
): string {
  if (!data.contextInfo) return "";
  const usedPct = data.contextInfo.usablePercentage;
  const filledCount = Math.round((usedPct / 100) * barWidth);
  const emptyCount = barWidth - filledCount;
  const bar = sym.bar_filled.repeat(filledCount) + sym.bar_empty.repeat(emptyCount);

  let fgColor = colors.contextFg;
  if (usedPct >= 80) fgColor = colors.contextCriticalFg;
  else if (usedPct >= 60) fgColor = colors.contextWarningFg;

  return colorize(bar, fgColor, reset);
}

export function buildContextLine(
  data: TuiData,
  contentWidth: number,
  sym: SymbolSet,
  reset: string,
  colors: PowerlineColors,
): string | null {
  if (!data.contextInfo) {
    return null;
  }

  const usedPct = data.contextInfo.usablePercentage;
  const tokenStr = formatTokens(data.contextInfo.totalTokens).replace(" tokens", "");
  const maxStr = formatTokens(data.contextInfo.maxTokens).replace(" tokens", "");
  const suffix = `  ${usedPct}%  ${tokenStr}/${maxStr}`;
  const barLen = Math.max(4, contentWidth - suffix.length);
  const filledCount = Math.round((usedPct / 100) * barLen);
  const emptyCount = barLen - filledCount;
  const bar = sym.bar_filled.repeat(filledCount) + sym.bar_empty.repeat(emptyCount);

  let fgColor = colors.contextFg;
  if (usedPct >= 80) {
    fgColor = colors.contextCriticalFg;
  } else if (usedPct >= 60) {
    fgColor = colors.contextWarningFg;
  }

  return colorize(`${bar}${suffix}`, fgColor, reset);
}

function getDirectoryDisplay(hookData: TuiData["hookData"]): string {
  const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir && currentDir.startsWith(homeDir)) {
    return currentDir.replace(homeDir, "~");
  }
  return currentDir;
}

export function collectMetricSegments(
  data: TuiData,
  sym: SymbolSet,
  config: PowerlineConfig,
  reset: string,
  colors: PowerlineColors,
): string[] {
  const segments: string[] = [];

  if (data.blockInfo) {
    segments.push(
      colorize(
        formatBlockSegment(data.blockInfo, sym, config),
        colors.blockFg,
        reset,
      ),
    );
  }
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    segments.push(
      colorize(formatWeeklySegment(sevenDay, sym), colors.weeklyFg, reset),
    );
  }
  if (data.usageInfo) {
    segments.push(
      colorize(
        formatSessionSegment(data.usageInfo, sym, config),
        colors.sessionFg,
        reset,
      ),
    );
  }
  if (data.todayInfo) {
    segments.push(
      colorize(
        formatTodaySegment(data.todayInfo, sym, config),
        colors.todayFg,
        reset,
      ),
    );
  }

  const activityParts = collectActivityParts(data, sym);
  if (activityParts.length > 0) {
    segments.push(colorize(activityParts.join(" · "), colors.metricsFg, reset));
  }

  return segments;
}

export function collectActivityParts(data: TuiData, sym: SymbolSet): string[] {
  const parts: string[] = [];
  if (data.metricsInfo) {
    if (
      data.metricsInfo.sessionDuration !== null &&
      data.metricsInfo.sessionDuration > 0
    ) {
      parts.push(
        `${sym.metrics_duration} ${formatDuration(data.metricsInfo.sessionDuration)}`,
      );
    }
    if (
      data.metricsInfo.messageCount !== null &&
      data.metricsInfo.messageCount > 0
    ) {
      parts.push(`${sym.metrics_messages} ${data.metricsInfo.messageCount}`);
    }
  }
  return parts;
}

export function collectWorkspaceParts(
  data: TuiData,
  sym: SymbolSet,
  reset: string,
  colors: PowerlineColors,
): string[] {
  const parts: string[] = [];

  const gitStr = formatGitSegment(data, sym);
  if (gitStr) parts.push(colorize(gitStr, colors.gitFg, reset));

  const dir = abbreviateFishStyle(getDirectoryDisplay(data.hookData));
  parts.push(colorize(dir, colors.modeFg, reset));

  return parts;
}

export function collectFooterParts(
  data: TuiData,
  sym: SymbolSet,
  config: PowerlineConfig,
  reset: string,
  colors: PowerlineColors,
): string[] {
  const parts: string[] = [];

  if (data.hookData.version) {
    parts.push(
      colorize(
        `${sym.version} v${data.hookData.version}`,
        colors.versionFg,
        reset,
      ),
    );
  }
  if (data.tmuxSessionId) {
    parts.push(colorize(`tmux:${data.tmuxSessionId}`, colors.tmuxFg, reset));
  }

  if (data.metricsInfo) {
    const metricParts: string[] = [];
    if (
      data.metricsInfo.responseTime !== null &&
      !isNaN(data.metricsInfo.responseTime) &&
      data.metricsInfo.responseTime > 0
    ) {
      metricParts.push(
        `${sym.metrics_response} ${formatResponseTime(data.metricsInfo.responseTime)}`,
      );
    }
    if (
      data.metricsInfo.linesAdded !== null &&
      data.metricsInfo.linesAdded > 0
    ) {
      metricParts.push(
        `${sym.metrics_lines_added}${data.metricsInfo.linesAdded}`,
      );
    }
    if (
      data.metricsInfo.linesRemoved !== null &&
      data.metricsInfo.linesRemoved > 0
    ) {
      metricParts.push(
        `${sym.metrics_lines_removed}${data.metricsInfo.linesRemoved}`,
      );
    }
    if (
      data.blockInfo?.source !== "native" &&
      data.blockInfo?.burnRate !== null &&
      data.blockInfo?.burnRate !== undefined &&
      data.blockInfo.burnRate > 0
    ) {
      const burnStr =
        data.blockInfo.burnRate < 1
          ? `${(data.blockInfo.burnRate * 100).toFixed(0)}c/h`
          : `$${data.blockInfo.burnRate.toFixed(2)}/h`;
      metricParts.push(`${sym.metrics_burn} ${burnStr}`);
    }
    if (metricParts.length > 0) {
      parts.push(colorize(metricParts.join(" · "), colors.metricsFg, reset));
    }
  }

  const envConfig = config.display.lines
    .map((line) => line.segments.env)
    .find((env) => env?.enabled);

  if (envConfig && envConfig.variable) {
    const envVal = process.env[envConfig.variable];
    if (envVal) {
      const prefix = envConfig.prefix ?? envConfig.variable;
      parts.push(
        colorize(prefix ? `${prefix}:${envVal}` : envVal, colors.envFg, reset),
      );
    }
  }

  return parts;
}

export function formatBlockParts(
  blockInfo: TuiData["blockInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): Record<string, string> {
  let value: string;
  if (blockInfo.source === "native" && blockInfo.nativeUtilization !== null) {
    value = `${Math.round(blockInfo.nativeUtilization)}%`;
  } else {
    value = formatCost(blockInfo.cost);
  }

  const time = blockInfo.timeRemaining !== null
    ? formatTimeRemaining(blockInfo.timeRemaining)
    : "";

  let budget = "";
  if (blockInfo.source !== "native") {
    const blockBudget = config.budget?.block;
    if (blockBudget?.amount && blockInfo.cost !== null) {
      budget = getBudgetStatus(blockInfo.cost, blockBudget.amount, blockBudget.warningThreshold || 80).displayText;
    }
  }

  return {
    icon: sym.block_cost,
    value,
    time,
    budget,
  };
}

export function formatBlockSegment(
  blockInfo: TuiData["blockInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  const parts = formatBlockParts(blockInfo, sym, config);
  let text = `${parts.icon} ${parts.value}`;
  if (parts.time) text += ` · ${parts.time}`;
  if (parts.budget) text += parts.budget;
  return text;
}

export function formatWeeklyParts(
  sevenDay: { used_percentage: number; resets_at: number },
  sym: SymbolSet,
): Record<string, string> {
  const pct = `${Math.round(sevenDay.used_percentage)}%`;
  const time = formatLongTimeRemaining(minutesUntilReset(sevenDay.resets_at));
  return { icon: sym.weekly_cost, pct, time };
}

export function formatWeeklySegment(
  sevenDay: { used_percentage: number; resets_at: number },
  sym: SymbolSet,
): string {
  const parts = formatWeeklyParts(sevenDay, sym);
  let text = `${parts.icon} ${parts.pct}`;
  if (parts.time) text += ` · ${parts.time}`;
  return text;
}

export function formatSessionParts(
  usageInfo: TuiData["usageInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): Record<string, string> {
  const sessionTokens = usageInfo.session.tokens;
  const tokenStr =
    sessionTokens !== null && sessionTokens > 0
      ? formatTokens(sessionTokens).replace(" tokens", "")
      : "";

  let budget = "";
  const sessionBudget = config.budget?.session;
  if (sessionBudget?.amount && usageInfo.session.cost !== null) {
    budget = getBudgetStatus(usageInfo.session.cost, sessionBudget.amount, sessionBudget.warningThreshold || 80).displayText;
  }

  return {
    icon: sym.session_cost,
    cost: formatCost(usageInfo.session.cost),
    tokens: tokenStr,
    budget,
  };
}

export function formatSessionSegment(
  usageInfo: TuiData["usageInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  const parts = formatSessionParts(usageInfo, sym, config);
  let text = `${parts.icon} ${parts.cost}`;
  if (parts.tokens) text += ` · ${parts.tokens}`;
  if (parts.budget) text += parts.budget;
  return text;
}

export function formatTodayParts(
  todayInfo: TuiData["todayInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): Record<string, string> {
  let budget = "";
  const todayBudget = config.budget?.today;
  if (todayBudget?.amount && todayInfo.cost !== null) {
    budget = getBudgetStatus(todayInfo.cost, todayBudget.amount, todayBudget.warningThreshold || 80).displayText;
  }

  return {
    icon: sym.today_cost,
    cost: formatCost(todayInfo.cost),
    label: "today",
    budget,
  };
}

export function formatTodaySegment(
  todayInfo: TuiData["todayInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  const parts = formatTodayParts(todayInfo, sym, config);
  let text = `${parts.icon} ${parts.cost} ${parts.label}`;
  if (parts.budget) text += parts.budget;
  return text;
}

export function formatBurnParts(blockInfo: TuiData["blockInfo"], sym: SymbolSet): Record<string, string> {
  if (!blockInfo || blockInfo.burnRate === null || blockInfo.burnRate === undefined || blockInfo.burnRate <= 0) {
    return { icon: "", rate: "" };
  }
  const rate = blockInfo.burnRate < 1
    ? `${(blockInfo.burnRate * 100).toFixed(0)}c/h`
    : `$${blockInfo.burnRate.toFixed(2)}/h`;
  return { icon: sym.metrics_burn, rate };
}

export function formatBurnSegment(blockInfo: TuiData["blockInfo"], sym: SymbolSet): string {
  const parts = formatBurnParts(blockInfo, sym);
  if (!parts.icon) return "";
  return `${parts.icon} ${parts.rate}`;
}

function formatMetricsParts(data: TuiData, sym: SymbolSet): Record<string, string> {
  const empty = { response: "", responseIcon: "", responseVal: "", lastResponse: "", lastResponseIcon: "", lastResponseVal: "", added: "", addedIcon: "", addedVal: "", removed: "", removedIcon: "", removedVal: "" };
  if (!data.metricsInfo) return empty;

  const hasResponse = data.metricsInfo.responseTime !== null && !isNaN(data.metricsInfo.responseTime) && data.metricsInfo.responseTime > 0;
  const responseValStr = hasResponse ? formatResponseTime(data.metricsInfo.responseTime!) : "";

  const hasLast = data.metricsInfo.lastResponseTime !== null && !isNaN(data.metricsInfo.lastResponseTime) && data.metricsInfo.lastResponseTime > 0;
  const lastValStr = hasLast ? formatResponseTime(data.metricsInfo.lastResponseTime!) : "";

  const hasAdded = data.metricsInfo.linesAdded !== null && data.metricsInfo.linesAdded > 0;
  const addedValStr = hasAdded ? `${data.metricsInfo.linesAdded}` : "";

  const hasRemoved = data.metricsInfo.linesRemoved !== null && data.metricsInfo.linesRemoved > 0;
  const removedValStr = hasRemoved ? `${data.metricsInfo.linesRemoved}` : "";

  return {
    response: hasResponse ? `${sym.metrics_response} ${responseValStr}` : "",
    responseIcon: hasResponse ? sym.metrics_response : "",
    responseVal: responseValStr,
    lastResponse: hasLast ? `${sym.metrics_last_response} ${lastValStr}` : "",
    lastResponseIcon: hasLast ? sym.metrics_last_response : "",
    lastResponseVal: lastValStr,
    added: hasAdded ? `${sym.metrics_lines_added}${addedValStr}` : "",
    addedIcon: hasAdded ? sym.metrics_lines_added : "",
    addedVal: addedValStr,
    removed: hasRemoved ? `${sym.metrics_lines_removed}${removedValStr}` : "",
    removedIcon: hasRemoved ? sym.metrics_lines_removed : "",
    removedVal: removedValStr,
  };
}

function formatMetricsSegment(data: TuiData, sym: SymbolSet): string {
  const parts = formatMetricsParts(data, sym);
  const filled = [parts.response, parts.lastResponse, parts.added, parts.removed].filter(Boolean);
  return filled.length > 0 ? filled.join(" · ") : "";
}

function formatActivityParts(data: TuiData, sym: SymbolSet): Record<string, string> {
  const empty = { duration: "", durationIcon: "", durationVal: "", messages: "", messagesIcon: "", messagesVal: "" };
  if (!data.metricsInfo) return empty;

  const hasDuration = data.metricsInfo.sessionDuration !== null && data.metricsInfo.sessionDuration > 0;
  const durationValStr = hasDuration ? formatDuration(data.metricsInfo.sessionDuration!) : "";

  const hasMessages = data.metricsInfo.messageCount !== null && data.metricsInfo.messageCount > 0;
  const messagesValStr = hasMessages ? `${data.metricsInfo.messageCount}` : "";

  return {
    duration: hasDuration ? `${sym.metrics_duration} ${durationValStr}` : "",
    durationIcon: hasDuration ? sym.metrics_duration : "",
    durationVal: durationValStr,
    messages: hasMessages ? `${sym.metrics_messages} ${messagesValStr}` : "",
    messagesIcon: hasMessages ? sym.metrics_messages : "",
    messagesVal: messagesValStr,
  };
}

function formatActivitySegment(data: TuiData, sym: SymbolSet): string {
  const parts = formatActivityParts(data, sym);
  const filled = [parts.duration, parts.messages].filter(Boolean);
  return filled.length > 0 ? filled.join(" · ") : "";
}

function formatGitParts(data: TuiData, sym: SymbolSet): Record<string, string> {
  if (!data.gitInfo) return { icon: "", branch: "", status: "", ahead: "", behind: "", working: "" };

  let statusIcon: string;
  if (data.gitInfo.status === "conflicts") {
    statusIcon = sym.git_conflicts;
  } else if (data.gitInfo.status === "dirty") {
    statusIcon = sym.git_dirty;
  } else {
    statusIcon = sym.git_clean;
  }

  const ahead = data.gitInfo.ahead > 0 ? `${sym.git_ahead}${data.gitInfo.ahead}` : "";
  const behind = data.gitInfo.behind > 0 ? `${sym.git_behind}${data.gitInfo.behind}` : "";

  const counts: string[] = [];
  if (data.gitInfo.staged && data.gitInfo.staged > 0) counts.push(`+${data.gitInfo.staged}`);
  if (data.gitInfo.unstaged && data.gitInfo.unstaged > 0) counts.push(`~${data.gitInfo.unstaged}`);
  if (data.gitInfo.untracked && data.gitInfo.untracked > 0) counts.push(`?${data.gitInfo.untracked}`);
  const working = counts.length > 0 ? `(${counts.join(" ")})` : "";

  const headParts = [sym.branch, data.gitInfo.branch, statusIcon];
  if (ahead) headParts.push(ahead);
  if (behind) headParts.push(behind);

  return {
    icon: sym.branch,
    branch: data.gitInfo.branch,
    status: statusIcon,
    ahead,
    behind,
    working,
    head: headParts.join(" "),
  };
}

function formatGitSegment(data: TuiData, sym: SymbolSet): string {
  const parts = formatGitParts(data, sym);
  if (!parts.icon) return "";
  let text = `${parts.icon} ${parts.branch} ${parts.status}`;
  if (parts.ahead) text += ` ${parts.ahead}`;
  if (parts.behind) text += `${parts.behind}`;
  if (parts.working) text += ` ${parts.working}`;
  return text;
}

function formatDirParts(data: TuiData, config: PowerlineConfig): Record<string, string> {
  return { value: formatDirValue(data, config) };
}

function formatDirValue(data: TuiData, config: PowerlineConfig): string {
  const raw = getDirectoryDisplay(data.hookData);
  const dirConfig = config.display.lines
    .map((line) => line.segments.directory)
    .find((d) => d?.enabled);
  const style = dirConfig?.style ?? (dirConfig?.showBasename ? "basename" : "fish");
  if (style === "basename") {
    const sep = raw.includes("/") ? "/" : "\\";
    return raw.split(sep).pop() || raw;
  }
  if (style === "full") return raw;
  return abbreviateFishStyle(raw);
}

function formatDirSegment(data: TuiData, config: PowerlineConfig): string {
  return formatDirValue(data, config);
}

function formatVersionParts(data: TuiData, sym: SymbolSet): Record<string, string> {
  if (!data.hookData.version) return { icon: "", value: "" };
  return { icon: sym.version, value: `v${data.hookData.version}` };
}

function formatVersionSegment(data: TuiData, sym: SymbolSet): string {
  const parts = formatVersionParts(data, sym);
  if (!parts.icon) return "";
  return `${parts.icon} ${parts.value}`;
}

function formatTmuxParts(data: TuiData): Record<string, string> {
  if (!data.tmuxSessionId) return { label: "", value: "" };
  return { label: "tmux", value: data.tmuxSessionId };
}

function formatTmuxSegment(data: TuiData): string {
  const parts = formatTmuxParts(data);
  if (!parts.label) return "";
  return `${parts.label}:${parts.value}`;
}

function formatEnvParts(config: PowerlineConfig): Record<string, string> {
  const envConfig = config.display.lines
    .map((line) => line.segments.env)
    .find((env) => env?.enabled);

  if (!envConfig || !envConfig.variable) return { prefix: "", value: "" };
  const envVal = process.env[envConfig.variable];
  if (!envVal) return { prefix: "", value: "" };
  const prefix = envConfig.prefix ?? envConfig.variable;
  return { prefix: prefix || "", value: envVal };
}

function formatEnvSegment(config: PowerlineConfig): string {
  const parts = formatEnvParts(config);
  if (!parts.value) return "";
  return parts.prefix ? `${parts.prefix}:${parts.value}` : parts.value;
}

function addParts(
  result: Record<string, string>,
  segment: string,
  parts: Record<string, string>,
  color: string,
  reset: string,
  partFg?: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(parts)) {
    const partKey = `${segment}.${key}`;
    const partColor = partFg?.[partKey] ?? color;
    result[partKey] = value ? colorize(value, partColor, reset) : "";
  }
}

// --- Template Composition ---

export interface ResolvedTemplate {
  items: string[];
  gap: number;
  justify: JustifyValue;
}

function resolveTemplateItems(
  template: SegmentTemplate,
  segmentRef: string,
  resolvedData: Record<string, string>,
): string[] {
  const dotIdx = segmentRef.indexOf(".");
  const baseSegment = dotIdx !== -1 ? segmentRef.slice(0, dotIdx) : segmentRef;

  return template.items
    .map((item) => {
      const match = item.match(/^\{(.+)\}$/);
      if (!match) return item ? colorize(item, "", "") : "";
      const partName = match[1]!;
      const key = `${baseSegment}.${partName}`;
      return resolvedData[key] ?? "";
    })
    .filter(Boolean);
}

export function composeTemplate(
  items: string[],
  gap: number,
  justify: JustifyValue,
  cellWidth?: number,
): string {
  if (items.length === 0) return "";

  if (justify === "between" && cellWidth !== undefined && items.length > 1) {
    const totalContent = items.reduce((sum, item) => sum + visibleLength(item), 0);
    const totalGap = cellWidth - totalContent;
    const gapSize = Math.max(gap, Math.floor(totalGap / (items.length - 1)));
    return items.join(" ".repeat(gapSize));
  }

  return items.join(" ".repeat(gap));
}

export interface ResolvedSegments {
  data: Record<string, string>;
  templates: Record<string, ResolvedTemplate>;
}

export function resolveSegments(data: TuiData, ctx: RenderCtx): ResolvedSegments {
  const { sym, config, reset, colors } = ctx;
  const pf = colors.partFg;

  const colorizeOrEmpty = (text: string, color: string): string =>
    text ? colorize(text, color, reset) : "";

  const result: Record<string, string> = {};

  // Context (bar is width-dependent, resolved later via lateResolve)
  const contextLine = buildContextLine(data, ctx.contentWidth, sym, reset, colors);
  result.context = contextLine ?? "";
  const ctxParts = formatContextParts(data, sym);
  let ctxColor = colors.contextFg;
  if (data.contextInfo) {
    if (data.contextInfo.usablePercentage >= 80) ctxColor = colors.contextCriticalFg;
    else if (data.contextInfo.usablePercentage >= 60) ctxColor = colors.contextWarningFg;
  }
  addParts(result, "context", ctxParts, ctxColor, reset, pf);

  // Block
  if (data.blockInfo) {
    result.block = colorizeOrEmpty(formatBlockSegment(data.blockInfo, sym, config), colors.blockFg);
    addParts(result, "block", formatBlockParts(data.blockInfo, sym, config), colors.blockFg, reset, pf);
  } else {
    result.block = "";
  }

  // Session
  if (data.usageInfo) {
    result.session = colorizeOrEmpty(formatSessionSegment(data.usageInfo, sym, config), colors.sessionFg);
    addParts(result, "session", formatSessionParts(data.usageInfo, sym, config), colors.sessionFg, reset, pf);
  } else {
    result.session = "";
  }

  // Today
  if (data.todayInfo) {
    result.today = colorizeOrEmpty(formatTodaySegment(data.todayInfo, sym, config), colors.todayFg);
    addParts(result, "today", formatTodayParts(data.todayInfo, sym, config), colors.todayFg, reset, pf);
  } else {
    result.today = "";
  }

  // Weekly
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    result.weekly = colorizeOrEmpty(formatWeeklySegment(sevenDay, sym), colors.weeklyFg);
    addParts(result, "weekly", formatWeeklyParts(sevenDay, sym), colors.weeklyFg, reset, pf);
  } else {
    result.weekly = "";
  }

  // Git
  result.git = colorizeOrEmpty(formatGitSegment(data, sym), colors.gitFg);
  addParts(result, "git", formatGitParts(data, sym), colors.gitFg, reset, pf);

  // Dir
  result.dir = colorizeOrEmpty(formatDirSegment(data, config), colors.modeFg);
  addParts(result, "dir", formatDirParts(data, config), colors.modeFg, reset, pf);

  // Version
  result.version = colorizeOrEmpty(formatVersionSegment(data, sym), colors.versionFg);
  addParts(result, "version", formatVersionParts(data, sym), colors.versionFg, reset, pf);

  // Tmux
  result.tmux = colorizeOrEmpty(formatTmuxSegment(data), colors.tmuxFg);
  addParts(result, "tmux", formatTmuxParts(data), colors.tmuxFg, reset, pf);

  // Metrics
  result.metrics = colorizeOrEmpty(formatMetricsSegment(data, sym), colors.metricsFg);
  addParts(result, "metrics", formatMetricsParts(data, sym), colors.metricsFg, reset, pf);

  // Activity
  result.activity = colorizeOrEmpty(formatActivitySegment(data, sym), colors.metricsFg);
  addParts(result, "activity", formatActivityParts(data, sym), colors.metricsFg, reset, pf);

  // Burn
  result.burn = colorizeOrEmpty(formatBurnSegment(data.blockInfo, sym), colors.metricsFg);
  addParts(result, "burn", formatBurnParts(data.blockInfo, sym), colors.metricsFg, reset, pf);

  // Env
  result.env = colorizeOrEmpty(formatEnvSegment(config), colors.envFg);
  addParts(result, "env", formatEnvParts(config), colors.envFg, reset, pf);

  // Apply segment templates: resolve items and compose default value
  const templates: Record<string, ResolvedTemplate> = {};
  const segmentConfigs = config.display.tui?.segments;
  if (segmentConfigs) {
    for (const [segRef, tmpl] of Object.entries(segmentConfigs)) {
      const items = resolveTemplateItems(tmpl, segRef, result);
      const gap = tmpl.gap ?? 1;
      const justify = tmpl.justify ?? "start";
      templates[segRef] = { items, gap, justify };
      // Compose default (without cell width for "between")
      result[segRef] = composeTemplate(items, gap, justify === "between" ? "start" : justify);
    }
  }

  return { data: result, templates };
}
