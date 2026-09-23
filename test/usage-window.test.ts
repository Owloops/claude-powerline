import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { TodayProvider } from "../src/segments/today";
import { MonthProvider } from "../src/segments/month";
import { PricingService } from "../src/segments/pricing";
import * as claude from "../src/utils/claude";

let request = 0;

/** One transcript line, newline included, with ids of its own. */
const line = (
  timestamp: Date,
  inputTokens: number,
  costUSD?: number,
): string => {
  request++;
  return (
    JSON.stringify({
      timestamp: timestamp.toISOString(),
      type: "assistant",
      requestId: `req_${request}`,
      message: {
        id: `msg_${request}`,
        model: "model-a",
        usage: { input_tokens: inputTokens },
      },
      ...(costUSD !== undefined ? { costUSD } : {}),
    }) + "\n"
  );
};

describe("Today and month totals across renders", () => {
  const now = new Date(2026, 8, 12, 12, 0, 0);
  const today = (hour: number) => new Date(2026, 8, 12, hour);
  const yesterday = (hour: number) => new Date(2026, 8, 11, hour);

  let tempDir: string;
  let projectsDir: string;
  let readSpy: jest.SpyInstance;

  const transcript = (relativePath: string) =>
    join(projectsDir, relativePath + ".jsonl");

  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };

  const todayTokens = async () =>
    (await new TodayProvider().getTodayInfo()).tokens;

  beforeEach(() => {
    request = 0;
    // Only Date is frozen: the cache lock retry loop awaits real timers.
    jest.useFakeTimers({
      now,
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "nextTick",
        "queueMicrotask",
      ],
    });
    tempDir = mkdtempSync(join(tmpdir(), "usage-window-test-"));
    projectsDir = join(tempDir, "claude", "projects");
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, "claude");
    process.env.CLAUDE_POWERLINE_CACHE_DIR = join(tempDir, "cache");

    // A million input tokens cost a dollar.
    jest.spyOn(PricingService, "getModelPricing").mockResolvedValue({
      name: "A",
      input: 1,
      output: 0,
      cache_write_5m: 0,
      cache_write_1h: 0,
      cache_read: 0,
    });
    readSpy = jest.spyOn(claude, "readTranscriptFrom");
  });

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_POWERLINE_CACHE_DIR;
    jest.restoreAllMocks();
    jest.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("counts today's entries of every project and agent transcript", async () => {
    write(
      transcript("p1/s1"),
      line(yesterday(23), 1) + line(today(9), 2) + line(today(10), 4),
    );
    write(transcript("p2/s2/subagents/agent-a"), line(today(11), 8));

    const info = await new TodayProvider().getTodayInfo();
    expect(info.tokens).toBe(14);
    expect(info.cost).toBeCloseTo(14 / 1_000_000, 12);
  });

  it("reads only what was appended since the last render", async () => {
    write(transcript("p1/s1"), line(today(9), 1));
    write(transcript("p2/s2"), line(today(9), 2));
    await todayTokens();

    readSpy.mockClear();
    const sizeBefore = statSync(transcript("p1/s1")).size;
    appendFileSync(transcript("p1/s1"), line(today(10), 4));

    expect(await todayTokens()).toBe(7);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(readSpy).toHaveBeenCalledWith(transcript("p1/s1"), sizeBefore);
  });

  it("picks up a transcript created since the last render", async () => {
    write(transcript("p1/s1"), line(today(9), 1));
    expect(await todayTokens()).toBe(1);

    write(transcript("p2/s2"), line(today(10), 2));
    expect(await todayTokens()).toBe(3);
  });

  it("does not count lines from before midnight appended today", async () => {
    write(transcript("p1/s1"), line(today(9), 1));
    await todayTokens();

    appendFileSync(
      transcript("p1/s1"),
      line(yesterday(23), 2) + line(yesterday(23), 4).trimEnd(),
    );
    expect(await todayTokens()).toBe(1);
  });

  it("counts a request once, skipping its copies from before midnight", async () => {
    const request = line(today(9), 2);
    const copiedYesterday = request.replace(
      today(9).toISOString(),
      yesterday(23).toISOString(),
    );
    write(transcript("p1/s1"), copiedYesterday + request);
    expect(await todayTokens()).toBe(2);

    write(transcript("p2/s2"), request);
    expect(await todayTokens()).toBe(2);
  });

  it("does not read transcripts untouched since before yesterday", async () => {
    write(transcript("p1/s1"), line(today(9), 1));
    write(transcript("p2/old"), line(yesterday(9), 2));
    const twoDaysAgo = new Date(2026, 8, 10, 23);
    utimesSync(transcript("p2/old"), twoDaysAgo, twoDaysAgo);

    expect(await todayTokens()).toBe(1);
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it("starts over at midnight", async () => {
    write(transcript("p1/s1"), line(today(9), 1));
    expect(await todayTokens()).toBe(1);

    jest.setSystemTime(new Date(2026, 8, 13, 0, 30));
    appendFileSync(transcript("p1/s1"), line(new Date(2026, 8, 13, 0, 10), 2));
    expect(await todayTokens()).toBe(2);
  });

  it("starts over when the time zone changes", async () => {
    // Fake timers wrap `Intl`, whose zone this test fakes instead.
    jest.useRealTimers();
    write(transcript("p1/s1"), line(new Date(), 1));
    await todayTokens();

    // Only the zone's name changes: the lines already read would be dated the
    // same, so only reading them again shows the new zone was noticed.
    const options = Intl.DateTimeFormat().resolvedOptions();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ ...options, timeZone: "Not/ThisZone" });
    readSpy.mockClear();
    expect(await todayTokens()).toBe(1);
    expect(readSpy).toHaveBeenCalledWith(transcript("p1/s1"), 0);
  });

  it("adds completed days to today for the month", async () => {
    write(
      transcript("p1/s1"),
      line(new Date(2026, 8, 1, 9), 1) +
        line(yesterday(9), 2) +
        line(today(9), 4),
    );

    expect((await new MonthProvider().getMonthInfo()).tokens).toBe(7);
    expect(await todayTokens()).toBe(4);
  });

  it("takes a recorded cost of zero as recorded, today and on completed days", async () => {
    write(
      transcript("p1/s1"),
      line(yesterday(9), 1_000_000, 0) + line(today(9), 1_000_000, 0),
    );

    expect((await new MonthProvider().getMonthInfo()).cost).toBe(0);
  });

  it("shares one read of today between concurrent today and month renders", async () => {
    write(transcript("p1/s1"), line(today(9), 1));

    await Promise.all([
      new MonthProvider().getMonthInfo(),
      new TodayProvider().getTodayInfo(),
    ]);
    // The month's completed days are scanned with parseJsonlFile.
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});
