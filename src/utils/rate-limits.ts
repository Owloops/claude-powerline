import { debug } from "./logger";

export interface RateLimitInfo {
  fiveHourUsagePercent: number;
  lastUpdated: Date;
}

export class RateLimitsService {
  /**
   * Get rate limit information from Claude API.
   * TODO: Implement when OAuth API is understood.
   * @returns Rate limit info or null if unavailable
   */
  static async getRateLimits(): Promise<RateLimitInfo | null> {
    // TODO: Implement when OAuth API is understood
    // For now, return null to indicate "not available"
    debug("Rate limits API not yet implemented");
    return null;
  }
}
