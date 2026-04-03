import type { BoxChars } from "./types";

import { visibleLength, stripAnsi, ESC, ANSI_SPLIT } from "../utils/terminal";

export function colorize(text: string, fgColor: string, reset: string): string {
  if (!fgColor) {
    return text;
  }
  return `${fgColor}${text}${reset}`;
}

export function padRight(text: string, width: number): string {
  const visible = visibleLength(text);
  if (visible >= width) {
    return text;
  }
  return text + " ".repeat(width - visible);
}

export function padLeft(text: string, width: number): string {
  const visible = visibleLength(text);
  if (visible >= width) {
    return text;
  }
  return " ".repeat(width - visible) + text;
}

export function padCenter(text: string, width: number): string {
  const visible = visibleLength(text);
  if (visible >= width) {
    return text;
  }
  const totalPad = width - visible;
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

export function truncateAnsi(text: string, maxWidth: number): string {
  if (stripAnsi(text).length <= maxWidth) {
    return text;
  }

  let width = 0;
  let result = "";
  const parts = text.split(ANSI_SPLIT);
  for (const part of parts) {
    if (part.startsWith(ESC)) {
      result += part;
      continue;
    }
    for (const char of part) {
      if (width >= maxWidth - 1) {
        result += "…\x1b[0m";
        return result;
      }
      result += char;
      width++;
    }
  }
  return result;
}

export function contentRow(
  box: BoxChars,
  content: string,
  innerWidth: number,
): string {
  const maxContent = innerWidth - 2;
  const truncated = truncateAnsi(content, maxContent);
  const padded = padRight(truncated, maxContent);
  return box.vertical + " " + padded + " " + box.vertical;
}

export function divider(box: BoxChars, innerWidth: number): string {
  return box.teeLeft + box.horizontal.repeat(innerWidth) + box.teeRight;
}

export function bottomBorder(
  box: BoxChars,
  innerWidth: number,
  leftText?: string,
  rightText?: string,
): string {
  if (!leftText && !rightText) {
    return box.bottomLeft + box.horizontal.repeat(innerWidth) + box.bottomRight;
  }

  let left = leftText ? ` ${leftText} ` : "";
  let right = rightText ? ` ${rightText} ` : "";
  let leftLen = visibleLength(left);
  let rightLen = visibleLength(right);

  // Truncate if combined text exceeds innerWidth
  if (leftLen + rightLen > innerWidth) {
    const maxLeft = Math.max(0, innerWidth - rightLen);
    if (leftLen > maxLeft) {
      left = truncateAnsi(left, maxLeft);
      leftLen = visibleLength(left);
    }
    if (leftLen + rightLen > innerWidth) {
      const maxRight = Math.max(0, innerWidth - leftLen);
      right = truncateAnsi(right, maxRight);
      rightLen = visibleLength(right);
    }
  }

  const fillCount = innerWidth - leftLen - rightLen;

  return (
    box.bottomLeft +
    left +
    box.horizontal.repeat(Math.max(0, fillCount)) +
    right +
    box.bottomRight
  );
}

export function spreadEven(parts: string[], totalWidth: number): string {
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0] ?? "";
  }

  const widths = parts.map((p) => visibleLength(p));
  const totalContentWidth = widths.reduce((sum, w) => sum + w, 0);
  const totalGap = totalWidth - totalContentWidth;
  const gapPerSlot = Math.max(2, Math.floor(totalGap / (parts.length - 1)));

  const suffixWidths = Array.from<number>({ length: parts.length });
  suffixWidths[parts.length - 1] = widths[parts.length - 1] ?? 0;
  for (let i = parts.length - 2; i >= 0; i--) {
    suffixWidths[i] = (suffixWidths[i + 1] ?? 0) + (widths[i] ?? 0);
  }

  let result = parts[0] ?? "";
  let usedWidth = widths[0] ?? 0;
  for (let i = 1; i < parts.length; i++) {
    const remaining =
      totalWidth -
      usedWidth -
      (suffixWidths[i] ?? 0) -
      (parts.length - 1 - i) * 2;
    const gap = Math.max(2, Math.min(gapPerSlot, remaining));
    result += " ".repeat(gap) + (parts[i] ?? "");
    usedWidth += gap + (widths[i] ?? 0);
  }

  return result;
}

export function spreadTwo(
  left: string,
  right: string,
  totalWidth: number,
): string {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }

  const leftLen = visibleLength(left);
  const rightLen = visibleLength(right);
  const gap = totalWidth - leftLen - rightLen;

  if (gap < 2) {
    return `${left}  ${right}`;
  }

  return left + " ".repeat(gap) + right;
}
