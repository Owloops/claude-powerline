import path from "node:path";
import type { ClaudeHookData } from "../utils/claude";
import type { PowerlineColors } from "../themes";
import type { PowerlineConfig } from "../config/loader";
import type { BlockInfo } from "./block";

export interface SegmentConfig {
  enabled: boolean;
}

export interface DirectorySegmentConfig extends SegmentConfig {
  showBasename?: boolean;
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
}

export interface TmuxSegmentConfig extends SegmentConfig {}

export interface ContextSegmentConfig extends SegmentConfig {}

export interface MetricsSegmentConfig extends SegmentConfig {
  showResponseTime?: boolean;
  showLastResponseTime?: boolean;
  showDuration?: boolean;
  showMessageCount?: boolean;
}

export interface BlockSegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "time";
  burnType?: "cost" | "tokens" | "both" | "none";
}

export interface TodaySegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "breakdown";
}

export interface VersionSegmentConfig extends SegmentConfig {}

export interface ModelSegmentConfig extends SegmentConfig {
  customIcon?: string;           // Universal custom icon for all models
  modelIcons?: {                 // Model-specific icons
    opus?: string;
    sonnet?: string;
    [key: string]: string | undefined;  // For future models
  };
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
  | ModelSegmentConfig;

import {
  formatCost,
  formatTokens,
  formatTokenBreakdown,
  formatTimeSince,
  formatDuration,
} from "../utils/formatters";
import { getBudgetStatus } from "../utils/budget";
import type {
  UsageInfo,
  TokenBreakdown,
  GitInfo,
  ContextInfo,
  MetricsInfo,
  VersionInfo,
} from ".";
import type { TodayInfo } from "./today";

export interface PowerlineSymbols {
  right: string;
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
  metrics_burn: string;
  version: string;
}

export interface SegmentData {
  text: string;
  bgColor: string;
  fgColor: string;
}

export class SegmentRenderer {
  constructor(
    private readonly config: PowerlineConfig,
    private readonly symbols: PowerlineSymbols
  ) {}

  renderDirectory(
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    config?: DirectorySegmentConfig
  ): SegmentData {
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const projectDir = hookData.workspace?.project_dir;

    if (config?.showBasename) {
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

    const dirName = this.getDisplayDirectoryName(displayDir, displayProjectDir);

    return {
      text: dirName,
      bgColor: colors.modeBg,
      fgColor: colors.modeFg,
    };
  }

  renderGit(
    gitInfo: GitInfo,
    colors: PowerlineColors,
    config?: GitSegmentConfig
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
          `${this.symbols.git_ahead}${gitInfo.ahead}${this.symbols.git_behind}${gitInfo.behind}`
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

  private resolveModelIcon(
    modelName: string,
    config?: ModelSegmentConfig
  ): string {
    // Default fallback
    const defaultIcon = "⚡";
    
    if (!config) {
      return defaultIcon;
    }

    // Check for model-specific icons first (highest priority)
    if (config.modelIcons) {
      const lowerModelName = modelName.toLowerCase();
      
      // Check each configured model icon for partial matches
      for (const [modelKey, icon] of Object.entries(config.modelIcons)) {
        if (icon && lowerModelName.includes(modelKey.toLowerCase())) {
          return icon;
        }
      }
    }

    // Fall back to universal custom icon if set
    if (config.customIcon) {
      return config.customIcon;
    }

    // Final fallback to default
    return defaultIcon;
  }

  renderModel(
    hookData: ClaudeHookData, 
    colors: PowerlineColors,
    config?: ModelSegmentConfig
  ): SegmentData {
    const modelName = hookData.model?.display_name || "Claude";
    const modelIcon = this.resolveModelIcon(modelName, config);

    return {
      text: `${modelIcon} ${modelName}`,
      bgColor: colors.modelBg,
      fgColor: colors.modelFg,
    };
  }

  renderSession(
    usageInfo: UsageInfo,
    colors: PowerlineColors,
    type = "cost"
  ): SegmentData {
    const sessionBudget = this.config.budget?.session;
    const text = `${this.symbols.session_cost} ${this.formatUsageWithBudget(
      usageInfo.session.cost,
      usageInfo.session.tokens,
      usageInfo.session.tokenBreakdown,
      type,
      sessionBudget?.amount,
      sessionBudget?.warningThreshold || 80
    )}`;

    return {
      text,
      bgColor: colors.sessionBg,
      fgColor: colors.sessionFg,
    };
  }

  renderTmux(
    sessionId: string | null,
    colors: PowerlineColors
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
    colors: PowerlineColors
  ): SegmentData | null {
    if (!contextInfo) {
      return {
        text: `${this.symbols.context_time} 0 (100%)`,
        bgColor: colors.contextBg,
        fgColor: colors.contextFg,
      };
    }

    const tokenDisplay = contextInfo.inputTokens.toLocaleString();

    const contextLeft = `${contextInfo.contextLeftPercentage}%`;

    return {
      text: `${this.symbols.context_time} ${tokenDisplay} (${contextLeft})`,
      bgColor: colors.contextBg,
      fgColor: colors.contextFg,
    };
  }

  renderMetrics(
    metricsInfo: MetricsInfo | null,
    colors: PowerlineColors,
    _blockInfo: BlockInfo | null,
    config?: MetricsSegmentConfig
  ): SegmentData | null {
    if (!metricsInfo) {
      return {
        text: `${this.symbols.metrics_response} new`,
        bgColor: colors.metricsBg,
        fgColor: colors.metricsFg,
      };
    }

    const parts: string[] = [];

    if (config?.showLastResponseTime) {
      const lastResponseTime =
        metricsInfo.lastResponseTime === null
          ? "0.0s"
          : metricsInfo.lastResponseTime < 60
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
        `${this.symbols.metrics_messages} ${metricsInfo.messageCount}`
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
    config?: BlockSegmentConfig
  ): SegmentData {
    let displayText: string;

    if (blockInfo.cost === null && blockInfo.tokens === null) {
      displayText = "No active block";
    } else {
      const type = config?.type || "cost";
      const burnType = config?.burnType;

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
          mainContent = formatCost(blockInfo.cost);
          break;
        case "tokens":
          mainContent = formatTokens(blockInfo.tokens);
          break;
        case "both":
          mainContent = `${formatCost(blockInfo.cost)} / ${formatTokens(blockInfo.tokens)}`;
          break;
        case "time":
          mainContent = timeStr || "N/A";
          break;
        default:
          mainContent = formatCost(blockInfo.cost);
      }

      let burnContent = "";
      if (burnType && burnType !== "none") {
        switch (burnType) {
          case "cost":
            const costBurnRate =
              blockInfo.burnRate !== null
                ? blockInfo.burnRate < 1
                  ? `${(blockInfo.burnRate * 100).toFixed(0)}¢/h`
                  : `$${blockInfo.burnRate.toFixed(2)}/h`
                : "N/A";
            burnContent = ` | ${costBurnRate}`;
            break;
          case "tokens":
            const tokenBurnRate =
              blockInfo.tokenBurnRate !== null
                ? `${formatTokens(Math.round(blockInfo.tokenBurnRate))}/h`
                : "N/A";
            burnContent = ` | ${tokenBurnRate}`;
            break;
          case "both":
            const costBurn =
              blockInfo.burnRate !== null
                ? blockInfo.burnRate < 1
                  ? `${(blockInfo.burnRate * 100).toFixed(0)}¢/h`
                  : `$${blockInfo.burnRate.toFixed(2)}/h`
                : "N/A";
            const tokenBurn =
              blockInfo.tokenBurnRate !== null
                ? `${formatTokens(Math.round(blockInfo.tokenBurnRate))}/h`
                : "N/A";
            burnContent = ` | ${costBurn} / ${tokenBurn}`;
            break;
        }
      }

      if (type === "time") {
        displayText = mainContent;
      } else {
        displayText = timeStr
          ? `${mainContent}${burnContent} (${timeStr} left)`
          : `${mainContent}${burnContent}`;
      }
    }

    return {
      text: `${this.symbols.block_cost} ${displayText}`,
      bgColor: colors.blockBg,
      fgColor: colors.blockFg,
    };
  }

  renderToday(
    todayInfo: TodayInfo,
    colors: PowerlineColors,
    type = "cost"
  ): SegmentData {
    const todayBudget = this.config.budget?.today;
    const text = `${this.symbols.today_cost} ${this.formatUsageWithBudget(
      todayInfo.cost,
      todayInfo.tokens,
      todayInfo.tokenBreakdown,
      type,
      todayBudget?.amount,
      todayBudget?.warningThreshold
    )}`;

    return {
      text,
      bgColor: colors.todayBg,
      fgColor: colors.todayFg,
    };
  }


  private getDisplayDirectoryName(
    currentDir: string,
    projectDir?: string
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

  private formatUsageDisplay(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: TokenBreakdown | null,
    type: string
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
    warningThreshold = 80
  ): string {
    const baseDisplay = this.formatUsageDisplay(
      cost,
      tokens,
      tokenBreakdown,
      type
    );

    if (budget && budget > 0 && cost !== null) {
      const budgetStatus = getBudgetStatus(cost, budget, warningThreshold);
      return baseDisplay + budgetStatus.displayText;
    }

    return baseDisplay;
  }

  renderVersion(
    versionInfo: VersionInfo | null,
    colors: PowerlineColors,
    _config?: VersionSegmentConfig
  ): SegmentData | null {
    if (!versionInfo || !versionInfo.version) {
      return null;
    }

    return {
      text: `${this.symbols.version} ${versionInfo.version}`,
      bgColor: colors.versionBg,
      fgColor: colors.versionFg,
    };
  }
}
