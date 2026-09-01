import type { BudgetItemConfig } from "../config/loader";

export interface BudgetStatus {
  percentage: number | null;
  isWarning: boolean;
  displayText: string;
}

export interface BudgetDisplayState {
  suppressAll: boolean;
  showBase: boolean;
  percentText: string;
  percentageOnly: boolean;
  /** Raw budget usage percentage (0-100, clamped), or null when no budget is configured or computable. */
  percentage: number | null;
}

export function calculateBudgetPercentage(
  cost: number,
  budget: number | undefined,
): number | null {
  if (!budget || budget <= 0 || cost < 0) return null;
  return Math.min(100, (cost / budget) * 100);
}

export function getBudgetStatus(
  cost: number,
  budget: number | undefined,
  warningThreshold = 80,
): BudgetStatus {
  const percentage = calculateBudgetPercentage(cost, budget);

  if (percentage === null) {
    return {
      percentage: null,
      isWarning: false,
      displayText: "",
    };
  }

  const percentStr = `${percentage.toFixed(0)}%`;
  const isWarning = percentage >= warningThreshold;

  let displayText = "";
  if (isWarning) {
    displayText = ` !${percentStr}`;
  } else if (percentage >= 50) {
    displayText = ` +${percentStr}`;
  } else {
    displayText = ` ${percentStr}`;
  }

  return {
    percentage,
    isWarning,
    displayText,
  };
}

export function pickBudgetValue(
  cost: number | null,
  tokens: number | null,
  budgetType: "cost" | "tokens" | undefined,
): number | null {
  return budgetType === "tokens" ? tokens : cost;
}

export function resolveBudgetDisplay(
  cost: number | null,
  tokens: number | null,
  budget?: BudgetItemConfig,
): BudgetDisplayState {
  if (!budget?.amount || budget.amount <= 0) {
    return {
      suppressAll: false,
      showBase: true,
      percentText: "",
      percentageOnly: false,
      percentage: null,
    };
  }

  const showValue = budget.showValue ?? true;
  const showPercentage = budget.showPercentage ?? true;
  const budgetValue = pickBudgetValue(cost, tokens, budget.type);

  if (budgetValue === null) {
    return {
      suppressAll: false,
      showBase: true,
      percentText: "",
      percentageOnly: false,
      percentage: null,
    };
  }

  const percentage = calculateBudgetPercentage(budgetValue, budget.amount);

  if (!showValue && !showPercentage) {
    return {
      suppressAll: true,
      showBase: false,
      percentText: "",
      percentageOnly: false,
      percentage,
    };
  }

  const percentText = showPercentage
    ? getBudgetStatus(
        budgetValue,
        budget.amount,
        budget.warningThreshold,
      ).displayText.trimStart()
    : "";

  return {
    suppressAll: false,
    showBase: showValue,
    percentText,
    percentageOnly: !showValue,
    percentage,
  };
}
