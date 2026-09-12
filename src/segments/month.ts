import type { UsageSummary } from "./usage-window";

import { getWindowUsage, summarizeUsage } from "./usage-window";

export interface MonthInfo extends UsageSummary {
  month: string;
}

function formatMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export class MonthProvider {
  async getMonthInfo(): Promise<MonthInfo> {
    const now = new Date();
    const usage = await getWindowUsage(startOfMonth(now));
    return { ...summarizeUsage(usage, "Month"), month: formatMonth(now) };
  }
}
