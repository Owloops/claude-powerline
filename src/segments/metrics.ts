import type { ClaudeHookData } from "../utils/claude";

import { debug } from "../utils/logger";
import { findTranscriptFile, parseJsonLine } from "../utils/claude";
import { readIncrementally } from "../utils/incremental";

export interface MetricsInfo {
  responseTime: number | null;
  lastResponseTime: number | null;
  sessionDuration: number | null;
  messageCount: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
}

interface TranscriptEntry {
  timestamp: string;
  type?: string;
  message?: {
    role?: string;
    type?: string;
    content?:
      | string
      | Array<{
          type?: string;
          [key: string]: unknown;
        }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  isSidechain?: boolean;
  isMeta?: boolean;
}

/**
 * Whether an entry is a prompt the user sent. Claude Code also writes user
 * entries for tool results, for text it injects (isMeta: a slash command's
 * expanded prompt, hook context) and for the output of local commands such
 * as /model, none of which the user typed.
 */
function isUserPrompt(entry: TranscriptEntry): boolean {
  const messageType = entry.type || entry.message?.role || entry.message?.type;
  if (messageType !== "user" || entry.isMeta === true) return false;

  const content = entry.message?.content;
  if (typeof content === "string") {
    return !/^<(local-command|bash)-(stdout|stderr)>/.test(content);
  }
  return content?.[0]?.type !== "tool_result";
}

/** Main-conversation entries; a line that does not parse is not one. */
function parseEntry(line: string): TranscriptEntry | null {
  const entry = parseJsonLine(line) as TranscriptEntry | null;
  return entry?.isSidechain === true ? null : entry;
}

/**
 * What the last response time needs of an entry: when it was written, and
 * whether it is a prompt or a reply. Null `at` is an entry without a usable
 * timestamp, which still takes a place among the recent entries.
 */
interface RecentEntry {
  at: number | null;
  kind: "prompt" | "reply" | "other";
}

function toRecentEntry(entry: TranscriptEntry): RecentEntry {
  const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
  const messageType = entry.type || entry.message?.role || entry.message?.type;
  return {
    at: Number.isNaN(parsed) ? null : parsed,
    kind: isUserPrompt(entry)
      ? "prompt"
      : messageType === "assistant"
        ? "reply"
        : "other",
  };
}

/** How many entries back the last response time looks. */
const RECENT_ENTRIES = 20;

/** Changed when the saved shape changes, so an older cache reads as a miss. */
const STATE_KEY = "metrics-v1";

interface TranscriptMetrics {
  /** Prompts the user sent. */
  prompts: number;
  /** The last RECENT_ENTRIES entries, in file order. */
  recent: RecentEntry[];
}

/** Adds one transcript line to `metrics` in place. */
function addLine(metrics: TranscriptMetrics, line: string): void {
  const entry = parseEntry(line);
  if (!entry) return;
  const recent = toRecentEntry(entry);
  if (recent.kind === "prompt") metrics.prompts++;
  metrics.recent.push(recent);
  if (metrics.recent.length > RECENT_ENTRIES) metrics.recent.shift();
}

function lastResponseTime(recent: RecentEntry[]): number | null {
  let lastPromptAt: number | null = null;
  let best: number | null = null;

  for (const entry of recent) {
    if (entry.at === null) continue;
    if (entry.kind === "prompt") {
      lastPromptAt = entry.at;
    } else if (entry.kind === "reply" && lastPromptAt !== null) {
      const seconds = (entry.at - lastPromptAt) / 1000;
      if (seconds > 0.1 && seconds < 300) best = seconds;
    }
  }

  return best;
}

export class MetricsProvider {
  /**
   * The session's prompt count and recent entries. Only what was appended
   * since the last render is read: what the lines before it gave is cached per
   * session.
   */
  private async readMetrics(
    sessionId: string,
  ): Promise<{ messageCount: number; lastResponseTime: number | null }> {
    try {
      const transcriptPath = await findTranscriptFile(sessionId);
      if (!transcriptPath) {
        debug(`No transcript found for session: ${sessionId}`);
        return { messageCount: 0, lastResponseTime: null };
      }

      // Only what was appended since the last render is read.
      const metrics = await readIncrementally<TranscriptMetrics>(
        {
          name: `metrics-${sessionId}`,
          key: STATE_KEY,
          empty: () => ({ prompts: 0, recent: [] }),
          save: (state) => state,
          load: (saved) => saved as TranscriptMetrics,
          addLine,
        },
        [transcriptPath],
      );
      return {
        messageCount: metrics.prompts,
        lastResponseTime: lastResponseTime(metrics.recent),
      };
    } catch (error) {
      debug(`Error reading transcript for ${sessionId}:`, error);
      return { messageCount: 0, lastResponseTime: null };
    }
  }

  async getMetricsInfo(
    sessionId: string,
    hookData: ClaudeHookData,
  ): Promise<MetricsInfo> {
    try {
      debug(`Getting metrics from hook data for session: ${sessionId}`);

      if (!hookData.cost) {
        debug(`No cost data available in hook data`);
        return {
          responseTime: null,
          lastResponseTime: null,
          sessionDuration: null,
          messageCount: null,
          linesAdded: null,
          linesRemoved: null,
        };
      }

      const { messageCount, lastResponseTime } =
        await this.readMetrics(sessionId);

      return {
        responseTime: hookData.cost.total_api_duration_ms / 1000,
        lastResponseTime,
        sessionDuration: hookData.cost.total_duration_ms / 1000,
        messageCount,
        linesAdded: hookData.cost.total_lines_added,
        linesRemoved: hookData.cost.total_lines_removed,
      };
    } catch (error) {
      debug(
        `Error getting metrics from hook data for session ${sessionId}:`,
        error,
      );
      return {
        responseTime: null,
        lastResponseTime: null,
        sessionDuration: null,
        messageCount: null,
        linesAdded: null,
        linesRemoved: null,
      };
    }
  }
}
