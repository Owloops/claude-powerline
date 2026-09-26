import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  statSync,
  writeFileSync,
  rmSync,
  utimesSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  findAgentTranscripts,
  parseJsonlFile,
  readTranscriptFrom,
  collectProjectFiles,
  createUniqueHash,
  getOutputStyleName,
  type ClaudeHookData,
} from "../src/utils/claude";
import { PricingService } from "../src/segments/pricing";
import type { ModelPricing } from "../src/segments/pricing";

describe("getOutputStyleName", () => {
  const base = {
    hook_event_name: "Status",
    session_id: "test",
    transcript_path: "/tmp/test.jsonl",
    cwd: "/test",
    model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
    workspace: { current_dir: "/test", project_dir: "/test" },
  } as ClaudeHookData;

  const withStyle = (name: unknown): ClaudeHookData =>
    ({ ...base, output_style: { name } }) as ClaudeHookData;

  it("returns the name when output_style.name is a non-empty string", () => {
    expect(getOutputStyleName(withStyle("Explanatory"))).toBe("Explanatory");
  });

  it("trims surrounding whitespace", () => {
    expect(getOutputStyleName(withStyle("  Explanatory  "))).toBe(
      "Explanatory",
    );
  });

  it("returns null for a whitespace-only name", () => {
    expect(getOutputStyleName(withStyle("   "))).toBeNull();
  });

  it("returns null for an empty name", () => {
    expect(getOutputStyleName(withStyle(""))).toBeNull();
  });

  it("returns null for a non-string name", () => {
    expect(getOutputStyleName(withStyle(42))).toBeNull();
    expect(getOutputStyleName(withStyle(null))).toBeNull();
    expect(getOutputStyleName(withStyle(undefined))).toBeNull();
  });

  it("returns null when output_style is absent", () => {
    expect(getOutputStyleName(base)).toBeNull();
  });

  it("preserves internal spaces and punctuation verbatim", () => {
    expect(getOutputStyleName(withStyle("My Custom Style (v2)"))).toBe(
      "My Custom Style (v2)",
    );
  });
});

describe("findAgentTranscripts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-agent-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSubagentsDir(sessionId: string): string {
    const subagentsDir = join(tempDir, sessionId, "subagents");
    mkdirSync(subagentsDir, { recursive: true });
    return subagentsDir;
  }

  function writeAgentFile(
    subagentsDir: string,
    name: string,
    sessionId: string,
  ): string {
    const filePath = join(subagentsDir, name);
    writeFileSync(filePath, JSON.stringify({ sessionId }) + "\n");
    return filePath;
  }

  it("finds agent transcripts in <session-uuid>/subagents/", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    const agentFile = writeAgentFile(
      subagentsDir,
      "agent-a1b2c3.jsonl",
      sessionId,
    );

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]!.replace(/\\/g, "/")).toBe(agentFile.replace(/\\/g, "/"));
  });

  it("returns [] when session has no subagents directory", async () => {
    const sessionId = "abc123";
    mkdirSync(join(tempDir, sessionId)); // session dir exists, but no subagents/ inside

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toEqual([]);
  });

  it("returns [] when session directory does not exist at all", async () => {
    const result = await findAgentTranscripts("no-such-session", tempDir);

    expect(result).toEqual([]);
  });

  it("returns multiple files when session has multiple agent transcripts", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-aaa.jsonl", sessionId);
    writeAgentFile(subagentsDir, "agent-bbb.jsonl", sessionId);

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(2);
  });

  it("finds forked agent transcripts, whose first line has no sessionId", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    const forkFile = join(subagentsDir, "agent-afork.jsonl");
    writeFileSync(
      forkFile,
      JSON.stringify({ type: "fork-context-ref", parentSessionId: sessionId }) +
        "\n" +
        JSON.stringify({ sessionId, message: { usage: {} } }) +
        "\n",
    );

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toEqual([forkFile]);
  });

  it("skips non-agent- files and non-.jsonl files in the subagents dir", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-valid.jsonl", sessionId);
    writeFileSync(
      join(subagentsDir, "agent-ignored.txt"),
      JSON.stringify({ sessionId }) + "\n",
    );
    writeFileSync(
      join(subagentsDir, "other.jsonl"),
      JSON.stringify({ sessionId }) + "\n",
    );

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("agent-valid.jsonl");
  });

  it("finds workflow agent transcripts nested under subagents/workflows/", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-top.jsonl", sessionId);

    const workflowDir = join(subagentsDir, "workflows", "wf_deadbeef");
    mkdirSync(workflowDir, { recursive: true });
    writeAgentFile(workflowDir, "agent-nested.jsonl", sessionId);

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(2);
    expect(result.some((f) => f.includes("agent-nested.jsonl"))).toBe(true);
  });
});

describe("collectProjectFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-collect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("collects session transcripts alongside flat and nested agent transcripts", async () => {
    writeFileSync(join(tempDir, "session.jsonl"), "{}\n");

    const subagentsDir = join(tempDir, "session", "subagents");
    mkdirSync(join(subagentsDir, "workflows", "wf_1"), { recursive: true });
    writeFileSync(join(subagentsDir, "agent-flat.jsonl"), "{}\n");
    writeFileSync(
      join(subagentsDir, "workflows", "wf_1", "agent-nested.jsonl"),
      "{}\n",
    );

    const files = await collectProjectFiles(tempDir);
    const names = files.map((f) => f.filePath.split(/[\\/]/).pop());

    expect(names.sort()).toEqual([
      "agent-flat.jsonl",
      "agent-nested.jsonl",
      "session.jsonl",
    ]);
  });
});

describe("parseJsonlFile caching", () => {
  let tempDir: string;
  let filePath: string;

  const line = (id: string, tokens: number) =>
    JSON.stringify({
      timestamp: "2026-01-01T00:00:00.000Z",
      requestId: id,
      message: { id, model: "claude-opus-5", usage: { input_tokens: tokens } },
    });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-parse-cache-"));
    filePath = join(tempDir, "session.jsonl");
    writeFileSync(filePath, `${line("a", 1)}\n${line("b", 2)}\n`);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("hands every caller the one shared array", async () => {
    const first = await parseJsonlFile(filePath);
    const second = await parseJsonlFile(filePath);

    expect(first).toHaveLength(2);
    expect(second).toBe(first);
  });

  // The cache holds the in-flight parse, so a failed one is cached as a
  // rejection; every caller must still get the empty-result fallback.
  it("returns no entries to every caller when the parse fails", async () => {
    expect(await parseJsonlFile(tempDir)).toEqual([]);
    expect(await parseJsonlFile(tempDir)).toEqual([]);
  });

  // Segments are started together, so they reach the cache before the first
  // parse resolves. Caching the resolved array would let every one of them miss.
  it("parses once when callers arrive concurrently", async () => {
    const [first, second, third] = await Promise.all([
      parseJsonlFile(filePath),
      parseJsonlFile(filePath),
      parseJsonlFile(filePath),
    ]);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first).toHaveLength(2);
  });

  // Each half of the cache key gets its own test: rewriting a file moves both
  // mtime and size, so only a pinned mtime isolates size.
  // The pin is a whole number of milliseconds because utimesSync cannot
  // reproduce the sub-millisecond precision a real write leaves behind.
  it("reparses when the file grows without its mtime moving", async () => {
    const pinned = new Date(1700000000000);
    utimesSync(filePath, pinned, pinned);

    expect(await parseJsonlFile(filePath)).toHaveLength(2);

    appendFileSync(filePath, `${line("c", 3)}\n`);
    utimesSync(filePath, pinned, pinned);
    expect(statSync(filePath).mtimeMs).toBe(pinned.getTime());

    expect(await parseJsonlFile(filePath)).toHaveLength(3);
  });

  it("reparses when the file changes without changing size", async () => {
    expect(await parseJsonlFile(filePath)).toHaveLength(2);

    writeFileSync(filePath, `${line("a", 9)}\n${line("b", 8)}\n`);
    const later = new Date(Date.now() + 2000);
    utimesSync(filePath, later, later);

    const entries = await parseJsonlFile(filePath);
    expect(entries[0]?.message?.usage?.input_tokens).toBe(9);
  });

  it("returns an empty array for a missing file", async () => {
    expect(await parseJsonlFile(join(tempDir, "nope.jsonl"))).toEqual([]);
  });
});

describe("readTranscriptFrom", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "read-from-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const prefix = '{"timestamp":"2026-09-18T10:00:00Z","message":{"id":"';
  const entryLine = (id: string) => `${prefix}${id}"}}\n`;

  // The stream hands out 64 KiB chunks from the start offset. The padding
  // puts the chunk boundary inside one of the 2-byte characters.
  it("joins a line across chunks and leaves an unterminated tail out of end", async () => {
    const skipped = entryLine("skipped");
    const pad = (65_536 - prefix.length) % 2 === 0 ? "a" : "";
    const long = pad + "é".repeat(40_000);
    const complete = skipped + entryLine(long) + entryLine("after");
    const filePath = join(tempDir, "transcript.jsonl");
    writeFileSync(filePath, complete + entryLine("tail").trimEnd());

    const read = await readTranscriptFrom(filePath, Buffer.byteLength(skipped));

    expect(read.entries.map((entry) => entry.message?.id)).toEqual([
      long,
      "after",
    ]);
    expect(read.end).toBe(Buffer.byteLength(complete));
    expect(read.tail?.message?.id).toBe("tail");
  });
});

describe("parsed entries retain only what consumers read", () => {
  const mockPricing: ModelPricing = {
    name: "Test Model",
    input: 10,
    output: 20,
    cache_write_5m: 1,
    cache_write_1h: 4,
    cache_read: 0.5,
  };

  let tempDir: string;
  let getModelPricingSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "parsed-narrow-"));
    getModelPricingSpy = jest
      .spyOn(PricingService, "getModelPricing")
      .mockResolvedValue(mockPricing);
  });

  afterEach(() => {
    getModelPricingSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const writeLines = (name: string, lines: unknown[]): string => {
    const filePath = join(tempDir, name);
    writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join("\n"));
    return filePath;
  };

  // A line carries tool results and message content far larger than the usage
  // data; holding on to them is what made peak memory track transcript size.
  const bulk = {
    toolUseResult: "x".repeat(4096),
    content: "y".repeat(4096),
  };

  it("drops fields no consumer reads", async () => {
    const filePath = writeLines("drop.jsonl", [
      {
        timestamp: "2026-09-18T10:00:00Z",
        requestId: "req_1",
        model_id: "m1",
        ...bulk,
        message: { id: "msg_1", model: "claude-opus-4-1", usage: {}, ...bulk },
      },
    ]);

    const [entry] = await parseJsonlFile(filePath);

    expect(Object.keys(entry!.raw).sort()).toEqual([
      "message",
      "model",
      "model_id",
      "requestId",
    ]);
    expect(Object.keys(entry!.message!).sort()).toEqual([
      "id",
      "model",
      "usage",
    ]);
  });

  it("keeps the fields dedup needs", async () => {
    const filePath = writeLines("dedup.jsonl", [
      {
        timestamp: "2026-09-18T10:00:00Z",
        requestId: "req_9",
        message: { id: "msg_9", usage: {} },
      },
    ]);

    const [entry] = await parseJsonlFile(filePath);

    expect(createUniqueHash(entry!)).toBe("msg_9:req_9");
  });

  it("returns null from the hash when the ids are absent", async () => {
    const filePath = writeLines("nohash.jsonl", [
      { timestamp: "2026-09-18T10:00:00Z", message: { usage: {} } },
    ]);

    const [entry] = await parseJsonlFile(filePath);

    expect(createUniqueHash(entry!)).toBeNull();
  });

  it("prices the full cache breakdown through the parser", async () => {
    const filePath = writeLines("cost.jsonl", [
      {
        timestamp: "2026-09-18T10:00:00Z",
        ...bulk,
        message: {
          model: "test-model",
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_input_tokens: 1_000_000,
            cache_creation_input_tokens: 2_000_000,
            cache_creation: {
              ephemeral_1h_input_tokens: 1_000_000,
              ephemeral_5m_input_tokens: 1_000_000,
            },
          },
        },
      },
    ]);

    const [entry] = await parseJsonlFile(filePath);

    // 10 input + 20 output + 0.5 cache read + 4 (1h write) + 1 (5m write)
    expect(await PricingService.calculateCostForEntry(entry!.raw)).toBeCloseTo(
      35.5,
    );
  });

  // extractModelId accepts message.model as a string or as an object with an
  // id; narrowing it to a string would silently mis-price every such entry.
  it("preserves an object-shaped message.model", async () => {
    const filePath = writeLines("modelobj.jsonl", [
      {
        timestamp: "2026-09-18T10:00:00Z",
        message: {
          model: { id: "claude-opus-4-1-20250805" },
          usage: { input_tokens: 1 },
        },
      },
    ]);

    const [entry] = await parseJsonlFile(filePath);
    await PricingService.calculateCostForEntry(entry!.raw);

    expect(getModelPricingSpy).toHaveBeenCalledWith("claude-opus-4-1-20250805");
  });

  it("falls back to a top-level model_id", async () => {
    const filePath = writeLines("modelid.jsonl", [
      {
        timestamp: "2026-09-18T10:00:00Z",
        model_id: "claude-haiku-4-5",
        message: { usage: { input_tokens: 1 } },
      },
    ]);

    const [entry] = await parseJsonlFile(filePath);
    await PricingService.calculateCostForEntry(entry!.raw);

    expect(getModelPricingSpy).toHaveBeenCalledWith("claude-haiku-4-5");
  });

  // Files above STREAMING_THRESHOLD_BYTES take a second parser; both build
  // entries the same way and must not drift apart.
  it("produces the same entry from the streaming and in-memory parsers", async () => {
    const line = {
      timestamp: "2026-09-18T10:00:00Z",
      requestId: "req_2",
      model: "claude-opus-4-1",
      model_id: "m2",
      ...bulk,
      message: { id: "msg_2", model: "claude-opus-4-1", usage: {} },
    };

    const small = writeLines("small.jsonl", [line]);
    // Pad past the 1 MiB streaming threshold with lines carrying no timestamp,
    // which the parser skips, leaving the same single entry.
    const padding = Array.from({ length: 4000 }, () => ({
      note: "z".repeat(300),
    }));
    const large = writeLines("large.jsonl", [line, ...padding]);

    const [fromMemory] = await parseJsonlFile(small);
    const [fromStream] = await parseJsonlFile(large);

    expect(statSync(large).size).toBeGreaterThan(1024 * 1024);
    expect(fromStream).toEqual(fromMemory);
  });
});
