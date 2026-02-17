import { BlockProvider } from "../src/segments/block";
import { TodayProvider } from "../src/segments/today";
import { SegmentRenderer } from "../src/segments/renderer";
import {
  loadEntriesFromProjects,
  type ClaudeHookData,
} from "../src/utils/claude";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

jest.mock("../src/utils/claude", () => ({
  loadEntriesFromProjects: jest.fn(),
}));

const mockLoadEntries = loadEntriesFromProjects as jest.MockedFunction<
  typeof loadEntriesFromProjects
>;

describe("Segment Time Logic", () => {
  let tempDir: string;
  let mockEntries: any[];

  beforeEach(() => {
    tempDir = join(tmpdir(), `powerline-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    const now = new Date();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const hoursSinceMidnight = now.getHours();
    const blockNumber = Math.floor(hoursSinceMidnight / 5);
    const blockStart = new Date();
    blockStart.setHours(blockNumber * 5, 0, 0, 0);

    mockEntries = [
      {
        timestamp: new Date(midnight.getTime() + 2 * 60 * 60 * 1000),
        message: {
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 50,
          },
          model: "claude-3-5-sonnet",
        },
        costUSD: 25.5,
        raw: {},
      },
      {
        timestamp: new Date(blockStart.getTime() + 60 * 60 * 1000),
        message: {
          usage: {
            input_tokens: 2000,
            output_tokens: 1000,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 100,
          },
          model: "claude-3-5-sonnet",
        },
        costUSD: 45.75,
        raw: {},
      },
    ];

    mockLoadEntries.mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe("Block Segment", () => {
    it("should only include entries from current 5-hour window", async () => {
      const now = new Date();
      const hoursSinceMidnight = now.getHours();
      const blockNumber = Math.floor(hoursSinceMidnight / 5);
      const blockStart = new Date();
      blockStart.setHours(blockNumber * 5, 0, 0, 0);
      const blockEnd = new Date();
      blockEnd.setHours((blockNumber + 1) * 5, 0, 0, 0);

      const currentBlockEntry = {
        timestamp: new Date(blockStart.getTime() + 60 * 60 * 1000),
        message: {
          usage: {
            input_tokens: 2000,
            output_tokens: 1000,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 100,
          },
          model: "claude-3-5-sonnet",
        },
        costUSD: 45.75,
        raw: {},
      };

      mockLoadEntries.mockResolvedValue([currentBlockEntry]);

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo();

      expect(blockInfo.cost).toBe(45.75);
      expect(blockInfo.tokens).toBe(3300);
      expect(blockInfo.timeRemaining).toBeGreaterThan(0);
      expect(blockInfo.timeRemaining).toBeLessThanOrEqual(360);
    });

    it("should calculate correct time remaining in current block", async () => {
      const now = new Date();
      const hoursSinceMidnight = now.getHours();
      const blockNumber = Math.floor(hoursSinceMidnight / 5);
      const blockStart = new Date();
      blockStart.setHours(blockNumber * 5, 0, 0, 0);

      const mockEntry = {
        timestamp: new Date(blockStart.getTime() + 30 * 60 * 1000),
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          model: "claude-3-5-sonnet",
        },
        costUSD: 1.0,
        raw: {},
      };

      mockLoadEntries.mockResolvedValue([mockEntry]);

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo();

      const blockEnd = new Date();
      blockEnd.setHours((blockNumber + 1) * 5, 0, 0, 0);
      const expectedRemaining = Math.max(
        0,
        Math.round((blockEnd.getTime() - now.getTime()) / (1000 * 60))
      );

      expect(blockInfo.timeRemaining).toBe(expectedRemaining);
    });
  });

  describe("Today Segment", () => {
    it("should include all entries since midnight", async () => {
      const todayProvider = new TodayProvider();
      const todayInfo = await todayProvider.getTodayInfo();

      expect(todayInfo.cost).toBe(71.25);
      expect(todayInfo.tokens).toBe(4950);

      expect(todayInfo.tokenBreakdown).toBeDefined();
      expect(todayInfo.tokenBreakdown!.input).toBe(3000);
      expect(todayInfo.tokenBreakdown!.output).toBe(1500);
      expect(todayInfo.tokenBreakdown!.cacheCreation).toBe(300);
      expect(todayInfo.tokenBreakdown!.cacheRead).toBe(150);
    });

    it("should format date consistently using local time", async () => {
      const todayProvider = new TodayProvider();
      const todayInfo = await todayProvider.getTodayInfo();

      const expectedDate = new Date();
      const year = expectedDate.getFullYear();
      const month = String(expectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(expectedDate.getDate()).padStart(2, "0");
      const expectedDateStr = `${year}-${month}-${day}`;

      expect(todayInfo.date).toBe(expectedDateStr);
    });
  });

  describe("Time Zone Consistency", () => {
    it("should use local time consistently across segments", async () => {
      const now = new Date();

      const hoursSinceMidnight = now.getHours();
      const blockNumber = Math.floor(hoursSinceMidnight / 5);
      const blockStart = new Date();
      blockStart.setHours(blockNumber * 5, 0, 0, 0);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      expect(blockStart.getTimezoneOffset()).toBe(now.getTimezoneOffset());
      expect(todayStart.getTimezoneOffset()).toBe(now.getTimezoneOffset());

      expect(blockStart.getTime()).toBeGreaterThanOrEqual(todayStart.getTime());
    });
  });

  describe("Edge Cases", () => {
    it("should handle no entries gracefully", async () => {
      mockLoadEntries.mockResolvedValue([]);

      const blockProvider = new BlockProvider();
      const todayProvider = new TodayProvider();

      const blockInfo = await blockProvider.getActiveBlockInfo();
      const todayInfo = await todayProvider.getTodayInfo();

      expect(blockInfo.cost).toBeNull();
      expect(blockInfo.tokens).toBeNull();
      expect(blockInfo.timeRemaining).toBeNull();

      expect(todayInfo.cost).toBeNull();
      expect(todayInfo.tokens).toBeNull();
      expect(todayInfo.tokenBreakdown).toBeNull();
    });

    it("should handle entries without usage data", async () => {
      const entriesWithoutUsage = [
        {
          timestamp: new Date(),
          message: {},
          costUSD: 0,
          raw: {},
        },
      ];

      mockLoadEntries.mockResolvedValue(entriesWithoutUsage);

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo();

      expect(blockInfo.cost).toBeNull();
      expect(blockInfo.tokens).toBeNull();
    });
  });

  describe("Version Segment", () => {
    it("should render version from hook data", () => {
      const config = { theme: "dark", display: { style: "minimal" } } as any;
      const symbols = { version: "◈" } as any;
      const colors = {} as any;
      const renderer = new SegmentRenderer(config, symbols);

      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test-session",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        workspace: { current_dir: "/test", project_dir: "/test" },
        version: "1.0.80",
      };

      const result = renderer.renderVersion(hookData, colors);

      expect(result).not.toBeNull();
      expect(result?.text).toContain("v1.0.80");
    });
  });

  describe("Context Segment Bar Styles", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = {
      context_time: "◔",
      bar_filled: "▪",
      bar_empty: "▫",
    } as any;
    const colors = {
      contextBg: "#1e1e2e",
      contextFg: "#cdd6f4",
      contextWarningBg: "#92400e",
      contextWarningFg: "#fbbf24",
      contextCriticalBg: "#991b1b",
      contextCriticalFg: "#fca5a5",
    } as any;

    const mkContext = (usedPct: number) => ({
      totalTokens: usedPct * 2000,
      percentage: usedPct,
      usablePercentage: usedPct,
      contextLeftPercentage: 100 - usedPct,
      maxTokens: 200000,
      usableTokens: (100 - usedPct) * 2000,
    });

    let renderer: SegmentRenderer;

    beforeEach(() => {
      renderer = new SegmentRenderer(config, symbols);
    });

    it("should render text style by default and fall back to text on null context", () => {
      const result = renderer.renderContext(mkContext(50), colors);
      expect(result!.text).toContain("◔");
      expect(result!.text).toContain("50%");

      const nullResult = renderer.renderContext(null, colors);
      expect(nullResult!.text).toMatch(/◔.*0.*100%/);
    });

    it("should use bar_filled/bar_empty symbols for 'bar' style and BAR_STYLES chars for custom styles", () => {
      const bar = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "bar" });
      expect(bar!.text).toContain("▪");
      expect(bar!.text).toContain("▫");

      const blocks = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "blocks" });
      expect(blocks!.text).toContain("█");
      expect(blocks!.text).toContain("░");
    });

    it("should render all standard styles with 10-char bars and correct fill/empty", () => {
      const styles: Array<{ name: "blocks" | "squares" | "dots" | "line" | "filled" | "geometric"; filled: string; empty: string }> = [
        { name: "blocks", filled: "█", empty: "░" },
        { name: "squares", filled: "◼", empty: "◻" },
        { name: "dots", filled: "●", empty: "○" },
        { name: "line", filled: "━", empty: "┄" },
        { name: "filled", filled: "■", empty: "□" },
        { name: "geometric", filled: "▰", empty: "▱" },
      ];

      for (const { name, filled, empty } of styles) {
        const result = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: name });
        const barPart = result!.text.split(" ")[0]!;
        expect(barPart).toHaveLength(10);
        expect(barPart).toContain(filled);
        expect(barPart).toContain(empty);
      }
    });

    it("should handle capped style edge cases: 0%, mid, and 100%", () => {
      const at0 = renderer.renderContext(mkContext(0), colors, { enabled: true, displayStyle: "capped" });
      expect(at0!.text).toMatch(/^╸┄{9}/);

      const at50 = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "capped" });
      expect(at50!.text).toContain("━");
      expect(at50!.text).toContain("╸");
      expect(at50!.text).toContain("┄");

      const at100 = renderer.renderContext(mkContext(100), colors, { enabled: true, displayStyle: "capped" });
      expect(at100!.text).toMatch(/^━{10}/);
    });

    it("should render ball style with exactly one position marker", () => {
      const result = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "ball" });
      const barPart = result!.text.split(" ")[0]!;
      expect(barPart).toHaveLength(10);
      expect((barPart.match(/●/g) || []).length).toBe(1);
    });

    it("should render empty bars on null context and text fallback for text style", () => {
      const barNull = renderer.renderContext(null, colors, { enabled: true, displayStyle: "squares" });
      expect(barNull!.text).toContain("◻".repeat(10));
      expect(barNull!.text).toContain("0%");

      const textNull = renderer.renderContext(null, colors, { enabled: true, displayStyle: "text" });
      expect(textNull!.text).toContain("◔");
    });

    it("should apply warning/critical colors based on context left percentage", () => {
      const warning = renderer.renderContext(mkContext(70), colors, { enabled: true, displayStyle: "blocks" });
      expect(warning!.bgColor).toBe(colors.contextWarningBg);

      const critical = renderer.renderContext(mkContext(90), colors, { enabled: true, displayStyle: "blocks" });
      expect(critical!.bgColor).toBe(colors.contextCriticalBg);

      const normal = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "blocks" });
      expect(normal!.bgColor).toBe(colors.contextBg);
    });

    it("should toggle token count display with showPercentageOnly", () => {
      const withTokens = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "blocks" });
      expect(withTokens!.text).toContain((100000).toLocaleString());
      expect(withTokens!.text).toContain("50%");

      const pctOnly = renderer.renderContext(mkContext(50), colors, { enabled: true, displayStyle: "blocks", showPercentageOnly: true });
      expect(pctOnly!.text).toContain("50%");
      expect(pctOnly!.text).not.toContain((100000).toLocaleString());
    });
  });
});
