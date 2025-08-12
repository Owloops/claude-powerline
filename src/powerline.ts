import type { ClaudeHookData, PowerlineColors } from "./types";
import type { PowerlineConfig, LineConfig } from "./types/config";
import { hexToAnsi, extractBgToFg } from "./lib/colors";
import { UsageProvider } from "./lib/usage-provider";
import { GitService } from "./lib/git-service";
import { TmuxService } from "./lib/tmux-service";
import { SegmentRenderer, PowerlineSymbols } from "./lib/segment-renderer";

export class PowerlineRenderer {
  private readonly symbols: PowerlineSymbols;
  private readonly usageProvider: UsageProvider;
  private readonly gitService: GitService;
  private readonly tmuxService: TmuxService;
  private readonly segmentRenderer: SegmentRenderer;

  constructor(private readonly config: PowerlineConfig) {
    this.symbols = this.initializeSymbols();
    this.usageProvider = new UsageProvider();
    this.gitService = new GitService();
    this.tmuxService = new TmuxService();
    this.segmentRenderer = new SegmentRenderer(config, this.symbols);
  }

  async generateStatusline(hookData: ClaudeHookData): Promise<string> {
    const usageInfo = await this.usageProvider.getUsageInfo(
      hookData.session_id
    );

    let sessionBlockInfo = null;
    if (this.needsSessionBlock()) {
      sessionBlockInfo = await this.usageProvider.getSessionBlockInfo();
    }

    const lines = this.config.display.lines
      .map((lineConfig) =>
        this.renderLine(lineConfig, hookData, usageInfo, sessionBlockInfo)
      )
      .filter((line) => line.length > 0);

    return lines.join("\n");
  }

  private needsSessionBlock(): boolean {
    return this.config.display.lines.some(
      (line) => line.segments.block?.enabled || line.segments.usage?.enabled
    );
  }

  private renderLine(
    lineConfig: LineConfig,
    hookData: ClaudeHookData,
    usageInfo: any,
    sessionBlockInfo: any
  ): string {
    const colors = this.getThemeColors();
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";

    const segments = Object.entries(lineConfig.segments)
      .filter(([_, config]: [string, any]) => config?.enabled)
      .map(([type, config]: [string, any]) => ({ type, config }));

    let line = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const isLast = i === segments.length - 1;
      const nextSegment = !isLast ? segments[i + 1] : null;
      const nextBgColor = nextSegment
        ? this.getSegmentBgColor(nextSegment.type, colors, sessionBlockInfo)
        : "";

      const segmentData = this.renderSegment(
        segment,
        hookData,
        usageInfo,
        sessionBlockInfo,
        colors,
        currentDir
      );

      if (segmentData) {
        line += this.formatSegment(
          segmentData.bgColor,
          segmentData.fgColor,
          segmentData.text,
          isLast ? undefined : nextBgColor
        );
      }
    }

    return line;
  }

  private renderSegment(
    segment: any,
    hookData: ClaudeHookData,
    usageInfo: any,
    sessionBlockInfo: any,
    colors: any,
    currentDir: string
  ) {
    switch (segment.type) {
      case "directory":
        return this.segmentRenderer.renderDirectory(hookData, colors);

      case "git":
        const showSha = segment.config?.showSha || false;
        // Use process.cwd() which should be the actual working directory
        const gitInfo = this.gitService.getGitInfo(process.cwd(), showSha);
        return gitInfo
          ? this.segmentRenderer.renderGit(gitInfo, colors, showSha)
          : null;

      case "model":
        return this.segmentRenderer.renderModel(hookData, colors);

      case "session":
        const usageType = segment.config?.type || "cost";
        return this.segmentRenderer.renderSession(usageInfo, colors, usageType);

      case "today":
        const todayType = segment.config?.type || "cost";
        return this.segmentRenderer.renderToday(usageInfo, colors, todayType);

      case "block":
        const blockType = segment.config?.type || "cost";
        return this.segmentRenderer.renderBlock(
          sessionBlockInfo,
          colors,
          blockType
        );

      case "usage":
        return this.segmentRenderer.renderUsage(sessionBlockInfo, colors);

      case "tmux":
        const tmuxSessionId = this.tmuxService.getSessionId();
        return this.segmentRenderer.renderTmux(tmuxSessionId, colors);

      default:
        return null;
    }
  }

  private initializeSymbols(): PowerlineSymbols {
    return {
      right: "\uE0B0",
      branch: "\uE0A0",
      model: "⚡",
      git_clean: "✓",
      git_dirty: "●",
      git_conflicts: "⚠",
      git_ahead: "↑",
      git_behind: "↓",
      session_cost: "Session",
      daily_cost: "Today",
      block_cost: "Block",
    };
  }

  private getThemeColors(): PowerlineColors {
    const theme = this.config.theme;
    const colorTheme = this.config.colors[theme];

    if (!colorTheme) {
      throw new Error(`Theme '${theme}' not found in configuration`);
    }

    return {
      reset: "\x1b[0m",
      modeBg: hexToAnsi(colorTheme.directory.bg, true),
      modeFg: hexToAnsi(colorTheme.directory.fg, false),
      gitBg: hexToAnsi(colorTheme.git.bg, true),
      gitFg: hexToAnsi(colorTheme.git.fg, false),
      modelBg: hexToAnsi(colorTheme.model.bg, true),
      modelFg: hexToAnsi(colorTheme.model.fg, false),
      sessionBg: hexToAnsi(colorTheme.session.bg, true),
      sessionFg: hexToAnsi(colorTheme.session.fg, false),
      todayBg: hexToAnsi(colorTheme.today.bg, true),
      todayFg: hexToAnsi(colorTheme.today.fg, false),
      blockBg: hexToAnsi(colorTheme.block.bg, true),
      blockFg: hexToAnsi(colorTheme.block.fg, false),
      usageBg: hexToAnsi(colorTheme.usage.bg, true),
      usageFg: hexToAnsi(colorTheme.usage.fg, false),
      burnLowBg: hexToAnsi(colorTheme.today.bg, true),
      burnFg: hexToAnsi(colorTheme.today.fg, false),
      tmuxBg: hexToAnsi(colorTheme.tmux.bg, true),
      tmuxFg: hexToAnsi(colorTheme.tmux.fg, false),
    };
  }

  private getSegmentBgColor(
    segmentType: string,
    colors: PowerlineColors,
    sessionBlockInfo?: any
  ): string {
    switch (segmentType) {
      case "directory":
        return colors.modeBg;
      case "git":
        return colors.gitBg;
      case "model":
        return colors.modelBg;
      case "session":
        return colors.sessionBg;
      case "today":
        return colors.burnLowBg;
      case "block":
        return colors.blockBg;
      case "usage":
        // Always return black background for usage segment
        return colors.usageBg || colors.blockBg;
      case "tmux":
        return colors.tmuxBg;
      default:
        return colors.modeBg;
    }
  }

  private hexToAnsi(hex: string, isBackground: boolean): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const result = `\x1b[${isBackground ? "48" : "38"};2;${r};${g};${b}m`;
    // Debug: ensure colors are properly formatted
    return result;
  }

  private formatSegment(
    bgColor: string,
    fgColor: string,
    text: string,
    nextBgColor?: string
  ): string {
    let output = `${bgColor}${fgColor} ${text} `;

    if (nextBgColor) {
      const arrowFgColor = this.bgToFg(bgColor);
      // Force reset and explicit color setting
      output += `\x1b[0m${nextBgColor}${arrowFgColor}${this.symbols.right}`;
    } else {
      const arrowFgColor = this.bgToFg(bgColor);
      output += `\x1b[0m${arrowFgColor}${this.symbols.right}\x1b[0m`;
    }

    return output;
  }

  private bgToFg(bgColor: string): string {
    // Convert background color to foreground color for arrows
    // Handle both 48;2;r;g;b and 48;5;n formats
    if (bgColor.includes('48;2;')) {
      return bgColor.replace(/48;2;/g, '38;2;');
    } else if (bgColor.includes('48;5;')) {
      return bgColor.replace(/48;5;/g, '38;5;');
    } else if (bgColor.includes('48')) {
      return bgColor.replace(/48/g, '38');
    }
    return bgColor;
  }
}
