import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  promises,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionProvider } from "../src/segments";
import { PricingService, type ModelPricing } from "../src/segments/pricing";
import * as claude from "../src/utils/claude";
import { CacheManager } from "../src/utils/cache";

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
}

let minute = 0;

/** One transcript line, newline included. */
const line = (
  usage: Usage | null,
  opts: { id?: string; model?: string; costUSD?: number } = {},
): string => {
  minute++;
  return (
    JSON.stringify({
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
      type: "assistant",
      message: {
        ...(opts.id ? { id: `msg_${opts.id}` } : {}),
        model: opts.model ?? "model-a",
        ...(usage ? { usage } : { content: "text" }),
      },
      ...(opts.id ? { requestId: `req_${opts.id}` } : {}),
      ...(opts.costUSD !== undefined ? { costUSD: opts.costUSD } : {}),
    }) + "\n"
  );
};

const PRICING: Record<string, ModelPricing> = {
  "model-a": {
    name: "A",
    input: 3,
    output: 15,
    cache_write_5m: 3.75,
    cache_write_1h: 6,
    cache_read: 0.3,
  },
  "model-b": {
    name: "B",
    input: 5,
    output: 25,
    cache_write_5m: 6.25,
    cache_write_1h: 10,
    cache_read: 0.5,
  },
};

describe("Session totals across renders", () => {
  let tempDir: string;
  let cacheDir: string;
  let mainPath: string;
  let agentPath: string;
  let agentPaths: string[];
  let pricing: Record<string, ModelPricing>;
  let readSpy: jest.SpyInstance;

  const render = () => new SessionProvider().getSessionUsage("session");

  /**
   * The totals of reading every line of the transcripts, deduplicated in the
   * order they are listed.
   */
  const fullRead = async () => {
    const entries: claude.ParsedEntry[] = [];
    for (const path of [mainPath, ...agentPaths]) {
      entries.push(...(await claude.parseJsonlFile(path)));
    }
    const counted = claude.deduplicateEntries(
      entries.filter((entry) => entry.message?.usage),
    );

    let totalCost = 0;
    const tokenBreakdown = {
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
    };
    for (const entry of counted) {
      const usage = entry.message!.usage!;
      totalCost +=
        entry.costUSD ??
        (await PricingService.calculateCostForEntry(entry.raw));
      tokenBreakdown.input += usage.input_tokens || 0;
      tokenBreakdown.output += usage.output_tokens || 0;
      tokenBreakdown.cacheCreation += usage.cache_creation_input_tokens || 0;
      tokenBreakdown.cacheRead += usage.cache_read_input_tokens || 0;
    }
    return { entryCount: counted.length, tokenBreakdown, totalCost };
  };

  const expectFullReadTotals = async () => {
    const usage = await render();
    const expected = await fullRead();
    expect(usage).not.toBeNull();
    expect(usage!.entryCount).toBe(expected.entryCount);
    expect(usage!.tokenBreakdown).toEqual(expected.tokenBreakdown);
    expect(usage!.totalCost).toBeCloseTo(expected.totalCost, 10);
  };

  beforeEach(() => {
    minute = 0;
    tempDir = mkdtempSync(join(tmpdir(), "transcript-totals-test-"));
    cacheDir = join(tempDir, "cache");
    process.env.CLAUDE_POWERLINE_CACHE_DIR = cacheDir;
    mainPath = join(tempDir, "session.jsonl");
    agentPath = join(tempDir, "agent-a.jsonl");
    writeFileSync(mainPath, "");
    writeFileSync(agentPath, "");
    agentPaths = [agentPath];
    pricing = PRICING;

    jest
      .spyOn(claude, "findTranscriptFile")
      .mockImplementation(async () => mainPath);
    jest
      .spyOn(claude, "findAgentTranscripts")
      .mockImplementation(async () => agentPaths);
    jest
      .spyOn(PricingService, "getModelPricing")
      .mockImplementation(async (modelId) => pricing[modelId]!);
    readSpy = jest.spyOn(claude, "readTranscriptFrom");
  });

  afterEach(() => {
    delete process.env.CLAUDE_POWERLINE_CACHE_DIR;
    jest.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("matches a full read at every step while the transcripts grow", async () => {
    // Claude Code writes one line per content block, repeating the message's
    // ids with a usage snapshot that can differ: the first one read counts.
    const writes: [string, string][] = [
      [mainPath, line({ input_tokens: 10, output_tokens: 1 }, { id: "a" })],
      [mainPath, line({ input_tokens: 10, output_tokens: 9 }, { id: "a" })],
      // A line without usage must not claim its ids' hash.
      [mainPath, line(null, { id: "b" })],
      [
        mainPath,
        line(
          {
            input_tokens: 5,
            output_tokens: 5,
            cache_creation_input_tokens: 300,
            cache_creation: { ephemeral_1h_input_tokens: 100 },
            cache_read_input_tokens: 1000,
          },
          { id: "b", model: "model-b" },
        ),
      ],
      [agentPath, line({ input_tokens: 7, output_tokens: 3 }, { id: "c" })],
      // An agent copy of a request the main transcript already counted.
      [agentPath, line({ input_tokens: 10, output_tokens: 1 }, { id: "a" })],
      [
        mainPath,
        line({ input_tokens: 1, output_tokens: 1 }, { costUSD: 0.25 }),
      ],
      [mainPath, line({ input_tokens: 2, output_tokens: 2 })],
      [mainPath, "not json\n\n"],
      [mainPath, line({ input_tokens: 3, output_tokens: 3 }, { id: "d" })],
      [agentPath, line({ input_tokens: 4, output_tokens: 4 }, { id: "d" })],
      [
        mainPath,
        line(
          { input_tokens: 8, cache_creation_input_tokens: 50 },
          { id: "e", model: "model-b" },
        ),
      ],
    ];

    for (const [path, text] of writes) {
      // Half a line first, as a render can land mid-write.
      const half = Math.floor(text.length / 2);
      appendFileSync(path, text.slice(0, half));
      await expectFullReadTotals();
      appendFileSync(path, text.slice(half));
      await expectFullReadTotals();
    }

    const usage = await render();
    expect(usage!.entryCount).toBe(7);
  });

  it("reads only what was appended since the last render", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }, { id: "a" }));
    writeFileSync(agentPath, line({ input_tokens: 2 }, { id: "b" }));
    await render();

    readSpy.mockClear();
    const sizeBefore = statSync(mainPath).size;
    appendFileSync(mainPath, line({ input_tokens: 4 }, { id: "c" }));

    const usage = await render();
    expect(usage!.tokenBreakdown.input).toBe(7);
    // The unchanged agent transcript is not read at all.
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(readSpy).toHaveBeenCalledWith(mainPath, sizeBefore);
  });

  it("keeps reading from the offset while a transcript is shorter than the 1 KiB its fingerprint covers", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }));
    await render();

    // A fingerprint not refreshed as the file grows still matches on the first
    // append; the second is the one that would find it stale.
    for (let i = 0; i < 2; i++) {
      readSpy.mockClear();
      const sizeBefore = statSync(mainPath).size;
      appendFileSync(mainPath, line({ input_tokens: 1 }));
      await render();
      expect(readSpy).toHaveBeenCalledWith(mainPath, sizeBefore);
    }
    expect(statSync(mainPath).size).toBeLessThan(1024);
  });

  it("does not count a line twice across renders", async () => {
    writeFileSync(
      mainPath,
      line({ input_tokens: 1 }) + line({ input_tokens: 2 }),
    );

    expect((await render())!.tokenBreakdown.input).toBe(3);
    expect((await render())!.tokenBreakdown.input).toBe(3);
  });

  it("does not consume a line until its newline is written", async () => {
    const second = line({ input_tokens: 2 });
    writeFileSync(mainPath, line({ input_tokens: 1 }) + second.slice(0, 20));
    expect((await render())!.tokenBreakdown.input).toBe(1);

    appendFileSync(mainPath, second.slice(20));
    expect((await render())!.tokenBreakdown.input).toBe(3);
  });

  it("counts a complete last line with no newline yet, without saving it", async () => {
    // No ids, so deduplication cannot hide the line being counted twice.
    const second = line({ input_tokens: 2 });
    writeFileSync(mainPath, line({ input_tokens: 1 }) + second.trimEnd());
    expect((await render())!.tokenBreakdown.input).toBe(3);
    expect((await render())!.tokenBreakdown.input).toBe(3);

    appendFileSync(mainPath, "\n" + line({ input_tokens: 4 }));
    expect((await render())!.tokenBreakdown.input).toBe(7);
  });

  it("deduplicates against requests counted before the saved offset", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }, { id: "a" }));
    await render();

    appendFileSync(mainPath, line({ input_tokens: 10 }, { id: "a" }));
    appendFileSync(agentPath, line({ input_tokens: 100 }, { id: "a" }));

    const usage = await render();
    expect(usage!.entryCount).toBe(1);
    expect(usage!.tokenBreakdown.input).toBe(1);
  });

  // A full read keeps the copy in the transcript listed first. Across renders
  // that copy may not exist yet when another one is counted, and the counted
  // one stays.
  it("keeps the copy of a request read first, whichever transcript it is in", async () => {
    writeFileSync(agentPath, line({ input_tokens: 4 }, { id: "a" }));
    await render();

    appendFileSync(mainPath, line({ input_tokens: 3 }, { id: "a" }));
    const usage = await render();
    expect(usage!.entryCount).toBe(1);
    expect(usage!.tokenBreakdown.input).toBe(4);
  });

  describe("rereads the session when a transcript no longer extends what was read", () => {
    // Longer than the head the fingerprint covers, so each case below can
    // keep that head intact and leave only the check under test to notice.
    const original = Array.from({ length: 12 }, (_, i) =>
      line({ input_tokens: 1 }, { id: `line${i}` }),
    );

    beforeEach(async () => {
      expect(original.slice(0, 8).join("").length).toBeGreaterThan(1024);
      writeFileSync(mainPath, original.join(""));
      writeFileSync(agentPath, line({ input_tokens: 100 }, { id: "agent" }));
      expect((await render())!.tokenBreakdown.input).toBe(112);
    });

    it("when it shrank", async () => {
      writeFileSync(mainPath, original.slice(0, 11).join(""));
      await expectFullReadTotals();
    });

    it("when it was replaced by another file", async () => {
      const replacement = join(tempDir, "replacement.jsonl");
      writeFileSync(
        replacement,
        original.slice(0, 8).join("") +
          Array.from({ length: 5 }, (_, i) =>
            line({ input_tokens: 10 }, { id: `new${i}` }),
          ).join(""),
      );
      renameSync(replacement, mainPath);
      await expectFullReadTotals();
      expect((await render())!.tokenBreakdown.input).toBe(158);
    });

    it("when it was rewritten in place", async () => {
      writeFileSync(
        mainPath,
        line({ input_tokens: 10 }, { id: "new" }) + original.join(""),
      );
      await expectFullReadTotals();
      expect((await render())!.tokenBreakdown.input).toBe(122);
    });

    it("when an agent transcript is gone", async () => {
      agentPaths = [];
      await expectFullReadTotals();
      expect((await render())!.tokenBreakdown.input).toBe(12);
    });
  });

  it("prices the saved totals with the current pricing", async () => {
    writeFileSync(
      mainPath,
      line({ input_tokens: 1_000_000 }) +
        line({ output_tokens: 1_000_000 }, { model: "model-b" }),
    );
    expect((await render())!.totalCost).toBeCloseTo(3 + 25, 10);

    pricing = {
      "model-a": { ...PRICING["model-a"]!, input: 1 },
      "model-b": { ...PRICING["model-b"]!, output: 50 },
    };
    readSpy.mockClear();
    expect((await render())!.totalCost).toBeCloseTo(1 + 50, 10);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("does not double count when renders race", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }, { id: "a" }));
    await render();

    appendFileSync(mainPath, line({ input_tokens: 2 }, { id: "b" }));
    const racing = await Promise.all([render(), render(), render()]);
    for (const usage of racing) expect(usage!.tokenBreakdown.input).toBe(3);

    appendFileSync(mainPath, line({ input_tokens: 4 }, { id: "c" }));
    expect((await render())!.tokenBreakdown.input).toBe(7);
  });

  it("does not save a state that did not change", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }));
    await render();

    const saveSpy = jest.spyOn(CacheManager, "setTotalsCache");
    await render();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("still counts when the cache directory cannot be written", async () => {
    // Under a regular file, so no directory can be created there.
    process.env.CLAUDE_POWERLINE_CACHE_DIR = join(mainPath, "cache");
    writeFileSync(mainPath, line({ input_tokens: 1 }));
    expect((await render())!.tokenBreakdown.input).toBe(1);
  });

  it("leaves no temp file behind when a save cannot be renamed", async () => {
    jest
      .spyOn(promises, "rename")
      .mockRejectedValueOnce(Object.assign(new Error(), { code: "EPERM" }));
    writeFileSync(mainPath, line({ input_tokens: 1 }));
    expect((await render())!.tokenBreakdown.input).toBe(1);
    expect(readdirSync(join(cacheDir, "usage"))).toEqual([]);
  });

  it("reads everything again when the saved state is unreadable", async () => {
    writeFileSync(mainPath, line({ input_tokens: 1 }));
    await render();

    const usageDir = join(cacheDir, "usage");
    writeFileSync(join(usageDir, "totals-session-session.json"), "{ torn");
    expect((await render())!.tokenBreakdown.input).toBe(1);
  });

  it("prunes the states of sessions not rendered for two weeks", async () => {
    const usageDir = join(cacheDir, "usage");
    mkdirSync(usageDir, { recursive: true });
    const stale = new Date(Date.now() - 15 * 86_400_000);
    for (const name of [
      "totals-session-old.json",
      "totals-session-old.json.123.tmp",
      "totals-session-recent.json",
      "day-2026-01-01.json",
    ]) {
      writeFileSync(join(usageDir, name), "{}");
    }
    utimesSync(join(usageDir, "totals-session-old.json"), stale, stale);
    utimesSync(join(usageDir, "totals-session-old.json.123.tmp"), stale, stale);
    utimesSync(join(usageDir, "day-2026-01-01.json"), stale, stale);

    writeFileSync(mainPath, line({ input_tokens: 1 }));
    await render();

    expect(readdirSync(usageDir).sort()).toEqual([
      "day-2026-01-01.json",
      "totals-session-recent.json",
      "totals-session-session.json",
    ]);
  });
});
