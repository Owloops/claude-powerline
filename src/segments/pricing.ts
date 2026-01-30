import { debug } from "../utils/logger";
import { get } from "node:https";
import { URL } from "node:url";
import { CacheManager } from "../utils/cache";

export interface ModelPricing {
  name: string;
  input: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
  output: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
}

export interface DetailedCostResult {
  breakdown: CostBreakdown;
  tokensUsed: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  modelId: string;
  isOutputEstimated: boolean;
}

const OFFLINE_PRICING_DATA: Record<string, ModelPricing> = {
  "claude-3-haiku-20240307": {
    name: "Claude 3 Haiku",
    input: 0.25,
    output: 1.25,
    cache_write_5m: 0.3,
    cache_write_1h: 0.5,
    cache_read: 0.03,
  },
  "claude-3-5-haiku-20241022": {
    name: "Claude 3.5 Haiku",
    input: 0.8,
    output: 4.0,
    cache_write_5m: 1.0,
    cache_write_1h: 1.6,
    cache_read: 0.08,
  },
  "claude-3-5-haiku-latest": {
    name: "Claude 3.5 Haiku Latest",
    input: 1.0,
    output: 5.0,
    cache_write_5m: 1.25,
    cache_write_1h: 2.0,
    cache_read: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    name: "Claude Haiku 4.5",
    input: 1.0,
    output: 5.0,
    cache_write_5m: 1.25,
    cache_write_1h: 2.0,
    cache_read: 0.1,
  },
  "claude-haiku-4-5": {
    name: "Claude Haiku 4.5",
    input: 1.0,
    output: 5.0,
    cache_write_5m: 1.25,
    cache_write_1h: 2.0,
    cache_read: 0.1,
  },
  "claude-3-opus-latest": {
    name: "Claude 3 Opus Latest",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-3-opus-20240229": {
    name: "Claude 3 Opus",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-3-5-sonnet-latest": {
    name: "Claude 3.5 Sonnet Latest",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-3-5-sonnet-20240620": {
    name: "Claude 3.5 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-3-5-sonnet-20241022": {
    name: "Claude 3.5 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-opus-4-20250514": {
    name: "Claude Opus 4",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-opus-4-1": {
    name: "Claude Opus 4.1",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-opus-4-1-20250805": {
    name: "Claude Opus 4.1",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-sonnet-4-20250514": {
    name: "Claude Sonnet 4",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-4-opus-20250514": {
    name: "Claude 4 Opus",
    input: 15.0,
    output: 75.0,
    cache_write_5m: 18.75,
    cache_write_1h: 30.0,
    cache_read: 1.5,
  },
  "claude-4-sonnet-20250514": {
    name: "Claude 4 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-sonnet-4-5": {
    name: "Claude Sonnet 4.5",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-sonnet-4-5-20250929": {
    name: "Claude Sonnet 4.5",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-3-7-sonnet-latest": {
    name: "Claude 3.7 Sonnet Latest",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
  "claude-3-7-sonnet-20250219": {
    name: "Claude 3.7 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_write_5m: 3.75,
    cache_write_1h: 6.0,
    cache_read: 0.3,
  },
};

export class PricingService {
  private static executionCache: Record<string, ModelPricing> | null = null;
  private static modelPricingCache = new Map<string, ModelPricing>();
  private static readonly GITHUB_PRICING_URL =
    "https://raw.githubusercontent.com/Owloops/claude-powerline/main/pricing.json";

  private static async loadDiskCache(): Promise<Record<
    string,
    ModelPricing
  > | null> {
    const TTL_24H = 24 * 60 * 60 * 1000;
    const minValidTime = Date.now() - TTL_24H;
    return await CacheManager.getUsageCache("pricing", minValidTime);
  }

  private static async saveDiskCache(
    data: Record<string, ModelPricing>
  ): Promise<void> {
    await CacheManager.setUsageCache("pricing", data);
  }

  private static async fetchPricingData(): Promise<Record<
    string,
    ModelPricing
  > | null> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(this.GITHUB_PRICING_URL);

      const request = get(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname,
          headers: {
            "User-Agent": "claude-powerline",
            "Cache-Control": "no-cache",
          },
          timeout: 5000,
        },
        (response) => {
          if (response.statusCode !== 200) {
            debug(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            resolve(null);
            return;
          }

          let data = "";
          let size = 0;
          const MAX_SIZE = 1024 * 1024;

          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_SIZE) {
              debug("Response too large");
              request.destroy();
              resolve(null);
              return;
            }
            data += chunk;
          });

          response.on("end", () => {
            try {
              const json = JSON.parse(data);
              const dataObj = json as Record<string, unknown>;
              const meta = dataObj._meta as { updated?: string } | undefined;

              const pricingData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(dataObj)) {
                if (key !== "_meta") {
                  pricingData[key] = value;
                }
              }

              if (this.validatePricingData(pricingData)) {
                debug(
                  `Fetched fresh pricing from GitHub for ${Object.keys(pricingData).length} models`
                );
                debug(`Pricing last updated: ${meta?.updated || "unknown"}`);
                resolve(pricingData);
              } else {
                debug("Invalid pricing data structure");
                resolve(null);
              }
            } catch (error) {
              debug("Failed to parse JSON:", error);
              resolve(null);
            }
          });

          response.on("error", (error) => {
            debug("Response error:", error);
            resolve(null);
          });
        }
      );

      request.on("error", (error) => {
        debug("Request error:", error);
        resolve(null);
      });

      request.on("timeout", () => {
        debug("Request timeout");
        request.destroy();
        resolve(null);
      });

      request.end();
    });
  }

  static async getCurrentPricing(): Promise<Record<string, ModelPricing>> {
    if (this.executionCache !== null) {
      debug(
        `[CACHE-HIT] Pricing execution cache: ${Object.keys(this.executionCache).length} models`
      );
      return this.executionCache;
    }

    const diskCached = await this.loadDiskCache();
    if (diskCached) {
      debug(
        `[CACHE-HIT] Pricing disk cache: ${Object.keys(diskCached).length} models`
      );
      this.executionCache = diskCached;
      debug(
        `[CACHE-SET] Pricing execution cache stored: ${Object.keys(diskCached).length} models`
      );
      return diskCached;
    }

    const freshData = await this.fetchPricingData();
    if (freshData) {
      await this.saveDiskCache(freshData);
      debug(
        `[CACHE-SET] Pricing disk cache stored: ${Object.keys(freshData).length} models`
      );
      this.executionCache = freshData;
      debug(
        `[CACHE-SET] Pricing execution cache stored: ${Object.keys(freshData).length} models`
      );
      return freshData;
    }

    debug(
      `[CACHE-FALLBACK] Using offline pricing data: ${Object.keys(OFFLINE_PRICING_DATA).length} models`
    );
    this.executionCache = OFFLINE_PRICING_DATA;
    debug(
      `[CACHE-SET] Pricing execution cache stored: ${Object.keys(OFFLINE_PRICING_DATA).length} models`
    );
    return OFFLINE_PRICING_DATA;
  }

  private static validatePricingData(
    data: unknown
  ): data is Record<string, ModelPricing> {
    if (!data || typeof data !== "object") return false;

    for (const [, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") return false;
      const pricing = value as Record<string, unknown>;

      if (
        typeof pricing.input !== "number" ||
        typeof pricing.output !== "number" ||
        typeof pricing.cache_read !== "number"
      ) {
        return false;
      }
    }

    return true;
  }

  static async getModelPricing(modelId: string): Promise<ModelPricing> {
    if (this.modelPricingCache.has(modelId)) {
      debug(`[CACHE-HIT] Model pricing cache: ${modelId}`);
      return this.modelPricingCache.get(modelId)!;
    }

    const allPricing = await this.getCurrentPricing();
    let pricing: ModelPricing;

    if (allPricing[modelId]) {
      pricing = allPricing[modelId];
    } else {
      pricing = this.fuzzyMatchModel(modelId, allPricing);
    }

    this.modelPricingCache.set(modelId, pricing);
    debug(`[CACHE-SET] Model pricing cache: ${modelId}`);
    return pricing;
  }

  private static fuzzyMatchModel(
    modelId: string,
    allPricing: Record<string, ModelPricing>
  ): ModelPricing {
    const lowerModelId = modelId.toLowerCase();

    for (const [key, pricing] of Object.entries(allPricing)) {
      if (key.toLowerCase() === lowerModelId) {
        return pricing;
      }
    }
    const patterns = [
      {
        pattern: ["opus-4-1", "claude-opus-4-1"],
        fallback: "claude-opus-4-1-20250805",
      },
      {
        pattern: ["opus-4", "claude-opus-4"],
        fallback: "claude-opus-4-20250514",
      },
      {
        pattern: ["sonnet-4.5", "4-5-sonnet", "sonnet-4-5"],
        fallback: "claude-sonnet-4-5-20250929",
      },
      {
        pattern: ["sonnet-4", "claude-sonnet-4"],
        fallback: "claude-sonnet-4-20250514",
      },
      {
        pattern: ["sonnet-3.7", "3-7-sonnet"],
        fallback: "claude-3-7-sonnet-20250219",
      },
      {
        pattern: ["3-5-sonnet", "sonnet-3.5"],
        fallback: "claude-3-5-sonnet-20241022",
      },
      {
        pattern: ["haiku-4.5", "4-5-haiku", "haiku-4-5"],
        fallback: "claude-haiku-4-5-20251001",
      },
      {
        pattern: ["3-5-haiku", "haiku-3.5"],
        fallback: "claude-3-5-haiku-20241022",
      },
      { pattern: ["haiku", "3-haiku"], fallback: "claude-3-haiku-20240307" },
      { pattern: ["opus"], fallback: "claude-opus-4-20250514" },
      { pattern: ["sonnet"], fallback: "claude-3-5-sonnet-20241022" },
    ];

    for (const { pattern, fallback } of patterns) {
      if (pattern.some((p) => lowerModelId.includes(p))) {
        if (allPricing[fallback]) {
          return allPricing[fallback];
        }
      }
    }

    return (
      allPricing["claude-3-5-sonnet-20241022"] || {
        name: `${modelId} (Unknown Model)`,
        input: 3.0,
        cache_write_5m: 3.75,
        cache_write_1h: 6.0,
        cache_read: 0.3,
        output: 15.0,
      }
    );
  }

  static async calculateCostForEntry(entry: any): Promise<number> {
    const message = entry.message;
    const usage = message?.usage;
    if (!usage) return 0;

    const modelId = this.extractModelId(entry);
    const pricing = await this.getModelPricing(modelId);

    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cache_read;
    const cacheCreationCost =
      (cacheCreationTokens / 1_000_000) * pricing.cache_write_5m;

    return inputCost + outputCost + cacheCreationCost + cacheReadCost;
  }

  static extractModelId(entry: any): string {
    if (entry.model && typeof entry.model === "string") {
      return entry.model;
    }

    const message = entry.message;
    if (message?.model) {
      const model = message.model;
      if (typeof model === "string") {
        return model;
      }
      return model?.id || "claude-3-5-sonnet-20241022";
    }

    if (entry.model_id && typeof entry.model_id === "string") {
      return entry.model_id;
    }

    return "claude-3-5-sonnet-20241022";
  }

  /**
   * Output token estimation ratios by model tier.
   * Based on typical Claude Code conversation patterns:
   * - Haiku: Concise, efficient responses (~30% of input)
   * - Sonnet: Balanced detail (~40% of input)
   * - Opus: Detailed reasoning, longer outputs (~50% of input)
   */
  private static readonly OUTPUT_RATIOS: Record<string, number> = {
    haiku: 0.30,
    sonnet: 0.40,
    opus: 0.50,
    default: 0.35,
  };

  static estimateOutputTokens(inputTokens: number, modelId: string): number {
    const modelLower = modelId.toLowerCase();
    let ratio = this.OUTPUT_RATIOS.default ?? 0.35;

    if (modelLower.includes('haiku')) ratio = this.OUTPUT_RATIOS.haiku ?? 0.30;
    else if (modelLower.includes('sonnet')) ratio = this.OUTPUT_RATIOS.sonnet ?? 0.40;
    else if (modelLower.includes('opus')) ratio = this.OUTPUT_RATIOS.opus ?? 0.50;

    return Math.round(inputTokens * ratio);
  }

  static async calculateDetailedCost(entry: any): Promise<DetailedCostResult> {
    const usage = entry.message?.usage;
    const modelId = this.extractModelId(entry);
    const pricing = await this.getModelPricing(modelId);

    const inputTokens = usage?.input_tokens || 0;
    let outputTokens = usage?.output_tokens ?? 0;
    const cacheCreation = usage?.cache_creation_input_tokens || 0;
    const cacheRead = usage?.cache_read_input_tokens || 0;

    // Estimate output ONLY if output_tokens is missing (not just 0) and entry is assistant type
    let isOutputEstimated = false;
    const isAssistantEntry = entry.type === 'assistant' || entry.message?.role === 'assistant';
    if (usage?.output_tokens === undefined && isAssistantEntry && inputTokens > 0) {
      outputTokens = this.estimateOutputTokens(inputTokens, modelId);
      isOutputEstimated = true;
    }

    const breakdown: CostBreakdown = {
      input: (inputTokens / 1_000_000) * pricing.input,
      output: (outputTokens / 1_000_000) * pricing.output,
      cacheWrite: (cacheCreation / 1_000_000) * pricing.cache_write_5m,
      cacheRead: (cacheRead / 1_000_000) * pricing.cache_read,
      total: 0,
    };
    breakdown.total = breakdown.input + breakdown.output + breakdown.cacheWrite + breakdown.cacheRead;

    return {
      breakdown,
      tokensUsed: { input: inputTokens, output: outputTokens, cacheCreation, cacheRead },
      modelId,
      isOutputEstimated,
    };
  }
}
