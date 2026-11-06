import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import { ContextProvider } from "../src/segments/context";
import { BACKWARD_CHUNK_BYTES as CHUNK } from "../src/utils/claude";

function usageLine(inputTokens: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "assistant",
    timestamp: "2026-01-01T10:00:00Z",
    isSidechain: false,
    message: { role: "assistant", usage: { input_tokens: inputTokens } },
    ...extra,
  });
}

/** A line with no usage, padded to `bytes` bytes, newline excluded. */
function fillerLine(bytes: number) {
  const head = '{"type":"user","timestamp":"2026-01-01T10:00:00Z","c":"';
  const tail = '"}';
  return head + "x".repeat(bytes - head.length - tail.length) + tail;
}

const COMPACT_BOUNDARY = JSON.stringify({
  type: "system",
  subtype: "compact_boundary",
  timestamp: "2026-01-01T10:00:00Z",
  isSidechain: false,
});

describe("context from the transcript", () => {
  let dir: string;
  let path: string;
  const provider = new ContextProvider(DEFAULT_CONFIG);
  const tokens = async () =>
    (await provider.calculateContextTokensFromTranscript(path))?.totalTokens ??
    null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "powerline-context-"));
    path = join(dir, "session.jsonl");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("finds the last usage behind several chunks of lines without usage", async () => {
    const filler = Array.from({ length: 300 }, () => fillerLine(1000));
    writeFileSync(
      path,
      [usageLine(1), usageLine(42), ...filler, ""].join("\n"),
    );

    expect(await tokens()).toBe(42);
  });

  it("reads the transcript's first line when the usage is there", async () => {
    const filler = Array.from({ length: 300 }, () => fillerLine(1000));
    writeFileSync(path, [usageLine(7), ...filler, ""].join("\n"));

    expect(await tokens()).toBe(7);
  });

  it("reads a usage line longer than a chunk", async () => {
    const long = usageLine(99, { pad: "y".repeat(3 * CHUNK) });
    writeFileSync(path, [usageLine(1), long, fillerLine(100), ""].join("\n"));

    expect(await tokens()).toBe(99);
  });

  it.each([
    ["last byte of the chunk before", CHUNK - 1],
    ["first byte of the last chunk", CHUNK - 2],
  ])("splits lines when a newline is the %s", async (_where, lastLineBytes) => {
    // The file's last CHUNK bytes hold the final line and its newline, and
    // the usage line's newline falls either side of the chunk boundary.
    const last = fillerLine(lastLineBytes);
    writeFileSync(path, [usageLine(1), usageLine(5), last, ""].join("\n"));

    expect(await tokens()).toBe(5);
  });

  it("uses an unterminated last line that parses", async () => {
    writeFileSync(path, [usageLine(1), usageLine(3)].join("\n"));

    expect(await tokens()).toBe(3);
  });

  it("skips an unterminated last line that is still being written", async () => {
    const partial = usageLine(3).slice(0, 40);
    writeFileSync(path, [usageLine(1), partial].join("\n"));

    expect(await tokens()).toBe(1);
  });

  it("skips sidechain usage written after the main chain's", async () => {
    writeFileSync(
      path,
      [usageLine(10), usageLine(20, { isSidechain: true }), ""].join("\n"),
    );

    expect(await tokens()).toBe(10);
  });

  it("reports nothing when /compact came after the last usage, chunks back", async () => {
    const filler = Array.from({ length: 100 }, () => fillerLine(1000));
    writeFileSync(
      path,
      [usageLine(10), COMPACT_BOUNDARY, ...filler, ""].join("\n"),
    );

    expect(await tokens()).toBeNull();
  });

  it("uses usage written after /compact", async () => {
    writeFileSync(
      path,
      [usageLine(10), COMPACT_BOUNDARY, usageLine(4), ""].join("\n"),
    );

    expect(await tokens()).toBe(4);
  });

  it("reports nothing for an empty transcript, one without usage, or none at all", async () => {
    writeFileSync(path, "");
    expect(await tokens()).toBeNull();

    writeFileSync(path, [fillerLine(100), fillerLine(100), ""].join("\n"));
    expect(await tokens()).toBeNull();

    rmSync(path);
    expect(await tokens()).toBeNull();
  });
});
