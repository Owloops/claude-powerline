import type { BudgetConfig } from "../config/loader";

export interface UsageThresholdConfig {
  /** Percent used from which the segment takes the warning color. */
  warningThreshold?: number;
  /** Percent used from which the segment takes the critical color. */
  criticalThreshold?: number;
}

/**
 * Color level of a usage segment, shared by the classic and TUI renderers.
 * Block's critical falls back to `budget.block.warningThreshold`, which
 * drove it before these options.
 */
export function usageLevel(
  key: "context" | "block" | "weekly",
  pct: number,
  segment: UsageThresholdConfig | undefined,
  budget: BudgetConfig | undefined,
): "critical" | "warning" | undefined {
  const critical =
    segment?.criticalThreshold ??
    (key === "block" ? budget?.block?.warningThreshold : undefined) ??
    80;
  const warning = segment?.warningThreshold ?? (key === "context" ? 60 : 50);
  if (pct >= critical) return "critical";
  if (pct >= warning) return "warning";
  return undefined;
}
