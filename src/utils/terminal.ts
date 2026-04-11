export const ESC = String.fromCharCode(27);
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
export const ANSI_SPLIT = new RegExp(`(${ESC}\\[[0-9;]*m)`);

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}
