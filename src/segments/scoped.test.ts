import { renderScopedLimits } from './scoped';
import { Config } from '../types';

describe('renderScopedLimits', () => {
  it('returns empty string if no scoped limits exist', () => {
    const config: Config = { rateLimits: { block: {} as any, weekly: {} as any } };
    expect(renderScopedLimits(config)).toBe('');
  });

  it('renders scoped limits correctly', () => {
    const config: Config = {
      rateLimits: {
        block: {} as any,
        weekly: {} as any,
        scoped: [{ name: 'Opus', usage: 50, limit: 100, resetAt: '10:00' }]
      }
    };
    expect(renderScopedLimits(config)).toBe('Opus: 50% (resets 10:00)');
  });
});