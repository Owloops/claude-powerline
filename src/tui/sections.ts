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
  formatCacheTimerElapsed,
  formatCacheTimerRemaining,
} from "../utils/formatters";
import { resolveBudgetDisplay } from "../utils/budget";
import type { CacheTimerSegmentConfig } from "../segments/renderer";
import { colorize, truncateAnsi } from "./primitives";
import { getEffortLevel, getThinkingEnabled } from "../utils/claude";
import { resolveIconVisibility } from "../utils/icon-visibility";

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

function resolveThresholdStyle(
  pct: number,
  defaultFg: string,
  defaultBold: boolean,
  colors: PowerlineColors,
  warningAt = 60,
  criticalAt = 80,
): { fg: string; bold: boolean } {
  if (pct >= criticalAt)
    return { fg: colors.contextCriticalFg, bold: colors.contextCriticalBold };
  if (pct >= warningAt)
    return { fg: colors.contextWarningFg, bold: colors.contextWarningBold };
  return { fg: defaultFg, bold: defaultBold };
}

function buildBarString(
  pct: number,
  barWidth: number,
  sym: SymbolSet,
  reset: string,
  fgColor: string,
  bold = false,
): string {
  barWidth = Math.max(5, barWidth);
  const filledCount = Math.max(
    0,
    Math.min(barWidth, Math.round((pct / 100) * barWidth)),
  );
  const emptyCount = barWidth - filledCount;
  const bar =
    sym.bar_filled.repeat(filledCount) + sym.bar_empty.repeat(emptyCount);
  return colorize(bar, fgColor, reset, bold);
}

export function formatContextParts(
  data: TuiData,
  sym: SymbolSet,
  iconVisible = true,
): Record<string, string> {
  if (!data.contextInfo)
    return { icon: "", label: "context", bar: "", pct: "", tokens: "" };

  const usedPct = data.contextInfo.usablePercentage;
  const tokenStr = formatTokenCount(data.contextInfo.totalTokens);
  const maxStr = formatTokenCount(data.contextInfo.maxTokens);

  return {
    icon: iconVisible ? sym.context_time : "",
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
  const { fg, bold } = resolveThresholdStyle(
    usedPct,
    defaultFg,
    colors.contextBold,
    colors,
  );
  return buildBarString(usedPct, barWidth, sym, reset, fg, bold);
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
  const { fg, bold } = resolveThresholdStyle(
    pct,
    defaultFg,
    colors.blockBold,
    colors,
    50,
    warningThreshold,
  );
  return buildBarString(pct, barWidth, sym, reset, fg, bold);
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
  const { fg, bold } = resolveThresholdStyle(
    pct,
    defaultFg,
    colors.weeklyBold,
    colors,
  );
  return buildBarString(pct, barWidth, sym, reset, fg, bold);
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

  const { fg, bold } = resolveThresholdStyle(
    usedPct,
    colors.contextFg,
    colors.contextBold,
    colors,
  );

  return colorize(`${bar}${suffix}`, fg, reset, bold);
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
        formatBlockSegment(
          data.blockInfo,
          sym,
          config,
          resolveIconVisibility(config, "block"),
        ),
        colors.blockFg,
        reset,
        colors.blockBold,
      ),
    );
  }
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    segments.push(
      colorize(
        formatWeeklySegment(
          sevenDay,
          sym,
          resolveIconVisibility(config, "weekly"),
        ),
        colors.weeklyFg,
        reset,
        colors.weeklyBold,
      ),
    );
  }
  if (data.usageInfo) {
    const sessionStr = formatSessionSegment(
      data.usageInfo,
      sym,
      config,
      resolveIconVisibility(config, "session"),
    );
    if (sessionStr) {
      segments.push(
        colorize(sessionStr, colors.sessionFg, reset, colors.sessionBold),
      );
    }
  }
  if (data.todayInfo) {
    const todayStr = formatTodaySegment(
      data.todayInfo,
      sym,
      config,
      resolveIconVisibility(config, "today"),
    );
    if (todayStr) {
      segments.push(
        colorize(todayStr, colors.todayFg, reset, colors.todayBold),
      );
    }
  }

  const activityParts = collectActivityParts(data, sym);
  if (activityParts.length > 0) {
    segments.push(
      colorize(
        activityParts.join(" · "),
        colors.metricsFg,
        reset,
        colors.metricsBold,
      ),
    );
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
  config: PowerlineConfig,
): string[] {
  const parts: string[] = [];

  const gitStr = formatGitSegment(
    data,
    sym,
    resolveIconVisibility(config, "git"),
  );
  if (gitStr) parts.push(colorize(gitStr, colors.gitFg, reset, colors.gitBold));

  const dir = abbreviateFishStyle(getDirectoryDisplay(data.hookData));
  parts.push(colorize(dir, colors.modeFg, reset, colors.modeBold));

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

  const versionText = formatVersionSegment(
    data,
    sym,
    resolveIconVisibility(config, "version"),
  );
  if (versionText) {
    parts.push(
      colorize(versionText, colors.versionFg, reset, colors.versionBold),
    );
  }

  const thinkingSegConfig = config.display.lines
    .map((line) => line.segments.thinking)
    .find((t) => t?.enabled);
  const thinkingText = formatThinkingSegment(
    data,
    sym,
    thinkingSegConfig,
    resolveIconVisibility(config, "thinking"),
  );
  if (thinkingText) {
    parts.push(
      colorize(thinkingText, colors.thinkingFg, reset, colors.thinkingBold),
    );
  }

  const cacheTimerEnabled = config.display.lines.some(
    (line) => line.segments.cacheTimer?.enabled,
  );
  const cacheTimerConfig = getCacheTimerConfig(config);
  if (cacheTimerEnabled && data.cacheTimerInfo) {
    const cacheTimerText = formatCacheTimerSegment(
      data,
      sym,
      cacheTimerConfig,
      resolveIconVisibility(config, "cacheTimer"),
    );
    if (cacheTimerText) {
      const { fg, bold } = cacheTimerStyle(
        data.cacheTimerInfo,
        colors,
        cacheTimerConfig,
      );
      parts.push(colorize(cacheTimerText, fg, reset, bold));
    }
  }

  if (data.tmuxSessionId) {
    parts.push(
      colorize(
        `tmux:${data.tmuxSessionId}`,
        colors.tmuxFg,
        reset,
        colors.tmuxBold,
      ),
    );
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
      parts.push(
        colorize(
          metricParts.join(" · "),
          colors.metricsFg,
          reset,
          colors.metricsBold,
        ),
      );
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
        colorize(
          prefix ? `${prefix}:${envVal}` : envVal,
          colors.envFg,
          reset,
          colors.envBold,
        ),
      );
    }
  }

  return parts;
}

export function formatBlockParts(
  blockInfo: TuiData["blockInfo"] & {},
  sym: SymbolSet,
  _config: PowerlineConfig,
  iconVisible = true,
): Record<string, string> {
  const value = `${Math.round(blockInfo.nativeUtilization)}%`;
  const time = formatTimeRemaining(blockInfo.timeRemaining);

  return {
    icon: iconVisible ? sym.block_cost : "",
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
  iconVisible = true,
): string {
  const parts = formatBlockParts(blockInfo, sym, config, iconVisible);
  let text = parts.icon ? `${parts.icon} ${parts.value}` : (parts.value ?? "");
  if (parts.time) text += ` · ${parts.time}`;
  if (parts.budget) text += parts.budget;
  return text;
}

export function formatWeeklyParts(
  sevenDay: { used_percentage: number; resets_at: number },
  sym: SymbolSet,
  iconVisible = true,
): Record<string, string> {
  const pct = `${Math.round(sevenDay.used_percentage)}%`;
  const time = formatLongTimeRemaining(minutesUntilReset(sevenDay.resets_at));
  return {
    icon: iconVisible ? sym.weekly_cost : "",
    label: "weekly",
    pct,
    time,
    bar: " ",
  };
}

export function formatWeeklySegment(
  sevenDay: { used_percentage: number; resets_at: number },
  sym: SymbolSet,
  iconVisible = true,
): string {
  const parts = formatWeeklyParts(sevenDay, sym, iconVisible);
  let text = parts.icon ? `${parts.icon} ${parts.pct}` : (parts.pct ?? "");
  if (parts.time) text += ` · ${parts.time}`;
  return text;
}

export function formatSessionParts(
  usageInfo: TuiData["usageInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
  iconVisible = true,
): Record<string, string> {
  const state = resolveBudgetDisplay(
    usageInfo.session.cost,
    usageInfo.session.tokens,
    config.budget?.session,
  );

  if (state.suppressAll) {
    return { icon: "", label: "", cost: "", tokens: "", budget: "" };
  }

  const sessionTokens = usageInfo.session.tokens;
  const tokenStr =
    state.showBase && sessionTokens !== null && sessionTokens > 0
      ? formatTokenCount(sessionTokens)
      : "";

  return {
    icon: iconVisible ? sym.session_cost : "",
    label: state.percentageOnly ? "" : "session",
    cost: state.showBase ? formatCost(usageInfo.session.cost) : "",
    tokens: tokenStr,
    budget: state.percentText ? ` ${state.percentText}` : "",
  };
}

export function formatSessionSegment(
  usageInfo: TuiData["usageInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
  iconVisible = true,
): string {
  const state = resolveBudgetDisplay(
    usageInfo.session.cost,
    usageInfo.session.tokens,
    config.budget?.session,
  );
  if (state.suppressAll) return "";

  const icon = iconVisible ? sym.session_cost : "";

  if (!state.showBase) {
    return icon ? `${icon} ${state.percentText}` : state.percentText;
  }

  const costStr = formatCost(usageInfo.session.cost);
  const sessionTokens = usageInfo.session.tokens;
  let text = icon ? `${icon} ${costStr}` : costStr;
  if (sessionTokens !== null && sessionTokens > 0) {
    text += ` · ${formatTokenCount(sessionTokens)}`;
  }
  if (state.percentText) text += ` ${state.percentText}`;
  return text;
}

export function formatTodayParts(
  todayInfo: TuiData["todayInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
  iconVisible = true,
): Record<string, string> {
  const state = resolveBudgetDisplay(
    todayInfo.cost,
    todayInfo.tokens,
    config.budget?.today,
  );

  if (state.suppressAll) {
    return { icon: "", label: "", cost: "", budget: "" };
  }

  return {
    icon: iconVisible ? sym.today_cost : "",
    cost: state.showBase ? formatCost(todayInfo.cost) : "",
    label: state.percentageOnly ? "" : "today",
    budget: state.percentText ? ` ${state.percentText}` : "",
  };
}

export function formatTodaySegment(
  todayInfo: TuiData["todayInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
  iconVisible = true,
): string {
  const state = resolveBudgetDisplay(
    todayInfo.cost,
    todayInfo.tokens,
    config.budget?.today,
  );
  if (state.suppressAll) return "";

  const icon = iconVisible ? sym.today_cost : "";

  if (!state.showBase) {
    return icon ? `${icon} ${state.percentText}` : state.percentText;
  }

  const costStr = formatCost(todayInfo.cost);
  let text = icon ? `${icon} ${costStr} today` : `${costStr} today`;
  if (state.percentText) text += ` ${state.percentText}`;
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

function formatGitParts(
  data: TuiData,
  sym: SymbolSet,
  iconVisible = true,
): Record<string, string> {
  if (!data.gitInfo)
    return {
      icon: "",
      headVal: "",
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

  const headParts: string[] = [];
  if (iconVisible) headParts.push(sym.branch);
  headParts.push(data.gitInfo.branch, statusIcon);
  if (ahead) headParts.push(ahead);
  if (behind) headParts.push(behind);

  const infoParts = [data.gitInfo.branch, statusIcon];
  if (ahead) infoParts.push(ahead);
  if (behind) infoParts.push(behind);

  return {
    icon: iconVisible ? sym.branch : "",
    headVal: infoParts.join(" "),
    branch: data.gitInfo.branch,
    status: statusIcon,
    ahead,
    behind,
    working,
    head: headParts.join(" "),
  };
}

function formatGitSegment(
  data: TuiData,
  sym: SymbolSet,
  iconVisible = true,
): string {
  const parts = formatGitParts(data, sym, iconVisible);
  if (!parts.branch) return "";
  let text = parts.icon
    ? `${parts.icon} ${parts.branch} ${parts.status}`
    : `${parts.branch} ${parts.status}`;
  if (parts.ahead) text += ` ${parts.ahead}`;
  if (parts.behind) text += `${parts.behind}`;
  if (parts.working) text += ` ${parts.working}`;
  return text;
}

function formatDirParts(
  data: TuiData,
  config: PowerlineConfig,
  sym: SymbolSet,
  iconVisible = true,
): Record<string, string> {
  return {
    icon: iconVisible ? sym.dir : "",
    value: formatDirValue(data, config),
  };
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
  iconVisible = true,
): Record<string, string> {
  if (!data.hookData.version) return { icon: "", value: "" };
  return {
    icon: iconVisible ? sym.version : "",
    value: `v${data.hookData.version}`,
  };
}

function formatVersionSegment(
  data: TuiData,
  sym: SymbolSet,
  iconVisible = true,
): string {
  const parts = formatVersionParts(data, sym, iconVisible);
  if (!parts.value) return "";
  return parts.icon ? `${parts.icon} ${parts.value}` : parts.value;
}

function formatAgentParts(
  data: TuiData,
  sym: SymbolSet,
  iconVisible = true,
): Record<string, string> {
  const raw = data.hookData.agent?.name;
  if (typeof raw !== "string") return { icon: "", name: "" };
  const name = raw.trim();
  if (!name) return { icon: "", name: "" };
  return {
    icon: iconVisible ? sym.agent : "",
    name,
  };
}

function formatAgentSegment(
  data: TuiData,
  sym: SymbolSet,
  config: PowerlineConfig,
  iconVisible = true,
): string {
  const parts = formatAgentParts(data, sym, iconVisible);
  if (!parts.name) return "";
  const agentConfig = config.display.lines
    .map((line) => line.segments.agent)
    .find((a) => a?.enabled);
  const body = agentConfig?.showLabel ? `agent: ${parts.name}` : parts.name;
  return parts.icon ? `${parts.icon} ${body}` : body;
}

function buildThinkingBody(
  data: TuiData,
  thinkingConfig: { showEnabled?: boolean; showEffort?: boolean } | undefined,
): string {
  const showEnabled = thinkingConfig?.showEnabled ?? true;
  const showEffort = thinkingConfig?.showEffort ?? true;
  if (!showEnabled && !showEffort) return "";

  const enabled = showEnabled ? getThinkingEnabled(data.hookData) : null;
  const level = showEffort ? getEffortLevel(data.hookData) : null;

  const segments: string[] = [];
  if (enabled !== null) segments.push(enabled ? "On" : "Off");
  if (level) segments.push(level);
  return segments.join(" · ");
}

function formatThinkingParts(
  data: TuiData,
  sym: SymbolSet,
  thinkingConfig: { showEnabled?: boolean; showEffort?: boolean } | undefined,
  iconVisible = true,
): Record<string, string> {
  const showEnabled = thinkingConfig?.showEnabled ?? true;
  const showEffort = thinkingConfig?.showEffort ?? true;
  const enabled = showEnabled ? getThinkingEnabled(data.hookData) : null;
  const level = showEffort ? getEffortLevel(data.hookData) : null;

  const enabledText = enabled === null ? "" : enabled ? "On" : "Off";
  const effortText = level ?? "";
  const hasAny = enabledText !== "" || effortText !== "";
  return {
    icon: hasAny && iconVisible ? sym.thinking : "",
    enabled: enabledText,
    effort: effortText,
  };
}

function formatThinkingSegment(
  data: TuiData,
  sym: SymbolSet,
  thinkingConfig: { showEnabled?: boolean; showEffort?: boolean } | undefined,
  iconVisible = true,
): string {
  const body = buildThinkingBody(data, thinkingConfig);
  if (!body) return "";
  return iconVisible ? `${sym.thinking} ${body}` : body;
}

function getCacheTimerConfig(
  config: PowerlineConfig,
): CacheTimerSegmentConfig | undefined {
  return config.display.lines
    .map((line) => line.segments.cacheTimer)
    .find((segment): segment is CacheTimerSegmentConfig =>
      Boolean(segment?.enabled),
    );
}
function cacheTimerRemaining(
  info: NonNullable<TuiData["cacheTimerInfo"]>,
  config?: CacheTimerSegmentConfig,
): number {
  const ttl = config?.ttlSeconds ?? info.detectedTtlSeconds ?? 3600;
  return Math.max(0, ttl - info.elapsedSeconds);
}
function formatCacheTimerValue(
  info: NonNullable<TuiData["cacheTimerInfo"]>,
  config?: CacheTimerSegmentConfig,
): string {
  if (config?.displayMode === "remaining") {
    return formatCacheTimerRemaining(cacheTimerRemaining(info, config));
  }
  return formatCacheTimerElapsed(info.elapsedSeconds);
}
function formatCacheTimerParts(
  data: TuiData,
  sym: SymbolSet,
  config?: CacheTimerSegmentConfig,
  iconVisible = true,
): Record<string, string> {
  if (!data.cacheTimerInfo) return { icon: "", value: "" };
  return {
    icon: iconVisible ? sym.cache_timer : "",
    value: formatCacheTimerValue(data.cacheTimerInfo, config),
  };
}
function formatCacheTimerSegment(
  data: TuiData,
  sym: SymbolSet,
  config?: CacheTimerSegmentConfig,
  iconVisible = true,
): string {
  const parts = formatCacheTimerParts(data, sym, config, iconVisible);
  if (!parts.value) return "";
  return parts.icon ? `${parts.icon} ${parts.value}` : parts.value;
}
function cacheTimerStyle(
  info: NonNullable<TuiData["cacheTimerInfo"]>,
  colors: PowerlineColors,
  config?: CacheTimerSegmentConfig,
): { fg: string; bold: boolean } {
  if (config?.displayMode === "remaining") {
    const remaining = cacheTimerRemaining(info, config);
    if (remaining < 60) {
      return { fg: colors.contextCriticalFg, bold: colors.contextCriticalBold };
    }
    if (remaining < 300) {
      return { fg: colors.contextWarningFg, bold: colors.contextWarningBold };
    }
    return { fg: colors.cacheTimerFg, bold: colors.cacheTimerBold };
  }

  const elapsed = info.elapsedSeconds;
  if (elapsed >= 300) {
    return { fg: colors.contextCriticalFg, bold: colors.contextCriticalBold };
  }
  if (elapsed >= 180) {
    return { fg: colors.contextWarningFg, bold: colors.contextWarningBold };
  }
  return { fg: colors.cacheTimerFg, bold: colors.cacheTimerBold };
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
  bold = false,
): void {
  for (const [key, value] of Object.entries(parts)) {
    const partKey = `${segment}.${key}`;
    const partColor = partFg?.[partKey] ?? partFg?.[segment] ?? color;
    result[partKey] = value ? colorize(value, partColor, reset, bold) : "";
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

  const colorizeOrEmpty = (
    text: string,
    color: string,
    bold = false,
  ): string => (text ? colorize(text, color, reset, bold) : "");

  const result: Record<string, string> = {};

  const iconVisible = {
    model: resolveIconVisibility(config, "model"),
    context: resolveIconVisibility(config, "context"),
    block: resolveIconVisibility(config, "block"),
    session: resolveIconVisibility(config, "session"),
    today: resolveIconVisibility(config, "today"),
    weekly: resolveIconVisibility(config, "weekly"),
    git: resolveIconVisibility(config, "git"),
    directory: resolveIconVisibility(config, "directory"),
    version: resolveIconVisibility(config, "version"),
    agent: resolveIconVisibility(config, "agent"),
    thinking: resolveIconVisibility(config, "thinking"),
    cacheTimer: resolveIconVisibility(config, "cacheTimer"),
  };

  // Model
  const rawModelName = data.hookData.model?.display_name || "Claude";
  const modelName = formatModelName(rawModelName).toLowerCase();
  const modelColor = pf?.["model"] ?? colors.modelFg;
  const modelIcon = iconVisible.model ? sym.model : "";
  result.model = colorizeOrEmpty(
    modelIcon ? `${modelIcon} ${modelName}` : modelName,
    modelColor,
    colors.modelBold,
  );
  addParts(
    result,
    "model",
    { icon: modelIcon, value: modelName },
    colors.modelFg,
    reset,
    pf,
    colors.modelBold,
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
  const ctxParts = formatContextParts(data, sym, iconVisible.context);
  const ctxStyle = data.contextInfo
    ? resolveThresholdStyle(
        data.contextInfo.usablePercentage,
        colors.contextFg,
        colors.contextBold,
        colors,
      )
    : { fg: colors.contextFg, bold: colors.contextBold };
  addParts(result, "context", ctxParts, ctxStyle.fg, reset, pf, ctxStyle.bold);

  // Block
  if (data.blockInfo) {
    const blockColor = pf?.["block"] ?? colors.blockFg;
    result.block = colorizeOrEmpty(
      formatBlockSegment(data.blockInfo, sym, config, iconVisible.block),
      blockColor,
      colors.blockBold,
    );
    addParts(
      result,
      "block",
      formatBlockParts(data.blockInfo, sym, config, iconVisible.block),
      colors.blockFg,
      reset,
      pf,
      colors.blockBold,
    );
  } else {
    result.block = "";
  }

  // Session
  if (data.usageInfo) {
    const sessionColor = pf?.["session"] ?? colors.sessionFg;
    result.session = colorizeOrEmpty(
      formatSessionSegment(data.usageInfo, sym, config, iconVisible.session),
      sessionColor,
      colors.sessionBold,
    );
    addParts(
      result,
      "session",
      formatSessionParts(data.usageInfo, sym, config, iconVisible.session),
      colors.sessionFg,
      reset,
      pf,
      colors.sessionBold,
    );
  } else {
    result.session = "";
  }

  // Today
  if (data.todayInfo) {
    const todayColor = pf?.["today"] ?? colors.todayFg;
    result.today = colorizeOrEmpty(
      formatTodaySegment(data.todayInfo, sym, config, iconVisible.today),
      todayColor,
      colors.todayBold,
    );
    addParts(
      result,
      "today",
      formatTodayParts(data.todayInfo, sym, config, iconVisible.today),
      colors.todayFg,
      reset,
      pf,
      colors.todayBold,
    );
  } else {
    result.today = "";
  }

  // Weekly
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    const weeklyColor = pf?.["weekly"] ?? colors.weeklyFg;
    result.weekly = colorizeOrEmpty(
      formatWeeklySegment(sevenDay, sym, iconVisible.weekly),
      weeklyColor,
      colors.weeklyBold,
    );
    addParts(
      result,
      "weekly",
      formatWeeklyParts(sevenDay, sym, iconVisible.weekly),
      colors.weeklyFg,
      reset,
      pf,
      colors.weeklyBold,
    );
  } else {
    result.weekly = "";
  }

  // Git
  const gitColor = pf?.["git"] ?? colors.gitFg;
  result.git = colorizeOrEmpty(
    formatGitSegment(data, sym, iconVisible.git),
    gitColor,
    colors.gitBold,
  );
  addParts(
    result,
    "git",
    formatGitParts(data, sym, iconVisible.git),
    colors.gitFg,
    reset,
    pf,
    colors.gitBold,
  );

  // Dir
  const dirColor = pf?.["dir"] ?? colors.modeFg;
  result.dir = colorizeOrEmpty(
    formatDirValue(data, config),
    dirColor,
    colors.modeBold,
  );
  addParts(
    result,
    "dir",
    formatDirParts(data, config, sym, iconVisible.directory),
    colors.modeFg,
    reset,
    pf,
    colors.modeBold,
  );

  // Version
  const versionColor = pf?.["version"] ?? colors.versionFg;
  result.version = colorizeOrEmpty(
    formatVersionSegment(data, sym, iconVisible.version),
    versionColor,
    colors.versionBold,
  );
  addParts(
    result,
    "version",
    formatVersionParts(data, sym, iconVisible.version),
    colors.versionFg,
    reset,
    pf,
    colors.versionBold,
  );

  // Tmux
  const tmuxColor = pf?.["tmux"] ?? colors.tmuxFg;
  result.tmux = colorizeOrEmpty(
    formatTmuxSegment(data),
    tmuxColor,
    colors.tmuxBold,
  );
  addParts(
    result,
    "tmux",
    formatTmuxParts(data),
    colors.tmuxFg,
    reset,
    pf,
    colors.tmuxBold,
  );

  // Metrics
  const metricsColor = pf?.["metrics"] ?? colors.metricsFg;
  result.metrics = colorizeOrEmpty(
    formatMetricsSegment(data, sym),
    metricsColor,
    colors.metricsBold,
  );
  addParts(
    result,
    "metrics",
    formatMetricsParts(data, sym),
    colors.metricsFg,
    reset,
    pf,
    colors.metricsBold,
  );

  // Activity
  const activityColor = pf?.["activity"] ?? colors.metricsFg;
  result.activity = colorizeOrEmpty(
    formatActivitySegment(data, sym),
    activityColor,
    colors.metricsBold,
  );
  addParts(
    result,
    "activity",
    formatActivityParts(data, sym),
    colors.metricsFg,
    reset,
    pf,
    colors.metricsBold,
  );

  // Env
  const envColor = pf?.["env"] ?? colors.envFg;
  result.env = colorizeOrEmpty(
    formatEnvSegment(config),
    envColor,
    colors.envBold,
  );
  addParts(
    result,
    "env",
    formatEnvParts(config),
    colors.envFg,
    reset,
    pf,
    colors.envBold,
  );

  // Agent
  const agentColor = pf?.["agent"] ?? colors.agentFg;
  result.agent = colorizeOrEmpty(
    formatAgentSegment(data, sym, config, iconVisible.agent),
    agentColor,
    colors.agentBold,
  );
  addParts(
    result,
    "agent",
    formatAgentParts(data, sym, iconVisible.agent),
    colors.agentFg,
    reset,
    pf,
    colors.agentBold,
  );

  // Thinking (combined enabled + effort)
  const thinkingSegConfig = config.display.lines
    .map((line) => line.segments.thinking)
    .find((t) => t?.enabled);
  const thinkingColor = pf?.["thinking"] ?? colors.thinkingFg;
  result.thinking = colorizeOrEmpty(
    formatThinkingSegment(data, sym, thinkingSegConfig, iconVisible.thinking),
    thinkingColor,
    colors.thinkingBold,
  );
  addParts(
    result,
    "thinking",
    formatThinkingParts(data, sym, thinkingSegConfig, iconVisible.thinking),
    colors.thinkingFg,
    reset,
    pf,
    colors.thinkingBold,
  );

  // CacheTimer
  const cacheTimerConfig = getCacheTimerConfig(config);
  const cacheTimerStyleResolved = data.cacheTimerInfo
    ? cacheTimerStyle(data.cacheTimerInfo, colors, cacheTimerConfig)
    : { fg: colors.cacheTimerFg, bold: colors.cacheTimerBold };
  const cacheTimerColor = pf?.["cacheTimer"] ?? cacheTimerStyleResolved.fg;
  result.cacheTimer = colorizeOrEmpty(
    formatCacheTimerSegment(
      data,
      sym,
      cacheTimerConfig,
      iconVisible.cacheTimer,
    ),
    cacheTimerColor,
    cacheTimerStyleResolved.bold,
  );
  addParts(
    result,
    "cacheTimer",
    formatCacheTimerParts(data, sym, cacheTimerConfig, iconVisible.cacheTimer),
    cacheTimerStyleResolved.fg,
    reset,
    pf,
    cacheTimerStyleResolved.bold,
  );

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
