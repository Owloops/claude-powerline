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
});
