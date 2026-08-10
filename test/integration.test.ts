import { PowerlineRenderer } from "../src/powerline";
import type { ClaudeHookData } from "../src/utils/claude";
import type { PowerlineConfig } from "../src/config/loader";
import type { OutputStyleSegmentConfig } from "../src/segments/renderer";
import { stripAnsi } from "../src/utils/terminal";

jest.mock("../src/segments/session", () => ({
  SessionProvider: jest.fn().mockImplementation(() => ({
    getSessionInfo: jest.fn().mockResolvedValue({
      cost: 0.05,
      tokens: 1650,
      tokenBreakdown: {
        input: 1000,
        output: 500,
        cacheCreation: 100,
        cacheRead: 50,
      },
    }),
  })),
  UsageProvider: jest.fn().mockImplementation(() => ({
    getUsageInfo: jest.fn().mockResolvedValue({
      session: {
        cost: 0.05,
        tokens: 1650,
        tokenBreakdown: {
          input: 1000,
          output: 500,
          cacheCreation: 100,
          cacheRead: 50,
        },
      },
    }),
  })),
}));

jest.mock("node:child_process", () => ({
  exec: jest.fn().mockImplementation((cmd: string, _options: any, callback: any) => {
    let result = "";
    if (cmd.includes("git branch --show-current")) result = "main\n";
    else if (cmd.includes("git status --porcelain")) result = "";
    else if (cmd.includes("git rev-list --count")) result = "0\n";
    
    if (typeof callback === 'function') {
      callback(null, { stdout: result, stderr: "" });
    }
    return result;
  }),
}));

describe("Integration Tests", () => {
  const mockHookData: ClaudeHookData = {
    hook_event_name: "Status",
    session_id: "test-session-123",
    transcript_path: "/path/to/transcript.json",
    cwd: "/Users/test/claude-powerline",
    model: {
      id: "claude-opus-4",
      display_name: "Claude Opus",
    },
    workspace: {
      current_dir: "/Users/test/claude-powerline",
      project_dir: "/Users/test/claude-powerline",
    },
  };

  it("should generate complete statusline without ccusage dependency", async () => {
    const config = {
      theme: "dark" as const,
      display: {
        lines: [
          {
            segments: {
              directory: { enabled: true },
              git: { enabled: true, showSha: false },
              model: { enabled: true },
              session: { enabled: true, type: "tokens" as const },
            },
          },
        ],
      },
    };

    const renderer = new PowerlineRenderer(config);
    const result = await renderer.generateStatusline(mockHookData);

    expect(result).toContain("claude-powerline");
    expect(result).toContain("1.6K tokens");
    expect(result).toContain("Claude Opus");
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle session segment with different usage types", async () => {
    const baseConfig = {
      theme: "dark" as const,
      display: {
        lines: [
          {
            segments: {
              session: { enabled: true, type: "cost" as const },
            },
          },
        ],
      },
    };

    const renderer = new PowerlineRenderer(baseConfig);
    const result = await renderer.generateStatusline(mockHookData);

    expect(result).toContain("$0.05");
  });

  it("should work with minimal configuration", async () => {
    const minimalConfig = {
      theme: "light" as const,
      display: {
        lines: [
          {
            segments: {
              directory: { enabled: true },
            },
          },
        ],
      },
    };

    const renderer = new PowerlineRenderer(minimalConfig);
    const result = await renderer.generateStatusline(mockHookData);

    expect(result).toBeTruthy();
    expect(result).toContain("claude-powerline");
  });

  it("should handle empty segment configuration gracefully", async () => {
    const emptyConfig = {
      theme: "dark" as const,
      display: {
        lines: [
          {
            segments: {},
          },
        ],
      },
    };

    const renderer = new PowerlineRenderer(emptyConfig);
    const result = await renderer.generateStatusline(mockHookData);

    expect(typeof result).toBe("string");
  });

  describe("outputStyle segment end to end", () => {
    const styleHookData: ClaudeHookData = {
      ...mockHookData,
      output_style: { name: "Explanatory" },
    };

    const configFor = (
      display: Partial<PowerlineConfig["display"]> = {},
      segment: OutputStyleSegmentConfig = { enabled: true },
    ): PowerlineConfig => ({
      theme: "dark",
      display: {
        colorCompatibility: "truecolor",
        autoWrap: false,
        ...display,
        lines: [{ segments: { outputStyle: segment } }],
      },
    });

    it.each(["minimal", "powerline", "capsule"] as const)(
      "renders the style name in %s display style",
      async (style) => {
        const result = await new PowerlineRenderer(
          configFor({ style }),
        ).generateStatusline(styleHookData);
        expect(stripAnsi(result)).toContain("✎ Explanatory");
      },
    );

    it("renders the text-charset fallback OS instead of the pencil glyph", async () => {
      const result = await new PowerlineRenderer(
        configFor({ style: "minimal", charset: "text" }),
      ).generateStatusline(styleHookData);
      expect(stripAnsi(result)).toContain("OS Explanatory");
      expect(result).not.toContain("✎");
    });

    it("renders the bare name when display.showIcons is false", async () => {
      const result = await new PowerlineRenderer(
        configFor({ style: "minimal", showIcons: false }),
      ).generateStatusline(styleHookData);
      expect(stripAnsi(result)).toContain("Explanatory");
      expect(result).not.toContain("✎");
    });

    it("renders the label form when showLabel is set", async () => {
      const result = await new PowerlineRenderer(
        configFor({ style: "minimal" }, { enabled: true, showLabel: true }),
      ).generateStatusline(styleHookData);
      expect(stripAnsi(result)).toContain("✎ style: Explanatory");
    });

    it("omits the segment when hideDefault is set and the style is default", async () => {
      const defaultHookData: ClaudeHookData = {
        ...mockHookData,
        output_style: { name: "default" },
      };

      const hidden = await new PowerlineRenderer(
        configFor({ style: "minimal" }, { enabled: true, hideDefault: true }),
      ).generateStatusline(defaultHookData);
      expect(stripAnsi(hidden)).not.toContain("default");

      const shown = await new PowerlineRenderer(
        configFor({ style: "minimal" }, { enabled: true, hideDefault: false }),
      ).generateStatusline(defaultHookData);
      expect(stripAnsi(shown)).toContain("✎ default");
    });

    it("omits the segment when Claude Code sends no output_style", async () => {
      const result = await new PowerlineRenderer(
        configFor({ style: "minimal" }),
      ).generateStatusline(mockHookData);
      expect(result).not.toContain("✎");
    });
  });
});
