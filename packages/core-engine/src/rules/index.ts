import { loopRules } from './loop-rules';
import { memoryRules } from './memory-rules';
import { indexRules } from './index-rules';
import { n1Rules } from './n1-rules';
import { blockingIoRules } from './blocking-io-rules';
import { resourceRules } from './resource-rules';
import { bundleRules } from './bundle-rules';
import { domRules } from './dom-rules';
import { payloadRules } from './payload-rules';
import { redosRules } from './redos-rules';
import { cachingRules } from './caching-rules';
import type { RuleDefinition } from '../types';

export { loopRules } from './loop-rules';
export { memoryRules } from './memory-rules';
export { indexRules, resetIndexRuleCache } from './index-rules';
export { n1Rules } from './n1-rules';
export { blockingIoRules } from './blocking-io-rules';
export { resourceRules } from './resource-rules';
export { bundleRules } from './bundle-rules';
export { domRules } from './dom-rules';
export { payloadRules } from './payload-rules';
export { redosRules } from './redos-rules';
export { cachingRules } from './caching-rules';

export function getAllRules(): RuleDefinition[] {
  return [
    ...n1Rules,
    ...blockingIoRules,
    ...memoryRules,
    ...loopRules,
    ...indexRules,
    ...resourceRules,
    ...bundleRules,
    ...domRules,
    ...payloadRules,
    ...redosRules,
    ...cachingRules,
  ];
}
