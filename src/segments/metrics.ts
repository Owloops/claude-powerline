import { readFile } from "node:fs/promises";
import { debug } from "../utils/logger";
import { PricingService } from "./pricing";
import { findTranscriptFile } from "../utils/claude";

export interface MetricsInfo {
  responseTime: number | null;
  lastResponseTime: number | null;
  sessionDuration: number | null;
  messageCount: number | null;
  costBurnRate: number | null;
  tokenBurnRate: number | null;
}

interface TranscriptEntry {
  timestamp: string;
  type?: string;
  message?: {
    role?: string;
    type?: string;
    content?: Array<{
      type?: string;
      [key: string]: any;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  costUSD?: number;
  isSidechain?: boolean;
}

export class MetricsProvider {
  private async loadTranscriptEntries(
    sessionId: string
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

  private calculateResponseTimes(entries: TranscriptEntry[]): {
    average: number | null;
    last: number | null;
  } {
    const userMessages: Date[] = [];
    const assistantMessages: Date[] = [];
    let lastUserMessageIndex = -1;
    let lastUserMessageTime: Date | null = null;
    let lastResponseEndTime: Date | null = null;
    let lastResponseEndIndex = -1;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || !entry.timestamp) continue;

      try {
        const timestamp = new Date(entry.timestamp);
        const messageType =
          entry.type || entry.message?.role || entry.message?.type;

        const isToolResult =
          entry.type === "user" &&
          entry.message?.content?.[0]?.type === "tool_result";

        const isRealUserMessage = messageType === "user" && !isToolResult;

        if (isRealUserMessage) {
          userMessages.push(timestamp);
          lastUserMessageTime = timestamp;
          lastUserMessageIndex = i;
          lastResponseEndTime = null;
          lastResponseEndIndex = -1;
          debug(
            `Found user message at index ${i}, timestamp ${timestamp.toISOString()}`
          );
        } else if (lastUserMessageIndex >= 0) {
          const isPartOfResponse =
            messageType === "assistant" ||
            isToolResult ||
            messageType === "system" ||
            entry.message?.usage;

          if (isPartOfResponse) {
            lastResponseEndTime = timestamp;
            lastResponseEndIndex = i;

            if (messageType === "assistant" || entry.message?.usage) {
              assistantMessages.push(timestamp);
              debug(
                `Found assistant message at index ${i}, timestamp ${timestamp.toISOString()}`
              );
            } else if (isToolResult) {
              debug(
                `Found tool result at index ${i}, timestamp ${timestamp.toISOString()}`
              );
            } else {
              debug(
                `Found ${messageType} message at index ${i}, timestamp ${timestamp.toISOString()}`
              );
            }
          }
        }
      } catch {
        continue;
      }
    }

    if (userMessages.length === 0 || assistantMessages.length === 0) {
      return { average: null, last: null };
    }

    const responseTimes: number[] = [];

    for (const assistantTime of assistantMessages) {
      const priorUsers = userMessages.filter(
        (userTime) => userTime < assistantTime
      );

      if (priorUsers.length > 0) {
        const userTime = new Date(
          Math.max(...priorUsers.map((d) => d.getTime()))
        );
        const responseTime =
          (assistantTime.getTime() - userTime.getTime()) / 1000;

        if (responseTime > 0.1 && responseTime < 300) {
          responseTimes.push(responseTime);
          debug(`Valid response time: ${responseTime.toFixed(1)}s`);
        } else {
          debug(
            `Rejected response time: ${responseTime.toFixed(1)}s (outside 0.1s-5m range)`
          );
        }
      }
    }

    let lastResponseTime: number | null = null;
    if (
      lastUserMessageTime &&
      lastResponseEndTime &&
      lastResponseEndIndex > lastUserMessageIndex
    ) {
      const timeDiff =
        lastResponseEndTime.getTime() - lastUserMessageTime.getTime();
      const positionDiff = lastResponseEndIndex - lastUserMessageIndex;

      if (timeDiff === 0 && positionDiff > 0) {
        lastResponseTime = positionDiff * 0.1;
        debug(
          `Estimated last response time from position difference: ${lastResponseTime.toFixed(2)}s (${positionDiff} messages)`
        );
      } else if (timeDiff > 0) {
        lastResponseTime = timeDiff / 1000;
        debug(
          `Last response time from timestamps: ${lastResponseTime.toFixed(2)}s`
        );
      }

      debug(
        `Last user message at index ${lastUserMessageIndex}, timestamp ${lastUserMessageTime.toISOString()}`
      );
      debug(
        `Last response end at index ${lastResponseEndIndex}, timestamp ${lastResponseEndTime.toISOString()}`
      );
    }

    if (responseTimes.length === 0 && lastResponseTime === null) {
      return { average: null, last: null };
    }

    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) /
          responseTimes.length
        : null;

    debug(
      `Calculated average response time: ${avgResponseTime?.toFixed(2) || "null"}s from ${responseTimes.length} measurements`
    );
    debug(`Last response time: ${lastResponseTime?.toFixed(2) || "null"}s`);

    return { average: avgResponseTime, last: lastResponseTime };
  }

  private calculateSessionDuration(entries: TranscriptEntry[]): number | null {
    const timestamps: Date[] = [];

    for (const entry of entries) {
      if (!entry.timestamp) continue;

      try {
        timestamps.push(new Date(entry.timestamp));
      } catch {
        continue;
      }
    }

    if (timestamps.length < 2) {
      return null;
    }

    timestamps.sort((a, b) => a.getTime() - b.getTime());

    const lastTimestamp = timestamps[timestamps.length - 1];
    const firstTimestamp = timestamps[0];

    if (!lastTimestamp || !firstTimestamp) {
      return null;
    }

    const duration =
      (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000;
    return duration > 0 ? duration : null;
  }

  private calculateBurnRateDuration(entries: TranscriptEntry[]): number | null {
    if (entries.length === 0) return null;

    const now = new Date();
    const timestamps = entries
      .map((entry) => entry.timestamp)
      .filter(Boolean)
      .map((ts) => new Date(ts))
      .filter((ts) => now.getTime() - ts.getTime() < 2 * 60 * 60 * 1000)
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length === 0) return null;

    const sessionStart = timestamps[0];
    if (!sessionStart) return null;

    const durationFromStart = Math.max(
      (now.getTime() - sessionStart.getTime()) / 1000,
      30 * 60
    );

    return durationFromStart;
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

  private async calculateTotalCost(
    entries: TranscriptEntry[]
  ): Promise<number> {
    let total = 0;
    const processedEntries = new Set<string>();

    for (const entry of entries) {
      const entryKey = `${entry.timestamp}-${JSON.stringify(entry.message?.usage || {})}`;

      if (processedEntries.has(entryKey)) {
        debug(`Skipping duplicate entry at ${entry.timestamp}`);
        continue;
      }
      processedEntries.add(entryKey);

      if (typeof entry.costUSD === "number") {
        total += entry.costUSD;
      } else if (entry.message?.usage) {
        const cost = await PricingService.calculateCostForEntry(entry);
        total += cost;
      }
    }

    return Math.round(total * 10000) / 10000;
  }

  private calculateTotalTokens(entries: TranscriptEntry[]): number {
    const processedEntries = new Set<string>();

    return entries.reduce((total, entry) => {
      const usage = entry.message?.usage;
      if (!usage) return total;

      const entryKey = `${entry.timestamp}-${JSON.stringify(usage)}`;

      if (processedEntries.has(entryKey)) {
        debug(`Skipping duplicate token entry at ${entry.timestamp}`);
        return total;
      }
      processedEntries.add(entryKey);

      return (
        total +
        (usage.input_tokens || 0) +
        (usage.output_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0)
      );
    }, 0);
  }

  async getMetricsInfo(sessionId: string): Promise<MetricsInfo> {
    try {
      debug(`Starting metrics calculation for session: ${sessionId}`);

      const entries = await this.loadTranscriptEntries(sessionId);

      if (entries.length === 0) {
        return {
          responseTime: null,
          lastResponseTime: null,
          sessionDuration: null,
          messageCount: null,
          costBurnRate: null,
          tokenBurnRate: null,
        };
      }

      const responseTimes = this.calculateResponseTimes(entries);
      const sessionDuration = this.calculateSessionDuration(entries);
      const messageCount = this.calculateMessageCount(entries);

      let costBurnRate: number | null = null;
      let tokenBurnRate: number | null = null;

      const burnRateDuration = this.calculateBurnRateDuration(entries);
      if (burnRateDuration && burnRateDuration > 60) {
        const hoursElapsed = burnRateDuration / 3600;

        if (hoursElapsed <= 0) {
          debug(`Invalid hours elapsed: ${hoursElapsed}`);
        } else {
          const totalCost = await this.calculateTotalCost(entries);
          const totalTokens = this.calculateTotalTokens(entries);

          if (totalCost > 0) {
            costBurnRate = Math.round((totalCost / hoursElapsed) * 100) / 100;
            debug(
              `Cost burn rate: $${costBurnRate}/h (total: $${totalCost}, duration: ${hoursElapsed}h)`
            );
          }

          if (totalTokens > 0) {
            tokenBurnRate = Math.round(totalTokens / hoursElapsed);
            debug(
              `Token burn rate: ${tokenBurnRate}/h (total: ${totalTokens}, duration: ${hoursElapsed}h)`
            );
          }
        }
      }

      debug(
        `Metrics calculated: avgResponseTime=${responseTimes.average?.toFixed(2) || "null"}s, lastResponseTime=${responseTimes.last?.toFixed(2) || "null"}s, sessionDuration=${sessionDuration?.toFixed(0) || "null"}s, messageCount=${messageCount}`
      );

      return {
        responseTime: responseTimes.average,
        lastResponseTime: responseTimes.last,
        sessionDuration,
        messageCount,
        costBurnRate,
        tokenBurnRate,
      };
    } catch (error) {
      debug(`Error calculating metrics for session ${sessionId}:`, error);
      return {
        responseTime: null,
        lastResponseTime: null,
        sessionDuration: null,
        messageCount: null,
        costBurnRate: null,
        tokenBurnRate: null,
      };
    }
  }
}
