import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "./defaults";
import type { ColorTheme } from "../themes";
import type {
  SegmentConfig,
  DirectorySegmentConfig,
  GitSegmentConfig,
  UsageSegmentConfig,
  TmuxSegmentConfig,
  ContextSegmentConfig,
  MetricsSegmentConfig,
  BlockSegmentConfig,
  TodaySegmentConfig,
} from "../segments/renderer";

export interface LineConfig {
  segments: {
    directory?: DirectorySegmentConfig;
    git?: GitSegmentConfig;
    model?: SegmentConfig;
    session?: UsageSegmentConfig;
    block?: BlockSegmentConfig;
    today?: TodaySegmentConfig;
    tmux?: TmuxSegmentConfig;
    context?: ContextSegmentConfig;
    metrics?: MetricsSegmentConfig;
  };
}

export interface DisplayConfig {
  lines: LineConfig[];
  style?: "minimal" | "powerline";
}

export interface BudgetItemConfig {
  amount?: number;
  warningThreshold?: number;
}

export interface BudgetConfig {
  session?: BudgetItemConfig;
  today?: BudgetItemConfig;
}

export interface PowerlineConfig {
  theme: "light" | "dark" | "nord" | "tokyo-night" | "rose-pine" | "custom";
  display: DisplayConfig;
  colors?: {
    custom: ColorTheme;
  };
  budget?: BudgetConfig;
  usageType?: "cost" | "tokens" | "both" | "breakdown";
}

function isValidTheme(theme: string): theme is PowerlineConfig["theme"] {
  return [
    "light",
    "dark",
    "nord",
    "tokyo-night",
    "rose-pine",
    "custom",
  ].includes(theme);
}

function isValidStyle(style: string): style is "minimal" | "powerline" {
  return style === "minimal" || style === "powerline";
}

function isValidUsageType(
  usageType: string
): usageType is "cost" | "tokens" | "both" | "breakdown" {
  return ["cost", "tokens", "both", "breakdown"].includes(usageType);
}

function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue)
      ) {
        const targetValue = result[key] || {};
        result[key] = deepMerge(
          targetValue as Record<string, any>,
          sourceValue as Record<string, any>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

function findConfigFile(
  customPath?: string,
  projectDir?: string
): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? customPath : null;
  }

  const locations = [
    ...(projectDir ? [path.join(projectDir, ".claude-powerline.json")] : []),
    path.join(process.cwd(), ".claude-powerline.json"),
    path.join(os.homedir(), ".claude", "claude-powerline.json"),
    path.join(os.homedir(), ".config", "claude-powerline", "config.json"),
  ];

  return locations.find(fs.existsSync) || null;
}

function loadConfigFile(filePath: string): Partial<PowerlineConfig> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load config file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function loadEnvConfig(): Partial<PowerlineConfig> {
  const config: Partial<PowerlineConfig> = {};
  const display: Partial<DisplayConfig> = {};

  const theme = process.env.CLAUDE_POWERLINE_THEME;
  if (theme && isValidTheme(theme)) {
    config.theme = theme;
  }

  const style = process.env.CLAUDE_POWERLINE_STYLE;
  if (style) {
    if (isValidStyle(style)) {
      display.style = style;
    } else {
      console.warn(
        `Invalid display style '${style}' from environment variable, falling back to 'minimal'`
      );
      display.style = "minimal";
    }
  }

  const usageType = process.env.CLAUDE_POWERLINE_USAGE_TYPE;
  if (usageType && isValidUsageType(usageType)) {
    config.usageType = usageType;
  }

  const sessionBudgetStr = process.env.CLAUDE_POWERLINE_SESSION_BUDGET;
  if (sessionBudgetStr) {
    const sessionBudget = parseFloat(sessionBudgetStr);
    if (!isNaN(sessionBudget) && sessionBudget > 0) {
      config.budget = {
        session: {
          ...DEFAULT_CONFIG.budget?.session,
          amount: sessionBudget,
        },
      };
    }
  }

  if (Object.keys(display).length > 0) {
    config.display = display as DisplayConfig;
  }

  return config;
}

function getConfigPathFromEnv(): string | undefined {
  return process.env.CLAUDE_POWERLINE_CONFIG;
}

function parseCLIOverrides(args: string[]): Partial<PowerlineConfig> {
  const config: Partial<PowerlineConfig> = {};
  const display: Partial<DisplayConfig> = {};

  const theme = args.find((arg) => arg.startsWith("--theme="))?.split("=")[1];
  if (theme && isValidTheme(theme)) {
    config.theme = theme;
  }

  const style = args.find((arg) => arg.startsWith("--style="))?.split("=")[1];
  if (style) {
    if (isValidStyle(style)) {
      display.style = style;
    } else {
      console.warn(
        `Invalid display style '${style}' from CLI argument, falling back to 'minimal'`
      );
      display.style = "minimal";
    }
  }

  const usageType = args
    .find((arg) => arg.startsWith("--usage="))
    ?.split("=")[1];
  if (usageType && isValidUsageType(usageType)) {
    config.usageType = usageType;
  }

  const sessionBudgetStr = args
    .find((arg) => arg.startsWith("--session-budget="))
    ?.split("=")[1];
  if (sessionBudgetStr) {
    const sessionBudget = parseFloat(sessionBudgetStr);
    if (!isNaN(sessionBudget) && sessionBudget > 0) {
      config.budget = {
        session: {
          ...DEFAULT_CONFIG.budget?.session,
          amount: sessionBudget,
        },
      };
    }
  }

  if (Object.keys(display).length > 0) {
    config.display = display as DisplayConfig;
  }

  return config;
}

export function loadConfig(
  args: string[] = process.argv,
  projectDir?: string
): PowerlineConfig {
  let config: PowerlineConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  const configPath =
    args.find((arg) => arg.startsWith("--config="))?.split("=")[1] ||
    getConfigPathFromEnv();

  const configFile = findConfigFile(configPath, projectDir);
  if (configFile) {
    try {
      const fileConfig = loadConfigFile(configFile);
      config = deepMerge(config, fileConfig);
    } catch (err) {
      console.warn(
        `Warning: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (config.display?.style && !isValidStyle(config.display.style)) {
    console.warn(
      `Invalid display style '${config.display.style}' in config file, falling back to 'minimal'`
    );
    config.display.style = "minimal";
  }

  if (config.theme && !isValidTheme(config.theme)) {
    console.warn(
      `Invalid theme '${config.theme}' in config file, falling back to 'dark'`
    );
    config.theme = "dark";
  }

  const envConfig = loadEnvConfig();
  config = deepMerge(config, envConfig);

  const cliOverrides = parseCLIOverrides(args);
  config = deepMerge(config, cliOverrides);

  return config;
}

export const loadConfigFromCLI = loadConfig;
