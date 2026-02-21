import { loopRules } from './loop-rules';
import { memoryRules } from './memory-rules';
import { indexRules } from './index-rules';
import type { RuleDefinition } from '../types';

export { loopRules } from './loop-rules';
export { memoryRules } from './memory-rules';
export { indexRules, resetIndexRuleCache } from './index-rules';

export function getAllRules(): RuleDefinition[] {
  return [...loopRules, ...memoryRules, ...indexRules];
}
