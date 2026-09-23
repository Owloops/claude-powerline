import { stripAnsi, visibleLength } from "../src/utils/terminal";
import { getTerminalWidth } from "../src/utils/terminal-width";
import { PowerlineRenderer } from "../src/powerline";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import type { PowerlineConfig } from "../src/config/loader";

describe("terminal utilities", () => {
  describe("stripAnsi", () => {
    it("should remove ANSI color codes", () => {
      const input = "\x1b[38;2;255;0;0mred text\x1b[0m";
      expect(stripAnsi(input)).toBe("red text");
    });

    it("should handle multiple ANSI codes", () => {
      const input = "\x1b[48;2;0;0;255m\x1b[38;2;255;255;255m text \x1b[0m";
      expect(stripAnsi(input)).toBe(" text ");
    });

    it("should return unchanged string without ANSI codes", () => {
      const input = "plain text";
      expect(stripAnsi(input)).toBe("plain text");
    });

    it("should handle empty string", () => {
      expect(stripAnsi("")).toBe("");
    });
  });

  describe("visibleLength", () => {
    it("should return correct length without ANSI codes", () => {
      const input = "\x1b[38;2;255;0;0mhello\x1b[0m";
      expect(visibleLength(input)).toBe(5);
    });

    it("should return length of plain text", () => {
      expect(visibleLength("hello world")).toBe(11);
    });

    it("should return 0 for empty string", () => {
      expect(visibleLength("")).toBe(0);
    });

    it("should handle string with only ANSI codes", () => {
      expect(visibleLength("\x1b[0m\x1b[38;2;0;0;0m")).toBe(0);
    });
  });
});

describe("autoWrap functionality", () => {
  const createConfig = (overrides: Partial<PowerlineConfig> = {}): PowerlineConfig => ({
    ...DEFAULT_CONFIG,
    display: {
      ...DEFAULT_CONFIG.display,
      autoWrap: true,
      style: "minimal",
      ...overrides.display,
    },
    ...overrides,
  });

  const mockHookData = {
    session_id: "test-session",
    transcript_path: "/fake/path.jsonl",
    workspace: {
      project_dir: "/test/project",
      current_dir: "/test/project",
    },
    model: {
      id: "claude-3-5-sonnet",
      display_name: "Claude",
    },
    cwd: "/test/project",
    hook_event_name: "test",
  };

  describe("configuration", () => {
    it("should have autoWrap true by default", () => {
      expect(DEFAULT_CONFIG.display.autoWrap).toBe(true);
    });

    it("should accept autoWrap true in config", () => {
      const config = createConfig();
      expect(config.display.autoWrap).toBe(true);
    });
  });

  describe("rendering with autoWrap", () => {
    it("should generate statusline with autoWrap enabled", async () => {
      const config = createConfig();
      const renderer = new PowerlineRenderer(config);
      const result = await renderer.generateStatusline(mockHookData);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should respect manual line breaks with autoWrap", async () => {
      const config = createConfig({
        display: {
          ...DEFAULT_CONFIG.display,
          autoWrap: true,
          style: "minimal",
          lines: [
            {
              segments: {
                directory: { enabled: true, showBasename: true },
                model: { enabled: true },
              },
            },
            {
              segments: {
                session: { enabled: true, type: "tokens", costSource: "calculated" },
                context: { enabled: true, showPercentageOnly: false },
              },
            },
          ],
        },
      });

      const renderer = new PowerlineRenderer(config);
      const result = await renderer.generateStatusline(mockHookData);

      expect(result).toContain("\n");
    });

    it("should not produce empty lines", async () => {
      const config = createConfig({
        display: {
          ...DEFAULT_CONFIG.display,
          autoWrap: true,
          style: "minimal",
          lines: [
            {
              segments: {
                directory: { enabled: true, showBasename: true },
              },
            },
            {
              segments: {
                model: { enabled: false },
              },
            },
            {
              segments: {
                session: { enabled: true, type: "tokens", costSource: "calculated" },
              },
            },
          ],
        },
      });

      const renderer = new PowerlineRenderer(config);
      const result = await renderer.generateStatusline(mockHookData);
      const lines = result.split("\n");

      for (const line of lines) {
        expect(stripAnsi(line).trim().length).toBeGreaterThan(0);
      }
    });
  });
});

describe("widthReserve", () => {
  const originalColumns = process.env.COLUMNS;

  afterEach(() => {
    if (originalColumns === undefined) {
      delete process.env.COLUMNS;
    } else {
      process.env.COLUMNS = originalColumns;
    }
  });

  describe("getTerminalWidth", () => {
    it("should reserve 45 columns by default", () => {
      process.env.COLUMNS = "120";
      expect(getTerminalWidth()).toBe(75);
    });

    it("should honor a custom reserve", () => {
      process.env.COLUMNS = "120";
      expect(getTerminalWidth(2)).toBe(118);
      expect(getTerminalWidth(0)).toBe(120);
    });

    it("should fall back to the default reserve for invalid values", () => {
      process.env.COLUMNS = "120";
      expect(getTerminalWidth(-5)).toBe(75);
      expect(getTerminalWidth(Number.NaN)).toBe(75);
    });
  });

  describe("rendering", () => {
    const mockHookData = {
      session_id: "test-session",
      transcript_path: "/fake/path.jsonl",
      workspace: {
        project_dir: "/test/project",
        current_dir: "/test/project",
      },
      model: {
        id: "claude-3-5-sonnet",
        display_name: "Claude",
      },
      cwd: "/test/project",
      hook_event_name: "test",
    };

    const createConfig = (widthReserve?: number): PowerlineConfig => ({
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        autoWrap: true,
        style: "minimal",
        ...(widthReserve === undefined ? {} : { widthReserve }),
        lines: [
          {
            segments: {
              directory: { enabled: true },
              model: { enabled: true },
            },
          },
        ],
      },
    });

    it("should wrap earlier with the default reserve than with a small one", async () => {
      process.env.COLUMNS = "60";

      const wrapped = await new PowerlineRenderer(
        createConfig(),
      ).generateStatusline(mockHookData);
      const unwrapped = await new PowerlineRenderer(
        createConfig(2),
      ).generateStatusline(mockHookData);

      expect(wrapped.split("\n").length).toBe(2);
      expect(unwrapped.split("\n").length).toBe(1);
    });

    it("should size the fixed tui panel from the same reserve", async () => {
      process.env.COLUMNS = "100";
      const tuiConfig = (widthReserve?: number): PowerlineConfig => {
        const config = createConfig(widthReserve);
        return {
          ...config,
          display: { ...config.display, autoWrap: false, style: "tui" },
        };
      };
      // The border rows carry the synchronized-output escapes, so measure a
      // content row.
      const panelWidth = (output: string) =>
        visibleLength(output.split("\n")[1] ?? "");

      const reserved = await new PowerlineRenderer(
        tuiConfig(),
      ).generateStatusline(mockHookData);
      const full = await new PowerlineRenderer(tuiConfig(2)).generateStatusline(
        mockHookData,
      );

      expect(panelWidth(reserved)).toBe(55);
      expect(panelWidth(full)).toBe(98);
    });
  });
});
