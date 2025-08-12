import type { PowerlineConfig } from "../types/config";
import type { ClaudeHookData } from "../types";
import {
  formatCost,
  formatTokens,
  formatTokenBreakdown,
  formatTimeRemaining,
} from "./formatters";
import { getBudgetStatus } from "./budget";
import type { UsageInfo, SessionBlockInfo } from "./usage-provider";
import type { GitInfo } from "./git-service";

export interface PowerlineSymbols {
  right: string;
  branch: string;
  model: string;
  git_clean: string;
  git_dirty: string;
  git_conflicts: string;
  git_ahead: string;
  git_behind: string;
  session_cost: string;
  daily_cost: string;
  block_cost: string;
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

  renderDirectory(hookData: ClaudeHookData, colors: any): SegmentData {
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const projectDir = hookData.workspace?.project_dir;
    const dirName = this.getDisplayDirectoryName(currentDir, projectDir);

    return {
      text: dirName,
      bgColor: colors.modeBg,
      fgColor: colors.modeFg,
    };
  }

  renderGit(
    gitInfo: GitInfo,
    colors: any,
    showSha = false
  ): SegmentData | null {
    if (!gitInfo) return null;

    let gitStatusIcon = this.symbols.git_clean;
    if (gitInfo.status === "conflicts") {
      gitStatusIcon = this.symbols.git_conflicts;
    } else if (gitInfo.status === "dirty") {
      gitStatusIcon = this.symbols.git_dirty;
    }

    let text = `${this.symbols.branch} ${gitInfo.branch} ${gitStatusIcon}`;

    if (gitInfo.sha && showSha) {
      text += ` ${gitInfo.sha}`;
    }

    if (gitInfo.ahead > 0 && gitInfo.behind > 0) {
      text += ` ${this.symbols.git_ahead}${gitInfo.ahead}${this.symbols.git_behind}${gitInfo.behind}`;
    } else if (gitInfo.ahead > 0) {
      text += ` ${this.symbols.git_ahead}${gitInfo.ahead}`;
    } else if (gitInfo.behind > 0) {
      text += ` ${this.symbols.git_behind}${gitInfo.behind}`;
    }

    return {
      text,
      bgColor: colors.gitBg,
      fgColor: colors.gitFg,
    };
  }

  renderModel(hookData: ClaudeHookData, colors: any): SegmentData {
    const modelName = hookData.model?.display_name || "Claude";

    return {
      text: `${this.symbols.model} ${modelName}`,
      bgColor: colors.modelBg,
      fgColor: colors.modelFg,
    };
  }

  renderSession(usageInfo: UsageInfo, colors: any, type = "cost"): SegmentData {
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

  renderToday(usageInfo: UsageInfo, colors: any, type = "cost"): SegmentData {
    const todayBudget = this.config.budget?.today;
    const text = `Today ${this.formatUsageWithBudget(
      usageInfo.daily.cost,
      usageInfo.daily.tokens,
      usageInfo.daily.tokenBreakdown,
      type,
      todayBudget?.amount,
      todayBudget?.warningThreshold || 80
    )}`;

    return {
      text,
      bgColor: colors.burnLowBg,
      fgColor: colors.burnFg,
    };
  }

  renderBlock(
    blockInfo: SessionBlockInfo | null,
    colors: any,
    type = "cost"
  ): SegmentData | null {
    if (!blockInfo) return null;

    const text = `${this.symbols.block_cost} ${this.formatSessionBlockInfoOld(blockInfo, type)}`;

    return {
      text,
      bgColor: colors.blockBg,
      fgColor: colors.blockFg,
    };
  }

  private getUsageColors(blockInfo: SessionBlockInfo, colors: any): {bg: string, fg: string} {
    const percentage = (blockInfo.tokens / blockInfo.tokenLimit) * 100;
    
    // Always use black background, only change text color
    const bg = colors.usageBg; // Black background from theme
    
    // Match ccusage exact color thresholds - text color only
    if (percentage > 100) {
      // Red text - Over limit (>100%)
      return { bg, fg: this.hexToAnsi("#dc2626", false) };
    } else if (percentage > 80) {
      // Yellow text - Warning zone (80-100%)
      return { bg, fg: this.hexToAnsi("#ca8a04", false) };
    } else {
      // Green text - Normal usage (0-80%)
      return { bg, fg: this.hexToAnsi("#16a34a", false) };
    }
  }

  private hexToAnsi(hex: string, isBackground: boolean): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `\x1b[${isBackground ? "48" : "38"};2;${r};${g};${b}m`;
  }

  renderUsage(
    blockInfo: SessionBlockInfo | null,
    colors: any
  ): SegmentData | null {
    if (!blockInfo) return null;

    const text = `${this.formatSessionBlockInfo(blockInfo)}`;
    const usageColors = this.getUsageColors(blockInfo, colors);

    return {
      text,
      bgColor: usageColors.bg,
      fgColor: usageColors.fg,
    };
  }

  renderTmux(sessionId: string | null, colors: any): SegmentData | null {
    if (!sessionId) return null;

    return {
      text: `tmux:${sessionId}`,
      bgColor: colors.tmuxBg,
      fgColor: colors.tmuxFg,
    };
  }

  private getDisplayDirectoryName(
    currentDir: string,
    projectDir?: string
  ): string {
    if (projectDir && projectDir !== currentDir) {
      const projectName = projectDir.split("/").pop() || "project";
      const currentDirName = currentDir.split("/").pop() || "root";

      if (currentDir.includes(projectDir)) {
        return `${projectName}/${currentDirName}`;
      }

      return currentDirName;
    }

    return currentDir.split("/").pop() || "root";
  }

  private formatUsageDisplay(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: any,
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
    tokenBreakdown: any,
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

  private formatSessionBlockInfo(
    blockInfo: SessionBlockInfo,
    type = "cost"
  ): string {
    if (!blockInfo.isActive) {
      return "No active block";
    }

    // Format like: "20.7% (3815.7k/18477.3k)"
    const percentage = ((blockInfo.tokens / blockInfo.tokenLimit) * 100).toFixed(1);
    const tokensUsed = this.formatTokensCompact(blockInfo.tokens);
    const tokensLimit = this.formatTokensCompact(blockInfo.tokenLimit);
    
    return `${percentage}% (${tokensUsed}/${tokensLimit})`;
  }

  private formatTokensCompact(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  private formatSessionBlockInfoOld(
    blockInfo: SessionBlockInfo,
    type = "cost"
  ): string {
    if (!blockInfo.isActive) {
      return "No active block";
    }

    const timeStr = formatTimeRemaining(blockInfo.timeRemaining);

    if (type === "tokens") {
      const tokensStr = formatTokens(blockInfo.tokens);
      let result = `${tokensStr} (${timeStr} left)`;

      if (blockInfo.tokenBurnRate !== null && blockInfo.tokenBurnRate > 0) {
        const burnRateStr = `${formatTokens(blockInfo.tokenBurnRate)}/hr`;
        result += ` ${burnRateStr}`;
      }

      return result;
    } else {
      const costStr = formatCost(blockInfo.cost);
      let result = `${costStr} (${timeStr} left)`;

      if (blockInfo.burnRate !== null && blockInfo.burnRate > 0) {
        const burnRateStr = `${formatCost(blockInfo.burnRate)}/hr`;
        result += ` ${burnRateStr}`;
      }

      return result;
    }
  }
}
