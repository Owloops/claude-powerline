import { Config } from './types';
import { renderScopedLimits } from './segments/scoped';

export const generateStatusLine = (config: Config): string => {
  const scoped = renderScopedLimits(config);
  return scoped ? `[${scoped}]` : '';
};