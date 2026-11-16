import { stat } from "node:fs/promises";
import { debug } from "../utils/logger";
import {
  parseJsonLine,
  readLinesBackwards,
  type ClaudeHookData,
} from "../utils/claude";

export interface CacheTimerInfo {
  elapsedSeconds: number;
  detectedTtlSeconds?: number;
}

// Claude Code records local slash commands (/model, /cost, ...) and `!` bash
// mode as user entries but answers them in-process without an API request, so
// they do not touch the prompt cache. Prompt commands start with
// <command-message> instead and do reach the model.
const LOCAL_ENTRY_PREFIXES = [
  "<command-name>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<local-command-caveat>",
  "<bash-input>",
  "<bash-stdout>",
  "<bash-stderr>",
];

interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    type?: string;
    content?: string | Array<{ type?: string; text?: string }>;
    usage?: {
      cache_creation?: {
        ephemeral_1h_input_tokens?: number;
        ephemeral_5m_input_tokens?: number;
      };
    };
  };
}

const TTL_SECONDS: Record<string, number> = { "5m": 300, "1h": 3600 };

/**
 * How far back from the transcript's end the fallback reads. Both things it
 * looks for sit in the last few entries; the bound keeps a transcript without
 * them (caching off, a provider that does not report it), or one ending in a
 * huge tool result, from being read whole on every render.
 */
const TAIL_SEARCH_BYTES = 4 * 1024 * 1024;

interface TranscriptTail {
  lastUserTimestamp: number | null;
  ttlSeconds: number | null;
}

export class CacheTimerProvider {
  async getCacheTimerInfo(
    hookData: ClaudeHookData,
  ): Promise<CacheTimerInfo | null> {
    const fromHook = this.fromPromptCache(hookData?.prompt_cache);
    if (fromHook) return fromHook;

    const path = hookData?.transcript_path;
    if (!path) {
      debug("CacheTimer: no transcript_path in hookData");
      return null;
    }

    const tail = await this.readTranscriptTail(path);
    const anchor = tail.lastUserTimestamp ?? (await this.fileMtime(path));
    if (anchor === null) return null;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - anchor) / 1000),
    );
    return {
      elapsedSeconds,
      detectedTtlSeconds: tail.ttlSeconds ?? undefined,
    };
  }

  /**
   * Claude Code's own view of the cache: the lifetime of the cached prefix and
   * when it goes cold. The time since the cache was last refreshed is the part
   * of that lifetime already used. Null when Claude Code has not reported a
   * live cache (before the first response, older versions, caching off).
   */
  private fromPromptCache(
    promptCache: ClaudeHookData["prompt_cache"],
  ): CacheTimerInfo | null {
    const ttlSeconds = promptCache?.ttl
      ? TTL_SECONDS[promptCache.ttl]
      : undefined;
    const expiresAt = promptCache?.expires_at;
    if (ttlSeconds === undefined || typeof expiresAt !== "number") return null;

    const remaining = expiresAt - Date.now() / 1000;
    return {
      elapsedSeconds: Math.max(0, Math.floor(ttlSeconds - remaining)),
      detectedTtlSeconds: ttlSeconds,
    };
  }

  /** What the end of the transcript holds; what was found before a failed read is kept. */
  private async readTranscriptTail(path: string): Promise<TranscriptTail> {
    const tail: TranscriptTail = { lastUserTimestamp: null, ttlSeconds: null };
    try {
      for await (const line of readLinesBackwards(path, TAIL_SEARCH_BYTES)) {
        const entry = parseJsonLine(line) as TranscriptEntry | null;
        if (entry) {
          tail.lastUserTimestamp ??= this.userTimestamp(entry);
          tail.ttlSeconds ??= this.ttlSeconds(entry);
        }
        if (tail.lastUserTimestamp !== null && tail.ttlSeconds !== null) break;
      }
    } catch (error) {
      debug(`CacheTimer: reading ${path} failed: ${String(error)}`);
    }
    return tail;
  }

  private userTimestamp(entry: TranscriptEntry): number | null {
    const messageType =
      entry.type || entry.message?.role || entry.message?.type;
    if (messageType !== "user") return null;
    if (this.isLocalEntry(entry)) return null;
    if (!entry.timestamp) return null;
    const t = Date.parse(entry.timestamp);
    return Number.isNaN(t) ? null : t;
  }

  private isLocalEntry(entry: TranscriptEntry): boolean {
    const content = entry.message?.content;
    // Pasted images precede the command text, which is the last block.
    const last = Array.isArray(content) ? content[content.length - 1] : null;
    const text =
      typeof content === "string"
        ? content
        : last?.type === "text"
          ? last.text
          : undefined;
    if (typeof text !== "string") return false;
    const trimmed = text.trimStart();
    return LOCAL_ENTRY_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  }

  private ttlSeconds(entry: TranscriptEntry): number | null {
    const role = entry.type || entry.message?.role || entry.message?.type;
    if (role !== "assistant") return null;
    const cc = entry.message?.usage?.cache_creation;
    if (!cc) return null;
    if ((cc.ephemeral_1h_input_tokens ?? 0) > 0) return TTL_SECONDS["1h"]!;
    if ((cc.ephemeral_5m_input_tokens ?? 0) > 0) return TTL_SECONDS["5m"]!;
    return null;
  }

  private async fileMtime(path: string): Promise<number | null> {
    try {
      const { mtime } = await stat(path);
      return mtime.getTime();
    } catch (error) {
      debug(`CacheTimer: stat failed for ${path}: ${String(error)}`);
      return null;
    }
  }
}
