import { debug } from "../utils/logger";
import { CacheManager } from "../utils/cache";
import { calculateBudgetPercentage } from "../utils/budget";

export interface ProxyBudgetInfo {
  spend: number;
  budget: number;
  percentage: number;
  resetAt: Date | null;
}

interface ProxyBudgetPresetDef {
  endpoint: string;
  spendPath: string;
  budgetPath: string;
  resetAtPath: string;
  authScheme: "bearer" | "x-api-key";
}

// To add a new preset: add a single entry to this object. The type, the
// runtime validator, and the test matrix all derive from the keys here.
export const PROXY_BUDGET_PRESETS = {
  litellm: {
    endpoint: "${baseUrl}/key/info",
    spendPath: "info.spend",
    budgetPath: "info.max_budget",
    resetAtPath: "info.budget_reset_at",
    authScheme: "bearer",
  },
  openrouter: {
    endpoint: "${baseUrl}/api/v1/key",
    spendPath: "data.usage",
    budgetPath: "data.limit",
    resetAtPath: "data.limit_reset",
    authScheme: "bearer",
  },
} as const satisfies Record<string, ProxyBudgetPresetDef>;

export type ProxyBudgetPreset = keyof typeof PROXY_BUDGET_PRESETS;

export function isProxyBudgetPreset(value: string): value is ProxyBudgetPreset {
  return Object.prototype.hasOwnProperty.call(PROXY_BUDGET_PRESETS, value);
}

export interface ProxyBudgetProviderConfig {
  preset?: ProxyBudgetPreset;
  endpoint?: string;
  baseUrlEnv?: string;
  tokenEnv?: string;
  authScheme?: "bearer" | "x-api-key";
  spendPath?: string;
  budgetPath?: string;
  resetAtPath?: string;
  cacheTtlSec?: number;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL_ENV = "ANTHROPIC_BASE_URL";
const DEFAULT_TOKEN_ENV = "ANTHROPIC_AUTH_TOKEN";
const DEFAULT_CACHE_TTL_SEC = 60;
const DEFAULT_TIMEOUT_MS = 3000;
const STALE_FALLBACK_MULTIPLIER = 10;
const SANITY_BUDGET_MULTIPLIER = 2;
const CACHE_NAME = "proxyBudget";

function pickPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc &&
        typeof acc === "object" &&
        key in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export class ProxyBudgetProvider {
  async getProxyBudgetInfo(
    config: ProxyBudgetProviderConfig = {},
  ): Promise<ProxyBudgetInfo | null> {
    const baseUrlEnv = config.baseUrlEnv ?? DEFAULT_BASE_URL_ENV;
    const tokenEnv = config.tokenEnv ?? DEFAULT_TOKEN_ENV;
    const baseUrl = process.env[baseUrlEnv];
    const token = process.env[tokenEnv];

    if (!token) {
      debug(`ProxyBudget: env var ${tokenEnv} not set, segment disabled`);
      return null;
    }

    const preset = config.preset
      ? PROXY_BUDGET_PRESETS[config.preset]
      : PROXY_BUDGET_PRESETS.litellm;
    const endpointTemplate = config.endpoint ?? preset.endpoint;
    const endpoint = this.resolveEndpoint(endpointTemplate, baseUrl);
    if (!endpoint) {
      debug(
        `ProxyBudget: cannot resolve endpoint (${baseUrlEnv} unset and endpoint not absolute)`,
      );
      return null;
    }

    const ttlSec = config.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC;

    const fresh = (await CacheManager.getTtlCache(
      CACHE_NAME,
      ttlSec,
    )) as ProxyBudgetInfo | null;
    if (fresh) {
      return this.rehydrate(fresh);
    }

    const fetched = await this.fetchBudget(endpoint, token, config);
    if (fetched) {
      await CacheManager.setTtlCache(CACHE_NAME, fetched);
      return fetched;
    }

    const stale = (await CacheManager.getTtlCache(
      CACHE_NAME,
      ttlSec * STALE_FALLBACK_MULTIPLIER,
    )) as ProxyBudgetInfo | null;
    if (stale) {
      debug(`ProxyBudget: serving stale cache after fetch failure`);
      return this.rehydrate(stale);
    }

    return null;
  }

  private resolveEndpoint(
    template: string,
    baseUrl: string | undefined,
  ): string | null {
    if (template.includes("${baseUrl}")) {
      if (!baseUrl) return null;
      return template.replace("${baseUrl}", baseUrl.replace(/\/+$/, ""));
    }
    return template;
  }

  private async fetchBudget(
    endpoint: string,
    token: string,
    config: ProxyBudgetProviderConfig,
  ): Promise<ProxyBudgetInfo | null> {
    const preset = config.preset
      ? PROXY_BUDGET_PRESETS[config.preset]
      : PROXY_BUDGET_PRESETS.litellm;
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const authScheme = config.authScheme ?? preset.authScheme;
    const spendPath = config.spendPath ?? preset.spendPath;
    const budgetPath = config.budgetPath ?? preset.budgetPath;
    const resetAtPath = config.resetAtPath ?? preset.resetAtPath;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "claude-powerline",
    };
    if (authScheme === "bearer") {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["x-api-key"] = token;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        debug(`ProxyBudget: HTTP ${response.status} from ${endpoint}`);
        return null;
      }

      const body: unknown = await response.json();
      const spend = parseNumber(pickPath(body, spendPath));
      const budget = parseNumber(pickPath(body, budgetPath));
      const resetAt = parseDate(pickPath(body, resetAtPath));

      if (spend === null || budget === null) {
        debug(
          `ProxyBudget: missing field (spend=${spend}, budget=${budget}); paths used: ${spendPath} / ${budgetPath}`,
        );
        return null;
      }
      if (budget <= 0) {
        debug(`ProxyBudget: non-positive budget (${budget}); ignoring`);
        return null;
      }
      if (spend > budget * SANITY_BUDGET_MULTIPLIER) {
        debug(
          `ProxyBudget: spend (${spend}) far exceeds budget (${budget}); likely misconfigured spendPath`,
        );
        return null;
      }

      const percentage = calculateBudgetPercentage(spend, budget);
      if (percentage === null) {
        return null;
      }
      return {
        spend,
        budget,
        percentage,
        resetAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debug(`ProxyBudget: fetch failed for ${endpoint}: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private rehydrate(info: ProxyBudgetInfo): ProxyBudgetInfo {
    return {
      ...info,
      resetAt: info.resetAt ? new Date(info.resetAt) : null,
    };
  }
}
