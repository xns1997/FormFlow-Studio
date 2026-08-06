/**
 * Harness component contracts (类 Codex Agent Core).
 *
 * The AgentLoop driver is domain-agnostic: it orchestrates ContextManager,
 * PromptAssembler, ModelProvider, PermissionEvaluator, ToolExecutor,
 * VerificationEngine, RecoveryManager and EventEmitter. FormFlow-specific
 * tools/gates/skills are injected as implementations of these contracts.
 */
import type {
  AgentThread, ArtifactMeta, CapabilityBundleVersion, DynamicPlan,
  LoopDecision, LoopObservation, LoopQuestion, RunContext, ThreadMessage,
} from '../types';
import type { McpRole } from '../../services/tool-shared';

/** 一次工具调用的通用形态。 */
export interface HarnessToolCall {
  toolName: string;
  scope?: McpRole;
  arguments?: Record<string, any>;
}

/** 工具网关结果（与具体工具系统解耦）。 */
export interface HarnessToolResult {
  ok: boolean;
  data?: unknown;
  meta?: { revision?: string };
  error?: { code?: string; message: string; retryable?: boolean; details?: unknown };
  status?: 'confirmation_required';
  confirmation?: { token: string; expiresAt: string; summary: string; impact: unknown };
}

/** 工具网关：给定工具名与参数执行真实副作用。 */
export interface ToolGateway {
  execute(toolName: string, args: Record<string, any>, context: ToolExecutionContext): Promise<HarnessToolResult>;
}

export interface ToolExecutionContext {
  tenantId: string;
  userId: string;
  projectId?: string;
  requestId: string;
  mcpRole: McpRole;
}

/** 权限评估结果。 */
export interface PermissionDecision {
  level: 'allowed' | 'confirmation_required' | 'forbidden';
  reason: string;
  userMessage: string;
}

/** 最终门禁结果（与 gates.FinalGateResult 结构一致）。 */
export interface HarnessFinalGateResult {
  passed: boolean;
  failures: string[];
  evidence: Array<{ id: string; kind: string; summary: string; data?: unknown; createdAt: string }>;
}

/** PermissionEvaluator：模型只能请求，放行由 harness 决定。 */
export interface PermissionEvaluator {
  evaluate(toolName: string, goalText: string): PermissionDecision;
}

/** ToolRegistry：工具目录（名称 → 定义）。 */
export interface ToolRegistry {
  get(toolName: string): { name: string; risk: 'read' | 'write' | 'destructive'; inputSchema?: unknown; ownerRole?: McpRole; examples?: unknown[] } | undefined;
  risk(toolName: string): 'read' | 'write' | 'destructive';
  isWrite(toolName: string): boolean;
}

/** ToolExecutor：参数解析 → 策略 → 网关执行 → 输出归一化。 */
export interface ToolExecutor {
  execute(thread: AgentThread, run: RunContext, decision: LoopDecision, bundle: CapabilityBundleVersion): Promise<'succeeded' | 'failed' | 'waiting' | 'refreshed'>;
}

/** OutputNormalizer：工具结果 → 观察（压缩、截断、证据）。 */
export interface OutputNormalizer {
  observe(call: HarnessToolCall, result: HarnessToolResult): LoopObservation;
}

/** VerificationEngine：写后最小验证 + Turn 最终门禁。 */
export interface VerificationEngine {
  afterWrite(thread: AgentThread, run: RunContext, scope: McpRole, projectId: string): Promise<void>;
  final(thread: AgentThread, run: RunContext): Promise<HarnessFinalGateResult>;
  selfReview(thread: AgentThread, run: RunContext): Promise<{ issues: string[] }>;
}

/** RecoveryManager：瞬时错误/冲突自动恢复。 */
export interface RecoveryManager {
  executeWithRecovery(thread: AgentThread, run: RunContext, decision: LoopDecision, bundle: CapabilityBundleVersion): Promise<'succeeded' | 'failed' | 'waiting' | 'refreshed'>;
}

/** ContextManager：构建结构化上下文并在超限时压缩。 */
export interface ContextManager {
  compactIfNeeded(thread: AgentThread, bundle: CapabilityBundleVersion, run: RunContext): Promise<void>;
}

/** EventEmitter：事件、消息、指标与持久化。 */
export interface EventEmitter {
  emit(thread: AgentThread, type: string, data: any): void;
  observe(thread: AgentThread, observation: LoopObservation): void;
  message(thread: AgentThread, role: 'user' | 'assistant', kind: ThreadMessage['kind'], content: string, turnId?: string, questions?: LoopQuestion[]): void;
  save(thread: AgentThread): void;
  bumpMetric(thread: AgentThread, patch: any): void;
  resetMetrics(thread: AgentThread): void;
  flushMetrics(thread: AgentThread): Promise<void>;
}

/** PromptAssembler：按稳定顺序组装决策提示词。 */
export interface PromptAssembler {
  assemble(thread: AgentThread, bundle: CapabilityBundleVersion): string;
}

/** ModelProvider：决策/摘要等模型调用（可替换）。 */
export interface ModelProvider {
  decide(thread: AgentThread, run: RunContext, bundle: CapabilityBundleVersion): Promise<LoopDecision>;
}

/** 动态计划初始化。 */
export interface PlanInitializer {
  initialize(thread: AgentThread, run: RunContext): Promise<DynamicPlan>;
}

/** 批量只读执行器。 */
export interface ReadExecutor {
  batch(thread: AgentThread, run: RunContext, decision: LoopDecision, bundle: CapabilityBundleVersion): Promise<{ ok: number; failed: number }>;
  /** 回读 artifact；不存在返回 null（由驱动记录失败观察）。 */
  readArtifact(thread: AgentThread, decision: LoopDecision): Promise<LoopObservation | null>;
}

/** 包解析器。 */
export interface BundleResolver {
  get(thread: AgentThread): CapabilityBundleVersion | undefined;
}

/** AgentLoop 使用的全部组件。 */
export interface HarnessComponents {
  prompt: PromptAssembler;
  model: ModelProvider;
  tools: ToolExecutor;
  reads: ReadExecutor;
  permissions: PermissionEvaluator;
  verification: VerificationEngine;
  recovery: RecoveryManager;
  context: ContextManager;
  events: EventEmitter;
  plan: PlanInitializer;
  bundle: BundleResolver;
  isWriteTool(toolName: string): boolean;
  isVerificationRead(toolName: string): boolean;
  toolProjectId(thread: AgentThread, call: Pick<LoopDecision, 'arguments'>): string | undefined;
}

export type { AgentThread, LoopDecision, RunContext };
