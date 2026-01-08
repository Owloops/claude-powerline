interface TokenBreakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export function formatCost(cost: number | null): string {
  if (cost === null) return "$0.00";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number | null): string {
  if (tokens === null) return "0 tokens";
  if (tokens === 0) return "0 tokens";
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
}

export function formatTokenBreakdown(breakdown: TokenBreakdown | null): string {
  if (!breakdown) return "0 tokens";

  const parts: string[] = [];

  if (breakdown.input > 0) {
    parts.push(`${formatTokens(breakdown.input).replace(" tokens", "")}in`);
  }

  if (breakdown.output > 0) {
    parts.push(`${formatTokens(breakdown.output).replace(" tokens", "")}out`);
  }

  if (breakdown.cacheCreation > 0 || breakdown.cacheRead > 0) {
    const totalCached = breakdown.cacheCreation + breakdown.cacheRead;
    parts.push(`${formatTokens(totalCached).replace(" tokens", "")}cached`);
  }

  return parts.length > 0 ? parts.join(" + ") : "0 tokens";
}

export function formatTimeSince(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(0)}m`;
  } else if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(1)}h`;
  } else {
    return `${(seconds / 86400).toFixed(1)}d`;
  }
}

const CLAUDE_MODEL_PATTERN =
  /^(?:(?:global|apac|au|eu|us|us-east-\d|us-west-\d|eu-west-\d|eu-central-\d)\.)?(?:anthropic\.|azure_ai\/|bedrock\/|vertex_ai\/)?claude-(?:(?<family>opus|sonnet|haiku)-(?<newMajor>\d+)(?:-(?<newMinor>\d))?|(?<oldMajor>\d+)(?:-(?<oldMinor>\d))?-(?<oldFamily>opus|sonnet|haiku))(?:[-@]\d{8})?(?:-v\d+:\d+)?(?:-latest)?$/i;

export function formatModelName(rawName: string): string {
  if (!rawName) {
    return "Claude";
  }

  const match = rawName.trim().match(CLAUDE_MODEL_PATTERN);
  if (!match?.groups) {
    return rawName;
  }

  const { family, newMajor, newMinor, oldMajor, oldMinor, oldFamily } = match.groups;

  const modelFamily = family || oldFamily;
  const major = newMajor || oldMajor;
  const minor = newMinor || oldMinor;

  if (modelFamily && major) {
    const capitalizedFamily = modelFamily.charAt(0).toUpperCase() + modelFamily.slice(1).toLowerCase();
    const version = minor ? `${major}.${minor}` : major;
    return `${capitalizedFamily} ${version}`;
  }

  return rawName;
}
