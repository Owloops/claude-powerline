import { renderTuiPanel } from "../src/tui/renderer";
import {
  resolveSegments,
  formatTodayParts,
  formatSessionParts,
} from "../src/tui/sections";
import type { TuiData, BoxChars, RenderCtx } from "../src/tui/types";
import type { PowerlineColors } from "../src/themes";
import type { PowerlineConfig } from "../src/config/loader";
import { BOX_CHARS, SYMBOLS } from "../src/utils/constants";
import { DEFAULT_CONFIG } from "../src/config/defaults";

// Use empty strings for colors so snapshots capture layout, not ANSI codes
const PLAIN_COLORS: PowerlineColors = {
  reset: "",
  modeBg: "",
  modeFg: "",
  modeBold: false,
  gitBg: "",
  gitFg: "",
  gitBold: false,
  modelBg: "",
  modelFg: "",
  modelBold: false,
  sessionBg: "",
  sessionFg: "",
  sessionBold: false,
  blockBg: "",
  blockFg: "",
  blockBold: false,
  todayBg: "",
  todayFg: "",
  todayBold: false,
  tmuxBg: "",
  tmuxFg: "",
  tmuxBold: false,
  contextBg: "",
  contextFg: "",
  contextBold: false,
  contextWarningBg: "",
  contextWarningFg: "",
  contextWarningBold: false,
  contextCriticalBg: "",
  contextCriticalFg: "",
  contextCriticalBold: false,
  metricsBg: "",
  metricsFg: "",
  metricsBold: false,
  versionBg: "",
  versionFg: "",
  versionBold: false,
  envBg: "",
  envFg: "",
  envBold: false,
  weeklyBg: "",
  weeklyFg: "",
  weeklyBold: false,
  agentBg: "",
  agentFg: "",
  agentBold: false,
  thinkingBg: "",
  thinkingFg: "",
  thinkingBold: false,
  cacheTimerBg: "",
  cacheTimerFg: "",
  cacheTimerBold: false,
  partFg: {},
};

const tuiConfig: PowerlineConfig = {
  ...DEFAULT_CONFIG,
  display: {
    ...DEFAULT_CONFIG.display,
    style: "tui",
  },
};

function makeTuiData(overrides: Partial<TuiData> = {}): TuiData {
  return {
    hookData: {
      session_id: "test-session",
      transcript_path: "/fake/path.jsonl",
      workspace: {
        project_dir: "/home/user/project",
        current_dir: "/home/user/project",
      },
      model: { id: "claude-sonnet-4-6", display_name: "Claude 3.5 Sonnet" },
      cwd: "/home/user/project",
      hook_event_name: "test",
      version: "1.19.6",
    },
    usageInfo: {
      session: {
        cost: 0.0523,
        tokens: 42150,
        calculatedCost: 0.0523,
        officialCost: null,
        tokenBreakdown: null,
      },
    },
    blockInfo: { nativeUtilization: 35, timeRemaining: 258 },
    todayInfo: {
      cost: 1.87,
      tokens: null,
      tokenBreakdown: null,
      date: "2026-03-17",
    },
    contextInfo: {
      totalTokens: 90000,
      maxTokens: 200000,
      usablePercentage: 45,
      percentage: 45,
      contextLeftPercentage: 55,
      usableTokens: 110000,
    },
    metricsInfo: {
      responseTime: 2.3,
      lastResponseTime: null,
      sessionDuration: 125,
      messageCount: 12,
      linesAdded: 48,
      linesRemoved: 15,
    },
    gitInfo: { branch: "feat/tui-mode", status: "dirty", ahead: 2, behind: 0 },
    cacheTimerInfo: null,
    tmuxSessionId: "dev",
    colors: PLAIN_COLORS,
    ...overrides,
  };
}

describe("TUI Panel Rendering", () => {
  describe("Wide layout (80+ cols)", () => {
    it("should render full panel with all data", async () => {
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should render with minimal data", async () => {
      const result = await renderTuiPanel(
        makeTuiData({
          usageInfo: null,
          blockInfo: null,
          todayInfo: null,
          metricsInfo: null,
          gitInfo: null,
          tmuxSessionId: null,
        }),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe("Medium layout (55-79 cols)", () => {
    it("should render metrics across 2 lines", async () => {
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        65,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe("Narrow layout (<55 cols)", () => {
    it("should stack everything vertically", async () => {
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        40,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe("Edge cases", () => {
    it("should handle null terminal width", async () => {
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        null,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should handle minimum panel width", async () => {
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        32,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should handle missing context info", async () => {
      const result = await renderTuiPanel(
        makeTuiData({ contextInfo: null }),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should handle context at warning level", async () => {
      const result = await renderTuiPanel(
        makeTuiData({
          contextInfo: {
            totalTokens: 140000,
            maxTokens: 200000,
            usablePercentage: 70,
            percentage: 70,
            contextLeftPercentage: 30,
            usableTokens: 60000,
          },
        }),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should show git working tree counts", async () => {
      const result = await renderTuiPanel(
        makeTuiData({
          gitInfo: {
            branch: "main",
            status: "dirty",
            ahead: 0,
            behind: 0,
            staged: 3,
            unstaged: 2,
            untracked: 1,
          },
        }),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toContain("(+3 ~2 ?1)");
      expect(result).toMatchSnapshot();
    });

    it("should handle context at critical level", async () => {
      const result = await renderTuiPanel(
        makeTuiData({
          contextInfo: {
            totalTokens: 180000,
            maxTokens: 200000,
            usablePercentage: 90,
            percentage: 90,
            contextLeftPercentage: 10,
            usableTokens: 20000,
          },
        }),
        BOX_CHARS,
        "",
        100,
        tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe("Hardcoded layout unchanged without grid config", () => {
    it("should use hardcoded layouts when display.tui is absent", async () => {
      const configWithoutGrid: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          style: "tui",
          // no tui grid config
        },
      };
      expect(configWithoutGrid.display.tui).toBeUndefined();

      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        100,
        configWithoutGrid,
      );
      // Should use hardcoded wide layout (100 cols >= 80)
      expect(result).toContain("╭"); // top border
      expect(result).toContain("╰"); // bottom border
      expect(result).toMatchSnapshot();
    });

    it("should produce identical output to existing wide layout", async () => {
      const configWithoutGrid: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display, style: "tui" },
      };
      const data = makeTuiData();
      const result1 = await renderTuiPanel(data, BOX_CHARS, "", 100, tuiConfig);
      const result2 = await renderTuiPanel(
        data,
        BOX_CHARS,
        "",
        100,
        configWithoutGrid,
      );
      expect(result1).toBe(result2);
    });
  });

  describe("Grid layout integration", () => {
    const gridConfig: PowerlineConfig = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        style: "tui",
        tui: {
          widthReserve: 0,
          separator: { column: "  " },
          breakpoints: [
            {
              minWidth: 0,
              areas: [
                "context context context",
                "block   session today",
                "---",
                "git     .       dir",
              ],
              columns: ["1fr", "auto", "1fr"],
              align: ["left", "left", "right"],
            },
          ],
        },
      },
    };

    it("should render grid layout when display.tui is present", async () => {
      gridConfig.display.tui!.terminalWidth = 100;
      const result = await renderTuiPanel(
        makeTuiData(),
        BOX_CHARS,
        "",
        100,
        gridConfig,
      );
      expect(result).toContain("╭"); // title bar
      expect(result).toContain("╰"); // bottom border
      expect(result).toContain("├"); // divider
      // Verify it contains segment data
      expect(result).toContain("feat/tui-mode"); // git branch
    });

    it("should auto-collapse rows when segment data is missing", async () => {
      gridConfig.display.tui!.terminalWidth = 100;
      const data = makeTuiData({
        gitInfo: null,
        blockInfo: null,
        usageInfo: null,
        todayInfo: null,
      });
      const result = await renderTuiPanel(data, BOX_CHARS, "", 100, gridConfig);
      // git row should collapse since git is null
      // block/session/today row should collapse since all null
      // divider between them should be orphaned and removed
      expect(result).toBeDefined();
    });
  });

  describe("resolveSegments showIcons handling", () => {
    const mkCtx = (config: PowerlineConfig, data: TuiData): RenderCtx => ({
      lines: [],
      data,
      box: BOX_CHARS,
      contentWidth: 96,
      innerWidth: 98,
      sym: SYMBOLS,
      config,
      reset: "",
      colors: PLAIN_COLORS,
    });

    it("strips leading icons from segments and composite tokens while keeping metrics icons and git status glyphs", () => {
      const config: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          style: "tui",
          showIcons: false,
          lines: [
            {
              segments: {
                ...DEFAULT_CONFIG.display.lines[0]!.segments,
                metrics: {
                  enabled: true,
                  showResponseTime: true,
                  showLinesAdded: true,
                },
              },
            },
          ],
        },
      };
      const data = makeTuiData();
      const { data: result } = resolveSegments(data, mkCtx(config, data));

      expect(result["git.icon"]).toBe("");
      expect(result["git.head"]).not.toContain(SYMBOLS.branch);
      expect(result["git.head"]).toContain(data.gitInfo!.branch);
      expect(result["git.head"]).toContain(SYMBOLS.git_dirty);
      expect(result["session"]).not.toContain(SYMBOLS.session_cost);
      expect(result["today"]).not.toContain(SYMBOLS.today_cost);
      expect(result["model"]).not.toContain(SYMBOLS.model);
      expect(result["version"]).not.toContain(SYMBOLS.version);
      expect(result["metrics.response"]).toContain(SYMBOLS.metrics_response);
      expect(result["metrics.added"]).toContain(SYMBOLS.metrics_lines_added);
    });

    it("per-segment showIcon overrides global showIcons", () => {
      const config: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          style: "tui",
          showIcons: false,
          lines: [
            {
              segments: {
                ...DEFAULT_CONFIG.display.lines[0]!.segments,
                git: { enabled: true, showIcon: true },
              },
            },
          ],
        },
      };
      const data = makeTuiData();
      const { data: result } = resolveSegments(data, mkCtx(config, data));

      expect(result["git.icon"]).toBe(SYMBOLS.branch);
      expect(result["git.head"]).toContain(SYMBOLS.branch);
      expect(result["session"]).not.toContain(SYMBOLS.session_cost);
    });

    it("resolveSegments exposes thinking sub-parts (icon, enabled, effort) when data present, empty when absent", () => {
      const config: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display, style: "tui" },
      };

      const withData = makeTuiData({
        hookData: {
          ...makeTuiData().hookData,
          effort: { level: "xhigh" },
          thinking: { enabled: true },
        },
      });
      const { data: resultPresent } = resolveSegments(
        withData,
        mkCtx(config, withData),
      );
      expect(resultPresent["thinking.icon"]).toBe(SYMBOLS.thinking);
      expect(resultPresent["thinking.enabled"]).toBe("On");
      expect(resultPresent["thinking.effort"]).toBe("xhigh");

      const absent = makeTuiData();
      const { data: resultAbsent } = resolveSegments(
        absent,
        mkCtx(config, absent),
      );
      expect(resultAbsent["thinking"]).toBe("");
      expect(resultAbsent["thinking.icon"]).toBe("");
      expect(resultAbsent["thinking.enabled"]).toBe("");
      expect(resultAbsent["thinking.effort"]).toBe("");
    });

    it("resolveSegments exposes cacheTimer sub-parts (icon, value) using formatted elapsed time", () => {
      const config: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display, style: "tui" },
      };

      const data = makeTuiData({ cacheTimerInfo: { elapsedSeconds: 200 } });
      const { data: result } = resolveSegments(data, mkCtx(config, data));
      expect(result["cacheTimer.icon"]).toBe(SYMBOLS.cache_timer);
      expect(result["cacheTimer.value"]).toBe("3:20");

      const hiddenConfig: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          style: "tui",
          showIcons: false,
        },
      };
      const { data: hiddenResult } = resolveSegments(
        data,
        mkCtx(hiddenConfig, data),
      );
      expect(hiddenResult["cacheTimer.icon"]).toBe("");
      expect(hiddenResult["cacheTimer.value"]).toBe("3:20");

      const absent = makeTuiData();
      const { data: resultAbsent } = resolveSegments(
        absent,
        mkCtx(config, absent),
      );
      expect(resultAbsent["cacheTimer"]).toBe("");
      expect(resultAbsent["cacheTimer.icon"]).toBe("");
      expect(resultAbsent["cacheTimer.value"]).toBe("");
    });
    it("resolveSegments honors cacheTimer remaining mode and detected TTL", () => {
      const config: PowerlineConfig = {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_CONFIG.display,
          style: "tui",
          lines: [
            {
              segments: {
                ...DEFAULT_CONFIG.display.lines[0]!.segments,
                cacheTimer: { enabled: true, displayMode: "remaining" },
              },
            },
          ],
        },
      };
      const data = makeTuiData({
        cacheTimerInfo: { elapsedSeconds: 10, detectedTtlSeconds: 3600 },
      });
      const { data: result } = resolveSegments(data, mkCtx(config, data));
      expect(result["cacheTimer.icon"]).toBe(SYMBOLS.cache_timer);
      expect(result["cacheTimer.value"]).toBe("59:50");
      expect(result["cacheTimer"]).toContain("59:50");
    });
  });

  describe("Budget display toggles (TUI formatTodayParts / formatSessionParts)", () => {
    const sym = SYMBOLS as any;

    function configWith(
      segment: "today" | "session",
      budget: {
        amount?: number;
        type?: "cost" | "tokens";
        showValue?: boolean;
        showPercentage?: boolean;
      },
    ): PowerlineConfig {
      return {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display, style: "tui" },
        budget: {
          [segment]: {
            warningThreshold: 80,
            ...budget,
          },
        },
      } as PowerlineConfig;
    }

    const todayInfo = {
      cost: 10,
      tokens: null as number | null,
      tokenBreakdown: null,
      date: "2026-04-24",
    };

    const todayInfoWithTokens = {
      cost: 10,
      tokens: 250,
      tokenBreakdown: null,
      date: "2026-04-24",
    };

    const todayCases: Array<{
      name: string;
      info: typeof todayInfo | typeof todayInfoWithTokens;
      budget: Parameters<typeof configWith>[1];
      expected: {
        cost?: string;
        budget?: string;
        icon?: string;
        label?: string;
        budgetContains?: string;
      };
    }> = [
      {
        name: "default flags -> cost + budget (with %)",
        info: todayInfo,
        budget: { amount: 50 },
        expected: { cost: "$10.00", budgetContains: "20%" },
      },
      {
        name: "showPercentage:false -> cost only, budget empty",
        info: todayInfo,
        budget: { amount: 50, showPercentage: false },
        expected: { cost: "$10.00", budget: "" },
      },
      {
        name: "showValue:false -> cost empty, budget present, label empty",
        info: todayInfo,
        budget: { amount: 50, showValue: false },
        expected: { cost: "", label: "", budgetContains: "20%" },
      },
      {
        name: "both false -> all empty (icon + label too)",
        info: todayInfo,
        budget: { amount: 50, showValue: false, showPercentage: false },
        expected: { icon: "", label: "", cost: "", budget: "" },
      },
      {
        name: "budget.type:tokens with tokens present -> pct computed from tokens",
        info: todayInfoWithTokens,
        budget: { amount: 500, type: "tokens" },
        expected: { cost: "$10.00", budgetContains: "50%" },
      },
      {
        name: "no budget + showValue:false -> base value (flags no-op)",
        info: todayInfo,
        budget: { showValue: false, showPercentage: true },
        expected: { cost: "$10.00", budget: "" },
      },
      {
        name: "budget but pct not computable -> base value (no suppression)",
        info: todayInfo,
        budget: {
          amount: 50,
          type: "tokens",
          showValue: false,
          showPercentage: true,
        },
        expected: { cost: "$10.00", budget: "" },
      },
    ];

    it.each(todayCases)("today: $name", ({ info, budget, expected }) => {
      const parts = formatTodayParts(
        info as any,
        sym,
        configWith("today", budget),
        true,
      );
      if (expected.cost !== undefined) expect(parts.cost).toBe(expected.cost);
      if (expected.budget !== undefined)
        expect(parts.budget).toBe(expected.budget);
      if (expected.icon !== undefined) expect(parts.icon).toBe(expected.icon);
      if (expected.label !== undefined)
        expect(parts.label).toBe(expected.label);
      if (expected.budgetContains !== undefined)
        expect(parts.budget).toContain(expected.budgetContains);
    });

    it("session: both false -> all-empty parts (session label blank too)", () => {
      const usageInfo = {
        session: {
          cost: 5,
          tokens: 100,
          calculatedCost: 5,
          officialCost: null,
          tokenBreakdown: null,
        },
      };
      const parts = formatSessionParts(
        usageInfo as any,
        sym,
        configWith("session", {
          amount: 50,
          showValue: false,
          showPercentage: false,
        }),
        true,
      );
      expect(parts).toEqual({
        icon: "",
        label: "",
        cost: "",
        tokens: "",
        budget: "",
      });
    });
  });
});
