import type { UsageSummary } from "./usage-window";

import { formatLocalDate } from "../utils/formatters";
import { getWindowUsage, startOfDay, summarizeUsage } from "./usage-window";

export interface TodayInfo extends UsageSummary {
  date: string;
}

export class TodayProvider {
  async getTodayInfo(): Promise<TodayInfo> {
    const now = new Date();
    const usage = await getWindowUsage(startOfDay(now));
    return { ...summarizeUsage(usage, "Today"), date: formatLocalDate(now) };
  }
}
