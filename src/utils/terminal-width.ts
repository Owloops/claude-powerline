import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const VALID_TTY_PATTERN = /^[a-zA-Z0-9/]+$/;

interface ProcessTty {
  ppid: string;
  tty: string | null;
  // Set only by the /proc reader, which can see a device it failed to name.
  ttyNr?: number;
}

/**
 * @info Decodes the `tty_nr` field of /proc/<pid>/stat into a device name
 * relative to /dev, matching the form `ps -o tty=` prints (e.g. "pts/0").
 * Returns null when the process has no controlling terminal (tty_nr 0) or
 * the device is not one we can name, so the caller keeps walking/falls back.
 */
export function ttyNameFromDevNumber(ttyNr: number): string | null {
  if (ttyNr === 0) return null;

  const major = (ttyNr >>> 8) & 0xfff;
  const minor = (ttyNr & 0xff) | ((ttyNr >>> 12) & 0xfff00);

  if (major >= 136 && major <= 143) return `pts/${(major - 136) * 256 + minor}`;
  if (major === 4) return minor < 64 ? `tty${minor}` : `ttyS${minor - 64}`;

  return null;
}

/**
 * @info Reads ppid and controlling tty straight out of /proc, avoiding a
 * `sh` + `ps` spawn per ancestor. `ps -p <pid>` still walks every process in
 * /proc to answer a single-pid query, so on a busy machine the shell-out cost
 * is thousands of file reads per status line render.
 */
function readProcStat(pid: string): ProcessTty | null {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
  } catch {
    return null;
  }

  // comm (field 2) is parenthesised and may itself contain spaces or ')',
  // so fields are only unambiguous after the final ')'.
  const commEnd = stat.lastIndexOf(")");
  if (commEnd === -1) return null;

  // After comm: state, ppid, pgrp, session, tty_nr, ...
  const fields = stat
    .slice(commEnd + 1)
    .trim()
    .split(/\s+/);
  const ppid = fields[1];
  const ttyNr = Number(fields[4]);

  if (!ppid || !Number.isInteger(ttyNr)) return null;

  return { ppid, tty: ttyNameFromDevNumber(ttyNr), ttyNr };
}

function readPsStat(pid: string): ProcessTty | null {
  try {
    const info = execSync(`ps -o ppid=,tty= -p ${pid}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const parts = info.split(/\s+/);
    const ppid = parts[0];
    const tty = parts[1];

    if (!ppid) return null;

    return { ppid, tty: tty && tty !== "?" && tty !== "??" ? tty : null };
  } catch {
    return null;
  }
}

function findParentTty(): string | null {
  if (process.platform === "win32") return null;

  const readStat = process.platform === "linux" ? readProcStat : readPsStat;
  let pid = process.pid.toString();
  let unnamedDevicePid: string | null = null;

  for (let i = 0; i < 10; i++) {
    const info = readStat(pid);
    if (!info) break;

    if (info.tty && VALID_TTY_PATTERN.test(info.tty)) return info.tty;
    // Only /proc hands back a device it could not name; ps names whatever it
    // finds, so this never fires off Linux.
    if (info.ttyNr && !unnamedDevicePid) unnamedDevicePid = pid;

    if (info.ppid === "1" || info.ppid === "0") break;
    pid = info.ppid;
  }

  if (!unnamedDevicePid) return null;

  // That pid holds a controlling terminal on a device major this decoder cannot
  // name — a USB or virtio serial console, say. ps resolves it, and asking about
  // the one pid beats laying the status line out for tput's 80-column default.
  const tty = readPsStat(unnamedDevicePid)?.tty;
  return tty && VALID_TTY_PATTERN.test(tty) ? tty : null;
}

function getWindowsTerminalWidth(): number | null {
  try {
    const output = execSync("mode con", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    const match = output.match(/Columns:\s*(\d+)/i);
    if (match?.[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return null;
}

function getUnixTerminalWidth(): number | null {
  const tty = findParentTty();
  if (tty) {
    try {
      const size = execSync(`stty size < /dev/${tty}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        shell: "/bin/sh",
      }).trim();
      const width = size.split(" ")[1];
      if (width) {
        const parsed = parseInt(width, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
  }

  try {
    const width = execSync("tput cols 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const parsed = parseInt(width, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {}

  return null;
}

/**
 * @info Reserves characters for Claude Code's right-side UI messages
 * (e.g., "Current: 2.1.78 · latest: 2.1.78", "Thinking off")
 */
const RESERVED_CHARS = 45;

export function getTerminalWidth(): number | null {
  const applyReserve = (w: number) => Math.max(1, w - RESERVED_CHARS);

  const envColumns = process.env.COLUMNS;
  if (envColumns) {
    const parsed = parseInt(envColumns, 10);
    if (!isNaN(parsed) && parsed > 0) return applyReserve(parsed);
  }

  if (process.stdout.columns && process.stdout.columns > 0) {
    return applyReserve(process.stdout.columns);
  }

  if (process.platform === "win32") {
    const width = getWindowsTerminalWidth();
    if (width) return applyReserve(width);
  }

  const width = getUnixTerminalWidth();
  return width ? applyReserve(width) : null;
}

export function getRawTerminalWidth(): number | null {
  // Skip COLUMNS env and process.stdout.columns — Claude Code sets those
  // to an already-reserved panel width. We need the actual terminal width
  // so the grid engine can apply its own widthReserve.
  if (process.platform === "win32") {
    return getWindowsTerminalWidth();
  }

  return getUnixTerminalWidth();
}
