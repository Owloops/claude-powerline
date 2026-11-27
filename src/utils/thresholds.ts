import type { BudgetConfig } from "../config/loader";
import {
  BLOCK_WINDOW_MINUTES,
  pacePercentage,
  WEEKLY_WINDOW_MINUTES,
} from "./formatters";

const PACE_WARNING_POINTS = 5;
const PACE_CRITICAL_POINTS = 15;
const PACE_CRITICAL_PERCENT = 95;

export interface UsageThresholdConfig {
  /** Percent used from which the segment takes the warning color. */
  warningThreshold?: number;
  /** Percent used from which the segment takes the critical color. */
  criticalThreshold?: number;
}

export interface RateLimitColorConfig extends UsageThresholdConfig {
  /** Color by percent used, or by distance from an even spend over the window (default: "usage"). */
  colorBy?: "usage" | "pace";
}

/**
 * Color level of a usage segment, shared by the classic and TUI renderers.
 * Block's critical falls back to `budget.block.warningThreshold`, which
 * drove it before these options. With `colorBy: "pace"`, block and weekly
 * color by how far usage runs ahead of the pace instead.
 */
export function usageLevel(
  key: "context" | "block" | "weekly",
  pct: number,
  segment: RateLimitColorConfig | undefined,
  budget: BudgetConfig | undefined,
  minutesRemaining?: number,
): "critical" | "warning" | undefined {
  if (segment?.colorBy === "pace" && minutesRemaining !== undefined) {
    const overPace =
      pct -
      pacePercentage(
        minutesRemaining,
        key === "block" ? BLOCK_WINDOW_MINUTES : WEEKLY_WINDOW_MINUTES,
      );
    if (pct >= PACE_CRITICAL_PERCENT || overPace >= PACE_CRITICAL_POINTS) {
      return "critical";
    }
    if (overPace >= PACE_WARNING_POINTS) return "warning";
    return undefined;
  }

  const critical =
    segment?.criticalThreshold ??
    (key === "block" ? budget?.block?.warningThreshold : undefined) ??
    80;
  const warning = segment?.warningThreshold ?? (key === "context" ? 60 : 50);
  if (pct >= critical) return "critical";
  if (pct >= warning) return "warning";
  return undefined;
}
