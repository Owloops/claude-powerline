import type { PowerlineConfig } from "../config/loader";
import type { PowerlineColors } from "../themes";
import type { TuiData, SymbolSet, BoxChars, SegmentName, RenderCtx } from "./types";

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

  const tokenStr =
    data.contextInfo.totalTokens >= 1000
      ? `${(data.contextInfo.totalTokens / 1000).toFixed(0)}k`
      : `${data.contextInfo.totalTokens}`;

  const maxStr =
    data.contextInfo.maxTokens >= 1000
      ? `${(data.contextInfo.maxTokens / 1000).toFixed(0)}k`
      : `${data.contextInfo.maxTokens}`;

  // Build text suffix first, then let the bar fill the remaining space
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

  if (data.gitInfo) {
    let gitText = `${sym.branch} ${data.gitInfo.branch}`;
    if (data.gitInfo.status === "conflicts") {
      gitText += ` ${sym.git_conflicts}`;
    } else if (data.gitInfo.status === "dirty") {
      gitText += ` ${sym.git_dirty}`;
    } else {
      gitText += ` ${sym.git_clean}`;
    }
    if (data.gitInfo.ahead > 0) {
      gitText += ` ${sym.git_ahead}${data.gitInfo.ahead}`;
    }
    if (data.gitInfo.behind > 0) {
      gitText += ` ${sym.git_behind}${data.gitInfo.behind}`;
    }
    const counts: string[] = [];
    if (data.gitInfo.staged && data.gitInfo.staged > 0)
      counts.push(`+${data.gitInfo.staged}`);
    if (data.gitInfo.unstaged && data.gitInfo.unstaged > 0)
      counts.push(`~${data.gitInfo.unstaged}`);
    if (data.gitInfo.untracked && data.gitInfo.untracked > 0)
      counts.push(`?${data.gitInfo.untracked}`);
    if (counts.length > 0) {
      gitText += ` (${counts.join(" ")})`;
    }
    parts.push(colorize(gitText, colors.gitFg, reset));
  }

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

export function formatBlockSegment(
  blockInfo: TuiData["blockInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  if (blockInfo.source === "native" && blockInfo.nativeUtilization !== null) {
    const pct = Math.round(blockInfo.nativeUtilization);
    let text = `${sym.block_cost} ${pct}%`;
    if (blockInfo.timeRemaining !== null) {
      text += ` · ${formatTimeRemaining(blockInfo.timeRemaining)}`;
    }
    return text;
  }

  const blockCost = formatCost(blockInfo.cost);
  let text = `${sym.block_cost} ${blockCost}`;

  if (blockInfo.timeRemaining !== null) {
    text += ` · ${formatTimeRemaining(blockInfo.timeRemaining)}`;
  }

  const blockBudget = config.budget?.block;
  if (blockBudget?.amount && blockInfo.cost !== null) {
    const status = getBudgetStatus(
      blockInfo.cost,
      blockBudget.amount,
      blockBudget.warningThreshold || 80,
    );
    text += status.displayText;
  }

  return text;
}

export function formatWeeklySegment(
  sevenDay: { used_percentage: number; resets_at: number },
  sym: SymbolSet,
): string {
  const pct = Math.round(sevenDay.used_percentage);
  const timeStr = formatLongTimeRemaining(
    minutesUntilReset(sevenDay.resets_at),
  );
  return `${sym.weekly_cost} ${pct}%${timeStr ? ` · ${timeStr}` : ""}`;
}

export function formatSessionSegment(
  usageInfo: TuiData["usageInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  const sessionCost = formatCost(usageInfo.session.cost);
  const sessionTokens = usageInfo.session.tokens;
  const tokenStr =
    sessionTokens !== null && sessionTokens > 0
      ? formatTokens(sessionTokens).replace(" tokens", "")
      : null;

  let text = `${sym.session_cost} ${sessionCost}`;
  if (tokenStr) {
    text += ` · ${tokenStr}`;
  }

  const sessionBudget = config.budget?.session;
  if (sessionBudget?.amount && usageInfo.session.cost !== null) {
    const status = getBudgetStatus(
      usageInfo.session.cost,
      sessionBudget.amount,
      sessionBudget.warningThreshold || 80,
    );
    text += status.displayText;
  }

  return text;
}

export function formatTodaySegment(
  todayInfo: TuiData["todayInfo"] & {},
  sym: SymbolSet,
  config: PowerlineConfig,
): string {
  const todayCost = formatCost(todayInfo.cost);
  let text = `${sym.today_cost} ${todayCost} today`;

  const todayBudget = config.budget?.today;
  if (todayBudget?.amount && todayInfo.cost !== null) {
    const status = getBudgetStatus(
      todayInfo.cost,
      todayBudget.amount,
      todayBudget.warningThreshold || 80,
    );
    text += status.displayText;
  }

  return text;
}

export function formatBurnSegment(blockInfo: TuiData["blockInfo"], sym: SymbolSet): string {
  if (!blockInfo || blockInfo.burnRate === null || blockInfo.burnRate === undefined || blockInfo.burnRate <= 0) {
    return "";
  }
  const burnStr = blockInfo.burnRate < 1
    ? `${(blockInfo.burnRate * 100).toFixed(0)}c/h`
    : `$${blockInfo.burnRate.toFixed(2)}/h`;
  return `${sym.metrics_burn} ${burnStr}`;
}

function formatMetricsSegment(data: TuiData, sym: SymbolSet): string {
  if (!data.metricsInfo) return "";
  const parts: string[] = [];
  if (data.metricsInfo.responseTime !== null && !isNaN(data.metricsInfo.responseTime) && data.metricsInfo.responseTime > 0) {
    parts.push(`${sym.metrics_response} ${formatResponseTime(data.metricsInfo.responseTime)}`);
  }
  if (data.metricsInfo.linesAdded !== null && data.metricsInfo.linesAdded > 0) {
    parts.push(`${sym.metrics_lines_added}${data.metricsInfo.linesAdded}`);
  }
  if (data.metricsInfo.linesRemoved !== null && data.metricsInfo.linesRemoved > 0) {
    parts.push(`${sym.metrics_lines_removed}${data.metricsInfo.linesRemoved}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "";
}

function formatActivitySegment(data: TuiData, sym: SymbolSet): string {
  const parts = collectActivityParts(data, sym);
  return parts.length > 0 ? parts.join(" · ") : "";
}

function formatGitSegment(data: TuiData, sym: SymbolSet): string {
  if (!data.gitInfo) return "";
  let gitText = `${sym.branch} ${data.gitInfo.branch}`;
  if (data.gitInfo.status === "conflicts") {
    gitText += ` ${sym.git_conflicts}`;
  } else if (data.gitInfo.status === "dirty") {
    gitText += ` ${sym.git_dirty}`;
  } else {
    gitText += ` ${sym.git_clean}`;
  }
  if (data.gitInfo.ahead > 0) {
    gitText += ` ${sym.git_ahead}${data.gitInfo.ahead}`;
  }
  if (data.gitInfo.behind > 0) {
    gitText += ` ${sym.git_behind}${data.gitInfo.behind}`;
  }
  const counts: string[] = [];
  if (data.gitInfo.staged && data.gitInfo.staged > 0) counts.push(`+${data.gitInfo.staged}`);
  if (data.gitInfo.unstaged && data.gitInfo.unstaged > 0) counts.push(`~${data.gitInfo.unstaged}`);
  if (data.gitInfo.untracked && data.gitInfo.untracked > 0) counts.push(`?${data.gitInfo.untracked}`);
  if (counts.length > 0) {
    gitText += ` (${counts.join(" ")})`;
  }
  return gitText;
}

function formatDirSegment(data: TuiData): string {
  return abbreviateFishStyle(getDirectoryDisplay(data.hookData));
}

function formatVersionSegment(data: TuiData, sym: SymbolSet): string {
  if (!data.hookData.version) return "";
  return `${sym.version} v${data.hookData.version}`;
}

function formatTmuxSegment(data: TuiData): string {
  if (!data.tmuxSessionId) return "";
  return `tmux:${data.tmuxSessionId}`;
}

function formatEnvSegment(config: PowerlineConfig): string {
  const envConfig = config.display.lines
    .map((line) => line.segments.env)
    .find((env) => env?.enabled);

  if (!envConfig || !envConfig.variable) return "";
  const envVal = process.env[envConfig.variable];
  if (!envVal) return "";
  const prefix = envConfig.prefix ?? envConfig.variable;
  return prefix ? `${prefix}:${envVal}` : envVal;
}

export function resolveSegments(data: TuiData, ctx: RenderCtx): Record<SegmentName, string> {
  const { sym, config, reset, colors } = ctx;

  const colorizeOrEmpty = (text: string, color: string): string =>
    text ? colorize(text, color, reset) : "";

  const contextLine = buildContextLine(data, ctx.contentWidth, sym, reset, colors);

  return {
    context: contextLine ?? "",
    block: data.blockInfo ? colorizeOrEmpty(formatBlockSegment(data.blockInfo, sym, config), colors.blockFg) : "",
    session: data.usageInfo ? colorizeOrEmpty(formatSessionSegment(data.usageInfo, sym, config), colors.sessionFg) : "",
    today: data.todayInfo ? colorizeOrEmpty(formatTodaySegment(data.todayInfo, sym, config), colors.todayFg) : "",
    git: colorizeOrEmpty(formatGitSegment(data, sym), colors.gitFg),
    dir: colorizeOrEmpty(formatDirSegment(data), colors.modeFg),
    version: colorizeOrEmpty(formatVersionSegment(data, sym), colors.versionFg),
    tmux: colorizeOrEmpty(formatTmuxSegment(data), colors.tmuxFg),
    metrics: colorizeOrEmpty(formatMetricsSegment(data, sym), colors.metricsFg),
    activity: colorizeOrEmpty(formatActivitySegment(data, sym), colors.metricsFg),
    burn: colorizeOrEmpty(formatBurnSegment(data.blockInfo, sym), colors.metricsFg),
    env: colorizeOrEmpty(formatEnvSegment(config), colors.envFg),
  };
}
