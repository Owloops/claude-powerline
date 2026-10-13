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

  // Compare the rounded value so the marker matches the percentage shown
  const shownPercentage = Math.round(percentage);
  const percentStr = `${shownPercentage}%`;
  const isWarning = shownPercentage >= warningThreshold;

  let displayText = "";
  if (isWarning) {
    displayText = ` !${percentStr}`;
  } else if (shownPercentage >= 50) {
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
    };
  }

  if (!showValue && !showPercentage) {
    return {
      suppressAll: true,
      showBase: false,
      percentText: "",
      percentageOnly: false,
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
  };
}
