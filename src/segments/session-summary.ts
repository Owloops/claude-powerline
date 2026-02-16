import { readFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  getClaudePaths,
  findProjectPaths,
  findTranscriptFile,
  type ClaudeHookData,
} from "../utils/claude";

export interface SessionSummaryInfo {
  name: string;
  sessionId: string;
}

interface SessionIndexEntry {
  sessionId: string;
  summary?: string;
  firstPrompt?: string;
}

export class SessionSummaryProvider {
  async getSessionSummaryInfo(hookData: ClaudeHookData): Promise<SessionSummaryInfo | null> {
    const sessionId = hookData.session_id;
    if (!sessionId) return null;

    try {
      const customTitle = await this.findCustomTitleInTranscript(sessionId);
      if (customTitle) return { name: customTitle, sessionId };

      const name = await this.findInSessionsIndex(sessionId);
      if (name) return { name, sessionId };

      const firstPrompt = await this.findFirstPromptInTranscript(sessionId);
      if (firstPrompt) return { name: firstPrompt, sessionId };
    } catch {
      // silently fail
    }

    return null;
  }

  private async findInSessionsIndex(sessionId: string): Promise<string | null> {
    const claudePaths = getClaudePaths();
    const projectPaths = await findProjectPaths(claudePaths);

    for (const projectPath of projectPaths) {
      const indexPath = join(projectPath, "sessions-index.json");
      if (!existsSync(indexPath)) continue;

      try {
        const content = await readFile(indexPath, "utf-8");
        const parsed = JSON.parse(content);
        const entries: SessionIndexEntry[] = Array.isArray(parsed)
          ? parsed
          : parsed.entries ?? [];

        const match = entries.find((e) => e.sessionId === sessionId);
        if (match?.summary) return match.summary;
        if (match?.firstPrompt) return match.firstPrompt;
      } catch {
        // skip unparseable index
      }
    }

    return null;
  }

  private async findCustomTitleInTranscript(sessionId: string): Promise<string | null> {
    const transcriptPath = await findTranscriptFile(sessionId);
    if (!transcriptPath) return null;

    try {
      const content = await readFile(transcriptPath, "utf-8");
      let lastTitle: string | null = null;

      for (const line of content.split("\n")) {
        if (!line.includes('"custom-title"')) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === "custom-title" && entry.customTitle) {
            lastTitle = entry.customTitle;
          }
        } catch {
          // skip
        }
      }

      return lastTitle;
    } catch {
      return null;
    }
  }

  private async findFirstPromptInTranscript(sessionId: string): Promise<string | null> {
    const transcriptPath = await findTranscriptFile(sessionId);
    if (!transcriptPath) return null;

    try {
      return await this.readFirstUserMessage(transcriptPath);
    } catch {
      return null;
    }
  }

  private readFirstUserMessage(filePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const stream = createReadStream(filePath, { encoding: "utf8" });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      let linesRead = 0;
      const maxLines = 30;
      let resolved = false;

      const done = (value: string | null) => {
        if (resolved) return;
        resolved = true;
        rl.close();
        stream.destroy();
        resolve(value);
      };

      rl.on("line", (line) => {
        if (resolved) return;
        linesRead++;
        if (linesRead > maxLines) {
          done(null);
          return;
        }

        try {
          const entry = JSON.parse(line);
          if (entry.type === "user" && entry.message?.role === "user") {
            const text = this.extractUserText(entry.message.content);
            if (text && text.length > 1) {
              done(text);
              return;
            }
          }
        } catch {
          // skip unparseable lines
        }
      });

      rl.on("close", () => done(null));
      rl.on("error", () => done(null));
      stream.on("error", () => done(null));
    });
  }

  private extractUserText(content: unknown): string | null {
    if (typeof content === "string") {
      if (this.isSystemContent(content)) return null;
      return this.cleanPromptText(content);
    }

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          if (this.isSystemContent(block.text)) continue;
          const text = this.cleanPromptText(block.text);
          if (text && text.length > 1) return text;
        }
      }
    }

    return null;
  }

  private cleanPromptText(text: string): string {
    return text
      .replace(/\[Request interrupted[^\]]*\]/g, "")
      .replace(/<[^>]+>[^<]*<\/[^>]+>/g, "")
      .replace(/<[^>]+\/>/g, "")
      .split("\n")[0]!
      .trim();
  }

  private isSystemContent(text: string): boolean {
    const systemPatterns = [
      /^<(system-reminder|local-command-caveat|command-name|command-message|command-args|local-command-stdout)/,
      /^\[Request interrupted/,
    ];
    return systemPatterns.some((p) => p.test(text.trim()));
  }
}
