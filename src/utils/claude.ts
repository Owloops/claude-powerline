import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { join, posix } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { debug } from "./logger";

export interface ClaudeHookData {
  hook_event_name: string;
  session_id: string;
  transcript_path: string;
  cwd: string;
  model: {
    id: string;
    display_name: string;
  };
  workspace: {
    current_dir: string;
    project_dir: string;
  };
  version?: string;
  output_style?: {
    name: string;
  };
  cost?: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window?: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    current_usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
}

export function getClaudePaths(): string[] {
  const paths: string[] = [];

  const envPath = process.env.CLAUDE_CONFIG_DIR;
  if (envPath) {
    envPath.split(",").forEach((path) => {
      const trimmedPath = path.trim();
      if (existsSync(trimmedPath)) {
        paths.push(trimmedPath);
      }
    });
  }

  if (paths.length === 0) {
    const homeDir = homedir();
    const configPath = join(homeDir, ".config", "claude");
    const claudePath = join(homeDir, ".claude");

    if (existsSync(configPath)) {
      paths.push(configPath);
    } else if (existsSync(claudePath)) {
      paths.push(claudePath);
    }
  }

  return paths;
}

export async function findProjectPaths(
  claudePaths: string[]
): Promise<string[]> {
  const projectPaths: string[] = [];

  for (const claudePath of claudePaths) {
    const projectsDir = join(claudePath, "projects");

    if (existsSync(projectsDir)) {
      try {
        const entries = await readdir(projectsDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const projectPath = posix.join(projectsDir, entry.name);
            projectPaths.push(projectPath);
          }
        }
      } catch (error) {
        debug(`Failed to read projects directory ${projectsDir}:`, error);
      }
    }
  }

  return projectPaths;
}

export async function findTranscriptFile(
  sessionId: string
): Promise<string | null> {
  const claudePaths = getClaudePaths();
  const projectPaths = await findProjectPaths(claudePaths);

  for (const projectPath of projectPaths) {
    const transcriptPath = posix.join(projectPath, `${sessionId}.jsonl`);
    if (existsSync(transcriptPath)) {
      return transcriptPath;
    }
  }

  return null;
}

export async function findAgentTranscripts(
  sessionId: string,
  projectPath: string
): Promise<string[]> {
  const agentFiles: string[] = [];

  try {
    const files = await readdir(projectPath);
    const agentFileNames = files.filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"));

    for (const fileName of agentFileNames) {
      const filePath = posix.join(projectPath, fileName);
      try {
        const content = await readFile(filePath, "utf-8");
        const firstLine = content.split("\n")[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine);
          if (parsed.sessionId === sessionId) {
            agentFiles.push(filePath);
          }
        }
      } catch {
        debug(`Failed to check agent file ${filePath}`);
      }
    }
  } catch (error) {
    debug(`Failed to read project directory ${projectPath}:`, error);
  }

  return agentFiles;
}

export async function getEarliestTimestamp(
  filePath: string
): Promise<Date | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");

    let earliestDate: Date | null = null;
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);
        if (json.timestamp && typeof json.timestamp === "string") {
          const date = new Date(json.timestamp);
          if (!isNaN(date.getTime())) {
            if (earliestDate === null || date < earliestDate) {
              earliestDate = date;
            }
          }
        }
      } catch {
        continue;
      }
    }
    return earliestDate;
  } catch (error) {
    debug(`Failed to get earliest timestamp for ${filePath}:`, error);
    return null;
  }
}

export async function sortFilesByTimestamp(
  files: string[],
  oldestFirst = true
): Promise<string[]> {
  const filesWithTimestamps = await Promise.all(
    files.map(async (file) => ({
      file,
      timestamp: await getEarliestTimestamp(file),
    }))
  );

  return filesWithTimestamps
    .sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return 0;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      const sortOrder = oldestFirst ? 1 : -1;
      return sortOrder * (a.timestamp.getTime() - b.timestamp.getTime());
    })
    .map((item) => item.file);
}

export async function getFileModificationDate(
  filePath: string
): Promise<Date | null> {
  try {
    const stats = await stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

export interface ParsedEntry {
  timestamp: Date;
  message?: {
    id?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;
  };
  costUSD?: number;
  isSidechain?: boolean;
  raw: Record<string, unknown>;
}

export function createUniqueHash(entry: ParsedEntry): string | null {
  const messageId =
    entry.message?.id ||
    (typeof entry.raw.message === "object" &&
    entry.raw.message !== null &&
    "id" in entry.raw.message
      ? (entry.raw.message.id as string)
      : undefined);
  const requestId =
    "requestId" in entry.raw ? (entry.raw.requestId as string) : undefined;

  if (!messageId || !requestId) {
    return null;
  }

  return `${messageId}:${requestId}`;
}

const STREAMING_THRESHOLD_BYTES = 1024 * 1024;

export async function parseJsonlFile(filePath: string): Promise<ParsedEntry[]> {
  try {
    const stats = await stat(filePath);
    const fileSizeBytes = stats.size;
    let entries: ParsedEntry[];

    if (fileSizeBytes > STREAMING_THRESHOLD_BYTES) {
      debug(
        `Using streaming parser for large file ${filePath} (${Math.round(fileSizeBytes / 1024)}KB)`
      );
      entries = await parseJsonlFileStreaming(filePath);
    } else {
      entries = await parseJsonlFileInMemory(filePath);
    }

    debug(`Parsed ${entries.length} entries from ${filePath}`);

    return entries;
  } catch (error) {
    debug(`Failed to read file ${filePath}:`, error);
    return [];
  }
}

async function parseJsonlFileInMemory(
  filePath: string
): Promise<ParsedEntry[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      if (!raw.timestamp) continue;

      const entry: ParsedEntry = {
        timestamp: new Date(raw.timestamp),
        message: raw.message,
        costUSD: typeof raw.costUSD === "number" ? raw.costUSD : undefined,
        isSidechain: raw.isSidechain === true,
        raw,
      };

      entries.push(entry);
    } catch (parseError) {
      debug(`Failed to parse JSONL line: ${parseError}`);
      continue;
    }
  }

  return entries;
}

async function parseJsonlFileStreaming(
  filePath: string
): Promise<ParsedEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: ParsedEntry[] = [];
    const fileStream = createReadStream(filePath, { encoding: "utf8" });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      try {
        const raw = JSON.parse(trimmedLine);
        if (!raw.timestamp) return;

        const entry: ParsedEntry = {
          timestamp: new Date(raw.timestamp),
          message: raw.message,
          costUSD: typeof raw.costUSD === "number" ? raw.costUSD : undefined,
          isSidechain: raw.isSidechain === true,
          raw,
        };

        entries.push(entry);
      } catch (parseError) {
        debug(`Failed to parse JSONL line: ${parseError}`);
      }
    });

    rl.on("close", () => {
      resolve(entries);
    });

    rl.on("error", (error) => {
      debug(`Streaming parser error for ${filePath}:`, error);
      reject(error);
    });

    fileStream.on("error", (error) => {
      debug(`File stream error for ${filePath}:`, error);
      reject(error);
    });
  });
}

/**
 * Loads entries from Claude projects with deterministic deduplication.
 * @param timeFilter Optional filter to apply based on timestamp
 * @param fileFilter Optional filter to apply based on file path and modification time  
 * @param sortFiles Whether to sort files by modification time
 * @returns Deduplicated entries sorted by timestamp
 * @note Sorts entries by timestamp before deduplication to ensure consistent
 *       duplicate selection. Otherwise, parallel file loading causes race conditions
 *       where different duplicates are kept on each run, leading to flickering values.
 */
export async function loadEntriesFromProjects(
  timeFilter?: (entry: ParsedEntry) => boolean,
  fileFilter?: (filePath: string, modTime: Date) => boolean,
  sortFiles = false
): Promise<ParsedEntry[]> {
  const claudePaths = getClaudePaths();
  const projectPaths = await findProjectPaths(claudePaths);
  const processedHashes = new Set<string>();

  const allFilesPromises = projectPaths.map(async (projectPath) => {
    try {
      const files = await readdir(projectPath);
      const jsonlFiles = files.filter((file) => file.endsWith(".jsonl"));

      const fileStatsPromises = jsonlFiles.map(async (file) => {
        const filePath = posix.join(projectPath, file);
        if (existsSync(filePath)) {
          const mtime = await getFileModificationDate(filePath);
          return { filePath, mtime };
        }
        return null;
      });

      const fileStats = await Promise.all(fileStatsPromises);
      return fileStats.filter(
        (stat) =>
          stat?.mtime && (!fileFilter || fileFilter(stat.filePath, stat.mtime))
      );
    } catch (dirError) {
      debug(`Failed to read project directory ${projectPath}:`, dirError);
      return [];
    }
  });

  const allFileResults = await Promise.all(allFilesPromises);
  const allFilesWithMtime = allFileResults
    .flat()
    .filter((file): file is { filePath: string; mtime: Date } => file !== null);

  if (sortFiles) {
    allFilesWithMtime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  const allFiles = allFilesWithMtime.map((file) => file.filePath);

  const entries: ParsedEntry[] = [];

  const filePromises = allFiles.map(async (filePath) => {
    const fileEntries = await parseJsonlFile(filePath);
    return fileEntries.filter((entry) => !timeFilter || timeFilter(entry));
  });

  const fileResults = await Promise.all(filePromises);
  for (const fileEntries of fileResults) {
    entries.push(...fileEntries);
  }

  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const deduplicatedEntries: ParsedEntry[] = [];
  for (const entry of entries) {
    const uniqueHash = createUniqueHash(entry);
    if (uniqueHash && processedHashes.has(uniqueHash)) {
      continue;
    }
    if (uniqueHash) {
      processedHashes.add(uniqueHash);
    }
    deduplicatedEntries.push(entry);
  }

  return deduplicatedEntries;
}
