export function debug(message: string, ...args: unknown[]): void {
  if (process.env.CLAUDE_POWERLINE_DEBUG) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}
