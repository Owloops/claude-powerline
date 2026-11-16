import { MetricsProvider } from "../src/segments/metrics";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as claudePaths from "../src/utils/claude";
import type { ClaudeHookData } from "../src/utils/claude";

describe("Metrics Provider", () => {
  let tempDir: string;
  let metricsProvider: MetricsProvider;

  const createMockHookData = (sessionId: string): ClaudeHookData => ({
    hook_event_name: "Status",
    session_id: sessionId,
    transcript_path: `/path/to/${sessionId}.jsonl`,
    cwd: "/test/cwd",
    model: {
      id: "claude-opus-4-1",
      display_name: "Opus",
    },
    workspace: {
      current_dir: "/test/workspace",
      project_dir: "/test/project",
    },
    version: "1.0.0",
    cost: {
      total_cost_usd: 0.5,
      total_duration_ms: 120000,
      total_api_duration_ms: 5000,
      total_lines_added: 25,
      total_lines_removed: 10,
    },
  });

  let originalCacheDir: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "metrics-test-"));
    metricsProvider = new MetricsProvider();
    originalCacheDir = process.env.CLAUDE_POWERLINE_CACHE_DIR;
    process.env.CLAUDE_POWERLINE_CACHE_DIR = join(tempDir, "cache");
  });

  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.CLAUDE_POWERLINE_CACHE_DIR;
    } else {
      process.env.CLAUDE_POWERLINE_CACHE_DIR = originalCacheDir;
    }
    jest.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const prompt = (text: string, at: number) =>
    JSON.stringify({
      timestamp: new Date(at).toISOString(),
      type: "user",
      message: { role: "user", content: text },
    });
  const reply = (at: number) =>
    JSON.stringify({
      timestamp: new Date(at).toISOString(),
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
    });

  const metricsFor = async (transcriptPath: string, sessionId = "s1") => {
    jest
      .spyOn(claudePaths, "findTranscriptFile")
      .mockResolvedValue(transcriptPath);
    return metricsProvider.getMetricsInfo(
      sessionId,
      createMockHookData(sessionId),
    );
  };

  it("counts prompts appended since the last render", async () => {
    const transcriptPath = join(tempDir, "s1.jsonl");
    const t0 = Date.UTC(2026, 0, 1);
    writeFileSync(
      transcriptPath,
      prompt("a", t0) + "\n" + reply(t0 + 1000) + "\n",
    );
    expect((await metricsFor(transcriptPath)).messageCount).toBe(1);
    // Unchanged since the last render: answered from the cache alone.
    const again = await metricsFor(transcriptPath);
    expect(again.messageCount).toBe(1);
    expect(again.lastResponseTime).toBe(1);

    appendFileSync(transcriptPath, prompt("b", t0 + 2000) + "\n");
    expect((await metricsFor(transcriptPath)).messageCount).toBe(2);

    // A line still being written counts, but is not saved as read.
    appendFileSync(transcriptPath, prompt("c", t0 + 3000));
    expect((await metricsFor(transcriptPath)).messageCount).toBe(3);
    appendFileSync(transcriptPath, "\n" + prompt("d", t0 + 4000) + "\n");
    expect((await metricsFor(transcriptPath)).messageCount).toBe(4);
  });

  it("recounts a transcript rewritten since the last render", async () => {
    const transcriptPath = join(tempDir, "s1.jsonl");
    const t0 = Date.UTC(2026, 0, 1);
    writeFileSync(
      transcriptPath,
      [prompt("a", t0), prompt("b", t0 + 1), prompt("c", t0 + 2)].join("\n") +
        "\n",
    );
    expect((await metricsFor(transcriptPath)).messageCount).toBe(3);

    writeFileSync(transcriptPath, prompt("x", t0) + "\n");
    expect((await metricsFor(transcriptPath)).messageCount).toBe(1);
  });

  it("takes the last response time from the last 20 entries only", async () => {
    const transcriptPath = join(tempDir, "s1.jsonl");
    const t0 = Date.UTC(2026, 0, 1);
    const lines = [prompt("old", t0), reply(t0 + 7000)];
    // 20 entries after the old exchange push it out of the window; the last
    // pair inside it answered in 3 s.
    for (let i = 0; i < 9; i++) {
      const at = t0 + 60_000 * (i + 1);
      lines.push(prompt(`p${i}`, at), reply(at + 3000));
    }
    lines.push(prompt("last", t0 + 3_600_000), reply(t0 + 3_604_000));
    writeFileSync(transcriptPath, lines.join("\n") + "\n");

    const metrics = await metricsFor(transcriptPath);
    expect(metrics.lastResponseTime).toBe(4);
    expect(metrics.messageCount).toBe(11);
  });

  it("measures no response time from a prompt without a usable timestamp", async () => {
    const transcriptPath = join(tempDir, "s1.jsonl");
    const t0 = Date.UTC(2026, 0, 1);
    const lines = [
      prompt("first", t0),
      JSON.stringify({ type: "user", timestamp: "bad", message: {} }),
      JSON.stringify({ type: "user", timestamp: { toString: null } }),
      reply(t0 + 1000),
    ];
    writeFileSync(transcriptPath, lines.join("\n") + "\n");

    const metrics = await metricsFor(transcriptPath);
    expect(metrics.lastResponseTime).toBeNull();
    expect(metrics.messageCount).toBe(3);
  });

  it("calculates metrics from valid transcript", async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const transcriptContent = [
      `{"timestamp": "${new Date(oneHourAgo.getTime()).toISOString()}", "type": "user", "message": {"content": "Hello"}}`,
      `{"timestamp": "${new Date(oneHourAgo.getTime() + 5000).toISOString()}", "type": "assistant", "message": {"content": "Hi!", "usage": {"input_tokens": 10, "output_tokens": 20}}, "costUSD": 0.50}`,
      `{"timestamp": "${new Date(oneHourAgo.getTime() + 60000).toISOString()}", "type": "user", "message": {"content": "How are you?"}}`,
      `{"timestamp": "${new Date(oneHourAgo.getTime() + 63000).toISOString()}", "type": "assistant", "message": {"content": "Good!", "usage": {"input_tokens": 15, "output_tokens": 25}}, "costUSD": 0.75}`,
    ].join("\n");

    const transcriptPath = join(tempDir, "test.jsonl");
    writeFileSync(transcriptPath, transcriptContent);

    jest
      .spyOn(claudePaths, "findTranscriptFile")
      .mockResolvedValue(transcriptPath);

    const mockHookData = createMockHookData("test-session");
    const metrics = await metricsProvider.getMetricsInfo(
      "test-session",
      mockHookData,
    );

    expect(metrics.messageCount).toBe(2);
    expect(metrics.sessionDuration).toBe(120);
    expect(metrics.responseTime).toBe(5);
    expect(metrics.lastResponseTime).toBeGreaterThan(0);
    expect(metrics.linesAdded).toBe(25);
    expect(metrics.linesRemoved).toBe(10);
  });

  it("counts only the prompts the user sent", async () => {
    let second = 0;
    const entry = (type: string, content: unknown, isMeta?: boolean) =>
      JSON.stringify({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, second++)).toISOString(),
        type,
        isMeta,
        message: { role: type, content },
      });

    // A typed prompt, a local command (/model) with its output, and a prompt
    // command (/init) whose expanded prompt is written as an isMeta entry.
    const transcriptContent = [
      entry("user", "Hello"),
      entry("assistant", [{ type: "text", text: "Hi!" }]),
      entry("user", "<command-name>/model</command-name>"),
      entry("user", "<local-command-stdout>Set model</local-command-stdout>"),
      entry("user", "<command-name>/init</command-name>"),
      entry("user", [{ type: "text", text: "Analyze this codebase" }], true),
      entry("user", "<bash-input>ls</bash-input>"),
      entry("user", "<bash-stdout>a</bash-stdout><bash-stderr></bash-stderr>"),
      entry("assistant", [{ type: "tool_use", id: "t1", name: "Read" }]),
      entry("user", [{ type: "tool_result", tool_use_id: "t1" }]),
      entry("assistant", [{ type: "text", text: "Done" }]),
    ].join("\n");

    const transcriptPath = join(tempDir, "test.jsonl");
    writeFileSync(transcriptPath, transcriptContent);

    jest
      .spyOn(claudePaths, "findTranscriptFile")
      .mockResolvedValue(transcriptPath);

    const metrics = await metricsProvider.getMetricsInfo(
      "commands-session",
      createMockHookData("commands-session"),
    );

    // "Hello", "/model", "/init" and "!ls"
    expect(metrics.messageCount).toBe(4);
  });

  it("handles missing transcript gracefully", async () => {
    jest.spyOn(claudePaths, "findTranscriptFile").mockResolvedValue(null);

    const mockHookData = createMockHookData("nonexistent-session");
    const metrics = await metricsProvider.getMetricsInfo(
      "nonexistent-session",
      mockHookData,
    );

    expect(metrics.messageCount).toBe(0);
    expect(metrics.sessionDuration).toBe(120);
    expect(metrics.responseTime).toBe(5);
    expect(metrics.lastResponseTime).toBeNull();
    expect(metrics.linesAdded).toBe(25);
    expect(metrics.linesRemoved).toBe(10);
  });

  it("handles empty transcript gracefully", async () => {
    const transcriptPath = join(tempDir, "test.jsonl");
    writeFileSync(transcriptPath, "");

    jest
      .spyOn(claudePaths, "findTranscriptFile")
      .mockResolvedValue(transcriptPath);

    const mockHookData = createMockHookData("empty-session");
    const metrics = await metricsProvider.getMetricsInfo(
      "empty-session",
      mockHookData,
    );

    expect(metrics.messageCount).toBe(0);
    expect(metrics.sessionDuration).toBe(120);
    expect(metrics.responseTime).toBe(5);
    expect(metrics.lastResponseTime).toBeNull();
    expect(metrics.linesAdded).toBe(25);
    expect(metrics.linesRemoved).toBe(10);
  });
});
