import { SessionProvider } from "../src/segments";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as claudePaths from "../src/utils/claude";

describe("Session Usage Deduplication", () => {
  let tempDir: string;
  let sessionProvider: SessionProvider;

  const entryLine = (
    minute: number,
    usage: Record<string, number>,
    costUSD: number,
    ids?: { messageId: string; requestId: string },
  ): string =>
    JSON.stringify({
      timestamp: `2024-01-01T10:0${minute}:00Z`,
      type: "assistant",
      message: {
        ...(ids ? { id: ids.messageId } : {}),
        usage,
      },
      ...(ids ? { requestId: ids.requestId } : {}),
      costUSD,
    });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "session-dedup-test-"));
    sessionProvider = new SessionProvider();

    // Claude Code writes one JSONL line per content block, so the same
    // usage record (same message.id + requestId) can repeat across lines.
    const requestA = { messageId: "msg_a", requestId: "req_a" };
    const usageA = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 25,
      cache_read_input_tokens: 10,
    };
    // A record without usage that shares ids with a real usage record must
    // not claim the hash and suppress it.
    const noUsageLine = JSON.stringify({
      timestamp: "2024-01-01T10:02:30Z",
      type: "assistant",
      message: { id: "msg_b", content: "text" },
      requestId: "req_b",
    });
    const transcriptContent = [
      entryLine(0, usageA, 0.5, requestA),
      entryLine(1, usageA, 0.5, requestA),
      entryLine(2, usageA, 0.5, requestA),
      noUsageLine,
      entryLine(3, { input_tokens: 10, output_tokens: 5 }, 0.2, {
        messageId: "msg_b",
        requestId: "req_b",
      }),
      entryLine(4, { input_tokens: 1, output_tokens: 1 }, 0.1),
      entryLine(5, { input_tokens: 2, output_tokens: 2 }, 0.3),
    ].join("\n");

    const transcriptPath = join(tempDir, "dedup-session.jsonl");
    writeFileSync(transcriptPath, transcriptContent);

    // The dedup set must span the main and agent transcripts: the agent
    // copy of request A is a duplicate, while its own request is new.
    const agentTranscriptContent = [
      entryLine(6, usageA, 0.5, requestA),
      entryLine(7, { input_tokens: 7, output_tokens: 3 }, 0.4, {
        messageId: "msg_c",
        requestId: "req_c",
      }),
    ].join("\n");

    const agentTranscriptPath = join(tempDir, "agent-transcript.jsonl");
    writeFileSync(agentTranscriptPath, agentTranscriptContent);

    jest
      .spyOn(claudePaths, "findTranscriptFile")
      .mockResolvedValue(transcriptPath);
    jest
      .spyOn(claudePaths, "findAgentTranscripts")
      .mockResolvedValue([agentTranscriptPath]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("counts duplicated message.id + requestId lines only once across main and agent transcripts", async () => {
    const usage = await sessionProvider.getSessionUsage("dedup-session");

    expect(usage).not.toBeNull();
    expect(usage!.entries).toHaveLength(5);
    expect(usage!.totalCost).toBeCloseTo(1.5, 10);
  });

  it("still counts distinct requests and keeps entries without ids", async () => {
    const usage = await sessionProvider.getSessionUsage("dedup-session");

    const breakdown = sessionProvider.calculateTokenBreakdown(usage!.entries);
    expect(breakdown.input).toBe(120);
    expect(breakdown.output).toBe(61);
    expect(breakdown.cacheCreation).toBe(25);
    expect(breakdown.cacheRead).toBe(10);
  });
});
