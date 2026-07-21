import type { DesignComponent } from '../../project/types';
import type { BehaviorDslDiagnostic } from '../engine/behaviorDsl';
import type { FormRuntimeSnapshot } from '../engine/formRuntimeSnapshot';

export type RuleAgentIntent = 'explain' | 'inspect' | 'edit' | 'lint' | 'test';

export interface RuleCodeProposal {
  id: string;
  sessionId: string;
  summary: string;
  proposedCode: string;
  changes: string[];
  assumptions: string[];
  baseRuleHash: string;
  diagnostics: BehaviorDslDiagnostic[];
  testResult?: RuleTestResult;
  createdAt: string;
}

export interface RuleTestResult {
  passed: boolean;
  scenarios: Array<{ name: string; passed: boolean; details: string[] }>;
  mockedEffects: Array<{ type: string; detail: string }>;
}

export interface RuleAgentTurnResult {
  intent: RuleAgentIntent;
  message: string;
  proposal?: RuleCodeProposal;
  diagnostics?: BehaviorDslDiagnostic[];
  testResult?: RuleTestResult;
  runtime?: FormRuntimeSnapshot;
  events: Array<{ type: string; data: unknown; requestId: string }>;
}

export interface AppliedRuleProposal { ruleCode: string; components: DesignComponent[]; updatedAt: string; }
