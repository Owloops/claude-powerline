import path from "node:path";
import type { ClaudeHookData } from "../utils/claude";
import type { PowerlineColors } from "../themes";
import type { PowerlineConfig } from "../config/loader";
import type { BlockInfo } from "./block";
import type { OmcModeInfo, OmcRalphInfo, OmcAgentsInfo, OmcSkillInfo, ActiveAgent } from "./omc";
import { formatModelName } from "../utils/formatters";

export interface SegmentConfig {
  enabled: boolean;
}

export interface DirectorySegmentConfig extends SegmentConfig {
  showBasename?: boolean;
  style?: "full" | "fish" | "basename";
}

export interface GitSegmentConfig extends SegmentConfig {
  showSha?: boolean;
  showAheadBehind?: boolean;
  showWorkingTree?: boolean;
  showOperation?: boolean;
  showTag?: boolean;
  showTimeSinceCommit?: boolean;
  showStashCount?: boolean;
  showUpstream?: boolean;
  showRepoName?: boolean;
}

export interface UsageSegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "breakdown";
  costSource?: "calculated" | "official";
  showCacheHitRate?: boolean;
  colorByCost?: boolean;
  costThresholds?: { low: number; medium: number };
}

export interface TmuxSegmentConfig extends SegmentConfig {}

export interface ContextSegmentConfig extends SegmentConfig {
  showPercentageOnly?: boolean;
  displayStyle?: "text" | "bar";
}

export interface MetricsSegmentConfig extends SegmentConfig {
  showResponseTime?: boolean;
  showLastResponseTime?: boolean;
  showDuration?: boolean;
  showMessageCount?: boolean;
  showLinesAdded?: boolean;
  showLinesRemoved?: boolean;
}

export interface BlockSegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "time" | "weighted";
  showCacheHitRate?: boolean;
  colorByCost?: boolean;
  costThresholds?: { low: number; medium: number };
}

export interface TodaySegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "breakdown";
}

export interface VersionSegmentConfig extends SegmentConfig {}

export interface OmcModeSegmentConfig extends SegmentConfig {}

export interface OmcRalphSegmentConfig extends SegmentConfig {
  warnThreshold?: number;
}

export type AgentsDisplayFormat = 'count' | 'codes' | 'codes-duration' | 'name' | 'detailed';

export interface OmcAgentsSegmentConfig extends SegmentConfig {
  format?: AgentsDisplayFormat;  // Default: 'count'
  showModelTier?: boolean;       // Show color-coded model tier
  maxDisplay?: number;           // Max agents to show (default: 3)
  showTokens?: boolean;          // Show per-agent token counts and cost (default: false)
}

export interface OmcSkillSegmentConfig extends SegmentConfig {}

export interface BurnRateSegmentConfig extends SegmentConfig {
  compact?: boolean;  // Use compact format (default: true)
}

export type AnySegmentConfig =
  | SegmentConfig
  | DirectorySegmentConfig
  | GitSegmentConfig
  | UsageSegmentConfig
  | TmuxSegmentConfig
  | ContextSegmentConfig
  | MetricsSegmentConfig
  | BlockSegmentConfig
  | TodaySegmentConfig
  | VersionSegmentConfig
  | OmcModeSegmentConfig
  | OmcRalphSegmentConfig
  | OmcAgentsSegmentConfig
  | OmcSkillSegmentConfig
  | BurnRateSegmentConfig;

import {
  formatCost,
  formatTokens,
  formatTokenBreakdown,
  formatTimeSince,
  formatDuration,
  getCostColorLevel,
  formatBurnRate,
  formatCacheHitRate,
} from "../utils/formatters";
import { getBudgetStatus } from "../utils/budget";
import type {
  UsageInfo,
  TokenBreakdown,
  GitInfo,
  ContextInfo,
  MetricsInfo,
} from ".";
import type { TodayInfo } from "./today";

export interface PowerlineSymbols {
  right: string;
  left: string;
  branch: string;
  model: string;
  git_clean: string;
  git_dirty: string;
  git_conflicts: string;
  git_ahead: string;
  git_behind: string;
  git_worktree: string;
  git_tag: string;
  git_sha: string;
  git_upstream: string;
  git_stash: string;
  git_time: string;
  session_cost: string;
  block_cost: string;
  today_cost: string;
  context_time: string;
  metrics_response: string;
  metrics_last_response: string;
  metrics_duration: string;
  metrics_messages: string;
  metrics_lines_added: string;
  metrics_lines_removed: string;
  metrics_burn: string;
  version: string;
  omc_mode_ultrawork: string;
  omc_mode_autopilot: string;
  omc_mode_ecomode: string;
  omc_mode_inactive: string;
  omc_ralph: string;
  omc_agents: string;
  omc_skill: string;
  bar_filled: string;
  bar_empty: string;
}

export interface SegmentData {
  text: string;
  bgColor: string;
  fgColor: string;
}

export class SegmentRenderer {
  constructor(
    private readonly config: PowerlineConfig,
    private readonly symbols: PowerlineSymbols,
  ) {}

  renderDirectory(
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    config?: DirectorySegmentConfig,
  ): SegmentData {
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const projectDir = hookData.workspace?.project_dir;

    const style = config?.style ?? (config?.showBasename ? "basename" : "full");

    if (style === "basename") {
      const basename = path.basename(currentDir) || "root";
      return {
        text: basename,
        bgColor: colors.modeBg,
        fgColor: colors.modeFg,
      };
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE;
    let displayDir = currentDir;
    let displayProjectDir = projectDir;

    if (homeDir) {
      if (currentDir.startsWith(homeDir)) {
        displayDir = currentDir.replace(homeDir, "~");
      }
      if (projectDir && projectDir.startsWith(homeDir)) {
        displayProjectDir = projectDir.replace(homeDir, "~");
      }
    }

    let dirName = this.getDisplayDirectoryName(displayDir, displayProjectDir);

    if (style === "fish") {
      dirName = this.abbreviateFishStyle(dirName);
    }

    return {
      text: dirName,
      bgColor: colors.modeBg,
      fgColor: colors.modeFg,
    };
  }

  renderGit(
    gitInfo: GitInfo,
    colors: PowerlineColors,
    config?: GitSegmentConfig,
  ): SegmentData | null {
    if (!gitInfo) return null;

    const parts: string[] = [];

    if (config?.showRepoName && gitInfo.repoName) {
      parts.push(gitInfo.repoName);
      if (gitInfo.isWorktree) {
        parts.push(this.symbols.git_worktree);
      }
    }

    if (config?.showOperation && gitInfo.operation) {
      parts.push(`[${gitInfo.operation}]`);
    }

    parts.push(`${this.symbols.branch} ${gitInfo.branch}`);

    if (config?.showTag && gitInfo.tag) {
      parts.push(`${this.symbols.git_tag} ${gitInfo.tag}`);
    }

    if (config?.showSha && gitInfo.sha) {
      parts.push(`${this.symbols.git_sha} ${gitInfo.sha}`);
    }

    if (config?.showAheadBehind !== false) {
      if (gitInfo.ahead > 0 && gitInfo.behind > 0) {
        parts.push(
          `${this.symbols.git_ahead}${gitInfo.ahead}${this.symbols.git_behind}${gitInfo.behind}`,
        );
      } else if (gitInfo.ahead > 0) {
        parts.push(`${this.symbols.git_ahead}${gitInfo.ahead}`);
      } else if (gitInfo.behind > 0) {
        parts.push(`${this.symbols.git_behind}${gitInfo.behind}`);
      }
    }

    if (config?.showWorkingTree) {
      const counts: string[] = [];
      if (gitInfo.staged && gitInfo.staged > 0)
        counts.push(`+${gitInfo.staged}`);
      if (gitInfo.unstaged && gitInfo.unstaged > 0)
        counts.push(`~${gitInfo.unstaged}`);
      if (gitInfo.untracked && gitInfo.untracked > 0)
        counts.push(`?${gitInfo.untracked}`);
      if (gitInfo.conflicts && gitInfo.conflicts > 0)
        counts.push(`!${gitInfo.conflicts}`);
      if (counts.length > 0) {
        parts.push(`(${counts.join(" ")})`);
      }
    }

    if (config?.showUpstream && gitInfo.upstream) {
      parts.push(`${this.symbols.git_upstream}${gitInfo.upstream}`);
    }

    if (
      config?.showStashCount &&
      gitInfo.stashCount &&
      gitInfo.stashCount > 0
    ) {
      parts.push(`${this.symbols.git_stash} ${gitInfo.stashCount}`);
    }

    if (config?.showTimeSinceCommit && gitInfo.timeSinceCommit !== undefined) {
      const time = formatTimeSince(gitInfo.timeSinceCommit);
      parts.push(`${this.symbols.git_time} ${time}`);
    }

    let gitStatusIcon = this.symbols.git_clean;
    if (gitInfo.status === "conflicts") {
      gitStatusIcon = this.symbols.git_conflicts;
    } else if (gitInfo.status === "dirty") {
      gitStatusIcon = this.symbols.git_dirty;
    }
    parts.push(gitStatusIcon);

    return {
      text: parts.join(" "),
      bgColor: colors.gitBg,
      fgColor: colors.gitFg,
    };
  }

  renderModel(hookData: ClaudeHookData, colors: PowerlineColors): SegmentData {
    const rawName = hookData.model?.display_name || "Claude";
    const modelName = formatModelName(rawName);

    return {
      text: `${this.symbols.model} ${modelName}`,
      bgColor: colors.modelBg,
      fgColor: colors.modelFg,
    };
  }

  renderSession(
    usageInfo: UsageInfo,
    colors: PowerlineColors,
    config?: UsageSegmentConfig,
  ): SegmentData {
    const type = config?.type || "cost";
    const costSource = config?.costSource;
    const sessionBudget = this.config.budget?.session;

    const getCost = () => {
      if (costSource === "calculated") return usageInfo.session.calculatedCost;
      if (costSource === "official") return usageInfo.session.officialCost;
      return usageInfo.session.cost;
    };
    const cost = getCost();

    const formattedUsage = this.formatUsageWithBudget(
      cost,
      usageInfo.session.tokens,
      usageInfo.session.tokenBreakdown,
      type,
      sessionBudget?.amount,
      sessionBudget?.warningThreshold || 80,
      sessionBudget?.type,
    );

    let text = `${this.symbols.session_cost} ${formattedUsage}`;
    let bgColor = colors.sessionBg;
    let fgColor = colors.sessionFg;

    // Cost-based coloring
    if (config?.colorByCost && cost !== null) {
      const level = getCostColorLevel(cost, config.costThresholds);
      if (level === 'normal' && colors.costNormalBg) {
        bgColor = colors.costNormalBg;
        fgColor = colors.costNormalFg || fgColor;
      } else if (level === 'warning' && colors.costWarningBg) {
        bgColor = colors.costWarningBg;
        fgColor = colors.costWarningFg || fgColor;
      } else if (level === 'critical' && colors.costCriticalBg) {
        bgColor = colors.costCriticalBg;
        fgColor = colors.costCriticalFg || fgColor;
      }
    }

    // Cache hit rate stays in session segment
    if (config?.showCacheHitRate && usageInfo.session.cacheHitRate !== null) {
      text += `  ${formatCacheHitRate(usageInfo.session.cacheHitRate)}`;
    }

    return { text, bgColor, fgColor };
  }

  renderBurnRate(
    usageInfo: UsageInfo,
    colors: PowerlineColors,
    config?: BurnRateSegmentConfig,
  ): SegmentData | null {
    const compact = config?.compact !== false;
    const text = formatBurnRate(usageInfo.session.burnRate, compact);

    return {
      text,
      bgColor: colors.burnRateBg || colors.metricsBg,
      fgColor: colors.burnRateFg || colors.metricsFg,
    };
  }

  renderTmux(
    sessionId: string | null,
    colors: PowerlineColors,
  ): SegmentData | null {
    if (!sessionId) {
      return {
        text: `tmux:none`,
        bgColor: colors.tmuxBg,
        fgColor: colors.tmuxFg,
      };
    }

    return {
      text: `tmux:${sessionId}`,
      bgColor: colors.tmuxBg,
      fgColor: colors.tmuxFg,
    };
  }

  renderContext(
    contextInfo: ContextInfo | null,
    colors: PowerlineColors,
    config?: ContextSegmentConfig,
  ): SegmentData | null {
    const barLength = 10;

    if (!contextInfo) {
      if (config?.displayStyle === "bar") {
        const emptyBar = this.symbols.bar_empty.repeat(barLength);
        return {
          text: `${emptyBar} 0%`,
          bgColor: colors.contextBg,
          fgColor: colors.contextFg,
        };
      }
      return {
        text: `${this.symbols.context_time} 0 (100%)`,
        bgColor: colors.contextBg,
        fgColor: colors.contextFg,
      };
    }

    let bgColor = colors.contextBg;
    let fgColor = colors.contextFg;

    if (contextInfo.contextLeftPercentage <= 20) {
      bgColor = colors.contextCriticalBg;
      fgColor = colors.contextCriticalFg;
    } else if (contextInfo.contextLeftPercentage <= 40) {
      bgColor = colors.contextWarningBg;
      fgColor = colors.contextWarningFg;
    }

    if (config?.displayStyle === "bar") {
      const usedPct = contextInfo.usablePercentage;
      const filledCount = Math.round((usedPct / 100) * barLength);
      const emptyCount = barLength - filledCount;
      const bar = this.symbols.bar_filled.repeat(filledCount) + this.symbols.bar_empty.repeat(emptyCount);

      const text = config?.showPercentageOnly
        ? `${bar} ${usedPct}%`
        : `${bar} ${contextInfo.totalTokens.toLocaleString()} (${usedPct}%)`;

      return { text, bgColor, fgColor };
    }

    const contextLeft = `${contextInfo.contextLeftPercentage}%`;
    const text = config?.showPercentageOnly
      ? `${this.symbols.context_time} ${contextLeft}`
      : `${this.symbols.context_time} ${contextInfo.totalTokens.toLocaleString()} (${contextLeft})`;

    return { text, bgColor, fgColor };
  }

  renderMetrics(
    metricsInfo: MetricsInfo | null,
    colors: PowerlineColors,
    _blockInfo: BlockInfo | null,
    config?: MetricsSegmentConfig,
  ): SegmentData | null {
    if (!metricsInfo) {
      return {
        text: `${this.symbols.metrics_response} new`,
        bgColor: colors.metricsBg,
        fgColor: colors.metricsFg,
      };
    }

    const parts: string[] = [];

    if (config?.showLastResponseTime && metricsInfo.lastResponseTime !== null) {
      const lastResponseTime =
        metricsInfo.lastResponseTime < 60
          ? `${metricsInfo.lastResponseTime.toFixed(1)}s`
          : `${(metricsInfo.lastResponseTime / 60).toFixed(1)}m`;
      parts.push(`${this.symbols.metrics_last_response} ${lastResponseTime}`);
    }

    if (
      config?.showResponseTime !== false &&
      metricsInfo.responseTime !== null
    ) {
      const responseTime =
        metricsInfo.responseTime < 60
          ? `${metricsInfo.responseTime.toFixed(1)}s`
          : `${(metricsInfo.responseTime / 60).toFixed(1)}m`;
      parts.push(`${this.symbols.metrics_response} ${responseTime}`);
    }

    if (
      config?.showDuration !== false &&
      metricsInfo.sessionDuration !== null
    ) {
      const duration = formatDuration(metricsInfo.sessionDuration);
      parts.push(`${this.symbols.metrics_duration} ${duration}`);
    }

    if (
      config?.showMessageCount !== false &&
      metricsInfo.messageCount !== null
    ) {
      parts.push(
        `${this.symbols.metrics_messages} ${metricsInfo.messageCount}`,
      );
    }

    if (
      config?.showLinesAdded !== false &&
      metricsInfo.linesAdded !== null &&
      metricsInfo.linesAdded > 0
    ) {
      parts.push(
        `${this.symbols.metrics_lines_added} ${metricsInfo.linesAdded}`,
      );
    }

    if (
      config?.showLinesRemoved !== false &&
      metricsInfo.linesRemoved !== null &&
      metricsInfo.linesRemoved > 0
    ) {
      parts.push(
        `${this.symbols.metrics_lines_removed} ${metricsInfo.linesRemoved}`,
      );
    }

    if (parts.length === 0) {
      return {
        text: `${this.symbols.metrics_response} active`,
        bgColor: colors.metricsBg,
        fgColor: colors.metricsFg,
      };
    }

    return {
      text: parts.join(" "),
      bgColor: colors.metricsBg,
      fgColor: colors.metricsFg,
    };
  }

  renderBlock(
    blockInfo: BlockInfo,
    colors: PowerlineColors,
    config?: BlockSegmentConfig,
  ): SegmentData {
    let displayText: string;

    if (blockInfo.cost === null && blockInfo.tokens === null) {
      displayText = "No active block";
    } else {
      const type = config?.type || "cost";
      const blockBudget = this.config.budget?.block;

      const timeStr =
        blockInfo.timeRemaining !== null
          ? (() => {
              const hours = Math.floor(blockInfo.timeRemaining / 60);
              const minutes = blockInfo.timeRemaining % 60;
              return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            })()
          : null;

      let mainContent: string;
      switch (type) {
        case "cost":
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            null,
            null,
            "cost",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "tokens":
          mainContent = this.formatUsageWithBudget(
            null,
            blockInfo.tokens,
            null,
            "tokens",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "weighted":
          const rateLimit =
            blockBudget?.type === "tokens" ? blockBudget.amount : undefined;
          const weightedDisplay = formatTokens(blockInfo.weightedTokens);
          if (rateLimit && blockInfo.weightedTokens !== null) {
            const rateLimitStatus = getBudgetStatus(
              blockInfo.weightedTokens,
              rateLimit,
              blockBudget?.warningThreshold || 80,
            );
            mainContent = `${weightedDisplay}${rateLimitStatus.displayText}`;
          } else {
            mainContent = `${weightedDisplay} (weighted)`;
          }
          break;
        case "both":
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            blockInfo.tokens,
            null,
            "both",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "time":
          mainContent = timeStr || "N/A";
          break;
        default:
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            null,
            null,
            "cost",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
      }

      if (type === "time") {
        displayText = mainContent;
      } else {
        displayText = timeStr
          ? `${mainContent} (${timeStr} left)`
          : mainContent;
      }
    }

    let bgColor = colors.blockBg;
    let fgColor = colors.blockFg;

    // Cost-based coloring
    if (config?.colorByCost && blockInfo.cost !== null) {
      const level = getCostColorLevel(blockInfo.cost, config.costThresholds);
      if (level === 'normal' && colors.costNormalBg) {
        bgColor = colors.costNormalBg;
        fgColor = colors.costNormalFg || fgColor;
      } else if (level === 'warning' && colors.costWarningBg) {
        bgColor = colors.costWarningBg;
        fgColor = colors.costWarningFg || fgColor;
      } else if (level === 'critical' && colors.costCriticalBg) {
        bgColor = colors.costCriticalBg;
        fgColor = colors.costCriticalFg || fgColor;
      }
    }

    // Add cache hit rate
    if (config?.showCacheHitRate && blockInfo.cacheHitRate !== null) {
      displayText += ` | ${formatCacheHitRate(blockInfo.cacheHitRate)}`;
    }

    return {
      text: `${this.symbols.block_cost} ${displayText}`,
      bgColor,
      fgColor,
    };
  }

  renderToday(
    todayInfo: TodayInfo,
    colors: PowerlineColors,
    type = "cost",
  ): SegmentData {
    const todayBudget = this.config.budget?.today;
    const text = `${this.symbols.today_cost} ${this.formatUsageWithBudget(
      todayInfo.cost,
      todayInfo.tokens,
      todayInfo.tokenBreakdown,
      type,
      todayBudget?.amount,
      todayBudget?.warningThreshold,
      todayBudget?.type,
    )}`;

    return {
      text,
      bgColor: colors.todayBg,
      fgColor: colors.todayFg,
    };
  }

  private getDisplayDirectoryName(
    currentDir: string,
    projectDir?: string,
  ): string {
    if (currentDir.startsWith("~")) {
      return currentDir;
    }

    if (projectDir && projectDir !== currentDir) {
      if (currentDir.startsWith(projectDir)) {
        const relativePath = currentDir.slice(projectDir.length + 1);
        return relativePath || path.basename(projectDir) || "project";
      }
      return path.basename(currentDir) || "root";
    }

    return path.basename(currentDir) || "root";
  }

  private abbreviateFishStyle(dirPath: string): string {
    const parts = dirPath.split(path.sep);
    return parts
      .map((part, index) => {
        if (index === parts.length - 1) return part;
        if (part === "~" || part === "") return part;
        return part.charAt(0);
      })
      .join(path.sep);
  }

  private formatUsageDisplay(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: TokenBreakdown | null,
    type: string,
  ): string {
    switch (type) {
      case "cost":
        return formatCost(cost);
      case "tokens":
        return formatTokens(tokens);
      case "both":
        return `${formatCost(cost)} (${formatTokens(tokens)})`;
      case "breakdown":
        return formatTokenBreakdown(tokenBreakdown);
      default:
        return formatCost(cost);
    }
  }

  private formatUsageWithBudget(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: TokenBreakdown | null,
    type: string,
    budget: number | undefined,
    warningThreshold = 80,
    budgetType?: "cost" | "tokens",
  ): string {
    const baseDisplay = this.formatUsageDisplay(
      cost,
      tokens,
      tokenBreakdown,
      type,
    );

    if (budget && budget > 0) {
      let budgetValue: number | null = null;

      if (budgetType === "tokens" && tokens !== null) {
        budgetValue = tokens;
      } else if (budgetType === "cost" && cost !== null) {
        budgetValue = cost;
      } else if (!budgetType && cost !== null) {
        budgetValue = cost;
      }

      if (budgetValue !== null) {
        const budgetStatus = getBudgetStatus(
          budgetValue,
          budget,
          warningThreshold,
        );
        return baseDisplay + budgetStatus.displayText;
      }
    }

    return baseDisplay;
  }

  renderVersion(
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    _config?: VersionSegmentConfig,
  ): SegmentData | null {
    if (!hookData.version) {
      return null;
    }

    return {
      text: `${this.symbols.version} v${hookData.version}`,
      bgColor: colors.versionBg,
      fgColor: colors.versionFg,
    };
  }

  renderOmcMode(
    modeInfo: OmcModeInfo | null,
    colors: PowerlineColors,
    _config?: OmcModeSegmentConfig
  ): SegmentData | null {
    // Hide segment entirely when no mode is active
    if (!modeInfo || !modeInfo.active) {
      return null;
    }

    let symbol: string;
    switch (modeInfo.mode) {
      case 'ultrawork':
        symbol = this.symbols.omc_mode_ultrawork;
        break;
      case 'autopilot':
        symbol = this.symbols.omc_mode_autopilot;
        break;
      case 'ecomode':
        symbol = this.symbols.omc_mode_ecomode;
        break;
      default:
        symbol = this.symbols.omc_mode_inactive;
    }

    // Show icon + mode name (e.g., "⚡ ultrawork")
    return {
      text: `${symbol} ${modeInfo.mode}`,
      bgColor: colors.omcModeActiveBg,
      fgColor: colors.omcModeActiveFg,
    };
  }

  renderOmcRalph(
    ralphInfo: OmcRalphInfo | null,
    colors: PowerlineColors,
    config?: OmcRalphSegmentConfig
  ): SegmentData | null {
    // Hide segment entirely when ralph is not active
    if (!ralphInfo || !ralphInfo.active) {
      return null;
    }

    const warnThreshold = config?.warnThreshold ?? 7;

    const current = ralphInfo.currentIteration ?? 0;
    const max = ralphInfo.maxIterations ?? 10;
    const text = `${this.symbols.omc_ralph} ${current}/${max}`;

    if (current >= max) {
      return {
        text,
        bgColor: colors.omcRalphMaxBg,
        fgColor: colors.omcRalphMaxFg,
      };
    } else if (current >= warnThreshold) {
      return {
        text,
        bgColor: colors.omcRalphWarnBg,
        fgColor: colors.omcRalphWarnFg,
      };
    }

    return {
      text,
      bgColor: colors.omcRalphActiveBg,
      fgColor: colors.omcRalphActiveFg,
    };
  }

  renderOmcAgents(
    agentsInfo: OmcAgentsInfo | null,
    colors: PowerlineColors,
    config?: OmcAgentsSegmentConfig
  ): SegmentData | null {
    const count = agentsInfo?.count ?? 0;
    const allAgents = agentsInfo?.agents ?? [];

    // Hide segment entirely when no agents are running
    if (count === 0) {
      return null;
    }

    // Filter to RUNNING agents only for display
    const runningAgents = allAgents.filter(a => a.status === 'running');

    const format = config?.format ?? 'count';
    const showModelTier = config?.showModelTier ?? false;
    const maxDisplay = config?.maxDisplay ?? 3;

    let displayText: string;

    switch (format) {
      case 'count': {
        displayText = count === 1 && agentsInfo?.agentType
          ? agentsInfo.agentType
          : String(count);
        break;
      }

      case 'codes': {
        displayText = this.formatAgentCodes(runningAgents, maxDisplay, showModelTier, colors);
        if (count > maxDisplay) displayText += `+${count - maxDisplay}`;
        break;
      }

      case 'codes-duration': {
        const grouped = this.groupAgentsByType(runningAgents);
        displayText = grouped.slice(0, maxDisplay).map(g => {
          const code = this.getAgentTypeCode(g.type);
          const formattedCode = showModelTier && g.agents[0]?.model
            ? this.formatModelTierCode(code, g.agents[0].model, colors)
            : code;
          const countSuffix = g.count > 1 ? `×${g.count}` : '';
          const duration = g.totalDuration ? `(${g.totalDuration})` : '';
          return `${formattedCode}${countSuffix}${duration}`;
        }).join('');
        if (count > maxDisplay) displayText += `+${count - maxDisplay}`;
        break;
      }

      case 'name': {
        const grouped = this.groupAgentsByType(runningAgents);
        displayText = grouped.slice(0, maxDisplay).map(g => {
          const name = g.type.split(':').pop() || 'agent';
          return g.count > 1 ? `${name}×${g.count}` : name;
        }).join(',');
        if (count > maxDisplay) displayText += `+${count - maxDisplay}`;
        break;
      }

      case 'detailed': {
        const grouped = this.groupAgentsByType(runningAgents);
        const groupedParts = grouped.slice(0, maxDisplay).map(g => {
          const name = g.type.split(':').pop() || 'agent';
          const countSuffix = g.count > 1 ? `×${g.count}` : '';
          const duration = g.totalDuration ? `(${g.totalDuration})` : '';
          return `${name}${countSuffix}${duration}`;
        });
        displayText = '[' + groupedParts.join(',') + ']';
        if (grouped.length > maxDisplay) {
          displayText = displayText.slice(0, -1) + `+${grouped.length - maxDisplay}]`;
        }
        break;
      }

      default:
        displayText = String(count);
    }

    // Append token info when showTokens is enabled (CODEX-4 FIX)
    if (config?.showTokens) {
      const tokenSummary = this.formatAgentTokenSummary(runningAgents);
      if (tokenSummary) {
        displayText += ` ${tokenSummary}`;
      }
    }

    return {
      text: `${this.symbols.omc_agents} ${displayText}`,
      bgColor: colors.omcAgentsActiveBg,
      fgColor: colors.omcAgentsActiveFg,
    };
  }

  /**
   * Format token summary for running agents.
   * Returns format like "(12.5k, $0.05)" or null if no token data.
   */
  private formatAgentTokenSummary(agents: ActiveAgent[]): string | null {
    let totalTokens = 0;
    let totalCost = 0;

    for (const agent of agents) {
      if (agent.tokens) {
        totalTokens += agent.tokens.input + agent.tokens.output +
                       agent.tokens.cacheCreation + agent.tokens.cacheRead;
      }
      if (agent.cost) {
        totalCost += agent.cost;
      }
    }

    if (totalTokens === 0 && totalCost === 0) return null;

    const tokenStr = this.formatTokenCount(totalTokens);
    const costStr = totalCost > 0 ? `$${totalCost.toFixed(3)}` : '';

    if (tokenStr && costStr) {
      return `(${tokenStr}, ${costStr})`;
    } else if (tokenStr) {
      return `(${tokenStr})`;
    } else if (costStr) {
      return `(${costStr})`;
    }
    return null;
  }

  /**
   * Format token count compactly (e.g., 12500 -> "12.5k")
   */
  private formatTokenCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return String(count);
  }

  /**
   * Format agent codes with optional model tier coloring.
   */
  private formatAgentCodes(
    agents: ActiveAgent[],
    maxDisplay: number,
    showModelTier: boolean,
    colors: PowerlineColors
  ): string {
    return agents.slice(0, maxDisplay).map(a => {
      const typeCode = this.getAgentTypeCode(a.type);
      if (showModelTier && a.model) {
        return this.formatModelTierCode(typeCode, a.model, colors);
      }
      return typeCode;
    }).join('');
  }

  /**
   * Get single-character code for agent type
   */
  private getAgentTypeCode(type: string): string {
    const name = type.split(':').pop()?.toLowerCase() || 'x';
    const codeMap: Record<string, string> = {
      'executor': 'e', 'executor-low': 'e', 'executor-high': 'e',
      'architect': 'a', 'architect-low': 'a', 'architect-medium': 'a',
      'explore': 'x', 'explore-medium': 'x', 'explore-high': 'x',
      'designer': 'd', 'designer-low': 'd', 'designer-high': 'd',
      'researcher': 'r', 'researcher-low': 'r',
      'writer': 'w',
      'planner': 'p',
      'critic': 'c',
      'analyst': 'n',
      'qa-tester': 'q', 'qa-tester-high': 'q',
      'scientist': 's', 'scientist-low': 's', 'scientist-high': 's',
      'build-fixer': 'b', 'build-fixer-low': 'b',
      'security-reviewer': 'y', 'security-reviewer-low': 'y',
      'code-reviewer': 'v', 'code-reviewer-low': 'v',
      'tdd-guide': 't', 'tdd-guide-low': 't',
      'vision': 'i',
    };
    return codeMap[name] || name.charAt(0);
  }

  /**
   * Format code with model tier visual differentiation.
   * Opus=UPPERCASE+magenta, Sonnet=lowercase+yellow, Haiku=lowercase+green
   */
  private formatModelTierCode(code: string, model: string, colors: PowerlineColors): string {
    const modelLower = model?.toLowerCase() || '';

    // codex-4 fix: use includes() for flexible model string matching
    // Real model strings may be 'claude-3-opus-...' not just 'opus'
    const tier = modelLower.includes('opus') ? 'opus'
      : modelLower.includes('sonnet') ? 'sonnet'
      : modelLower.includes('haiku') ? 'haiku'
      : null;

    // Determine casing: Opus=UPPER, Sonnet/Haiku=lower
    const casedCode = tier === 'opus' ? code.toUpperCase() : code.toLowerCase();

    // Get model-specific ANSI fg code from theme
    let ansiFg: string | undefined;
    switch (tier) {
      case 'opus':
        ansiFg = colors.omcAgentOpusFg;
        break;
      case 'sonnet':
        ansiFg = colors.omcAgentSonnetFg;
        break;
      case 'haiku':
        ansiFg = colors.omcAgentHaikuFg;
        break;
    }

    // If ANSI code available, wrap text then restore base segment fg
    if (ansiFg) {
      return `${ansiFg}${casedCode}${colors.omcAgentsActiveFg}`;
    }

    // Fallback for non-color terminals: use superscript suffix
    const suffixMap: Record<string, string> = {
      'opus': '\u1D3C',    // superscript O
      'sonnet': '\u02E2',  // superscript s
      'haiku': '\u02B0',   // superscript h
    };
    const suffix = tier ? (suffixMap[tier] || '') : '';
    return casedCode + suffix;
  }

  /**
   * Format agent duration as compact string (e.g., "2m", "45s")
   */
  private formatAgentDuration(agent: ActiveAgent): string | null {
    if (!agent.startTime) return null;
    const endTime = agent.endTime || new Date();
    const durationMs = endTime.getTime() - agent.startTime.getTime();
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  }

  /**
   * Group agents by type for compact display.
   * Groups by agent.type only (not model tier).
   * When showModelTier is true, uses first agent's model as representative.
   */
  private groupAgentsByType(agents: ActiveAgent[]): Array<{
    type: string;
    count: number;
    totalDuration: string | null;
    agents: ActiveAgent[];
  }> {
    const groups = new Map<string, ActiveAgent[]>();

    for (const agent of agents) {
      const key = agent.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(agent);
    }

    return Array.from(groups.entries()).map(([type, agentList]) => {
      const totalMs = agentList.reduce((sum, a) => {
        const end = a.endTime || new Date();
        return sum + (end.getTime() - a.startTime.getTime());
      }, 0);

      return {
        type,
        count: agentList.length,
        totalDuration: this.formatDurationMs(totalMs),
        agents: agentList,
      };
    });
  }

  private formatDurationMs(ms: number): string | null {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m`;
  }

  renderOmcSkill(
    skillInfo: OmcSkillInfo | null,
    colors: PowerlineColors,
    _config?: OmcSkillSegmentConfig
  ): SegmentData | null {
    // Hide segment entirely when no skill has been activated
    if (!skillInfo || !skillInfo.name) {
      return null;
    }

    // Format: "skill:planner" or "skill:analyze(query)"
    const argsDisplay = skillInfo.args ? `(${skillInfo.args})` : '';
    const text = `skill:${skillInfo.name}${argsDisplay}`;

    return {
      text,
      bgColor: colors.omcSkillActiveBg,
      fgColor: colors.omcSkillActiveFg,
    };
  }
}
