import { PowerlineRenderer } from "../src/powerline";
import { GitService, SessionProvider } from "../src/segments";
import { loadConfigFromCLI } from "../src/config/loader";
import type { PowerlineConfig } from "../src/config/loader";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import { SYMBOLS } from "../src/utils/constants";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Core Functionality", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-test-"));
  });

  afterEach(() => {
    try {
      unlinkSync(join(tempDir, "test.jsonl"));
    } catch {}
  });

  describe("Basic Powerline Generation", () => {
    it("should generate powerline with all segments", async () => {
      const config = loadConfigFromCLI([], tempDir);
      const renderer = new PowerlineRenderer(config);

      const hookData = {
        session_id: "test-session",
        transcript_path: "/fake/path.jsonl",
        workspace: {
          project_dir: tempDir,
          current_dir: tempDir,
        },
        model: {
          id: "claude-3-5-sonnet",
          display_name: "Claude",
        },
        cwd: tempDir,
        hook_event_name: "test",
      };

      const result = await renderer.generateStatusline(hookData);

      expect(result.toLowerCase()).toContain("claude");
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain("\x1B[");
    });

    it("should handle missing transcript gracefully", async () => {
      const config = loadConfigFromCLI([], tempDir);
      const renderer = new PowerlineRenderer(config);

      const hookData = {
        session_id: "nonexistent-session",
        transcript_path: "/nonexistent/path.jsonl",
        workspace: {
          project_dir: tempDir,
          current_dir: tempDir,
        },
        model: { id: "claude-3-5-sonnet", display_name: "Claude" },
        cwd: tempDir,
        hook_event_name: "test",
      };

      const result = await renderer.generateStatusline(hookData);
      expect(result.length).toBeGreaterThan(0);
      expect(result.toLowerCase()).toContain("claude");
    });
  });

  describe("Session Tracking", () => {
    it("should calculate token breakdown from transcript", () => {
      const mockEntries = [
        {
          timestamp: "2024-01-01T10:00:00Z",
          message: {
            usage: {
              input_tokens: 1000,
              output_tokens: 500,
              cache_creation_input_tokens: 100,
            },
          },
          costUSD: 0.05,
        },
        {
          timestamp: "2024-01-01T10:01:00Z",
          message: {
            usage: {
              input_tokens: 1500,
              output_tokens: 750,
              cache_read_input_tokens: 200,
            },
          },
          costUSD: 0.08,
        },
      ];

      const sessionProvider = new SessionProvider();
      const breakdown = sessionProvider.calculateTokenBreakdown(mockEntries);

      expect(breakdown.input).toBe(2500);
      expect(breakdown.output).toBe(1250);
      expect(breakdown.cacheCreation).toBe(100);
      expect(breakdown.cacheRead).toBe(200);
    });
  });

  describe("Configuration", () => {
    it("should load default config", () => {
      const config = loadConfigFromCLI([], tempDir);

      expect(config.theme).toBeDefined();
      expect(config.display.style).toBeDefined();
      expect(config.display.lines.length).toBeGreaterThanOrEqual(1);
    });

    it("should override config with CLI args", () => {
      const config = loadConfigFromCLI(
        ["--theme=dark", "--style=powerline"],
        tempDir,
      );

      expect(config.theme).toBe("dark");
      expect(config.display.style).toBe("powerline");
    });
  });

  describe("Worktree indicator wiring", () => {
    let getGitInfo: jest.SpyInstance;

    beforeEach(() => {
      // Report a worktree only when the caller actually asked for detection,
      // so these tests fail if the option stops reaching the git service.
      getGitInfo = jest
        .spyOn(GitService.prototype, "getGitInfo")
        .mockImplementation(async (_workingDir, options) => ({
          branch: "feature",
          status: "clean" as const,
          ahead: 0,
          behind: 0,
          isWorktree: options?.showWorktree === true,
        }));
    });

    afterEach(() => {
      getGitInfo.mockRestore();
    });

    const hookData = {
      session_id: "worktree-session",
      transcript_path: "/fake/path.jsonl",
      model: { id: "claude-3-5-sonnet", display_name: "Claude" },
      hook_event_name: "test",
    };

    const configWith = (
      style: "minimal" | "tui",
      git: Record<string, unknown>,
    ): PowerlineConfig => ({
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        style,
        lines: [
          {
            segments: {
              ...DEFAULT_CONFIG.display.lines[0]!.segments,
              git: { enabled: true, ...git },
            },
          },
        ],
      },
    });

    it.each(["minimal", "tui"] as const)(
      "renders the indicator in the %s style when showWorktree is set",
      async (style) => {
        const result = await new PowerlineRenderer(
          configWith(style, { showWorktree: true }),
        ).generateStatusline({
          ...hookData,
          cwd: tempDir,
          workspace: { project_dir: tempDir, current_dir: tempDir },
        });

        expect(result).toContain(SYMBOLS.git_worktree);
      },
    );

    it.each(["minimal", "tui"] as const)(
      "omits the indicator in the %s style by default",
      async (style) => {
        const result = await new PowerlineRenderer(
          configWith(style, {}),
        ).generateStatusline({
          ...hookData,
          cwd: tempDir,
          workspace: { project_dir: tempDir, current_dir: tempDir },
        });

        expect(result).not.toContain(SYMBOLS.git_worktree);
      },
    );

    it("inherits showRepoName when showWorktree is unset", async () => {
      const result = await new PowerlineRenderer(
        configWith("minimal", { showRepoName: true }),
      ).generateStatusline({
        ...hookData,
        cwd: tempDir,
        workspace: { project_dir: tempDir, current_dir: tempDir },
      });

      expect(result).toContain(SYMBOLS.git_worktree);
    });

    it("lets showWorktree: false suppress the indicator for repo-name users", async () => {
      const result = await new PowerlineRenderer(
        configWith("minimal", { showRepoName: true, showWorktree: false }),
      ).generateStatusline({
        ...hookData,
        cwd: tempDir,
        workspace: { project_dir: tempDir, current_dir: tempDir },
      });

      expect(result).not.toContain(SYMBOLS.git_worktree);
    });
  });

  describe("Context Calculation", () => {
    it("should calculate context usage", async () => {
      const transcript = [
        '{"timestamp":"2024-01-01T10:00:00Z","message":{"usage":{"input_tokens":10000,"cache_read_input_tokens":5000}},"isSidechain":false}',
      ].join("\n");

      const transcriptPath = join(tempDir, "test.jsonl");
      writeFileSync(transcriptPath, transcript);

      const { ContextProvider } = require("../src/segments/context");
      const contextProvider = new ContextProvider(DEFAULT_CONFIG);
      const result =
        await contextProvider.calculateContextTokensFromTranscript(
          transcriptPath,
        );

      expect(result).toBeDefined();
      expect(result.totalTokens).toBe(15000);
      expect(result.percentage).toBeGreaterThan(0);
    });

    it("should use configurable context limits for sonnet models", async () => {
      const transcript = [
        '{"timestamp":"2024-01-01T10:00:00Z","message":{"usage":{"input_tokens":500000}},"isSidechain":false}',
      ].join("\n");

      const transcriptPath = join(tempDir, "test-sonnet.jsonl");
      writeFileSync(transcriptPath, transcript);

      const customConfig = {
        ...DEFAULT_CONFIG,
        modelContextLimits: {
          default: 200000,
          sonnet: 1000000,
          opus: 200000,
        },
      };

      const { ContextProvider } = require("../src/segments/context");
      const contextProvider = new ContextProvider(customConfig);
      const result = await contextProvider.calculateContextTokensFromTranscript(
        transcriptPath,
        "claude-sonnet-4-20250514",
      );

      expect(result).toBeDefined();
      expect(result.totalTokens).toBe(500000);
      expect(result.maxTokens).toBe(1000000);
      expect(result.percentage).toBe(50);
    });

    it("should use default limit for unknown model types", async () => {
      const transcript = [
        '{"timestamp":"2024-01-01T10:00:00Z","message":{"usage":{"input_tokens":100000}},"isSidechain":false}',
      ].join("\n");

      const transcriptPath = join(tempDir, "test-unknown.jsonl");
      writeFileSync(transcriptPath, transcript);

      const customConfig = {
        ...DEFAULT_CONFIG,
        modelContextLimits: {
          default: 200000,
          sonnet: 1000000,
        },
      };

      const { ContextProvider } = require("../src/segments/context");
      const contextProvider = new ContextProvider(customConfig);
      const result = await contextProvider.calculateContextTokensFromTranscript(
        transcriptPath,
        "unknown-model",
      );

      expect(result).toBeDefined();
      expect(result.totalTokens).toBe(100000);
      expect(result.maxTokens).toBe(200000);
      expect(result.percentage).toBe(50);
    });

    it("should map model IDs to correct model types", async () => {
      const transcript = [
        '{"timestamp":"2024-01-01T10:00:00Z","message":{"usage":{"input_tokens":300000}},"isSidechain":false}',
      ].join("\n");

      const transcriptPath = join(tempDir, "test-mapping.jsonl");
      writeFileSync(transcriptPath, transcript);

      const customConfig = {
        ...DEFAULT_CONFIG,
        modelContextLimits: {
          default: 200000,
          sonnet: 500000,
          opus: 400000,
        },
      };

      const { ContextProvider } = require("../src/segments/context");
      const contextProvider = new ContextProvider(customConfig);

      const sonnetResult =
        await contextProvider.calculateContextTokensFromTranscript(
          transcriptPath,
          "claude-3-5-sonnet-20241022",
        );
      expect(sonnetResult?.maxTokens).toBe(500000);

      const opusResult =
        await contextProvider.calculateContextTokensFromTranscript(
          transcriptPath,
          "claude-opus-4-20250514",
        );
      expect(opusResult?.maxTokens).toBe(400000);
    });

    it("should prefer Claude Code's context_window_size over modelContextLimits when current_usage is null", async () => {
      const transcript = [
        '{"timestamp":"2024-01-01T10:00:00Z","message":{"usage":{"input_tokens":500000}},"isSidechain":false}',
      ].join("\n");

      const transcriptPath = join(tempDir, "test-native-limit.jsonl");
      writeFileSync(transcriptPath, transcript);

      const customConfig = {
        ...DEFAULT_CONFIG,
        modelContextLimits: { default: 200000, opus: 200000 },
      };

      const { ContextProvider } = require("../src/segments/context");
      const contextProvider = new ContextProvider(customConfig);

      const result = await contextProvider.getContextInfo({
        hook_event_name: "Status",
        session_id: "test",
        transcript_path: transcriptPath,
        cwd: tempDir,
        model: { id: "claude-opus-5[1m]", display_name: "Opus 5" },
        workspace: { current_dir: tempDir, project_dir: tempDir },
        context_window: {
          total_input_tokens: 500000,
          total_output_tokens: 0,
          context_window_size: 1000000,
          current_usage: null,
        },
      });

      expect(result).toBeDefined();
      expect(result.totalTokens).toBe(500000);
      expect(result.maxTokens).toBe(1000000);
      expect(result.percentage).toBe(50);
      expect(result.usableTokens).toBe(967000);
      expect(result.usablePercentage).toBe(52);
      expect(result.contextLeftPercentage).toBe(48);
    });
  });
});
