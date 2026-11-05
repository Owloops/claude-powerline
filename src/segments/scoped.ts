import { Config } from '../types';

export const renderScopedLimits = (config: Config): string => {
  if (!config.rateLimits.scoped || config.rateLimits.scoped.length === 0) {
    return '';
  }

  return config.rateLimits.scoped
    .map((limit) => {
      const percentage = Math.round((limit.usage / limit.limit) * 100);
      return `${limit.name}: ${percentage}% (resets ${limit.resetAt})`;
    })
    .join(' | ');
};