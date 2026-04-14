import type { PowerlineConfig } from "../config/loader";
import type { PowerlineColors } from "../themes";
import type {
  TuiData,
  SymbolSet,
  BoxChars,
  RenderCtx,
  SegmentTemplate,
  JustifyValue,
  TuiTitleConfig,
} from "./types";
import { visibleLength } from "../utils/terminal";

import {
  formatCost,
  formatTokenCount,
  collapseHome,
  formatDuration,
  formatModelName,
  formatResponseTime,
  formatTimeRemaining,
  formatLongTimeRemaining,
  minutesUntilReset,
  abbreviateFishStyle,
} from "../utils/formatters";
import { getBudgetStatus } from "../utils/budget";
import { colorize, truncateAnsi } from "./primitives";

export function resolveTitleToken(
  template: string,
  data: TuiData,
  resolvedData?: Record<string, string>,
): string {
  const rawName = data.hookData.model?.display_name || "Claude";
  const modelName = formatModelName(rawName).toLowerCase();

  return template.replace(/\{([^}]+)\}/g, (_match, token: string) => {
    if (resolvedData) {
      const value = resolvedData[token];
      if (value !== undefined) return value;
    }
    if (token === "model") return modelName;
    return "";
  });
}

export function buildTitleBar(
  data: TuiData,
  box: BoxChars,
  innerWidth: number,
  titleConfig?: TuiTitleConfig,
  resolvedData?: Record<string, string>,
): string {
  const leftTemplate = titleConfig?.left ?? "{model}";
  const rightTemplate = titleConfig?.right;
  const leftResolved = resolveTitleToken(leftTemplate, data, resolvedData);
  const leftText = leftResolved ? ` ${leftResolved} ` : "";
  const leftLen = visibleLength(leftText);

  if (!rightTemplate) {
    const simpleFill = innerWidth - leftLen;
    return (
      box.topLeft +
      leftText +
      box.horizontal.repeat(Math.max(0, simpleFill)) +
      box.topRight
    );
  }

  const rightResolved = resolveTitleToken(rightTemplate, data, resolvedData);
  const rightText = rightResolved ? ` ${rightResolved} ` : "";
  const rightLen = visibleLength(rightText);

  // Truncate if combined text exceeds innerWidth
  let finalLeft = leftText;
  let finalLeftLen = leftLen;
  let finalRight = rightText;
  let finalRightLen = rightLen;

  if (finalLeftLen + finalRightLen > innerWidth) {
    const maxLeft = Math.max(0, innerWidth - finalRightLen);
    if (finalLeftLen > maxLeft) {
      finalLeft = truncateAnsi(finalLeft, maxLeft);
      finalLeftLen = visibleLength(finalLeft);
    }
    if (finalLeftLen + finalRightLen > innerWidth) {
      const maxRight = Math.max(0, innerWidth - finalLeftLen);
      finalRight = truncateAnsi(finalRight, maxRight);
      finalRightLen = visibleLength(finalRight);
    }
  }

  const fillCount = innerWidth - finalLeftLen - finalRightLen;

  if (fillCount < 2) {
    const simpleFill = innerWidth - finalLeftLen;
    return (
      box.topLeft +
      finalLeft +
      box.horizontal.repeat(Math.max(0, simpleFill)) +
      box.topRight
    );
  }

  return (
    box.topLeft +
    finalLeft +
    box.horizontal.repeat(fillCount) +
    finalRight +
    box.topRight
  );
}

function resolveThresholdColor(
  pct: number,
  defaultColor: string,
  colors: PowerlineColors,
  warningAt = 60,
  criticalAt = 80,
): string {
  if (pct >= criticalAt) return colors.contextCriticalFg;
  if (pct >= warningAt) return colors.contextWarningFg;
  return defaultColor;
}

function buildBarString(
  pct: number,
  barWidth: number,
  sym: SymbolSet,
  reset: string,
  fgColor: string,
): string {
  barWidth = Math.max(5, barWidth);
  const filledCount = Math.max(
    0,
    Math.min(barWidth, Math.round((pct / 100) * barWidth)),
  );
  const emptyCount = barWidth - filledCount;
  const bar =
    sym.bar_filled.repeat(filledCount) + sym.bar_empty.repeat(emptyCount);
  return colorize(bar, fgColor, reset);
}

export function formatContextParts(
  data: TuiData,
  sym: SymbolSet,
): Record<string, string> {
  if (!data.contextInfo)
    return { icon: "", label: "context", bar: "", pct: "", tokens: "" };

  const usedPct = data.contextInfo.usablePercentage;
  const tokenStr = formatTokenCount(data.contextInfo.totalTokens);
  const maxStr = formatTokenCount(data.contextInfo.maxTokens);

  return {
    icon: sym.context_time,
    label: "context",
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
  partFg?: Record<string, string>,
): string {
  if (!data.contextInfo) return "";
  const usedPct = data.contextInfo.usablePercentage;
  const defaultFg =
    partFg?.["context.bar"] ?? partFg?.["context"] ?? colors.contextFg;
  const fgColor = resolveThresholdColor(usedPct, defaultFg, colors);
  return buildBarString(usedPct, barWidth, sym, reset, fgColor);
}

export function buildBlockBar(
  data: TuiData,
  barWidth: number,
  sym: SymbolSet,
  reset: string,
  colors: PowerlineColors,
  config: PowerlineConfig,
  partFg?: Record<string, string>,
): string {
  if (!data.blockInfo) return "";

  const pct = data.blockInfo.nativeUtilization;
  const warningThreshold = config.budget?.block?.warningThreshold ?? 80;
  const defaultFg =
    partFg?.["block.bar"] ?? partFg?.["block"] ?? colors.blockFg;
  const fgColor = resolveThresholdColor(
    pct,
    defaultFg,
    colors,
    50,
    warningThreshold,
  );
  return buildBarString(pct, barWidth, sym, reset, fgColor);
}

export function buildWeeklyBar(
  data: TuiData,
  barWidth: number,
  sym: SymbolSet,
  reset: string,
  colors: PowerlineColors,
  partFg?: Record<string, string>,
): string {
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (!sevenDay) return "";

  const pct = sevenDay.used_percentage;
  const defaultFg =
    partFg?.["weekly.bar"] ?? partFg?.["weekly"] ?? colors.weeklyFg;
  const fgColor = resolveThresholdColor(pct, defaultFg, colors);
  return buildBarString(pct, barWidth, sym, reset, fgColor);
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
  const tokenStr = formatTokenCount(data.contextInfo.totalTokens);
  const maxStr = formatTokenCount(data.contextInfo.maxTokens);
  const suffix = `  ${usedPct}%  ${tokenStr}/${maxStr}`;
  const barLen = Math.max(5, contentWidth - suffix.length);
  const filledCount = Math.max(
    0,
    Math.min(barLen, Math.round((usedPct / 100) * barLen)),
  );
  const emptyCount = barLen - filledCount;
  const bar =
    sym.bar_filled.repeat(filledCount) + sym.bar_empty.repeat(emptyCount);

  const fgColor = resolveThresholdColor(usedPct, colors.contextFg, colors);

  return colorize(`${bar}${suffix}`, fgColor, reset);
}

function getDirectoryDisplay(hookData: TuiData["hookData"]): string {
  const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
  return collapseHome(currentDir);
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
    if (metricParts.length > 0) {
      parts.push(colorize(metricParts.join(" · "), colors.metricsFg, reset));
    }
  }

  const envConfig = config.display.lines
    .map((line) => line.segments.env)
    .find((env) => env?.enabled);

  if (envConfig && envConfig.variable) {
    const envVal = globalThis.process?.env?.[envConfig.variable];
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
  _config: PowerlineConfig,
): Record<string, string> {
  const value = `${Math.round(blockInfo.nativeUtilization)}%`;
  const time = formatTimeRemaining(blockInfo.timeRemaining);

  return {
    icon: sym.block_cost,
    label: "block",
    value,
    time,
    budget: "",
    bar: " ",
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
  return { icon: sym.weekly_cost, label: "weekly", pct, time, bar: " " };
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
      ? formatTokenCount(sessionTokens)
      : "";

  let budget = "";
  const sessionBudget = config.budget?.session;
  if (sessionBudget?.amount && usageInfo.session.cost !== null) {
    budget = getBudgetStatus(
      usageInfo.session.cost,
      sessionBudget.amount,
      sessionBudget.warningThreshold || 80,
    ).displayText;
  }

  return {
    icon: sym.session_cost,
    label: "session",
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
    budget = getBudgetStatus(
      todayInfo.cost,
      todayBudget.amount,
      todayBudget.warningThreshold || 80,
    ).displayText;
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

function formatMetricsParts(
  data: TuiData,
  sym: SymbolSet,
): Record<string, string> {
  const empty = {
    response: "",
    responseIcon: "",
    responseVal: "",
    lastResponse: "",
    lastResponseIcon: "",
    lastResponseVal: "",
    added: "",
    addedIcon: "",
    addedVal: "",
    removed: "",
    removedIcon: "",
    removedVal: "",
  };
  if (!data.metricsInfo) return empty;

  const hasResponse =
    data.metricsInfo.responseTime !== null &&
    !isNaN(data.metricsInfo.responseTime) &&
    data.metricsInfo.responseTime > 0;
  const responseValStr = hasResponse
    ? formatResponseTime(data.metricsInfo.responseTime!)
    : "";

  const hasLast =
    data.metricsInfo.lastResponseTime !== null &&
    !isNaN(data.metricsInfo.lastResponseTime) &&
    data.metricsInfo.lastResponseTime > 0;
  const lastValStr = hasLast
    ? formatResponseTime(data.metricsInfo.lastResponseTime!)
    : "";

  const hasAdded =
    data.metricsInfo.linesAdded !== null && data.metricsInfo.linesAdded > 0;
  const addedValStr = hasAdded ? `${data.metricsInfo.linesAdded}` : "";

  const hasRemoved =
    data.metricsInfo.linesRemoved !== null && data.metricsInfo.linesRemoved > 0;
  const removedValStr = hasRemoved ? `${data.metricsInfo.linesRemoved}` : "";

  return {
    response: hasResponse ? `${sym.metrics_response} ${responseValStr}` : "",
    responseIcon: hasResponse ? sym.metrics_response : "",
    responseVal: responseValStr,
    lastResponse: hasLast
      ? `${sym.metrics_last_response} ${lastValStr}`
      : `${sym.metrics_last_response} --`,
    lastResponseIcon: sym.metrics_last_response,
    lastResponseVal: hasLast ? lastValStr : "--",
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
  const filled = [
    parts.response,
    parts.lastResponse,
    parts.added,
    parts.removed,
  ].filter(Boolean);
  return filled.length > 0 ? filled.join(" · ") : "";
}

function formatActivityParts(
  data: TuiData,
  sym: SymbolSet,
): Record<string, string> {
  const empty = {
    icon: "",
    duration: "",
    durationIcon: "",
    durationVal: "",
    messages: "",
    messagesIcon: "",
    messagesVal: "",
  };
  if (!data.metricsInfo) return empty;

  const hasDuration =
    data.metricsInfo.sessionDuration !== null &&
    data.metricsInfo.sessionDuration > 0;
  const durationValStr = hasDuration
    ? formatDuration(data.metricsInfo.sessionDuration!)
    : "";

  const hasMessages =
    data.metricsInfo.messageCount !== null && data.metricsInfo.messageCount > 0;
  const messagesValStr = hasMessages ? `${data.metricsInfo.messageCount}` : "";

  return {
    icon: sym.activity,
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
  if (!data.gitInfo)
    return {
      icon: "",
      info: "",
      branch: "",
      status: "",
      ahead: "",
      behind: "",
      working: "",
      head: "",
    };

  let statusIcon: string;
  if (data.gitInfo.status === "conflicts") {
    statusIcon = sym.git_conflicts;
  } else if (data.gitInfo.status === "dirty") {
    statusIcon = sym.git_dirty;
  } else {
    statusIcon = sym.git_clean;
  }

  const ahead =
    data.gitInfo.ahead > 0 ? `${sym.git_ahead}${data.gitInfo.ahead}` : "";
  const behind =
    data.gitInfo.behind > 0 ? `${sym.git_behind}${data.gitInfo.behind}` : "";

  const counts: string[] = [];
  if (data.gitInfo.staged && data.gitInfo.staged > 0)
    counts.push(`+${data.gitInfo.staged}`);
  if (data.gitInfo.unstaged && data.gitInfo.unstaged > 0)
    counts.push(`~${data.gitInfo.unstaged}`);
  if (data.gitInfo.untracked && data.gitInfo.untracked > 0)
    counts.push(`?${data.gitInfo.untracked}`);
  const working = counts.length > 0 ? `(${counts.join(" ")})` : "";

  const headParts = [sym.branch, data.gitInfo.branch, statusIcon];
  if (ahead) headParts.push(ahead);
  if (behind) headParts.push(behind);

  const infoParts = [data.gitInfo.branch, statusIcon];
  if (ahead) infoParts.push(ahead);
  if (behind) infoParts.push(behind);

  return {
    icon: sym.branch,
    info: infoParts.join(" "),
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

function formatDirParts(
  data: TuiData,
  config: PowerlineConfig,
  sym: SymbolSet,
): Record<string, string> {
  return { icon: sym.dir, value: formatDirValue(data, config) };
}

function formatDirValue(data: TuiData, config: PowerlineConfig): string {
  const raw = getDirectoryDisplay(data.hookData);
  const dirConfig = config.display.lines
    .map((line) => line.segments.directory)
    .find((d) => d?.enabled);
  const style =
    dirConfig?.style ?? (dirConfig?.showBasename ? "basename" : "fish");
  if (style === "basename") {
    const sep = raw.includes("/") ? "/" : "\\";
    return raw.split(sep).pop() || raw;
  }
  if (style === "full") return raw;
  return abbreviateFishStyle(raw);
}

function formatVersionParts(
  data: TuiData,
  sym: SymbolSet,
): Record<string, string> {
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
  const envVal = globalThis.process?.env?.[envConfig.variable];
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
    const partColor = partFg?.[partKey] ?? partFg?.[segment] ?? color;
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
    const totalContent = items.reduce(
      (sum, item) => sum + visibleLength(item),
      0,
    );
    const totalGap = Math.max(
      gap * (items.length - 1),
      cellWidth - totalContent,
    );
    const baseGap = Math.floor(totalGap / (items.length - 1));
    const extraSpaces = totalGap % (items.length - 1);

    let result = items[0]!;
    for (let i = 1; i < items.length; i++) {
      result += " ".repeat(baseGap + (i <= extraSpaces ? 1 : 0)) + items[i];
    }
    return result;
  }

  return items.join(" ".repeat(gap));
}

export interface ResolvedSegments {
  data: Record<string, string>;
  templates: Record<string, ResolvedTemplate>;
}

export function resolveSegments(
  data: TuiData,
  ctx: RenderCtx,
): ResolvedSegments {
  const { sym, config, reset, colors } = ctx;
  const pf = colors.partFg;

  const colorizeOrEmpty = (text: string, color: string): string =>
    text ? colorize(text, color, reset) : "";

  const result: Record<string, string> = {};

  // Model
  const rawModelName = data.hookData.model?.display_name || "Claude";
  const modelName = formatModelName(rawModelName).toLowerCase();
  const modelColor = pf?.["model"] ?? colors.modelFg;
  result.model = colorizeOrEmpty(`${sym.model} ${modelName}`, modelColor);
  addParts(
    result,
    "model",
    { icon: sym.model, value: modelName },
    colors.modelFg,
    reset,
    pf,
  );

  // Context (bar is width-dependent, resolved later via lateResolve)
  const contextLine = buildContextLine(
    data,
    ctx.contentWidth,
    sym,
    reset,
    colors,
  );
  result.context = contextLine ?? "";
  const ctxParts = formatContextParts(data, sym);
  const ctxColor = data.contextInfo
    ? resolveThresholdColor(
        data.contextInfo.usablePercentage,
        colors.contextFg,
        colors,
      )
    : colors.contextFg;
  addParts(result, "context", ctxParts, ctxColor, reset, pf);

  // Block
  if (data.blockInfo) {
    const blockColor = pf?.["block"] ?? colors.blockFg;
    result.block = colorizeOrEmpty(
      formatBlockSegment(data.blockInfo, sym, config),
      blockColor,
    );
    addParts(
      result,
      "block",
      formatBlockParts(data.blockInfo, sym, config),
      colors.blockFg,
      reset,
      pf,
    );
  } else {
    result.block = "";
  }

  // Session
  if (data.usageInfo) {
    const sessionColor = pf?.["session"] ?? colors.sessionFg;
    result.session = colorizeOrEmpty(
      formatSessionSegment(data.usageInfo, sym, config),
      sessionColor,
    );
    addParts(
      result,
      "session",
      formatSessionParts(data.usageInfo, sym, config),
      colors.sessionFg,
      reset,
      pf,
    );
  } else {
    result.session = "";
  }

  // Today
  if (data.todayInfo) {
    const todayColor = pf?.["today"] ?? colors.todayFg;
    result.today = colorizeOrEmpty(
      formatTodaySegment(data.todayInfo, sym, config),
      todayColor,
    );
    addParts(
      result,
      "today",
      formatTodayParts(data.todayInfo, sym, config),
      colors.todayFg,
      reset,
      pf,
    );
  } else {
    result.today = "";
  }

  // Weekly
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    const weeklyColor = pf?.["weekly"] ?? colors.weeklyFg;
    result.weekly = colorizeOrEmpty(
      formatWeeklySegment(sevenDay, sym),
      weeklyColor,
    );
    addParts(
      result,
      "weekly",
      formatWeeklyParts(sevenDay, sym),
      colors.weeklyFg,
      reset,
      pf,
    );
  } else {
    result.weekly = "";
  }

  // Git
  const gitColor = pf?.["git"] ?? colors.gitFg;
  result.git = colorizeOrEmpty(formatGitSegment(data, sym), gitColor);
  addParts(result, "git", formatGitParts(data, sym), colors.gitFg, reset, pf);

  // Dir
  const dirColor = pf?.["dir"] ?? colors.modeFg;
  result.dir = colorizeOrEmpty(formatDirValue(data, config), dirColor);
  addParts(
    result,
    "dir",
    formatDirParts(data, config, sym),
    colors.modeFg,
    reset,
    pf,
  );

  // Version
  const versionColor = pf?.["version"] ?? colors.versionFg;
  result.version = colorizeOrEmpty(
    formatVersionSegment(data, sym),
    versionColor,
  );
  addParts(
    result,
    "version",
    formatVersionParts(data, sym),
    colors.versionFg,
    reset,
    pf,
  );

  // Tmux
  const tmuxColor = pf?.["tmux"] ?? colors.tmuxFg;
  result.tmux = colorizeOrEmpty(formatTmuxSegment(data), tmuxColor);
  addParts(result, "tmux", formatTmuxParts(data), colors.tmuxFg, reset, pf);

  // Metrics
  const metricsColor = pf?.["metrics"] ?? colors.metricsFg;
  result.metrics = colorizeOrEmpty(
    formatMetricsSegment(data, sym),
    metricsColor,
  );
  addParts(
    result,
    "metrics",
    formatMetricsParts(data, sym),
    colors.metricsFg,
    reset,
    pf,
  );

  // Activity
  const activityColor = pf?.["activity"] ?? colors.metricsFg;
  result.activity = colorizeOrEmpty(
    formatActivitySegment(data, sym),
    activityColor,
  );
  addParts(
    result,
    "activity",
    formatActivityParts(data, sym),
    colors.metricsFg,
    reset,
    pf,
  );

  // Env
  const envColor = pf?.["env"] ?? colors.envFg;
  result.env = colorizeOrEmpty(formatEnvSegment(config), envColor);
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
      result[segRef] = composeTemplate(
        items,
        gap,
        justify === "between" ? "start" : justify,
      );
    }
  }

  return { data: result, templates };
}
