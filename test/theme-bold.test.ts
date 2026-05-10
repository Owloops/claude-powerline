import { PowerlineRenderer } from "../src/powerline";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import type { PowerlineConfig } from "../src/config/loader";
import type { ColorTheme } from "../src/themes";
import { visibleLength, stripAnsi } from "../src/utils/terminal";

const mockHookData = {
  session_id: "test-session",
  transcript_path: "/fake/path.jsonl",
  workspace: { project_dir: "/test/project", current_dir: "/test/project" },
  model: { id: "claude-3-5-sonnet", display_name: "Claude" },
  cwd: "/test/project",
  hook_event_name: "test",
};

function makeCustomTheme(overrides: Partial<ColorTheme> = {}): ColorTheme {
  const base = {
    bg: "#202020",
    fg: "#cccccc",
  };
  return {
    directory: { ...base },
    git: { ...base },
    model: { ...base },
    session: { ...base },
    block: { ...base },
    today: { ...base },
    tmux: { ...base },
    context: { ...base },
    contextWarning: { ...base },
    contextCritical: { ...base },
    metrics: { ...base },
    version: { ...base },
    env: { ...base },
    weekly: { ...base },
    agent: { ...base },
    thinking: { ...base },
    cacheTimer: { ...base },
    proxyBudget: { ...base },
    ...overrides,
  };
}

function makeConfig(custom: ColorTheme): PowerlineConfig {
  return {
    ...DEFAULT_CONFIG,
    theme: "custom",
    colors: { custom },
    display: {
      ...DEFAULT_CONFIG.display,
      style: "minimal",
      autoWrap: false,
      colorCompatibility: "truecolor",
      lines: [
        {
          segments: {
            directory: { enabled: true, showBasename: true },
          },
        },
      ],
    },
  };
}

describe("segment bold theme", () => {
  it("emits SGR 1 / SGR 22 around segment text when bold is set in both powerline and TUI modes, and emits neither when unset", async () => {
    // Powerline / one-line renderer
    const boldConfig = makeConfig(
      makeCustomTheme({
        directory: { bg: "#202020", fg: "#cccccc", bold: true },
      }),
    );
    const boldOut = await new PowerlineRenderer(boldConfig).generateStatusline(
      mockHookData,
    );
    expect(boldOut).toContain("\x1b[1m");
    expect(boldOut).toContain("\x1b[22m");
    expect(boldOut.indexOf("\x1b[1m")).toBeLessThan(boldOut.indexOf("\x1b[22m"));

    const plainConfig = makeConfig(makeCustomTheme());
    const plainOut = await new PowerlineRenderer(
      plainConfig,
    ).generateStatusline(mockHookData);
    expect(plainOut).not.toContain("\x1b[1m");
    expect(plainOut).not.toContain("\x1b[22m");

    // TUI renderer — same custom theme, style: "tui"
    const tuiBoldConfig: PowerlineConfig = {
      ...boldConfig,
      display: { ...boldConfig.display, style: "tui" },
    };
    const tuiBoldOut = await new PowerlineRenderer(
      tuiBoldConfig,
    ).generateStatusline(mockHookData);
    expect(tuiBoldOut).toContain("\x1b[1m");
    expect(tuiBoldOut).toContain("\x1b[22m");

    const tuiPlainConfig: PowerlineConfig = {
      ...plainConfig,
      display: { ...plainConfig.display, style: "tui" },
    };
    const tuiPlainOut = await new PowerlineRenderer(
      tuiPlainConfig,
    ).generateStatusline(mockHookData);
    expect(tuiPlainOut).not.toContain("\x1b[1m");
    expect(tuiPlainOut).not.toContain("\x1b[22m");
  });

  it("preserves visible width — bold SGRs do not affect visibleLength / stripAnsi", () => {
    const bolded = "\x1b[1mfoo\x1b[22m";
    expect(visibleLength(bolded)).toBe(3);
    expect(stripAnsi(bolded)).toBe("foo");
    // and within a colored segment
    const full = "\x1b[48;2;32;32;32m\x1b[38;2;204;204;204m\x1b[1m hello \x1b[22m\x1b[0m";
    expect(visibleLength(full)).toBe(7);
  });

  it("suppresses bold SGRs entirely when colorSupport === 'none', even with bold: true in custom theme", async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, NO_COLOR: "1" };
    delete process.env.FORCE_COLOR;
    try {
      const config = makeConfig(
        makeCustomTheme({
          directory: { bg: "#202020", fg: "#cccccc", bold: true },
        }),
      );
      config.display.colorCompatibility = "auto";
      const out = await new PowerlineRenderer(config).generateStatusline(
        mockHookData,
      );
      expect(out).not.toContain("\x1b[1m");
      expect(out).not.toContain("\x1b[22m");
    } finally {
      process.env = originalEnv;
    }
  });
});
