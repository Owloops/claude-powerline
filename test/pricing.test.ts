import { PricingService } from "../src/segments/pricing";
import type { ModelPricing } from "../src/segments/pricing";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("PricingService cache write pricing", () => {
  const mockPricing: ModelPricing = {
    name: "Test Model",
    input: 10,
    output: 20,
    cache_write_5m: 1,
    cache_write_1h: 4,
    cache_read: 0.5,
  };

  let getModelPricingSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    getModelPricingSpy = jest
      .spyOn(PricingService, "getModelPricing")
      .mockResolvedValue(mockPricing);
  });

  afterEach(() => {
    getModelPricingSpy.mockRestore();
  });

  const entryWithUsage = (usage: Record<string, unknown>) => ({
    model: "test-model",
    message: { usage },
  });

  test.each([
    {
      case: "legacy aggregate only (no cache_creation breakdown) uses 5m rate",
      usage: { cache_creation_input_tokens: 1_000_000 },
      expected: 1,
    },
    {
      case: "1h-only breakdown uses 1h rate",
      usage: {
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      },
      expected: 4,
    },
    {
      case: "5m-only breakdown uses 5m rate",
      usage: {
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 1_000_000 },
      },
      expected: 1,
    },
    {
      case: "mixed breakdown prices each bucket at its own rate",
      usage: {
        cache_creation_input_tokens: 3_000_000,
        cache_creation: {
          ephemeral_1h_input_tokens: 2_000_000,
          ephemeral_5m_input_tokens: 1_000_000,
        },
      },
      expected: 2 * 4 + 1 * 1,
    },
    {
      case: "partial breakdown prices the uncategorized residual at 5m rate",
      usage: {
        cache_creation_input_tokens: 3_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      },
      expected: 1 * 4 + 2 * 1,
    },
    {
      case: "breakdown larger than aggregate does not go negative",
      usage: {
        cache_creation_input_tokens: 1_000_000,
        cache_creation: {
          ephemeral_1h_input_tokens: 1_000_000,
          ephemeral_5m_input_tokens: 1_000_000,
        },
      },
      expected: 1 * 4 + 1 * 1,
    },
  ])("$case", async ({ usage, expected }) => {
    const cost = await PricingService.calculateCostForEntry(
      entryWithUsage(usage),
    );
    expect(cost).toBeCloseTo(expected, 10);
  });

  test("missing cache_write_1h rate falls back to the 5m rate", async () => {
    const { cache_write_1h: _unused, ...withoutOneHourRate } = mockPricing;
    getModelPricingSpy.mockResolvedValue(withoutOneHourRate);

    const cost = await PricingService.calculateCostForEntry(
      entryWithUsage({
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      }),
    );

    expect(cost).toBeCloseTo(1, 10);
  });

  test("cache costs combine with input, output, and cache read costs", async () => {
    const cost = await PricingService.calculateCostForEntry(
      entryWithUsage({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 2_000_000,
        cache_creation: {
          ephemeral_1h_input_tokens: 1_000_000,
          ephemeral_5m_input_tokens: 1_000_000,
        },
      }),
    );

    expect(cost).toBeCloseTo(10 + 20 + 0.5 + 4 + 1, 10);
  });
});

describe("PricingService.getCurrentPricing concurrency", () => {
  let tempDir: string;
  let originalCacheDir: string | undefined;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-pricing-cache-"));
    originalCacheDir = process.env.CLAUDE_POWERLINE_CACHE_DIR;
    process.env.CLAUDE_POWERLINE_CACHE_DIR = tempDir;

    // Both caches start empty: getCurrentPricing has no other way to reset
    // its own module-level state between tests.
    (PricingService as unknown as { executionCache: unknown }).executionCache =
      null;
    (PricingService as unknown as { loadingCache: unknown }).loadingCache =
      null;

    fetchSpy = jest
      .spyOn(
        PricingService as unknown as {
          fetchPricingData: () => Promise<unknown>;
        },
        "fetchPricingData",
      )
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ "test-model": { input: 1 } }), 20),
          ),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
    if (originalCacheDir === undefined) {
      delete process.env.CLAUDE_POWERLINE_CACHE_DIR;
    } else {
      process.env.CLAUDE_POWERLINE_CACHE_DIR = originalCacheDir;
    }
  });

  // The tui style resolves every segment's info concurrently (see
  // powerline.ts), so session and today can each reach getCurrentPricing
  // before the first fetch resolves. Each one that started its own fetch was
  // the bug this covers.
  it("shares one GitHub fetch across concurrent callers", async () => {
    const [first, second, third] = await Promise.all([
      PricingService.getCurrentPricing(),
      PricingService.getCurrentPricing(),
      PricingService.getCurrentPricing(),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("does not fetch again once pricing is cached", async () => {
    await PricingService.getCurrentPricing();
    fetchSpy.mockClear();

    await PricingService.getCurrentPricing();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
