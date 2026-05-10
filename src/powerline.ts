import type { ClaudeHookData } from "./utils/claude";
import type { PowerlineColors, ColorTheme } from "./themes";
import type { PowerlineConfig, LineConfig } from "./config/loader";
import type {
  UsageInfo,
  ContextInfo,
  MetricsInfo,
  PowerlineSymbols,
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
  AgentSegmentConfig,
  ThinkingSegmentConfig,
  CacheTimerSegmentConfig,
  ProxyBudgetSegmentConfig,
} from "./segments";
import type { BlockInfo } from "./segments/block";
import type { TodayInfo } from "./segments/today";
import type { CacheTimerInfo } from "./segments/cacheTimer";
import type { ProxyBudgetInfo } from "./segments/proxyBudget";
import type { TuiData } from "./tui";

import {
  hexToAnsi,
  extractBgToFg,
  hexToBasicAnsi,
  hexTo256Ansi,
  hexColorDistance,
} from "./utils/colors";
import { getColorSupport } from "./utils/color-support";
import { getTheme } from "./themes";
import {
  UsageProvider,
  ContextProvider,
  GitService,
  TmuxService,
  MetricsProvider,
  SegmentRenderer,
} from "./segments";
import { BlockProvider } from "./segments/block";
import { TodayProvider } from "./segments/today";
import { CacheTimerProvider } from "./segments/cacheTimer";
import { ProxyBudgetProvider } from "./segments/proxyBudget";
import {
  SYMBOLS,
  TEXT_SYMBOLS,
  RESET_CODE,
  BOX_CHARS,
  BOX_CHARS_TEXT,
} from "./utils/constants";
import { visibleLength } from "./utils/terminal";
import { getTerminalWidth, getRawTerminalWidth } from "./utils/terminal-width";
import { renderTuiPanel } from "./tui";

interface RenderedSegment {
  type: string;
  text: string;
  bgColor: string;
  fgColor: string;
  bold?: boolean;
}

export class PowerlineRenderer {
  private readonly symbols: PowerlineSymbols;
  private _usageProvider?: UsageProvider;
  private _blockProvider?: BlockProvider;
  private _todayProvider?: TodayProvider;
  private _contextProvider?: ContextProvider;
  private _gitService?: GitService;
  private _tmuxService?: TmuxService;
  private _metricsProvider?: MetricsProvider;
  private _cacheTimerProvider?: CacheTimerProvider;
  private _proxyBudgetProvider?: ProxyBudgetProvider;
  private _segmentRenderer?: SegmentRenderer;

  constructor(private readonly config: PowerlineConfig) {
    this.symbols = this.initializeSymbols();
  }

  private get usageProvider(): UsageProvider {
    if (!this._usageProvider) {
      this._usageProvider = new UsageProvider();
    }
    return this._usageProvider;
  }

  private get blockProvider(): BlockProvider {
    if (!this._blockProvider) {
      this._blockProvider = new BlockProvider();
    }
    return this._blockProvider;
  }

  private get todayProvider(): TodayProvider {
    if (!this._todayProvider) {
      this._todayProvider = new TodayProvider();
    }
    return this._todayProvider;
  }

  private get contextProvider(): ContextProvider {
    if (!this._contextProvider) {
      this._contextProvider = new ContextProvider(this.config);
    }
    return this._contextProvider;
  }

  private get gitService(): GitService {
    if (!this._gitService) {
      this._gitService = new GitService();
    }
    return this._gitService;
  }

  private get tmuxService(): TmuxService {
    if (!this._tmuxService) {
      this._tmuxService = new TmuxService();
    }
    return this._tmuxService;
  }

  private get metricsProvider(): MetricsProvider {
    if (!this._metricsProvider) {
      this._metricsProvider = new MetricsProvider();
    }
    return this._metricsProvider;
  }

  private get cacheTimerProvider(): CacheTimerProvider {
    if (!this._cacheTimerProvider) {
      this._cacheTimerProvider = new CacheTimerProvider();
    }
    return this._cacheTimerProvider;
  }

  private get proxyBudgetProvider(): ProxyBudgetProvider {
    if (!this._proxyBudgetProvider) {
      this._proxyBudgetProvider = new ProxyBudgetProvider();
    }
    return this._proxyBudgetProvider;
  }

  private get segmentRenderer(): SegmentRenderer {
    if (!this._segmentRenderer) {
      this._segmentRenderer = new SegmentRenderer(this.config, this.symbols);
    }
    return this._segmentRenderer;
  }

  private needsSegmentInfo(segmentType: keyof LineConfig["segments"]): boolean {
    return this.config.display.lines.some(
      (line) => line.segments[segmentType]?.enabled,
    );
  }

  async generateStatusline(hookData: ClaudeHookData): Promise<string> {
    if (this.config.display.style === "tui") {
      return this.generateTuiStatusline(hookData);
    }

    const usageInfo = this.needsSegmentInfo("session")
      ? await this.usageProvider.getUsageInfo(hookData.session_id, hookData)
      : null;

    const blockInfo = this.needsSegmentInfo("block")
      ? await this.blockProvider.getActiveBlockInfo(hookData)
      : null;

    const todayInfo = this.needsSegmentInfo("today")
      ? await this.todayProvider.getTodayInfo()
      : null;

    const contextSegmentConfig = this.config.display.lines
      .map((line) => line.segments.context)
      .find((c) => c?.enabled) as ContextSegmentConfig | undefined;
    const autocompactBuffer = contextSegmentConfig?.autocompactBuffer ?? 33000;
    const contextInfo = this.needsSegmentInfo("context")
      ? await this.contextProvider.getContextInfo(hookData, autocompactBuffer)
      : null;

    const metricsInfo = this.needsSegmentInfo("metrics")
      ? await this.metricsProvider.getMetricsInfo(hookData.session_id, hookData)
      : null;

    const cacheTimerInfo = this.needsSegmentInfo("cacheTimer")
      ? await this.cacheTimerProvider.getCacheTimerInfo(hookData)
      : null;

    const proxyBudgetSegmentConfig = this.config.display.lines
      .map((line) => line.segments.proxyBudget)
      .find((c) => c?.enabled) as ProxyBudgetSegmentConfig | undefined;
    const proxyBudgetInfo = this.needsSegmentInfo("proxyBudget")
      ? await this.proxyBudgetProvider.getProxyBudgetInfo(
          proxyBudgetSegmentConfig,
        )
      : null;

    if (this.config.display.autoWrap) {
      return this.generateAutoWrapStatusline(
        hookData,
        usageInfo,
        blockInfo,
        todayInfo,
        contextInfo,
        metricsInfo,
        cacheTimerInfo,
        proxyBudgetInfo,
      );
    }

    const lines = await Promise.all(
      this.config.display.lines.map((lineConfig) =>
        this.renderLine(
          lineConfig,
          hookData,
          usageInfo,
          blockInfo,
          todayInfo,
          contextInfo,
          metricsInfo,
          cacheTimerInfo,
          proxyBudgetInfo,
        ),
      ),
    );

    return lines.filter((line) => line.length > 0).join("\n");
  }

  private async generateAutoWrapStatusline(
    hookData: ClaudeHookData,
    usageInfo: UsageInfo | null,
    blockInfo: BlockInfo | null,
    todayInfo: TodayInfo | null,
    contextInfo: ContextInfo | null,
    metricsInfo: MetricsInfo | null,
    cacheTimerInfo: CacheTimerInfo | null,
    proxyBudgetInfo: ProxyBudgetInfo | null,
  ): Promise<string> {
    const colors = this.getThemeColors();
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const terminalWidth = getTerminalWidth();

    const outputLines: string[] = [];

    for (const lineConfig of this.config.display.lines) {
      const segments = Object.entries(lineConfig.segments)
        .filter(
          ([_, config]: [string, AnySegmentConfig | undefined]) =>
            config?.enabled,
        )
        .map(([type, config]: [string, AnySegmentConfig]) => ({
          type,
          config,
        }));

      const renderedSegments: RenderedSegment[] = [];
      for (const segment of segments) {
        const segmentData = await this.renderSegment(
          segment,
          hookData,
          usageInfo,
          blockInfo,
          todayInfo,
          contextInfo,
          metricsInfo,
          cacheTimerInfo,
          proxyBudgetInfo,
          colors,
          currentDir,
        );

        if (segmentData) {
          renderedSegments.push({
            type: segment.type,
            text: segmentData.text,
            bgColor: segmentData.bgColor,
            fgColor: segmentData.fgColor,
            bold: segmentData.bold,
          });
        }
      }

      if (renderedSegments.length === 0) continue;

      if (!terminalWidth || terminalWidth <= 0) {
        outputLines.push(this.buildLineFromSegments(renderedSegments, colors));
        continue;
      }

      let currentLineSegments: RenderedSegment[] = [];
      let currentLineWidth = 0;

      for (const segment of renderedSegments) {
        const segmentWidth = this.calculateSegmentWidth(
          segment,
          currentLineSegments.length === 0,
        );

        if (
          currentLineSegments.length > 0 &&
          currentLineWidth + segmentWidth > terminalWidth
        ) {
          outputLines.push(
            this.buildLineFromSegments(currentLineSegments, colors),
          );
          currentLineSegments = [];
          currentLineWidth = 0;
        }

        currentLineSegments.push(segment);
        currentLineWidth += segmentWidth;
      }

      if (currentLineSegments.length > 0) {
        outputLines.push(
          this.buildLineFromSegments(currentLineSegments, colors),
        );
      }
    }

    return outputLines.join("\n");
  }

  private async generateTuiStatusline(
    hookData: ClaudeHookData,
  ): Promise<string> {
    const colors = this.getThemeColors();
    const terminalWidth = getTerminalWidth();
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const charset = this.config.display.charset || "unicode";
    const boxChars = charset === "text" ? BOX_CHARS_TEXT : BOX_CHARS;
    const contextSegmentConfig = this.config.display.lines
      .map((line) => line.segments.context)
      .find((c) => c?.enabled) as ContextSegmentConfig | undefined;
    const autocompactBuffer = contextSegmentConfig?.autocompactBuffer ?? 33000;

    const results = await Promise.allSettled([
      this.usageProvider.getUsageInfo(hookData.session_id, hookData),
      this.blockProvider.getActiveBlockInfo(hookData),
      this.todayProvider.getTodayInfo(),
      this.contextProvider.getContextInfo(hookData, autocompactBuffer),
      this.metricsProvider.getMetricsInfo(hookData.session_id, hookData),
      this.gitService.getGitInfo(
        currentDir,
        {
          showSha: false,
          showWorkingTree: true,
          showOperation: false,
          showTag: false,
          showTimeSinceCommit: false,
          showStashCount: false,
          showUpstream: false,
          showRepoName: false,
        },
        hookData.workspace?.project_dir,
      ),
      this.tmuxService.getSessionId(),
      this.cacheTimerProvider.getCacheTimerInfo(hookData),
    ]);
    const val = <T>(r: PromiseSettledResult<T>) =>
      r.status === "fulfilled" ? r.value : null;
    const [
      usageInfo,
      blockInfo,
      todayInfo,
      contextInfo,
      metricsInfo,
      gitInfo,
      tmuxSessionId,
      cacheTimerInfo,
    ] = [
      val(results[0]!),
      val(results[1]!),
      val(results[2]!),
      val(results[3]!),
      val(results[4]!),
      val(results[5]!),
      val(results[6]!),
      val(results[7]!),
    ] as const;

    const tuiData: TuiData = {
      hookData,
      usageInfo,
      blockInfo,
      todayInfo,
      contextInfo,
      metricsInfo,
      gitInfo,
      cacheTimerInfo,
      tmuxSessionId,
      colors,
    };

    return renderTuiPanel(
      tuiData,
      boxChars,
      colors.reset,
      terminalWidth,
      this.config,
      { rawTerminalWidth: getRawTerminalWidth() },
    );
  }

  private calculateSegmentWidth(
    segment: RenderedSegment,
    isFirst: boolean,
  ): number {
    const isCapsuleStyle = this.config.display.style === "capsule";
    const textWidth = visibleLength(segment.text);
    const padding = this.config.display.padding ?? 1;
    const paddingWidth = padding * 2;

    if (isCapsuleStyle) {
      const capsuleOverhead = 2 + paddingWidth + (isFirst ? 0 : 1);
      return textWidth + capsuleOverhead;
    }

    const powerlineOverhead = 1 + paddingWidth;
    return textWidth + powerlineOverhead;
  }

  private buildLineFromSegments(
    segments: RenderedSegment[],
    colors: PowerlineColors,
  ): string {
    const isCapsuleStyle = this.config.display.style === "capsule";
    let line = colors.reset;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const nextSegment = !isLast ? segments[i + 1] : null;

      if (isCapsuleStyle && !isFirst) {
        line += " ";
      }

      const bold =
        segment.bold ?? this.getSegmentBoldFlag(segment.type, colors);

      line += this.formatSegment(
        segment.bgColor,
        segment.fgColor,
        segment.text,
        nextSegment?.bgColor,
        colors,
        bold,
      );
    }

    return line;
  }

  private async renderLine(
    lineConfig: LineConfig,
    hookData: ClaudeHookData,
    usageInfo: UsageInfo | null,
    blockInfo: BlockInfo | null,
    todayInfo: TodayInfo | null,
    contextInfo: ContextInfo | null,
    metricsInfo: MetricsInfo | null,
    cacheTimerInfo: CacheTimerInfo | null,
    proxyBudgetInfo: ProxyBudgetInfo | null,
  ): Promise<string> {
    const colors = this.getThemeColors();
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";

    const segments = Object.entries(lineConfig.segments)
      .filter(
        ([_, config]: [string, AnySegmentConfig | undefined]) =>
          config?.enabled,
      )
      .map(([type, config]: [string, AnySegmentConfig]) => ({ type, config }));

    const renderedSegments: RenderedSegment[] = [];
    for (const segment of segments) {
      const segmentData = await this.renderSegment(
        segment,
        hookData,
        usageInfo,
        blockInfo,
        todayInfo,
        contextInfo,
        metricsInfo,
        cacheTimerInfo,
        proxyBudgetInfo,
        colors,
        currentDir,
      );

      if (segmentData) {
        renderedSegments.push({
          type: segment.type,
          text: segmentData.text,
          bgColor: segmentData.bgColor,
          fgColor: segmentData.fgColor,
          bold: segmentData.bold,
        });
      }
    }

    return this.buildLineFromSegments(renderedSegments, colors);
  }

  private async renderSegment(
    segment: { type: string; config: AnySegmentConfig },
    hookData: ClaudeHookData,
    usageInfo: UsageInfo | null,
    blockInfo: BlockInfo | null,
    todayInfo: TodayInfo | null,
    contextInfo: ContextInfo | null,
    metricsInfo: MetricsInfo | null,
    cacheTimerInfo: CacheTimerInfo | null,
    proxyBudgetInfo: ProxyBudgetInfo | null,
    colors: PowerlineColors,
    currentDir: string,
  ) {
    if (segment.type === "directory") {
      return this.segmentRenderer.renderDirectory(
        hookData,
        colors,
        segment.config as DirectorySegmentConfig,
      );
    }
    if (segment.type === "model") {
      return this.segmentRenderer.renderModel(hookData, colors, segment.config);
    }

    if (segment.type === "git") {
      return await this.renderGitSegment(
        segment.config as GitSegmentConfig,
        hookData,
        colors,
        currentDir,
      );
    }

    if (segment.type === "session") {
      return this.renderSessionSegment(
        segment.config as UsageSegmentConfig,
        usageInfo,
        colors,
      );
    }

    if (segment.type === "sessionId") {
      return hookData.session_id
        ? this.segmentRenderer.renderSessionId(
            hookData.session_id,
            colors,
            segment.config as SessionIdSegmentConfig,
          )
        : null;
    }

    if (segment.type === "tmux") {
      return await this.renderTmuxSegment(colors);
    }

    if (segment.type === "context") {
      return this.renderContextSegment(
        segment.config as ContextSegmentConfig,
        contextInfo,
        colors,
      );
    }

    if (segment.type === "metrics") {
      return this.renderMetricsSegment(
        segment.config as MetricsSegmentConfig,
        metricsInfo,
        blockInfo,
        colors,
      );
    }

    if (segment.type === "block") {
      return this.renderBlockSegment(
        segment.config as BlockSegmentConfig,
        blockInfo,
        colors,
      );
    }

    if (segment.type === "today") {
      return this.renderTodaySegment(
        segment.config as TodaySegmentConfig,
        todayInfo,
        colors,
      );
    }

    if (segment.type === "version") {
      return this.renderVersionSegment(
        segment.config as VersionSegmentConfig,
        hookData,
        colors,
      );
    }

    if (segment.type === "env") {
      return this.segmentRenderer.renderEnv(
        colors,
        segment.config as EnvSegmentConfig,
      );
    }

    if (segment.type === "weekly") {
      return this.segmentRenderer.renderWeekly(
        hookData,
        colors,
        segment.config as WeeklySegmentConfig,
      );
    }

    if (segment.type === "agent") {
      return this.segmentRenderer.renderAgent(
        hookData,
        colors,
        segment.config as AgentSegmentConfig,
      );
    }

    if (segment.type === "thinking") {
      return this.segmentRenderer.renderThinking(
        hookData,
        colors,
        segment.config as ThinkingSegmentConfig,
      );
    }

    if (segment.type === "cacheTimer") {
      if (!cacheTimerInfo) return null;
      return this.segmentRenderer.renderCacheTimer(
        cacheTimerInfo,
        colors,
        segment.config as CacheTimerSegmentConfig,
      );
    }

    if (segment.type === "proxyBudget") {
      if (!proxyBudgetInfo) return null;
      return this.segmentRenderer.renderProxyBudget(
        proxyBudgetInfo,
        colors,
        segment.config as ProxyBudgetSegmentConfig,
      );
    }

    return null;
  }

  private async renderGitSegment(
    config: GitSegmentConfig,
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    currentDir: string,
  ) {
    if (!this.needsSegmentInfo("git")) return null;

    const gitInfo = await this.gitService.getGitInfo(
      currentDir,
      {
        showSha: config?.showSha,
        showWorkingTree: config?.showWorkingTree,
        showOperation: config?.showOperation,
        showTag: config?.showTag,
        showTimeSinceCommit: config?.showTimeSinceCommit,
        showStashCount: config?.showStashCount,
        showUpstream: config?.showUpstream,
        showRepoName: config?.showRepoName,
      },
      hookData.workspace?.project_dir,
    );

    return gitInfo
      ? this.segmentRenderer.renderGit(gitInfo, colors, config)
      : null;
  }

  private renderSessionSegment(
    config: UsageSegmentConfig,
    usageInfo: UsageInfo | null,
    colors: PowerlineColors,
  ) {
    if (!usageInfo) return null;
    return this.segmentRenderer.renderSession(usageInfo, colors, config);
  }

  private async renderTmuxSegment(colors: PowerlineColors) {
    if (!this.needsSegmentInfo("tmux")) return null;
    const tmuxSessionId = await this.tmuxService.getSessionId();
    return this.segmentRenderer.renderTmux(tmuxSessionId, colors);
  }

  private renderContextSegment(
    config: ContextSegmentConfig,
    contextInfo: ContextInfo | null,
    colors: PowerlineColors,
  ) {
    if (!this.needsSegmentInfo("context")) return null;
    return this.segmentRenderer.renderContext(contextInfo, colors, config);
  }

  private renderMetricsSegment(
    config: MetricsSegmentConfig,
    metricsInfo: MetricsInfo | null,
    _blockInfo: BlockInfo | null,
    colors: PowerlineColors,
  ) {
    return this.segmentRenderer.renderMetrics(metricsInfo, colors, config);
  }

  private renderBlockSegment(
    config: BlockSegmentConfig,
    blockInfo: BlockInfo | null,
    colors: PowerlineColors,
  ) {
    if (!blockInfo) return null;
    return this.segmentRenderer.renderBlock(blockInfo, colors, config);
  }

  private renderTodaySegment(
    config: TodaySegmentConfig,
    todayInfo: TodayInfo | null,
    colors: PowerlineColors,
  ) {
    if (!todayInfo) return null;
    return this.segmentRenderer.renderToday(todayInfo, colors, config);
  }

  private renderVersionSegment(
    config: VersionSegmentConfig,
    hookData: ClaudeHookData,
    colors: PowerlineColors,
  ) {
    return this.segmentRenderer.renderVersion(hookData, colors, config);
  }

  private initializeSymbols(): PowerlineSymbols {
    const style = this.config.display.style;
    const charset = this.config.display.charset || "unicode";
    const isMinimalStyle = style === "minimal";
    const isCapsuleStyle = style === "capsule";
    const symbolSet = charset === "text" ? TEXT_SYMBOLS : SYMBOLS;

    return {
      right: isMinimalStyle
        ? ""
        : isCapsuleStyle
          ? symbolSet.right_rounded
          : symbolSet.right,
      left: isCapsuleStyle ? symbolSet.left_rounded : "",
      branch: symbolSet.branch,
      model: symbolSet.model,
      git_clean: symbolSet.git_clean,
      git_dirty: symbolSet.git_dirty,
      git_conflicts: symbolSet.git_conflicts,
      git_ahead: symbolSet.git_ahead,
      git_behind: symbolSet.git_behind,
      git_worktree: symbolSet.git_worktree,
      git_tag: symbolSet.git_tag,
      git_sha: symbolSet.git_sha,
      git_upstream: symbolSet.git_upstream,
      git_stash: symbolSet.git_stash,
      git_time: symbolSet.git_time,
      session_cost: symbolSet.session_cost,
      block_cost: symbolSet.block_cost,
      today_cost: symbolSet.today_cost,
      context_time: symbolSet.context_time,
      metrics_response: symbolSet.metrics_response,
      metrics_last_response: symbolSet.metrics_last_response,
      metrics_duration: symbolSet.metrics_duration,
      metrics_messages: symbolSet.metrics_messages,
      metrics_lines_added: symbolSet.metrics_lines_added,
      metrics_lines_removed: symbolSet.metrics_lines_removed,
      metrics_burn: symbolSet.metrics_burn,
      version: symbolSet.version,
      bar_filled: symbolSet.bar_filled,
      bar_empty: symbolSet.bar_empty,
      env: symbolSet.env,
      session_id: symbolSet.session_id,
      weekly_cost: symbolSet.weekly_cost,
      agent: symbolSet.agent,
      thinking: symbolSet.thinking,
      cache_timer: symbolSet.cache_timer,
      proxy_budget: symbolSet.proxy_budget,
    };
  }

  private getThemeColors(): PowerlineColors {
    const theme = this.config.theme;
    let colorTheme;

    const colorMode = this.config.display.colorCompatibility || "auto";
    const colorSupport = colorMode === "auto" ? getColorSupport() : colorMode;

    if (theme === "custom") {
      colorTheme = this.config.colors?.custom;
      if (!colorTheme) {
        throw new Error(
          "Custom theme selected but no colors provided in configuration",
        );
      }
    } else {
      colorTheme = getTheme(theme, colorSupport);
      if (!colorTheme) {
        console.warn(
          `Built-in theme '${theme}' not found, falling back to 'dark' theme`,
        );
        colorTheme = getTheme("dark", colorSupport)!;
      }
    }

    const convertHex = (hex: string, isBg: boolean): string => {
      if (colorSupport === "none") return "";
      if (colorSupport === "ansi") return hexToBasicAnsi(hex, isBg);
      if (colorSupport === "ansi256") return hexTo256Ansi(hex, isBg);
      return hexToAnsi(hex, isBg);
    };

    const fallbackTheme = getTheme("dark", colorSupport)!;

    const isTui = this.config.display.style === "tui";
    const isLightTheme = theme === "light";
    const terminalRef = isLightTheme ? "#f0f0f0" : "#1e1e1e";

    const getSegmentColors = (segment: Exclude<keyof ColorTheme, "tui">) => {
      const fallback = fallbackTheme[segment];
      const custom = colorTheme[segment];
      const colors = {
        fg: custom?.fg || fallback.fg,
        bg: custom?.bg || fallback.bg,
      };

      let fgHex = colors.fg;
      if (isTui && hexColorDistance(fgHex, terminalRef) < 60) {
        fgHex = colors.bg;
      }

      const bold =
        colorSupport !== "none" && Boolean(custom?.bold ?? fallback.bold);

      return {
        bg: convertHex(colors.bg, true),
        fg: convertHex(fgHex, false),
        bold,
      };
    };

    const directory = getSegmentColors("directory");
    const git = getSegmentColors("git");
    const model = getSegmentColors("model");
    const session = getSegmentColors("session");
    const block = getSegmentColors("block");
    const today = getSegmentColors("today");
    const tmux = getSegmentColors("tmux");
    const context = getSegmentColors("context");
    const contextWarning = getSegmentColors("contextWarning");
    const contextCritical = getSegmentColors("contextCritical");
    const metrics = getSegmentColors("metrics");
    const version = getSegmentColors("version");
    const env = getSegmentColors("env");
    const weekly = getSegmentColors("weekly");
    const agent = getSegmentColors("agent");
    const thinking = getSegmentColors("thinking");
    const cacheTimer = getSegmentColors("cacheTimer");
    const proxyBudget = getSegmentColors("proxyBudget");

    return {
      reset: colorSupport === "none" ? "" : RESET_CODE,
      modeBg: directory.bg,
      modeFg: directory.fg,
      modeBold: directory.bold,
      gitBg: git.bg,
      gitFg: git.fg,
      gitBold: git.bold,
      modelBg: model.bg,
      modelFg: model.fg,
      modelBold: model.bold,
      sessionBg: session.bg,
      sessionFg: session.fg,
      sessionBold: session.bold,
      blockBg: block.bg,
      blockFg: block.fg,
      blockBold: block.bold,
      todayBg: today.bg,
      todayFg: today.fg,
      todayBold: today.bold,
      tmuxBg: tmux.bg,
      tmuxFg: tmux.fg,
      tmuxBold: tmux.bold,
      contextBg: context.bg,
      contextFg: context.fg,
      contextBold: context.bold,
      contextWarningBg: contextWarning.bg,
      contextWarningFg: contextWarning.fg,
      contextWarningBold: contextWarning.bold,
      contextCriticalBg: contextCritical.bg,
      contextCriticalFg: contextCritical.fg,
      contextCriticalBold: contextCritical.bold,
      metricsBg: metrics.bg,
      metricsFg: metrics.fg,
      metricsBold: metrics.bold,
      versionBg: version.bg,
      versionFg: version.fg,
      versionBold: version.bold,
      envBg: env.bg,
      envFg: env.fg,
      envBold: env.bold,
      weeklyBg: weekly.bg,
      weeklyFg: weekly.fg,
      weeklyBold: weekly.bold,
      agentBg: agent.bg,
      agentFg: agent.fg,
      agentBold: agent.bold,
      thinkingBg: thinking.bg,
      thinkingFg: thinking.fg,
      thinkingBold: thinking.bold,
      cacheTimerBg: cacheTimer.bg,
      cacheTimerFg: cacheTimer.fg,
      cacheTimerBold: cacheTimer.bold,
      proxyBudgetBg: proxyBudget.bg,
      proxyBudgetFg: proxyBudget.fg,
      proxyBudgetBold: proxyBudget.bold,
      partFg: theme === "custom" ? this.resolvePartColors(convertHex) : {},
    };
  }

  private resolvePartColors(
    convertHex: (hex: string, isBg: boolean) => string,
  ): Record<string, string> {
    const custom = this.config.colors?.custom as
      | Record<string, { fg?: string }>
      | undefined;
    if (!custom) return {};

    const result: Record<string, string> = {};
    for (const key of Object.keys(custom)) {
      const entry = custom[key];
      if (!entry?.fg) continue;
      result[key] = convertHex(entry.fg, false);
    }
    return result;
  }

  private getSegmentBgColor(
    segmentType: string,
    colors: PowerlineColors,
  ): string {
    switch (segmentType) {
      case "directory":
        return colors.modeBg;
      case "git":
        return colors.gitBg;
      case "model":
        return colors.modelBg;
      case "session":
      case "sessionId":
        return colors.sessionBg;
      case "block":
        return colors.blockBg;
      case "today":
        return colors.todayBg;
      case "tmux":
        return colors.tmuxBg;
      case "context":
        return colors.contextBg;
      case "metrics":
        return colors.metricsBg;
      case "version":
        return colors.versionBg;
      case "env":
        return colors.envBg;
      case "weekly":
        return colors.weeklyBg;
      case "agent":
        return colors.agentBg;
      case "thinking":
        return colors.thinkingBg;
      case "cacheTimer":
        return colors.cacheTimerBg;
      case "proxyBudget":
        return colors.proxyBudgetBg;
      default:
        return colors.modeBg;
    }
  }

  private getSegmentBoldFlag(
    segmentType: string,
    colors: PowerlineColors,
  ): boolean {
    switch (segmentType) {
      case "directory":
        return colors.modeBold;
      case "git":
        return colors.gitBold;
      case "model":
        return colors.modelBold;
      case "session":
      case "sessionId":
        return colors.sessionBold;
      case "block":
        return colors.blockBold;
      case "today":
        return colors.todayBold;
      case "tmux":
        return colors.tmuxBold;
      case "context":
        return colors.contextBold;
      case "metrics":
        return colors.metricsBold;
      case "version":
        return colors.versionBold;
      case "env":
        return colors.envBold;
      case "weekly":
        return colors.weeklyBold;
      case "agent":
        return colors.agentBold;
      case "thinking":
        return colors.thinkingBold;
      case "cacheTimer":
        return colors.cacheTimerBold;
      case "proxyBudget":
        return colors.proxyBudgetBold;
      default:
        return colors.modeBold;
    }
  }

  private formatSegment(
    bgColor: string,
    fgColor: string,
    text: string,
    nextBgColor: string | undefined,
    colors: PowerlineColors,
    bold: boolean,
  ): string {
    const isCapsuleStyle = this.config.display.style === "capsule";
    const padding = " ".repeat(this.config.display.padding ?? 1);
    const useBold = bold && colors.reset !== "";
    const boldOn = useBold ? "\x1b[1m" : "";
    const boldOff = useBold ? "\x1b[22m" : "";

    if (isCapsuleStyle) {
      const colorMode = this.config.display.colorCompatibility || "auto";
      const colorSupport = colorMode === "auto" ? getColorSupport() : colorMode;
      const isBasicMode = colorSupport === "ansi";

      const capFgColor = extractBgToFg(bgColor, isBasicMode);

      const leftCap = `${capFgColor}${this.symbols.left}${colors.reset}`;

      const content = `${bgColor}${fgColor}${boldOn}${padding}${text}${padding}${boldOff}${colors.reset}`;

      const rightCap = `${capFgColor}${this.symbols.right}${colors.reset}`;

      return `${leftCap}${content}${rightCap}`;
    }

    let output = `${bgColor}${fgColor}${boldOn}${padding}${text}${padding}${boldOff}`;

    const colorMode = this.config.display.colorCompatibility || "auto";
    const colorSupport = colorMode === "auto" ? getColorSupport() : colorMode;
    const isBasicMode = colorSupport === "ansi";

    if (nextBgColor) {
      const arrowFgColor = extractBgToFg(bgColor, isBasicMode);
      output += `${colors.reset}${nextBgColor}${arrowFgColor}${this.symbols.right}`;
    } else {
      output += `${colors.reset}${extractBgToFg(bgColor, isBasicMode)}${this.symbols.right}${colors.reset}`;
    }

    return output;
  }
}
