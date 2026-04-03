import type { ClaudeHookData } from "../utils/claude";

import { readFile } from "node:fs/promises";
import { debug } from "../utils/logger";
import { findTranscriptFile } from "../utils/claude";

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
    content?: Array<{
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
}

export class MetricsProvider {
  private async loadTranscriptEntries(
    sessionId: string,
  ): Promise<TranscriptEntry[]> {
    try {
      const transcriptPath = await findTranscriptFile(sessionId);
      if (!transcriptPath) {
        debug(`No transcript found for session: ${sessionId}`);
        return [];
      }

      debug(`Loading transcript from: ${transcriptPath}`);

      const content = await readFile(transcriptPath, "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      const entries: TranscriptEntry[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as TranscriptEntry;

          if (entry.isSidechain === true) {
            continue;
          }

          entries.push(entry);
        } catch (parseError) {
          debug(`Failed to parse JSONL line: ${parseError}`);
          continue;
        }
      }

      debug(`Loaded ${entries.length} transcript entries`);
      return entries;
    } catch (error) {
      debug(`Error loading transcript for ${sessionId}:`, error);
      return [];
    }
  }

  private calculateMessageCount(entries: TranscriptEntry[]): number {
    return entries.filter((entry) => {
      const messageType =
        entry.type || entry.message?.role || entry.message?.type;
      const isToolResult =
        entry.type === "user" &&
        entry.message?.content?.[0]?.type === "tool_result";
      return messageType === "user" && !isToolResult;
    }).length;
  }

  private calculateLastResponseTime(entries: TranscriptEntry[]): number | null {
    if (entries.length === 0) return null;

    const recentEntries = entries.slice(-20);

    let lastUserTime: Date | null = null;
    let bestResponseTime: number | null = null;

    for (const entry of recentEntries) {
      if (!entry.timestamp) continue;

      try {
        const timestamp = new Date(entry.timestamp);
        const messageType =
          entry.type || entry.message?.role || entry.message?.type;

        const isToolResult =
          entry.type === "user" &&
          entry.message?.content?.[0]?.type === "tool_result";
        const isRealUserMessage = messageType === "user" && !isToolResult;

        if (isRealUserMessage) {
          lastUserTime = timestamp;
        } else if (messageType === "assistant" && lastUserTime) {
          const responseTime =
            (timestamp.getTime() - lastUserTime.getTime()) / 1000;
          if (responseTime > 0.1 && responseTime < 300) {
            bestResponseTime = responseTime;
          }
        }
      } catch {
        continue;
      }
    }

    return bestResponseTime;
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

      const entries = await this.loadTranscriptEntries(sessionId);
      const messageCount = this.calculateMessageCount(entries);
      const lastResponseTime = this.calculateLastResponseTime(entries);

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
