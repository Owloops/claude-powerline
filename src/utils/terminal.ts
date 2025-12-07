import { execSync } from "node:child_process";

const ESC = String.fromCharCode(27);
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const VALID_TTY_PATTERN = /^[a-zA-Z0-9/]+$/;

function findParentTty(): string | null {
  if (process.platform === "win32") return null;

  let pid = process.pid.toString();

  for (let i = 0; i < 10; i++) {
    try {
      const info = execSync(`ps -o ppid=,tty= -p ${pid}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
      const parts = info.split(/\s+/);
      const ppid = parts[0];
      const tty = parts[1];

      if (tty && tty !== "?" && tty !== "??" && VALID_TTY_PATTERN.test(tty)) {
        return tty;
      }

      if (!ppid || ppid === "1" || ppid === "0") break;
      pid = ppid;
    } catch {
      break;
    }
  }

  return null;
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
  } catch {
  }
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
    } catch {
    }
  }

  try {
    const width = execSync("tput cols 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const parsed = parseInt(width, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {
  }

  return null;
}

export function getTerminalWidth(): number | null {
  const envColumns = process.env.COLUMNS;
  if (envColumns) {
    const parsed = parseInt(envColumns, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }

  if (process.platform === "win32") {
    return getWindowsTerminalWidth();
  }

  return getUnixTerminalWidth();
}

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}
