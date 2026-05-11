import { BlockProvider } from "../src/segments/block";
import { TodayProvider } from "../src/segments/today";
import { SegmentRenderer } from "../src/segments/renderer";
import { CacheTimerProvider } from "../src/segments/cacheTimer";
import {
  ProxyBudgetProvider,
  PROXY_BUDGET_PRESETS,
  isProxyBudgetPreset,
} from "../src/segments/proxyBudget";
import { CacheManager } from "../src/utils/cache";
import { formatCacheTimerElapsed } from "../src/utils/formatters";
import {
  loadEntriesFromProjects,
  type ClaudeHookData,
} from "../src/utils/claude";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

jest.mock("../src/utils/claude", () => ({
  loadEntriesFromProjects: jest.fn(),
  getEffortLevel: (hookData: any) => {
    const level = hookData?.effort?.level;
    if (typeof level !== "string") return null;
    const trimmed = level.trim();
    return trimmed ? trimmed : null;
  },
  getThinkingEnabled: (hookData: any) => {
    const enabled = hookData?.thinking?.enabled;
    if (typeof enabled !== "boolean") return null;
    return enabled;
  },
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
    it("should return native rate limit data when available", async () => {
      const resetsAt = Math.floor(Date.now() / 1000) + 3600;
      const hookData = {
        rate_limits: {
          five_hour: { used_percentage: 35, resets_at: resetsAt },
        },
      } as ClaudeHookData;

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo(hookData);

      expect(blockInfo).not.toBeNull();
      expect(blockInfo!.nativeUtilization).toBe(35);
      expect(blockInfo!.timeRemaining).toBeGreaterThan(0);
      expect(blockInfo!.timeRemaining).toBeLessThanOrEqual(60);
    });

    it("should return null when no native data is available", async () => {
      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo();

      expect(blockInfo).toBeNull();
    });

    it("should return null when hook data has no rate_limits", async () => {
      const hookData = { cwd: "/tmp" } as ClaudeHookData;

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo(hookData);

      expect(blockInfo).toBeNull();
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
    it("should handle no hook data gracefully", async () => {
      const blockProvider = new BlockProvider();
      const todayProvider = new TodayProvider();

      mockLoadEntries.mockResolvedValue([]);
      const blockInfo = await blockProvider.getActiveBlockInfo();
      const todayInfo = await todayProvider.getTodayInfo();

      expect(blockInfo).toBeNull();

      expect(todayInfo.cost).toBeNull();
      expect(todayInfo.tokens).toBeNull();
      expect(todayInfo.tokenBreakdown).toBeNull();
    });
  });

  describe("Directory Segment", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = {} as any;
    const colors = { modeBg: "#1e1e2e", modeFg: "#cdd6f4" } as any;

    let renderer: SegmentRenderer;
    let originalHome: string | undefined;

    beforeEach(() => {
      renderer = new SegmentRenderer(config, symbols);
      originalHome = process.env.HOME;
    });

    afterEach(() => {
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      }
    });

    it("should fish-style abbreviate paths under HOME", () => {
      process.env.HOME = "/home/user";
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/home/user/repos/dotfiles",
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        workspace: {
          current_dir: "/home/user/repos/dotfiles",
          project_dir: "/home/user/repos/dotfiles",
        },
      };

      const result = renderer.renderDirectory(hookData, colors, {
        enabled: true,
        style: "fish",
      });

      expect(result.text).toBe("~/r/dotfiles");
    });

    it("should fish-style abbreviate paths outside HOME", () => {
      process.env.HOME = "/home/user";
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/mnt/c/Users/andyb/repos/dotfiles",
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        workspace: {
          current_dir: "/mnt/c/Users/andyb/repos/dotfiles",
          project_dir: "/mnt/c/Users/andyb/repos/dotfiles",
        },
      };

      const result = renderer.renderDirectory(hookData, colors, {
        enabled: true,
        style: "fish",
      });

      expect(result.text).toBe("/m/c/U/a/r/dotfiles");
    });

    it("should show relative path when inside a subdirectory of project", () => {
      process.env.HOME = "/home/user";
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/home/user/repos/dotfiles/src/components",
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        workspace: {
          current_dir: "/home/user/repos/dotfiles/src/components",
          project_dir: "/home/user/repos/dotfiles",
        },
      };

      const result = renderer.renderDirectory(hookData, colors, {
        enabled: true,
        style: "fish",
      });

      expect(result.text).toBe("~/r/d/s/components");
    });

    it("should render original repo path in --worktree sessions", () => {
      process.env.HOME = "/home/user";
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/tmp/worktrees/some-task/src/components",
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        workspace: {
          current_dir: "/tmp/worktrees/some-task/src/components",
          project_dir: "/tmp/worktrees/some-task",
        },
        worktree: {
          name: "some-task",
          path: "/tmp/worktrees/some-task",
          branch: "feature/x",
          original_cwd: "/home/user/repos/claude-powerline",
          original_branch: "main",
        },
      };

      const result = renderer.renderDirectory(hookData, colors, {
        enabled: true,
        style: "fish",
      });

      expect(result.text).toBe("~/r/claude-powerline");
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

  describe("Agent Segment", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = { agent: "◇" } as any;
    const colors = { agentBg: "#2a2a4a", agentFg: "#b0a8e0" } as any;

    it("should render agent name when present", () => {
      const renderer = new SegmentRenderer(config, symbols);
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
        agent: { name: "researcher" },
      };

      const result = renderer.renderAgent(hookData, colors, { enabled: true });
      expect(result).not.toBeNull();
      expect(result!.text).toBe("◇ researcher");
      expect(result!.bgColor).toBe(colors.agentBg);
      expect(result!.fgColor).toBe(colors.agentFg);
    });

    it("should return null when agent is absent or name is blank", () => {
      const renderer = new SegmentRenderer(config, symbols);
      const base: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
      };

      expect(renderer.renderAgent(base, colors, { enabled: true })).toBeNull();
      expect(
        renderer.renderAgent({ ...base, agent: { name: "   " } }, colors, {
          enabled: true,
        }),
      ).toBeNull();
    });
  });

  describe("Thinking Segment", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = { thinking: "✦" } as any;
    const colors = {
      thinkingBg: "#2a2a3a",
      thinkingFg: "#c792ea",
    } as any;

    const base: ClaudeHookData = {
      hook_event_name: "Status",
      session_id: "test",
      transcript_path: "/tmp/test.json",
      cwd: "/test",
      model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
      workspace: { current_dir: "/test", project_dir: "/test" },
    };

    interface Case {
      name: string;
      hook: Partial<ClaudeHookData>;
      cfg: { showEnabled?: boolean; showEffort?: boolean };
      expected: string | null;
    }

    const cases: Case[] = [
      {
        name: "both parts enabled, both fields present -> uses separator",
        hook: { effort: { level: "xhigh" }, thinking: { enabled: true } },
        cfg: { showEnabled: true, showEffort: true },
        expected: "✦ On · xhigh",
      },
      {
        name: "only showEnabled, thinking.enabled=false -> no separator",
        hook: { thinking: { enabled: false } },
        cfg: { showEnabled: true, showEffort: false },
        expected: "✦ Off",
      },
      {
        name: "both flags true but only effort present -> no separator",
        hook: { effort: { level: "xhigh" } },
        cfg: { showEnabled: true, showEffort: true },
        expected: "✦ xhigh",
      },
      {
        name: "both flags true, hookData empty -> null",
        hook: {},
        cfg: { showEnabled: true, showEffort: true },
        expected: null,
      },
      {
        name: "both flags false -> null",
        hook: { effort: { level: "high" }, thinking: { enabled: true } },
        cfg: { showEnabled: false, showEffort: false },
        expected: null,
      },
    ];

    it.each(cases)("$name", ({ hook, cfg, expected }) => {
      const renderer = new SegmentRenderer(config, symbols);
      const result = renderer.renderThinking(
        { ...base, ...hook } as ClaudeHookData,
        colors,
        { enabled: true, ...cfg },
      );
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.text).toBe(expected);
        expect(result!.bgColor).toBe(colors.thinkingBg);
        expect(result!.fgColor).toBe(colors.thinkingFg);
      }
    });
  });

  describe("Env Segment", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = { env: "⚙" } as any;
    const colors = { envBg: "#2d2d3d", envFg: "#d0a0d0" } as any;

    let renderer: SegmentRenderer;

    beforeEach(() => {
      renderer = new SegmentRenderer(config, symbols);
    });

    afterEach(() => {
      delete process.env.TEST_ENV_SEGMENT;
    });

    it("should return null when env var is unset", () => {
      delete process.env.TEST_ENV_SEGMENT;
      const result = renderer.renderEnv(colors, {
        enabled: true,
        variable: "TEST_ENV_SEGMENT",
      });
      expect(result).toBeNull();
    });

    it("should return null when env var is empty string", () => {
      process.env.TEST_ENV_SEGMENT = "";
      const result = renderer.renderEnv(colors, {
        enabled: true,
        variable: "TEST_ENV_SEGMENT",
      });
      expect(result).toBeNull();
    });

    it("should render with variable name as default prefix", () => {
      process.env.TEST_ENV_SEGMENT = "my-value";
      const result = renderer.renderEnv(colors, {
        enabled: true,
        variable: "TEST_ENV_SEGMENT",
      });
      expect(result).not.toBeNull();
      expect(result!.text).toBe("⚙ TEST_ENV_SEGMENT: my-value");
      expect(result!.bgColor).toBe(colors.envBg);
      expect(result!.fgColor).toBe(colors.envFg);
    });

    it("should render with custom prefix", () => {
      process.env.TEST_ENV_SEGMENT = "work-org";
      const result = renderer.renderEnv(colors, {
        enabled: true,
        variable: "TEST_ENV_SEGMENT",
        prefix: "Acct",
      });
      expect(result).not.toBeNull();
      expect(result!.text).toBe("⚙ Acct: work-org");
    });

    it("should render without prefix or colon when prefix is empty string", () => {
      process.env.TEST_ENV_SEGMENT = "work-org";
      const result = renderer.renderEnv(colors, {
        enabled: true,
        variable: "TEST_ENV_SEGMENT",
        prefix: "",
      });
      expect(result).not.toBeNull();
      expect(result!.text).toBe("⚙ work-org");
    });
  });

  describe("Session ID Segment", () => {
    const config = { theme: "dark", display: { style: "minimal" } } as any;
    const symbols = { session_id: "⌗" } as any;
    const colors = { sessionBg: "#1e1e2e", sessionFg: "#cdd6f4" } as any;
    const sessionId = "01abc123-def4-5678-9012-345678901234";

    let renderer: SegmentRenderer;

    beforeEach(() => {
      renderer = new SegmentRenderer(config, symbols);
    });

    it("should render session id with label by default", () => {
      const result = renderer.renderSessionId(sessionId, colors);
      expect(result.text).toBe(`⌗ ${sessionId}`);
    });

    it("should render session id with label when showIdLabel is true", () => {
      const result = renderer.renderSessionId(sessionId, colors, {
        enabled: true,
        showIdLabel: true,
      });
      expect(result.text).toBe(`⌗ ${sessionId}`);
    });

    it("should render session id without label when showIdLabel is false", () => {
      const result = renderer.renderSessionId(sessionId, colors, {
        enabled: true,
        showIdLabel: false,
      });
      expect(result.text).toBe(sessionId);
    });

    it("should use session colors", () => {
      const result = renderer.renderSessionId(sessionId, colors);
      expect(result.bgColor).toBe(colors.sessionBg);
      expect(result.fgColor).toBe(colors.sessionFg);
    });
  });

  describe("Block Segment - Native Rate Limits", () => {
    it("should use native rate_limits when present and skip transcript loading", async () => {
      mockLoadEntries.mockClear();

      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
        rate_limits: {
          five_hour: {
            used_percentage: 42.5,
            resets_at: Math.floor(Date.now() / 1000) + 3 * 3600,
          },
        },
      };

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo(hookData);

      expect(blockInfo).not.toBeNull();
      expect(blockInfo!.nativeUtilization).toBe(42.5);
      expect(blockInfo!.timeRemaining).toBeGreaterThan(0);
      expect(blockInfo!.timeRemaining).toBeLessThanOrEqual(180);
    });

    it("should return null when rate_limits is absent", async () => {
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
      };

      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo(hookData);

      expect(blockInfo).toBeNull();
    });

    it("should return null when called without hookData", async () => {
      const blockProvider = new BlockProvider();
      const blockInfo = await blockProvider.getActiveBlockInfo();

      expect(blockInfo).toBeNull();
    });

    it("should render native block data with text style", () => {
      const config = {
        theme: "dark",
        display: { style: "minimal" },
        budget: { block: { warningThreshold: 80 } },
      } as any;
      const symbols = {
        block_cost: "◱",
        bar_filled: "▪",
        bar_empty: "▫",
      } as any;
      const colors = {
        blockBg: "#2a2a2a",
        blockFg: "#87ceeb",
        contextWarningBg: "#92400e",
        contextWarningFg: "#fbbf24",
        contextCriticalBg: "#991b1b",
        contextCriticalFg: "#fca5a5",
      } as any;

      const renderer = new SegmentRenderer(config, symbols);
      const blockInfo = { nativeUtilization: 35, timeRemaining: 180 };

      const result = renderer.renderBlock(blockInfo, colors, {
        enabled: true,
        type: "cost",
        displayStyle: "text",
      });
      expect(result.text).toContain("◱");
      expect(result.text).toContain("35%");
      expect(result.text).toContain("3h");
      expect(result.bgColor).toBe(colors.blockBg);
    });

    it("should render native block with bar display style", () => {
      const config = {
        theme: "dark",
        display: { style: "minimal" },
        budget: { block: { warningThreshold: 80 } },
      } as any;
      const symbols = {
        block_cost: "◱",
        bar_filled: "▪",
        bar_empty: "▫",
      } as any;
      const colors = {
        blockBg: "#2a2a2a",
        blockFg: "#87ceeb",
        contextWarningBg: "#92400e",
        contextWarningFg: "#fbbf24",
        contextCriticalBg: "#991b1b",
        contextCriticalFg: "#fca5a5",
      } as any;

      const renderer = new SegmentRenderer(config, symbols);
      const blockInfo = { nativeUtilization: 50, timeRemaining: 60 };

      const result = renderer.renderBlock(blockInfo, colors, {
        enabled: true,
        type: "cost",
        displayStyle: "bar",
      });
      expect(result.text).toContain("▪");
      expect(result.text).toContain("▫");
      expect(result.text).toContain("50%");
    });

    it("should apply warning colors when native utilization >= 50%", () => {
      const config = {
        theme: "dark",
        display: { style: "minimal" },
        budget: { block: { warningThreshold: 80 } },
      } as any;
      const symbols = { block_cost: "◱" } as any;
      const colors = {
        blockBg: "#2a2a2a",
        blockFg: "#87ceeb",
        contextWarningBg: "#92400e",
        contextWarningFg: "#fbbf24",
        contextCriticalBg: "#991b1b",
        contextCriticalFg: "#fca5a5",
      } as any;

      const renderer = new SegmentRenderer(config, symbols);

      const at60 = renderer.renderBlock(
        { nativeUtilization: 60, timeRemaining: 120 },
        colors,
        { enabled: true, type: "cost" },
      );
      expect(at60.bgColor).toBe(colors.contextWarningBg);

      const at90 = renderer.renderBlock(
        { nativeUtilization: 90, timeRemaining: 30 },
        colors,
        { enabled: true, type: "cost" },
      );
      expect(at90.bgColor).toBe(colors.contextCriticalBg);
    });
  });

  describe("Weekly Segment", () => {
    it("should render when seven_day rate limits are present", () => {
      const config = { theme: "dark", display: { style: "minimal" } } as any;
      const symbols = { weekly_cost: "◑" } as any;
      const colors = {
        weeklyBg: "#2a2a3a",
        weeklyFg: "#a0c4e8",
        contextWarningBg: "#92400e",
        contextWarningFg: "#fbbf24",
        contextCriticalBg: "#991b1b",
        contextCriticalFg: "#fca5a5",
      } as any;

      const renderer = new SegmentRenderer(config, symbols);
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
        rate_limits: {
          seven_day: {
            used_percentage: 41.2,
            resets_at: Math.floor(Date.now() / 1000) + 4 * 24 * 3600,
          },
        },
      };

      const result = renderer.renderWeekly(hookData, colors);
      expect(result).not.toBeNull();
      expect(result!.text).toContain("◑");
      expect(result!.text).toContain("41%");
      expect(result!.bgColor).toBe(colors.weeklyBg);
    });

    it("should return null when seven_day rate limits are absent", () => {
      const config = { theme: "dark", display: { style: "minimal" } } as any;
      const symbols = { weekly_cost: "◑" } as any;
      const colors = { weeklyBg: "#2a2a3a", weeklyFg: "#a0c4e8" } as any;

      const renderer = new SegmentRenderer(config, symbols);
      const hookData: ClaudeHookData = {
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: "/tmp/test.json",
        cwd: "/test",
        model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
        workspace: { current_dir: "/test", project_dir: "/test" },
      };

      const result = renderer.renderWeekly(hookData, colors);
      expect(result).toBeNull();
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
      const bar = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "bar",
      });
      expect(bar!.text).toContain("▪");
      expect(bar!.text).toContain("▫");

      const blocks = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "blocks",
      });
      expect(blocks!.text).toContain("█");
      expect(blocks!.text).toContain("░");
    });

    it("should render all standard styles with 10-char bars and correct fill/empty", () => {
      const styles: Array<{
        name: "blocks" | "squares" | "dots" | "line" | "filled" | "geometric";
        filled: string;
        empty: string;
      }> = [
        { name: "blocks", filled: "█", empty: "░" },
        { name: "squares", filled: "◼", empty: "◻" },
        { name: "dots", filled: "●", empty: "○" },
        { name: "line", filled: "━", empty: "┄" },
        { name: "filled", filled: "■", empty: "□" },
        { name: "geometric", filled: "▰", empty: "▱" },
      ];

      for (const { name, filled, empty } of styles) {
        const result = renderer.renderContext(mkContext(50), colors, {
          enabled: true,
          displayStyle: name,
        });
        const barPart = result!.text.split(" ")[0]!;
        expect(barPart).toHaveLength(10);
        expect(barPart).toContain(filled);
        expect(barPart).toContain(empty);
      }
    });

    it("should handle capped style edge cases: 0%, mid, and 100%", () => {
      const at0 = renderer.renderContext(mkContext(0), colors, {
        enabled: true,
        displayStyle: "capped",
      });
      expect(at0!.text).toMatch(/^╸┄{9}/);

      const at50 = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "capped",
      });
      expect(at50!.text).toContain("━");
      expect(at50!.text).toContain("╸");
      expect(at50!.text).toContain("┄");

      const at100 = renderer.renderContext(mkContext(100), colors, {
        enabled: true,
        displayStyle: "capped",
      });
      expect(at100!.text).toMatch(/^━{10}/);
    });

    it("should render ball style with exactly one position marker", () => {
      const result = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "ball",
      });
      const barPart = result!.text.split(" ")[0]!;
      expect(barPart).toHaveLength(10);
      expect((barPart.match(/●/g) || []).length).toBe(1);
    });

    it("should render empty bars on null context and text fallback for text style", () => {
      const barNull = renderer.renderContext(null, colors, {
        enabled: true,
        displayStyle: "squares",
      });
      expect(barNull!.text).toContain("◻".repeat(10));
      expect(barNull!.text).toContain("0%");

      const textNull = renderer.renderContext(null, colors, {
        enabled: true,
        displayStyle: "text",
      });
      expect(textNull!.text).toContain("◔");
    });

    it("should apply warning/critical colors based on context left percentage", () => {
      const warning = renderer.renderContext(mkContext(70), colors, {
        enabled: true,
        displayStyle: "blocks",
      });
      expect(warning!.bgColor).toBe(colors.contextWarningBg);

      const critical = renderer.renderContext(mkContext(90), colors, {
        enabled: true,
        displayStyle: "blocks",
      });
      expect(critical!.bgColor).toBe(colors.contextCriticalBg);

      const normal = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "blocks",
      });
      expect(normal!.bgColor).toBe(colors.contextBg);
    });

    it("should toggle token count display with showPercentageOnly", () => {
      const withTokens = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "blocks",
      });
      expect(withTokens!.text).toContain((100000).toLocaleString());
      expect(withTokens!.text).toContain("50%");

      const pctOnly = renderer.renderContext(mkContext(50), colors, {
        enabled: true,
        displayStyle: "blocks",
        showPercentageOnly: true,
      });
      expect(pctOnly!.text).toContain("50%");
      expect(pctOnly!.text).not.toContain((100000).toLocaleString());
    });
  });

  describe("showIcons flag (hide leading segment icons)", () => {
    const symbols = {
      branch: "⎇",
      session_cost: "§",
      git_clean: "✓",
      git_dirty: "●",
      git_ahead: "↑",
      git_behind: "↓",
      metrics_response: "⧖",
      metrics_lines_added: "+",
    } as any;
    const colors = {
      sessionBg: "",
      sessionFg: "",
      gitBg: "",
      gitFg: "",
      metricsBg: "",
      metricsFg: "",
    } as any;

    it("drops leading session icon when display.showIcons is false, per-segment override re-enables git icon, and status glyphs stay", () => {
      const config = {
        theme: "dark",
        display: {
          style: "minimal",
          showIcons: false,
          lines: [
            {
              segments: {
                session: { enabled: true, type: "cost" },
                git: { enabled: true, showIcon: true, showAheadBehind: true },
              },
            },
          ],
        },
      } as any;
      const renderer = new SegmentRenderer(config, symbols);

      const usageInfo = {
        session: {
          cost: 1.23,
          tokens: 0,
          calculatedCost: 1.23,
          officialCost: null,
          tokenBreakdown: null,
        },
      } as any;
      const session = renderer.renderSession(
        usageInfo,
        colors,
        config.display.lines[0].segments.session,
      );
      expect(session!.text).not.toContain("§");
      expect(session!.text.startsWith(" ")).toBe(false);

      const git = renderer.renderGit(
        { branch: "main", status: "dirty", ahead: 1, behind: 2 } as any,
        colors,
        config.display.lines[0].segments.git,
      );
      expect(git!.text).toContain("⎇");
      expect(git!.text).toContain("●");
      expect(git!.text).toContain("↑1");
      expect(git!.text).toContain("↓2");

      const metrics = renderer.renderMetrics(
        {
          responseTime: 2.5,
          lastResponseTime: null,
          sessionDuration: null,
          messageCount: null,
          linesAdded: 12,
          linesRemoved: null,
        } as any,
        colors,
        { enabled: true, showResponseTime: true, showLinesAdded: true } as any,
      );
      expect(metrics!.text).toContain("⧖");
      expect(metrics!.text).toContain("+");
    });

    it("global showIcons true with per-segment showIcon false drops only that segment's icon", () => {
      const config = {
        theme: "dark",
        display: {
          style: "minimal",
          showIcons: true,
          lines: [
            {
              segments: {
                session: { enabled: true, type: "cost", showIcon: false },
              },
            },
          ],
        },
      } as any;
      const renderer = new SegmentRenderer(config, symbols);
      const usageInfo = {
        session: {
          cost: 2.5,
          tokens: 0,
          calculatedCost: 2.5,
          officialCost: null,
          tokenBreakdown: null,
        },
      } as any;
      const session = renderer.renderSession(
        usageInfo,
        colors,
        config.display.lines[0].segments.session,
      );
      expect(session!.text).not.toContain("§");
      expect(session!.text.startsWith(" ")).toBe(false);
    });
  });

  describe("CacheTimer Segment", () => {
    it("formats elapsed seconds across all thresholds", () => {
      expect(formatCacheTimerElapsed(0)).toBe("0:00");
      expect(formatCacheTimerElapsed(3)).toBe("0:03");
      expect(formatCacheTimerElapsed(222)).toBe("3:42");
      expect(formatCacheTimerElapsed(299)).toBe("4:59");
      expect(formatCacheTimerElapsed(300)).toBe("5m");
      expect(formatCacheTimerElapsed(1050)).toBe("17m");
      expect(formatCacheTimerElapsed(3599)).toBe("59m");
      expect(formatCacheTimerElapsed(3600)).toBe("1h+");
      expect(formatCacheTimerElapsed(86400)).toBe("1h+");
    });

    it("escalates colors at 3m and 5m boundaries", () => {
      const config = { theme: "dark", display: { style: "minimal" } } as any;
      const symbols = { cache_timer: "◴" } as any;
      const colors = {
        cacheTimerBg: "#1f3a1f",
        cacheTimerFg: "#90ee90",
        cacheTimerBold: false,
        contextWarningBg: "#92400e",
        contextWarningFg: "#fbbf24",
        contextWarningBold: false,
        contextCriticalBg: "#991b1b",
        contextCriticalFg: "#fca5a5",
        contextCriticalBold: false,
      } as any;
      const renderer = new SegmentRenderer(config, symbols);

      const healthy0 = renderer.renderCacheTimer({ elapsedSeconds: 0 }, colors);
      expect(healthy0.bgColor).toBe(colors.cacheTimerBg);
      expect(healthy0.fgColor).toBe(colors.cacheTimerFg);

      const healthy179 = renderer.renderCacheTimer(
        { elapsedSeconds: 179 },
        colors,
      );
      expect(healthy179.bgColor).toBe(colors.cacheTimerBg);

      const warn180 = renderer.renderCacheTimer(
        { elapsedSeconds: 180 },
        colors,
      );
      expect(warn180.bgColor).toBe(colors.contextWarningBg);
      expect(warn180.fgColor).toBe(colors.contextWarningFg);

      const warn299 = renderer.renderCacheTimer(
        { elapsedSeconds: 299 },
        colors,
      );
      expect(warn299.bgColor).toBe(colors.contextWarningBg);

      const critical300 = renderer.renderCacheTimer(
        { elapsedSeconds: 300 },
        colors,
      );
      expect(critical300.bgColor).toBe(colors.contextCriticalBg);
      expect(critical300.fgColor).toBe(colors.contextCriticalFg);

      const critical3600 = renderer.renderCacheTimer(
        { elapsedSeconds: 3600 },
        colors,
      );
      expect(critical3600.bgColor).toBe(colors.contextCriticalBg);
      expect(critical3600.text).toContain("1h+");
    });

    it("anchors elapsed time to the last user entry in the transcript", async () => {
      const transcriptPath = join(tempDir, "transcript.jsonl");
      const now = Date.now();
      const userTs = new Date(now - 120_000).toISOString();
      const assistantTs = new Date(now - 15_000).toISOString();
      const content = [
        JSON.stringify({
          type: "user",
          message: { role: "user" },
          timestamp: new Date(now - 600_000).toISOString(),
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user" },
          timestamp: userTs,
        }),
        JSON.stringify({
          type: "assistant",
          message: { role: "assistant" },
          timestamp: assistantTs,
        }),
      ].join("\n");
      writeFileSync(transcriptPath, content);

      const provider = new CacheTimerProvider();
      const result = await provider.getCacheTimerInfo({
        transcript_path: transcriptPath,
      } as ClaudeHookData);

      expect(result).not.toBeNull();
      expect(result!.elapsedSeconds).toBeGreaterThanOrEqual(119);
      expect(result!.elapsedSeconds).toBeLessThanOrEqual(125);
    });
  });

  describe("Budget display toggles (renderToday)", () => {
    const symbols = { today_cost: "◱" } as any;
    const colors = {
      todayBg: "",
      todayFg: "",
      todayBold: false,
    } as any;

    function renderTodayCase(opts: {
      cost: number | null;
      tokens?: number | null;
      amount?: number;
      budgetType?: "cost" | "tokens";
      showValue?: boolean;
      showPercentage?: boolean;
    }) {
      const config = {
        theme: "dark",
        display: { style: "minimal", showIcons: false, lines: [] },
        budget: {
          today: {
            amount: opts.amount,
            type: opts.budgetType,
            warningThreshold: 80,
            showValue: opts.showValue,
            showPercentage: opts.showPercentage,
          },
        },
      } as any;
      const renderer = new SegmentRenderer(config, symbols);
      const todayInfo = {
        cost: opts.cost,
        tokens: opts.tokens ?? null,
        tokenBreakdown: null,
        date: "2026-04-24",
      } as any;
      return renderer.renderToday(todayInfo, colors, {
        enabled: true,
        type: "cost",
      } as any);
    }

    const cases: Array<{
      name: string;
      opts: Parameters<typeof renderTodayCase>[0];
      expected: {
        isNull: boolean;
        textContains?: string[];
        textEquals?: string;
      };
    }> = [
      {
        name: "default flags (both true) -> value + percentage",
        opts: { cost: 10, amount: 50 },
        expected: { isNull: false, textContains: ["$10.00", "20%"] },
      },
      {
        name: "showPercentage:false -> value only",
        opts: { cost: 10, amount: 50, showPercentage: false },
        expected: { isNull: false, textEquals: "$10.00" },
      },
      {
        name: "showValue:false -> percentage only",
        opts: { cost: 10, amount: 50, showValue: false },
        expected: { isNull: false, textEquals: "20%" },
      },
      {
        name: "both false -> null",
        opts: {
          cost: 10,
          amount: 50,
          showValue: false,
          showPercentage: false,
        },
        expected: { isNull: true },
      },
      {
        name: "no budget + showValue:false -> value (flags no-op)",
        opts: { cost: 10, showValue: false, showPercentage: true },
        expected: { isNull: false, textEquals: "$10.00" },
      },
      {
        name: "budget but pct not computable (tokens-budget, no tokens) -> falls back to base",
        opts: {
          cost: 10,
          tokens: null,
          amount: 50,
          budgetType: "tokens",
          showValue: false,
          showPercentage: true,
        },
        expected: { isNull: false, textEquals: "$10.00" },
      },
      {
        name: "both false + pct not computable -> falls back to base (not null)",
        opts: {
          cost: 10,
          tokens: null,
          amount: 50,
          budgetType: "tokens",
          showValue: false,
          showPercentage: false,
        },
        expected: { isNull: false, textEquals: "$10.00" },
      },
    ];

    it.each(cases)("$name", ({ opts, expected }) => {
      const result = renderTodayCase(opts);
      if (expected.isNull) {
        expect(result).toBeNull();
        return;
      }
      expect(result).not.toBeNull();
      if (expected.textEquals !== undefined) {
        expect(result!.text).toBe(expected.textEquals);
      }
      for (const piece of expected.textContains ?? []) {
        expect(result!.text).toContain(piece);
      }
    });

    it("renderSession applies the same flag semantics", () => {
      const sessionSymbols = { session_cost: "§" } as any;
      const sessionColors = {
        sessionBg: "",
        sessionFg: "",
        sessionBold: false,
      } as any;

      function renderSessionCase(opts: {
        cost: number | null;
        amount?: number;
        showValue?: boolean;
        showPercentage?: boolean;
      }) {
        const config = {
          theme: "dark",
          display: { style: "minimal", showIcons: false, lines: [] },
          budget: {
            session: {
              amount: opts.amount,
              warningThreshold: 80,
              showValue: opts.showValue,
              showPercentage: opts.showPercentage,
            },
          },
        } as any;
        const renderer = new SegmentRenderer(config, sessionSymbols);
        const usageInfo = {
          session: {
            cost: opts.cost,
            tokens: 0,
            calculatedCost: opts.cost,
            officialCost: null,
            tokenBreakdown: null,
          },
        } as any;
        return renderer.renderSession(usageInfo, sessionColors, {
          enabled: true,
          type: "cost",
        } as any);
      }

      expect(renderSessionCase({ cost: 10, amount: 50 })!.text).toBe(
        "$10.00 20%",
      );
      expect(
        renderSessionCase({ cost: 10, amount: 50, showPercentage: false })!
          .text,
      ).toBe("$10.00");
      expect(
        renderSessionCase({ cost: 10, amount: 50, showValue: false })!.text,
      ).toBe("20%");
      expect(
        renderSessionCase({
          cost: 10,
          amount: 50,
          showValue: false,
          showPercentage: false,
        }),
      ).toBeNull();
    });
  });

  describe("Proxy Budget Segment", () => {
    const PROXY_BASE_URL_ENV = "TEST_PROXY_BASE_URL";
    const PROXY_TOKEN_ENV = "TEST_PROXY_TOKEN";
    const PROXY_BASE_URL = "https://proxy.example.com";
    const PROXY_TOKEN = "test-token";
    const baseEnv = {
      [PROXY_BASE_URL_ENV]: PROXY_BASE_URL,
      [PROXY_TOKEN_ENV]: PROXY_TOKEN,
    };

    let fetchMock: jest.SpyInstance;
    let getTtlCacheMock: jest.SpyInstance;
    let setTtlCacheMock: jest.SpyInstance;
    let originalEnv: typeof process.env;

    beforeEach(() => {
      originalEnv = { ...process.env };
      Object.assign(process.env, baseEnv);
      fetchMock = jest.spyOn(globalThis, "fetch");
      getTtlCacheMock = jest
        .spyOn(CacheManager, "getTtlCache")
        .mockResolvedValue(null);
      setTtlCacheMock = jest
        .spyOn(CacheManager, "setTtlCache")
        .mockResolvedValue();
    });

    afterEach(() => {
      process.env = originalEnv;
      fetchMock.mockRestore();
      getTtlCacheMock.mockRestore();
      setTtlCacheMock.mockRestore();
    });

    function mockFetchOk(body: unknown): void {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => body,
      } as Response);
    }

    function provider() {
      return new ProxyBudgetProvider();
    }

    function defaultProviderConfig() {
      return {
        baseUrlEnv: PROXY_BASE_URL_ENV,
        tokenEnv: PROXY_TOKEN_ENV,
      };
    }

    it("returns spend, budget, percentage, and resetAt for a healthy LiteLLM response", async () => {
      mockFetchOk({
        info: {
          spend: 5,
          max_budget: 50,
          budget_reset_at: "2026-01-01T00:00:00Z",
        },
      });
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(5);
      expect(info!.budget).toBe(50);
      expect(info!.percentage).toBeCloseTo(10);
      expect(info!.resetAt).toBeInstanceOf(Date);
      expect(setTtlCacheMock).toHaveBeenCalledTimes(1);
    });

    it("returns null when the token env var is unset, without calling fetch", async () => {
      delete process.env[PROXY_TOKEN_ENV];
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("supports custom JSON paths (OpenRouter-style shape)", async () => {
      mockFetchOk({ data: { usage: 12, limit: 30 } });
      const info = await provider().getProxyBudgetInfo({
        ...defaultProviderConfig(),
        spendPath: "data.usage",
        budgetPath: "data.limit",
      });
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(12);
      expect(info!.budget).toBe(30);
      expect(info!.percentage).toBeCloseTo(40);
    });

    it("returns null when a configured field is missing from the response", async () => {
      mockFetchOk({ info: { max_budget: 50 } });
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
      expect(setTtlCacheMock).not.toHaveBeenCalled();
    });

    it("returns null on non-2xx response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
    });

    it("returns null on malformed JSON", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid json");
        },
      } as unknown as Response);
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
    });

    it("falls back to stale cache on fetch failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const stale = {
        spend: 7,
        budget: 50,
        percentage: 14,
        resetAt: null,
      };
      getTtlCacheMock.mockResolvedValueOnce(null).mockResolvedValueOnce(stale);
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(7);
    });

    it("returns null when spend grossly exceeds budget (likely misconfigured spendPath)", async () => {
      mockFetchOk({ info: { spend: 99999, max_budget: 50 } });
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
    });

    it("uses the disk cache when fresh and skips the network", async () => {
      const cached = {
        spend: 3,
        budget: 50,
        percentage: 6,
        resetAt: null,
      };
      getTtlCacheMock.mockResolvedValueOnce(cached);
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(3);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null when neither the network nor the stale cache yield data", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      getTtlCacheMock.mockResolvedValue(null);
      const info = await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(info).toBeNull();
    });

    it("uses the bearer auth header by default and x-api-key when configured", async () => {
      mockFetchOk({ info: { spend: 1, max_budget: 10 } });
      await provider().getProxyBudgetInfo(defaultProviderConfig());
      expect(fetchMock.mock.calls[0]?.[1]?.headers?.["Authorization"]).toBe(
        `Bearer ${PROXY_TOKEN}`,
      );
      fetchMock.mockClear();

      await provider().getProxyBudgetInfo({
        ...defaultProviderConfig(),
        authScheme: "x-api-key",
      });
      expect(fetchMock.mock.calls[0]?.[1]?.headers?.["x-api-key"]).toBe(
        PROXY_TOKEN,
      );
      expect(
        fetchMock.mock.calls[0]?.[1]?.headers?.["Authorization"],
      ).toBeUndefined();
    });

    it("renders spent+percentage by default and applies traffic-light colors", () => {
      const symbols = { proxy_budget: "⛁" } as any;
      const colors = {
        proxyBudgetBg: "#PB",
        proxyBudgetFg: "#PF",
        proxyBudgetBold: false,
        contextWarningBg: "#WB",
        contextWarningFg: "#WF",
        contextWarningBold: false,
        contextCriticalBg: "#CB",
        contextCriticalFg: "#CF",
        contextCriticalBold: false,
      } as any;
      const config = {
        theme: "dark",
        display: { style: "minimal", showIcons: false, lines: [] },
      } as any;
      const renderer = new SegmentRenderer(config, symbols);

      const healthy = renderer.renderProxyBudget(
        { spend: 5, budget: 100, percentage: 5, resetAt: null },
        colors,
        { enabled: true },
      );
      expect(healthy.text).toBe("$5.00 (5%)");
      expect(healthy.bgColor).toBe(colors.proxyBudgetBg);

      const warn = renderer.renderProxyBudget(
        { spend: 80, budget: 100, percentage: 80, resetAt: null },
        colors,
        { enabled: true },
      );
      expect(warn.bgColor).toBe(colors.contextWarningBg);

      const critical = renderer.renderProxyBudget(
        { spend: 95, budget: 100, percentage: 95, resetAt: null },
        colors,
        { enabled: true },
      );
      expect(critical.bgColor).toBe(colors.contextCriticalBg);
    });

    it("renders alternative type values", () => {
      const symbols = { proxy_budget: "⛁" } as any;
      const colors = {
        proxyBudgetBg: "",
        proxyBudgetFg: "",
        proxyBudgetBold: false,
      } as any;
      const config = {
        theme: "dark",
        display: { style: "minimal", showIcons: false, lines: [] },
      } as any;
      const renderer = new SegmentRenderer(config, symbols);
      const info = {
        spend: 25,
        budget: 100,
        percentage: 25,
        resetAt: null,
      };

      expect(
        renderer.renderProxyBudget(info, colors, {
          enabled: true,
          type: "spent",
        }).text,
      ).toBe("$25.00");
      expect(
        renderer.renderProxyBudget(info, colors, {
          enabled: true,
          type: "remaining",
        }).text,
      ).toBe("$75.00");
      expect(
        renderer.renderProxyBudget(info, colors, {
          enabled: true,
          type: "percentage",
        }).text,
      ).toBe("25%");
    });

    it("preset=litellm uses /key/info with info.spend/info.max_budget paths", async () => {
      mockFetchOk({
        info: {
          spend: 4,
          max_budget: 40,
          budget_reset_at: "2026-02-01T00:00:00Z",
        },
      });
      const info = await provider().getProxyBudgetInfo({
        ...defaultProviderConfig(),
        preset: "litellm",
      });
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(4);
      expect(info!.budget).toBe(40);
      expect(info!.percentage).toBeCloseTo(10);
      expect(info!.resetAt).toBeInstanceOf(Date);
    });

    it("preset=openrouter resolves /api/v1/key with data.usage/data.limit/data.limit_reset", async () => {
      mockFetchOk({
        data: { usage: 8, limit: 20, limit_reset: "2026-03-01T00:00:00Z" },
      });
      const info = await provider().getProxyBudgetInfo({
        ...defaultProviderConfig(),
        preset: "openrouter",
      });
      expect(info).not.toBeNull();
      expect(info!.spend).toBe(8);
      expect(info!.budget).toBe(20);
      expect(info!.percentage).toBeCloseTo(40);
      expect(info!.resetAt).toBeInstanceOf(Date);
    });

    it("user-supplied paths override preset defaults", async () => {
      mockFetchOk({ custom: { my_spend: 6, my_cap: 60 } });
      const info = await provider().getProxyBudgetInfo({
        ...defaultProviderConfig(),
        preset: "openrouter",
        spendPath: "custom.my_spend",
        budgetPath: "custom.my_cap",
      });
      expect(info!.spend).toBe(6);
      expect(info!.budget).toBe(60);
    });

    it("isProxyBudgetPreset accepts every registered preset and rejects unknown ones", () => {
      for (const key of Object.keys(PROXY_BUDGET_PRESETS)) {
        expect(isProxyBudgetPreset(key)).toBe(true);
      }
      expect(isProxyBudgetPreset("bogus-proxy")).toBe(false);
      expect(isProxyBudgetPreset("")).toBe(false);
    });

    it("every registered preset has a fully-specified shape", () => {
      for (const def of Object.values(PROXY_BUDGET_PRESETS)) {
        expect(def.endpoint).toMatch(/\$\{baseUrl\}/);
        expect(def.spendPath).toBeTruthy();
        expect(def.budgetPath).toBeTruthy();
        expect(def.resetAtPath).toBeTruthy();
        expect(["bearer", "x-api-key"]).toContain(def.authScheme);
      }
    });
  });
});
