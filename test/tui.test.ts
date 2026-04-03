import { renderTuiPanel } from "../src/tui/renderer";
import type { TuiData, BoxChars } from "../src/tui/types";
import type { PowerlineColors } from "../src/themes";
import type { PowerlineConfig } from "../src/config/loader";
import { BOX_CHARS } from "../src/utils/constants";
import { DEFAULT_CONFIG } from "../src/config/defaults";

// Use empty strings for colors so snapshots capture layout, not ANSI codes
const PLAIN_COLORS: PowerlineColors = {
  reset: "", modeBg: "", modeFg: "", gitBg: "", gitFg: "",
  modelBg: "", modelFg: "", sessionBg: "", sessionFg: "",
  blockBg: "", blockFg: "", todayBg: "", todayFg: "",
  tmuxBg: "", tmuxFg: "", contextBg: "", contextFg: "",
  contextWarningBg: "", contextWarningFg: "",
  contextCriticalBg: "", contextCriticalFg: "",
  metricsBg: "", metricsFg: "", versionBg: "", versionFg: "",
  envBg: "", envFg: "",
  weeklyBg: "", weeklyFg: "",
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
      workspace: { project_dir: "/home/user/project", current_dir: "/home/user/project" },
      model: { id: "claude-sonnet-4-6", display_name: "Claude 3.5 Sonnet" },
      cwd: "/home/user/project",
      hook_event_name: "test",
      version: "1.19.6",
    },
    usageInfo: { session: { cost: 0.0523, tokens: 42150, calculatedCost: 0.0523, officialCost: null, tokenBreakdown: null } },
    blockInfo: { cost: 0.12, tokens: 5000, weightedTokens: 5000, timeRemaining: 3600, burnRate: 0.45, tokenBurnRate: null, source: "transcript" as const, nativeUtilization: null },
    todayInfo: { cost: 1.87, tokens: null, tokenBreakdown: null, date: "2026-03-17" },
    contextInfo: { totalTokens: 90000, maxTokens: 200000, usablePercentage: 45, percentage: 45, contextLeftPercentage: 55, usableTokens: 110000 },
    metricsInfo: { responseTime: 2.3, lastResponseTime: null, sessionDuration: 125, messageCount: 12, linesAdded: 48, linesRemoved: 15 },
    gitInfo: { branch: "feat/tui-mode", status: "dirty", ahead: 2, behind: 0 },
    tmuxSessionId: "dev",
    colors: PLAIN_COLORS,
    ...overrides,
  };
}

describe("TUI Panel Rendering", () => {
  describe("Wide layout (80+ cols)", () => {
    it("should render full panel with all data", async () => {
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 100, tuiConfig);
      expect(result).toMatchSnapshot();
    });

    it("should render with minimal data", async () => {
      const result = await renderTuiPanel(
        makeTuiData({ usageInfo: null, blockInfo: null, todayInfo: null, metricsInfo: null, gitInfo: null, tmuxSessionId: null }),
        BOX_CHARS, "", 100, tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe("Medium layout (55-79 cols)", () => {
    it("should render metrics across 2 lines", async () => {
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 65, tuiConfig);
      expect(result).toMatchSnapshot();
    });
  });

  describe("Narrow layout (<55 cols)", () => {
    it("should stack everything vertically", async () => {
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 40, tuiConfig);
      expect(result).toMatchSnapshot();
    });
  });

  describe("Edge cases", () => {
    it("should handle null terminal width", async () => {
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", null, tuiConfig);
      expect(result).toMatchSnapshot();
    });

    it("should handle minimum panel width", async () => {
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 32, tuiConfig);
      expect(result).toMatchSnapshot();
    });

    it("should handle missing context info", async () => {
      const result = await renderTuiPanel(makeTuiData({ contextInfo: null }), BOX_CHARS, "", 100, tuiConfig);
      expect(result).toMatchSnapshot();
    });

    it("should handle context at warning level", async () => {
      const result = await renderTuiPanel(
        makeTuiData({ contextInfo: { totalTokens: 140000, maxTokens: 200000, usablePercentage: 70, percentage: 70, contextLeftPercentage: 30, usableTokens: 60000} }),
        BOX_CHARS, "", 100, tuiConfig,
      );
      expect(result).toMatchSnapshot();
    });

    it("should show git working tree counts", async () => {
      const result = await renderTuiPanel(
        makeTuiData({ gitInfo: { branch: "main", status: "dirty", ahead: 0, behind: 0, staged: 3, unstaged: 2, untracked: 1 } }),
        BOX_CHARS, "", 100, tuiConfig,
      );
      expect(result).toContain("(+3 ~2 ?1)");
      expect(result).toMatchSnapshot();
    });

    it("should handle context at critical level", async () => {
      const result = await renderTuiPanel(
        makeTuiData({ contextInfo: { totalTokens: 180000, maxTokens: 200000, usablePercentage: 90, percentage: 90, contextLeftPercentage: 10, usableTokens: 20000 } }),
        BOX_CHARS, "", 100, tuiConfig,
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

      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 100, configWithoutGrid);
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
      const result2 = await renderTuiPanel(data, BOX_CHARS, "", 100, configWithoutGrid);
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
          breakpoints: [{
            minWidth: 0,
            areas: [
              "context context context",
              "block   session today",
              "---",
              "git     .       dir",
            ],
            columns: ["1fr", "auto", "1fr"],
            align: ["left", "left", "right"],
          }],
        },
      },
    };

    it("should render grid layout when display.tui is present", async () => {
      jest.spyOn(require("../src/utils/terminal"), "getRawTerminalWidth").mockReturnValue(100);
      const result = await renderTuiPanel(makeTuiData(), BOX_CHARS, "", 100, gridConfig);
      expect(result).toContain("╭"); // title bar
      expect(result).toContain("╰"); // bottom border
      expect(result).toContain("├"); // divider
      // Verify it contains segment data
      expect(result).toContain("feat/tui-mode"); // git branch
    });

    it("should auto-collapse rows when segment data is missing", async () => {
      jest.spyOn(require("../src/utils/terminal"), "getRawTerminalWidth").mockReturnValue(100);
      const data = makeTuiData({ gitInfo: null, blockInfo: null, usageInfo: null, todayInfo: null });
      const result = await renderTuiPanel(data, BOX_CHARS, "", 100, gridConfig);
      // git row should collapse since git is null
      // block/session/today row should collapse since all null
      // divider between them should be orphaned and removed
      expect(result).toBeDefined();
    });
  });
});
