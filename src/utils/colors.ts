export function hexToAnsi(hex: string, isBackground: boolean): string {
  if (
    isBackground &&
    (hex.toLowerCase() === "transparent" || hex.toLowerCase() === "none")
  ) {
    return "\x1b[49m";
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[${isBackground ? "48" : "38"};2;${r};${g};${b}m`;
}

export function extractBgToFg(
  ansiCode: string,
  useTextOnly: boolean = false,
): string {
  if (!ansiCode || ansiCode === "") {
    return "";
  }

  const truecolorMatch = ansiCode.match(/48;2;(\d+);(\d+);(\d+)/);
  if (truecolorMatch) {
    return `\x1b[38;2;${truecolorMatch[1]};${truecolorMatch[2]};${truecolorMatch[3]}m`;
  }

  if (useTextOnly) {
    return "\x1b[37m";
  }

  if (ansiCode.includes("\x1b[") && ansiCode.includes("m")) {
    const codeMatch = ansiCode.match(/\[(\d+)m/);
    if (codeMatch && codeMatch[1]) {
      const bgCode = parseInt(codeMatch[1], 10);
      if (bgCode >= 40 && bgCode <= 47) {
        const fgCode = bgCode - 10;
        return `\x1b[${fgCode}m`;
      }
      if (bgCode >= 100 && bgCode <= 107) {
        const fgCode = bgCode - 10;
        return `\x1b[${fgCode}m`;
      }
    }
  }

  return ansiCode.replace("48", "38");
}

export function hexTo256Ansi(hex: string, isBackground: boolean): string {
  if (
    isBackground &&
    (hex.toLowerCase() === "transparent" || hex.toLowerCase() === "none")
  ) {
    return "\x1b[49m";
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const toAnsi256 = (r: number, g: number, b: number): number => {
    if (r === g && g === b) {
      if (r < 8) return 16;
      if (r > 248) return 231;
      return Math.round(((r - 8) / 247) * 24) + 232;
    }
    return (
      16 +
      36 * Math.round((r / 255) * 5) +
      6 * Math.round((g / 255) * 5) +
      Math.round((b / 255) * 5)
    );
  };

  const colorCode = toAnsi256(r, g, b);
  return `\x1b[${isBackground ? "48" : "38"};5;${colorCode}m`;
}

export function hexToBasicAnsi(hex: string, isBackground: boolean): string {
  if (
    isBackground &&
    (hex.toLowerCase() === "transparent" || hex.toLowerCase() === "none")
  ) {
    return "\x1b[49m";
  }

  if (isBackground) {
    return "";
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (g > r && g > b && g > 120) {
    return "\x1b[32m";
  }

  if (r > g && r > b && r > 120) {
    return "\x1b[31m";
  }

  if (b > r && b > g && b > 120) {
    return "\x1b[34m";
  }

  const brightness = (r + g + b) / 3;
  return brightness > 150 ? "\x1b[37m" : "\x1b[90m";
}

export function hexColorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
