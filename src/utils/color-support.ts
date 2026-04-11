import process from "node:process";
import tty from "node:tty";

export function getColorSupport(): "none" | "ansi" | "ansi256" | "truecolor" {
  const { env } = process;

  let colorEnabled = true;

  if (env.NO_COLOR && env.NO_COLOR !== "") {
    colorEnabled = false;
  }

  const forceColor = env.FORCE_COLOR;
  if (forceColor && forceColor !== "") {
    if (forceColor === "false" || forceColor === "0") {
      return "none";
    }
    if (forceColor === "true" || forceColor === "1") {
      return "ansi";
    }
    if (forceColor === "2") {
      return "ansi256";
    }
    if (forceColor === "3") {
      return "truecolor";
    }
    return "ansi";
  }

  if (!colorEnabled) {
    return "none";
  }

  if (env.TERM === "dumb") {
    return "none";
  }

  if (env.CI) {
    if (
      ["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)
    ) {
      return "truecolor";
    }
    return "ansi";
  }

  if (env.COLORTERM === "truecolor") {
    return "truecolor";
  }

  const truecolorTerminals = [
    "xterm-kitty",
    "xterm-ghostty",
    "wezterm",
    "alacritty",
    "foot",
    "contour",
  ];

  if (truecolorTerminals.includes(env.TERM || "")) {
    return "truecolor";
  }

  if (env.TERM_PROGRAM) {
    switch (env.TERM_PROGRAM) {
      case "iTerm.app":
        return "truecolor";
      case "Apple_Terminal":
        return "ansi256";
      case "vscode":
        return "truecolor";
      case "Tabby":
        return "truecolor";
    }
  }

  if (/-256(color)?$/i.test(env.TERM || "")) {
    return "ansi256";
  }

  if (/-truecolor$/i.test(env.TERM || "")) {
    return "truecolor";
  }

  if (
    /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
      env.TERM || "",
    )
  ) {
    return "ansi";
  }

  if (env.COLORTERM) {
    return "ansi";
  }

  if (tty?.WriteStream?.prototype?.hasColors) {
    try {
      const colors = tty.WriteStream.prototype.hasColors();
      if (!colors) {
        return "none";
      }

      const has256Colors = tty.WriteStream.prototype.hasColors(256);
      const has16mColors = tty.WriteStream.prototype.hasColors(16777216);

      if (has16mColors) {
        return "truecolor";
      } else if (has256Colors) {
        return "ansi256";
      } else {
        return "ansi";
      }
    } catch {}
  }

  return "ansi";
}
