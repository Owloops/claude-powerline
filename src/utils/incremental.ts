import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { debug } from "./logger";
import { CacheManager } from "./cache";
import { scanLinesFrom } from "./claude";

/**
 * Enough of a transcript's start to tell it from another one: its first
 * records carry ids and prompt text unique to it.
 */
const HEAD_BYTES = 1024;

export interface FileProgress {
  /** Bytes consumed so far, always just past a newline. */
  offset: number;
  ino: number;
  /** Hash of the first min(offset, HEAD_BYTES) bytes. */
  head: string;
}

async function hashHead(filePath: string, length: number): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(length, HEAD_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return createHash("sha1")
      .update(buffer.subarray(0, bytesRead))
      .digest("hex");
  } finally {
    await handle.close();
  }
}

interface ResumePoint {
  ino: number;
  /** Where the next read starts: the recorded offset, or 0 for a new file. */
  offset: number;
  /** Nothing was appended since the recorded read. */
  upToDate: boolean;
  /**
   * The file no longer extends what was read from it: replaced, truncated, or
   * rewritten in place. What was derived from that read no longer holds.
   */
  replaced: boolean;
}

async function resumePoint(
  filePath: string,
  known?: FileProgress,
): Promise<ResumePoint> {
  const { size, ino } = await stat(filePath);
  const at = (offset: number, upToDate = false, replaced = false) => ({
    ino,
    offset,
    upToDate,
    replaced,
  });

  if (!known) return at(0);
  if (ino !== known.ino || size < known.offset) return at(0, false, true);
  if (size === known.offset) return at(known.offset, true);
  if ((await hashHead(filePath, known.offset)) !== known.head) {
    return at(0, false, true);
  }
  return at(known.offset);
}

async function progressAt(
  filePath: string,
  ino: number,
  end: number,
  known?: FileProgress,
): Promise<FileProgress> {
  return {
    offset: end,
    ino,
    head:
      known && known.offset >= HEAD_BYTES
        ? known.head
        : await hashHead(filePath, end),
  };
}

/** What one incremental reader derives from transcript lines. */
export interface IncrementalSpec<S> {
  /** The cache file the state is saved under. */
  name: string;
  /**
   * Identifies what the saved state means: its shape, and any restriction
   * the lines were read under. A state saved under another key is a miss.
   */
  key: string;
  empty(): S;
  /** The state as saved, and back. */
  save(state: S): unknown;
  load(saved: unknown): S;
  addLine(state: S, line: string): void;
}

interface SavedState {
  key: string;
  files: Record<string, FileProgress>;
  state: unknown;
}

/**
 * Reads what each file gained since `files` was recorded and adds it to
 * `state`. Returns the unterminated last lines, which count for this render
 * only, or null when a file no longer extends what was read from it: what it
 * contributed cannot be taken back out, so the caller starts over.
 */
async function advance<S>(
  spec: IncrementalSpec<S>,
  files: Record<string, FileProgress>,
  state: S,
  filePaths: string[],
): Promise<{ tails: string[]; advanced: boolean } | null> {
  if (Object.keys(files).some((p) => !filePaths.includes(p))) return null;

  const tails: string[] = [];
  let advanced = false;

  for (const filePath of filePaths) {
    const known = files[filePath];
    const resume = await resumePoint(filePath, known);
    if (resume.replaced) return null;
    if (resume.upToDate) continue;

    const scan = await scanLinesFrom(filePath, resume.offset, (line) =>
      spec.addLine(state, line),
    );
    if (scan.tail !== null) tails.push(scan.tail);

    if (!known || scan.end !== known.offset) {
      advanced = true;
      files[filePath] = await progressAt(filePath, resume.ino, scan.end, known);
    }
  }

  return { tails, advanced };
}

/**
 * Derives a state from files that only grow, reading only what was appended
 * since the last render. The state is saved whole in one cache file, so
 * concurrent renders racing to save it lose work, never count anything twice.
 */
export async function readIncrementally<S>(
  spec: IncrementalSpec<S>,
  filePaths: string[],
): Promise<S> {
  const saved = (await CacheManager.getTotalsCache(
    spec.name,
  )) as SavedState | null;
  let files: Record<string, FileProgress> = {};
  let state = spec.empty();
  if (saved?.key === spec.key) {
    files = saved.files;
    state = spec.load(saved.state);
  } else {
    await CacheManager.pruneTotalsCache();
  }

  let progress = await advance(spec, files, state, filePaths);
  if (!progress) {
    debug(`Reading every file again for ${spec.name}`);
    files = {};
    state = spec.empty();
    // Empty progress has no offsets that a file could contradict.
    progress = (await advance(spec, files, state, filePaths))!;
  }

  if (progress.advanced) {
    const toSave: SavedState = {
      key: spec.key,
      files,
      state: spec.save(state),
    };
    // Awaited before the tails are added: the saved state may share objects
    // with `state`, and the tails must not be saved.
    await CacheManager.setTotalsCache(spec.name, toSave);
  }

  for (const tail of progress.tails) spec.addLine(state, tail);
  return state;
}
