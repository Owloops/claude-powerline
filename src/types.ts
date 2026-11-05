export interface RateLimit {
  name: string;
  usage: number;
  limit: number;
  resetAt: string;
}

export interface RateLimits {
  block: RateLimit;
  weekly: RateLimit;
  scoped?: RateLimit[];
}

export interface Config {
  rateLimits: RateLimits;
}