import { debug } from "../utils/logger";
import { priceTotals, readTranscriptTotals } from "./transcript-totals";
import {
  findTranscriptFile,
  findAgentTranscripts,
  type ClaudeHookData,
} from "../utils/claude";
import { dirname } from "node:path";

export interface SessionUsage {
  totalCost: number;
  /** Usage entries counted, after deduplication. */
  entryCount: number;
  tokenBreakdown: TokenBreakdown;
}

/**
 * Totals states save sums of these: a change here needs STATE_VERSION in
 * transcript-totals.ts bumped.
 */
export interface TokenBreakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface SessionInfo {
  cost: number | null;
  calculatedCost: number | null;
  officialCost: number | null;
  tokens: number | null;
  tokenBreakdown: TokenBreakdown | null;
}

export interface UsageInfo {
  session: SessionInfo;
}

export class SessionProvider {
  async getSessionUsage(sessionId: string): Promise<SessionUsage | null> {
    try {
      const transcriptPath = await findTranscriptFile(sessionId);
      if (!transcriptPath) {
        debug(`No transcript found for session: ${sessionId}`);
        return null;
      }

      debug(`Found transcript at: ${transcriptPath}`);

      const agentTranscripts = await findAgentTranscripts(
        sessionId,
        dirname(transcriptPath),
      );

      debug(`Found ${agentTranscripts.length} agent transcripts for session`);

      const totals = await readTranscriptTotals(`session-${sessionId}`, [
        transcriptPath,
        ...agentTranscripts,
      ]);
      const totalCost = await priceTotals(totals);

      debug(
        `Counted ${totals.entries} usage entries, total cost: $${totalCost.toFixed(4)}`,
      );
      return {
        totalCost,
        entryCount: totals.entries,
        tokenBreakdown: totals.tokens,
      };
    } catch (error) {
      debug(`Error reading session usage for ${sessionId}:`, error);
      return null;
    }
  }

  async getSessionInfo(
    sessionId: string,
    hookData?: ClaudeHookData,
  ): Promise<SessionInfo> {
    const sessionUsage = await this.getSessionUsage(sessionId);

    if (!sessionUsage || sessionUsage.entryCount === 0) {
      return {
        cost: null,
        calculatedCost: null,
        officialCost: null,
        tokens: null,
        tokenBreakdown: null,
      };
    }

    const { tokenBreakdown } = sessionUsage;
    const totalTokens =
      tokenBreakdown.input +
      tokenBreakdown.output +
      tokenBreakdown.cacheCreation +
      tokenBreakdown.cacheRead;

    const calculatedCost = sessionUsage.totalCost;
    const hookDataCost = hookData?.cost?.total_cost_usd ?? null;
    const cost = calculatedCost ?? hookDataCost;

    return {
      cost,
      calculatedCost,
      officialCost: hookDataCost,
      tokens: totalTokens,
      tokenBreakdown,
    };
  }
}

export class UsageProvider {
  private sessionProvider = new SessionProvider();

  async getUsageInfo(
    sessionId: string,
    hookData?: ClaudeHookData,
  ): Promise<UsageInfo> {
    try {
      debug(`Starting usage info retrieval for session: ${sessionId}`);

      const sessionInfo = await this.sessionProvider.getSessionInfo(
        sessionId,
        hookData,
      );

      return {
        session: sessionInfo,
      };
    } catch (error) {
      debug(`Error getting usage info for session ${sessionId}:`, error);
      return {
        session: {
          cost: null,
          calculatedCost: null,
          officialCost: null,
          tokens: null,
          tokenBreakdown: null,
        },
      };
    }
  }
}
