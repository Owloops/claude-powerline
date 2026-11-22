import { CacheTimerProvider } from "../src/segments/cacheTimer";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ClaudeHookData } from "../src/utils/claude";

describe("CacheTimerProvider", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-timer-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const elapsedFor = async (entries: object[]): Promise<number | undefined> => {
    const transcriptPath = join(tempDir, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const info = await new CacheTimerProvider().getCacheTimerInfo({
      transcript_path: transcriptPath,
    } as ClaudeHookData);
    return info?.elapsedSeconds;
  };

  const ago = (seconds: number) =>
    new Date(Date.now() - seconds * 1000).toISOString();

  it("anchors on the last user prompt", async () => {
    const elapsed = await elapsedFor([
      { type: "user", timestamp: ago(600), message: { content: "hi" } },
      { type: "assistant", timestamp: ago(595), message: { content: [] } },
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(599);
    expect(elapsed).toBeLessThanOrEqual(601);
  });

  it("ignores local slash command and bash mode entries", async () => {
    const elapsed = await elapsedFor([
      { type: "user", timestamp: ago(600), message: { content: "hi" } },
      { type: "assistant", timestamp: ago(595), message: { content: [] } },
      {
        type: "user",
        isMeta: true,
        timestamp: ago(10),
        message: {
          content: "<local-command-caveat>Caveat: ...</local-command-caveat>",
        },
      },
      {
        type: "user",
        timestamp: ago(10),
        message: {
          content:
            "<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args></command-args>",
        },
      },
      {
        type: "user",
        timestamp: ago(10),
        message: {
          content:
            "<local-command-stdout>Set model to opus</local-command-stdout>",
        },
      },
      {
        type: "user",
        timestamp: ago(5),
        message: {
          content: [{ type: "text", text: "<bash-input>ls</bash-input>" }],
        },
      },
      {
        type: "user",
        timestamp: ago(5),
        message: {
          content: "<bash-stdout>a</bash-stdout><bash-stderr></bash-stderr>",
        },
      },
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(599);
    expect(elapsed).toBeLessThanOrEqual(601);
  });

  it("still anchors on prompt commands, which reach the model", async () => {
    const elapsed = await elapsedFor([
      { type: "user", timestamp: ago(600), message: { content: "hi" } },
      {
        type: "user",
        timestamp: ago(30),
        message: {
          content:
            "<command-message>review</command-message>\n<command-name>/review</command-name>",
        },
      },
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(29);
    expect(elapsed).toBeLessThanOrEqual(31);
  });

  const infoFor = (hookData: Partial<ClaudeHookData>) =>
    new CacheTimerProvider().getCacheTimerInfo(hookData as ClaudeHookData);

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it("takes the timer from Claude Code's prompt cache when it has one", async () => {
    const info = await infoFor({
      transcript_path: join(tempDir, "missing.jsonl"),
      prompt_cache: { warm: true, ttl: "5m", expires_at: nowSeconds() + 200 },
    });
    expect(info?.detectedTtlSeconds).toBe(300);
    expect(info?.elapsedSeconds).toBeGreaterThanOrEqual(99);
    expect(info?.elapsedSeconds).toBeLessThanOrEqual(101);
  });

  it("keeps counting past expiry", async () => {
    const info = await infoFor({
      prompt_cache: { warm: false, ttl: "1h", expires_at: nowSeconds() - 60 },
    });
    expect(info?.detectedTtlSeconds).toBe(3600);
    expect(info?.elapsedSeconds).toBeGreaterThanOrEqual(3659);
    expect(info?.elapsedSeconds).toBeLessThanOrEqual(3661);
  });

  it("falls back to the transcript when the prompt cache has no expiry", async () => {
    const transcriptPath = join(tempDir, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: "user",
        timestamp: ago(42),
        message: { content: "hi" },
      }) + "\n",
    );
    const info = await infoFor({
      transcript_path: transcriptPath,
      prompt_cache: { warm: false, ttl: "5m", expires_at: null },
    });
    expect(info?.elapsedSeconds).toBeGreaterThanOrEqual(41);
    expect(info?.elapsedSeconds).toBeLessThanOrEqual(43);
  });

  it("falls back to the transcript for a ttl it does not know", async () => {
    const transcriptPath = join(tempDir, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      [
        { type: "user", timestamp: ago(42), message: { content: "hi" } },
        // Valid JSON, unusable timestamp: skipped, not the end of the search.
        { type: "user", timestamp: { toString: null } },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
    );
    const info = await infoFor({
      transcript_path: transcriptPath,
      prompt_cache: { ttl: "toString", expires_at: nowSeconds() + 100 },
    });
    expect(info?.detectedTtlSeconds).toBeUndefined();
    expect(info?.elapsedSeconds).toBeGreaterThanOrEqual(41);
    expect(info?.elapsedSeconds).toBeLessThanOrEqual(43);
  });

  it("reads the ttl from the last response that wrote to the cache", async () => {
    const transcriptPath = join(tempDir, "transcript.jsonl");
    const lines = [
      {
        type: "assistant",
        timestamp: ago(700),
        message: {
          usage: { cache_creation: { ephemeral_5m_input_tokens: 10 } },
        },
      },
      {
        type: "assistant",
        timestamp: ago(600),
        message: {
          usage: { cache_creation: { ephemeral_1h_input_tokens: 10 } },
        },
      },
      { type: "user", timestamp: ago(30), message: { content: "hi" } },
      {
        type: "assistant",
        timestamp: ago(25),
        message: {
          usage: { cache_creation: { ephemeral_1h_input_tokens: 0 } },
        },
      },
    ];
    writeFileSync(
      transcriptPath,
      lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    );
    const info = await infoFor({ transcript_path: transcriptPath });
    expect(info?.detectedTtlSeconds).toBe(3600);
  });

  it("stops looking back past its bound and anchors on the file's time", async () => {
    const transcriptPath = join(tempDir, "transcript.jsonl");
    // The user entry sits behind more bytes than the search reads.
    writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: "user",
        timestamp: ago(900),
        message: { content: "hi" },
      }) +
        "\n" +
        JSON.stringify({
          type: "assistant",
          timestamp: ago(890),
          pad: "x".repeat(5 * 1024 * 1024),
        }) +
        "\n",
    );
    const info = await infoFor({ transcript_path: transcriptPath });
    expect(info?.elapsedSeconds).toBeLessThanOrEqual(5);
  });
});
