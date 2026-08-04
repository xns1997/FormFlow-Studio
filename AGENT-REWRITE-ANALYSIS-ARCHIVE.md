# 🔥 Grill-Me 深度分析：项目智能体重写方案

> **归档说明（2026-08-03）**：本文描述的「结构化重构 + V3 模块化子系统」方案已被更彻底的 V4 单循环重写取代（`server/src/agent-core/` + `/api/ai/project-agent/v4`）。文中提到的 `server/src/agent/*`、`services/project-agent-*` 与 V2/V3 路由均已删除，仅作历史分析留存。

> 分析日期：2026-07-30
> 状态：历史分析文档；所述重写已落地为 `server/src/agent/` 模块化子系统（orchestrator / decision-engine / recovery-engine / observer / verifier / specialist-runner 等），文中文件清单与行数为当时的现状快照。
> 目标：彻底重写项目智能体，实现如同 Codex 一样的自动编排、自动检查、自动调用合适工具、自动修复能力

---

## 一、现状诊断

### 1.1 架构概览

当前项目智能体系统分布在 **14 个核心文件** 中，总计约 **2,347 行代码**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `routes/project-agent-v2.ts` | 968 | 路由 + 主编排循环（**God Object**） |
| `services/project-agent-v2-store.ts` | 352 | 会话持久化 + PostgreSQL 镜像 |
| `services/project-agent-actions.ts` | 193 | 下一步行动决策 Schema 与解析 |
| `services/project-agent-loop.ts` | 161 | 旧版轮次协调器（已半废弃） |
| `services/project-agent-expert-registry.ts` | 118 | 专家注册 + 系统提示词构建 |
| `services/project-agent-v3-recovery.ts` | 113 | 恢复策略分类与补丁应用 |
| `services/project-agent-state-check.ts` | 102 | 项目状态快照 |
| `services/project-agent-v2-remediation.ts` | 85 | 质量诊断修复任务生成 |
| `services/project-agent-v2-context.ts` | 81 | 工具结果压缩 |
| `services/project-agent-requirements.ts` | 58 | 需求物化与覆盖追踪 |
| `services/project-agent-revision.ts` | 52 | Revision 冲突处理 |
| `services/project-agent-v2-planning.ts` | 27 | 规划 Schema 边界校验 |
| `services/project-agent-v2-policy.ts` | 27 | 删除操作策略 |
| `services/project-agent-expert-repair.ts` | 10 | 专家修复决策 |

### 1.2 关键问题

#### ❌ 问题 1：God Object — `project-agent-v2.ts`（968 行）

这个文件同时承担了：
- HTTP 路由定义（20+ 端点）
- LLM 调用与重试逻辑
- 需求分析流程
- 目标规划流程
- 下一步决策流程
- 专家任务执行循环
- 工具调用与参数预检
- Revision 冲突恢复
- 质量门禁验证
- 恢复策略编排
- SSE 事件流

**这是典型的"智能体内核"和"HTTP 表现层"混合的反模式。**

#### ❌ 问题 2：双轨并行 — 旧 Loop vs 新 Actions

- `project-agent-loop.ts` 定义了 `RoundPlannerResult`（7 个专家的轮次决策）
- `project-agent-actions.ts` 定义了 `NextActionDecision`（动态分配的行动决策）
- 两者都有 `PROJECT_AGENT_ROLES`、`DEFAULT_MAX_*`、progress fingerprint 等重复定义
- 路由文件同时导入两套，实际只用 Actions 那套

#### ❌ 问题 3：专家执行是一层薄壳

`runSpecialist()` 函数（约 200 行）做的事情：
1. 构建系统提示词
2. 调用 LLM Provider 启动 agent
3. 进入 while 循环处理 tool_call
4. 每次调用 `prepareToolArguments()` + `executeLlmTool()`
5. 处理确认、revision、参数纠正

但**没有**：
- 自动判断何时应该换策略
- 跨工具调用的上下文记忆
- 基于工具结果的动态调整
- 工具调用链的可观测性

#### ❌ 问题 4：恢复机制是补丁式

`recoverFailedTask()` 有 80+ 行的嵌套 if/else，处理：
- 质量诊断修复
- 工具角色边界纠正
- 瞬时错误重试
- 策略去重
- 动态任务生成

每种恢复路径都是硬编码的规则，不是可扩展的策略模式。

#### ❌ 问题 5：缺少自省能力

当前智能体**不能**：
- 回顾自己的工具调用历史并总结经验
- 在执行中动态发现新的依赖关系
- 根据中间结果调整整体计划
- 识别"这条路走不通"并主动换方向

---

## 二、Codex 对标分析

### 2.1 Codex 的核心特征

| 特征 | Codex | 当前 FormFlow Agent |
|------|-------|-------------------|
| **自动编排** | 根据任务自动选择工具和执行顺序 | ✅ 有，但硬编码在路由中 |
| **自动检查** | 每步执行后自动验证结果 | ✅ 有 verifyTask() |
| **自动调用工具** | 动态选择最合适的工具 | ⚠️ 依赖 LLM 决策，无工具推荐 |
| **自动修复** | 失败后自动分析原因并重试 | ⚠️ 有恢复机制，但策略有限 |
| **自省** | 能回顾历史、总结经验、调整策略 | ❌ 缺失 |
| **可观测性** | 每步决策都有清晰的理由 | ⚠️ 有事件流，但缺少决策推理链 |
| **可扩展性** | 新工具/策略可插拔接入 | ❌ 硬编码在路由中 |
| **错误恢复** | 多策略、多轮、自适应 | ⚠️ 有但策略有限 |

### 2.2 差距总结

**核心差距**：当前系统是一个"执行器"（Executor），而不是一个"智能体"（Agent）。

- 执行器：按预定义流程调用工具，失败时按规则重试
- 智能体：理解目标、规划路径、执行、观察、调整、再执行

---

## 三、重写架构设计

### 3.1 核心设计原则

```
1. 分离关注点：路由 ≠ 编排 ≠ 执行 ≠ 恢复
2. 策略可插拔：每种决策都是可替换的策略
3. 自省驱动：每次行动后必须观察、总结、调整
4. 渐进式执行：小步快跑，每步验证
5. 可观测性：每个决策都有完整的推理链
```

### 3.2 新架构分层

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP / SSE Layer                       │
│  routes/project-agent-v3.ts (纯路由，~150 行)             │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Orchestrator Layer                      │
│  agent/orchestrator.ts — 主编排循环                        │
│  agent/planner.ts — 目标规划                               │
│  agent/decision-engine.ts — 下一步决策引擎                 │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Execution Layer                         │
│  agent/specialist-runner.ts — 专家执行器                   │
│  agent/tool-pipeline.ts — 工具调用管线                     │
│  agent/argument-builder.ts — 参数构建与预检                │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Recovery Layer                          │
│  agent/recovery-engine.ts — 恢复策略引擎                   │
│  agent/strategies/*.ts — 可插拔恢复策略                    │
│  agent/diagnostic-analyzer.ts — 诊断分析                  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Observation Layer                        │
│  agent/observer.ts — 观察与自省                            │
│  agent/context-manager.ts — 上下文管理                    │
│  agent/progress-tracker.ts — 进度追踪                     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Infrastructure Layer                    │
│  agent/session-store.ts — 会话持久化（重构自 v2-store）     │
│  agent/event-bus.ts — 事件总线                             │
│  agent/llm-client.ts — LLM 调用封装                       │
└─────────────────────────────────────────────────────────┘
```

### 3.3 核心模块设计

#### 3.3.1 Orchestrator（主编排器）

```typescript
// agent/orchestrator.ts
export class ProjectAgentOrchestrator {
  private planner: Planner;
  private decisionEngine: DecisionEngine;
  private specialistRunner: SpecialistRunner;
  private recoveryEngine: RecoveryEngine;
  private observer: Observer;
  private contextManager: ContextManager;

  async runTurn(session: AgentSession, prompt: string): Promise<void> {
    // Phase 1: Grounding — 只读检查项目现状
    const grounding = await this.ground(session);

    // Phase 2: Requirement Analysis — 需求分析
    const requirements = await this.analyzeRequirements(session, prompt, grounding);
    if (requirements.needsClarification) {
      return this.askUser(session, requirements.questions);
    }

    // Phase 3: Planning — 目标规划
    const plan = await this.planner.createPlan(session, requirements, grounding);
    if (plan.needsApproval) {
      return this.awaitApproval(session, plan);
    }

    // Phase 4: Execution Loop — 执行循环
    await this.executionLoop(session, plan);
  }

  private async executionLoop(session: AgentSession, plan: Plan): Promise<void> {
    const maxSteps = session.budget.maxDecisionSteps;

    for (let step = 0; step < maxSteps; step++) {
      // 4.1 观察当前状态
      const observation = await this.observer.observe(session, plan);

      // 4.2 决策下一步
      const decision = await this.decisionEngine.decide(session, plan, observation);

      if (decision.action === 'complete') {
        return this.complete(session, plan, decision);
      }
      if (decision.action === 'ask_user') {
        return this.askUser(session, decision.questions);
      }
      if (decision.action === 'abort') {
        return this.abort(session, plan, decision);
      }

      // 4.3 执行任务
      const tasks = decision.assignments;
      const results = await this.executeTasks(session, plan, tasks);

      // 4.4 自省与恢复
      for (const result of results) {
        if (!result.success) {
          const recovered = await this.recoveryEngine.recover(session, plan, result);
          if (!recovered) {
            return this.abort(session, plan, { reason: 'recovery_exhausted' });
          }
        }
      }

      // 4.5 更新进度
      await this.observer.recordProgress(session, plan, results);
    }
  }
}
```

#### 3.3.2 Decision Engine（决策引擎）

```typescript
// agent/decision-engine.ts
export class DecisionEngine {
  private strategies: DecisionStrategy[];

  constructor(strategies: DecisionStrategy[]) {
    this.strategies = strategies;
  }

  async decide(
    session: AgentSession,
    plan: Plan,
    observation: Observation
  ): Promise<Decision> {
    // 1. 收集所有策略的建议
    const suggestions = await Promise.all(
      this.strategies.map(s => s.suggest(session, plan, observation))
    );

    // 2. 选择最高优先级且可行的建议
    const viable = suggestions
      .filter(s => s.confidence > 0.5)
      .sort((a, b) => b.priority - a.priority);

    if (!viable.length) {
      return { action: 'ask_user', questions: this.generateQuestions(observation) };
    }

    // 3. 验证决策可行性
    const selected = viable[0];
    await this.validateDecision(selected, session, plan);

    return selected;
  }
}

// 可插拔的决策策略
interface DecisionStrategy {
  name: string;
  suggest(session: AgentSession, plan: Plan, observation: Observation): Promise<Suggestion>;
}

// 策略示例：需求覆盖策略
class RequirementCoverageStrategy implements DecisionStrategy {
  name = 'requirement-coverage';

  async suggest(session, plan, observation): Promise<Suggestion> {
    const uncovered = session.requirements.filter(r =>
      r.status === 'supported' && !plan.tasks.some(t => t.requirementIds.includes(r.id))
    );

    if (!uncovered.length) return { confidence: 0, priority: 0 };

    return {
      confidence: 0.9,
      priority: 100,
      decision: {
        action: 'assign',
        assignments: uncovered.map(r => ({
          role: r.domain,
          title: `实现需求：${r.statement}`,
          instruction: this.buildInstruction(r),
          access: 'write',
          acceptance: r.acceptanceScenarios,
          requirementIds: [r.id],
        })),
      },
    };
  }
}
```

#### 3.3.3 Recovery Engine（恢复引擎）

```typescript
// agent/recovery-engine.ts
export class RecoveryEngine {
  private strategies: RecoveryStrategy[];
  private maxCycles: number;
  private cycles = 0;

  constructor(strategies: RecoveryStrategy[], maxCycles = 6) {
    this.strategies = strategies;
    this.maxCycles = maxCycles;
  }

  async recover(
    session: AgentSession,
    plan: Plan,
    failure: TaskFailure
  ): Promise<boolean> {
    if (this.cycles >= this.maxCycles) return false;

    // 1. 分类失败原因
    const classification = this.classifyFailure(failure);

    // 2. 选择恢复策略
    const strategy = this.strategies.find(s => s.canHandle(classification));
    if (!strategy) return false;

    // 3. 执行恢复
    this.cycles++;
    const result = await strategy.execute(session, plan, failure, classification);

    // 4. 验证恢复结果
    if (result.action === 'retry') {
      return true; // 重试当前任务
    }
    if (result.action === 'replace') {
      return true; // 用新任务替换
    }
    if (result.action === 'escalate') {
      return false; // 无法恢复
    }

    return false;
  }
}

// 可插拔的恢复策略
interface RecoveryStrategy {
  name: string;
  canHandle(classification: FailureClassification): boolean;
  execute(
    session: AgentSession,
    plan: Plan,
    failure: TaskFailure,
    classification: FailureClassification
  ): Promise<RecoveryResult>;
}

// 策略示例：质量诊断修复
class QualityDiagnosticRepairStrategy implements RecoveryStrategy {
  name = 'quality-diagnostic-repair';

  canHandle(classification): boolean {
    return classification.type === 'quality_gate_failure'
      && classification.diagnostics.length > 0;
  }

  async execute(session, plan, failure, classification): Promise<RecoveryResult> {
    const diagnostics = classification.diagnostics;

    // 按领域分组诊断
    const groups = this.groupByDomain(diagnostics);

    // 为每个领域创建修复任务
    const repairTasks = Object.entries(groups).map(([domain, items]) => ({
      role: domain as McpRole,
      title: `修复质量诊断（${domain}）`,
      instruction: this.buildRepairInstruction(items),
      access: 'write' as const,
      acceptance: items.map(d => `已修复：${d.message}`),
      requirementIds: failure.task.requirementIds,
    }));

    // 在失败任务前插入修复任务
    return {
      action: 'replace',
      newTasks: repairTasks,
      supersedeTaskId: failure.task.id,
    };
  }
}
```

#### 3.3.4 Observer（观察与自省）

```typescript
// agent/observer.ts
export class Observer {
  async observe(session: AgentSession, plan: Plan): Promise<Observation> {
    // 1. 项目状态快照
    const projectState = await this.checkProjectState(session);

    // 2. 需求覆盖分析
    const coverage = this.analyzeCoverage(session, plan);

    // 3. 任务进度分析
    const progress = this.analyzeProgress(plan);

    // 4. 失败模式分析
    const failures = this.analyzeFailures(plan);

    // 5. 生成观察摘要
    return {
      projectState,
      coverage,
      progress,
      failures,
      summary: this.generateSummary(projectState, coverage, progress, failures),
      recommendations: this.generateRecommendations(coverage, progress, failures),
    };
  }

  async recordProgress(
    session: AgentSession,
    plan: Plan,
    results: TaskResult[]
  ): Promise<void> {
    // 1. 更新需求覆盖
    this.refreshRequirementCoverage(session, plan);

    // 2. 记录观察
    const observation = await this.observe(session, plan);
    session.observations.push(observation);

    // 3. 自省：是否需要调整策略
    const reflection = this.reflect(session, plan, results);
    if (reflection.needAdjustment) {
      await this.adjustStrategy(session, plan, reflection);
    }
  }

  private reflect(
    session: AgentSession,
    plan: Plan,
    results: TaskResult[]
  ): Reflection {
    // 分析最近的执行模式
    const recentFailures = results.filter(r => !r.success);
    const repeatedFailures = this.detectRepeatedFailures(session);

    if (repeatedFailures.length > 0) {
      return {
        needAdjustment: true,
        reason: 'repeated_failures',
        suggestion: '检测到重复失败模式，建议更换执行策略',
        failures: repeatedFailures,
      };
    }

    return { needAdjustment: false };
  }
}
```

### 3.4 文件结构

```
server/src/agent/
├── orchestrator.ts           # 主编排循环
├── planner.ts                # 目标规划
├── decision-engine.ts        # 决策引擎
├── specialist-runner.ts      # 专家执行器
├── tool-pipeline.ts          # 工具调用管线
├── argument-builder.ts       # 参数构建与预检
├── recovery-engine.ts        # 恢复策略引擎
├── diagnostic-analyzer.ts    # 诊断分析
├── observer.ts               # 观察与自省
├── context-manager.ts        # 上下文管理
├── progress-tracker.ts       # 进度追踪
├── session-store.ts          # 会话持久化
├── event-bus.ts              # 事件总线
├── llm-client.ts             # LLM 调用封装
├── types.ts                  # 类型定义
├── strategies/
│   ├── requirement-coverage.ts    # 需求覆盖策略
│   ├── quality-repair.ts          # 质量修复策略
│   ├── dependency-resolution.ts   # 依赖解析策略
│   ├── risk-assessment.ts         # 风险评估策略
│   └── user-clarification.ts      # 用户澄清策略
└── recovery-strategies/
    ├── transient-retry.ts         # 瞬时错误重试
    ├── argument-correction.ts     # 参数纠正
    ├── role-redirection.ts        # 角色重定向
    ├── task-decomposition.ts      # 任务分解
    ├── quality-diagnostic.ts      # 质量诊断修复
    └── user-escalation.ts         # 用户升级
```

---

## 四、重写实施计划

### Phase 1：基础架构（2-3 天）

1. **创建 `agent/types.ts`** — 统一类型定义
   - 合并 `project-agent-v2-types.ts` 中的类型
   - 定义新的 `Decision`、`Observation`、`RecoveryResult` 等类型
   - 消除 `project-agent-loop.ts` 和 `project-agent-actions.ts` 的重复定义

2. **创建 `agent/session-store.ts`** — 重构会话持久化
   - 从 `project-agent-v2-store.ts` 提取纯存储逻辑
   - 分离 PostgreSQL 镜像逻辑
   - 支持新的会话结构

3. **创建 `agent/event-bus.ts`** — 事件总线
   - 从路由中提取事件发布逻辑
   - 支持 SSE 和内部事件订阅

4. **创建 `agent/llm-client.ts`** — LLM 调用封装
   - 从路由中提取 LLM 调用逻辑
   - 统一重试、路由选择、结构化输出处理

### Phase 2：核心引擎（3-4 天）

5. **创建 `agent/orchestrator.ts`** — 主编排循环
   - 实现 `runTurn()` 方法
   - 管理会话生命周期
   - 协调各子系统

6. **创建 `agent/observer.ts`** — 观察与自省
   - 实现项目状态检查
   - 实现需求覆盖分析
   - 实现失败模式检测
   - 实现自省与策略调整

7. **创建 `agent/decision-engine.ts`** — 决策引擎
   - 实现策略注册与选择
   - 实现决策验证
   - 实现默认策略集

8. **创建 `agent/specialist-runner.ts`** — 专家执行器
   - 从路由中提取 `runSpecialist()` 逻辑
   - 实现工具调用管线
   - 实现参数预检与纠正

### Phase 3：恢复系统（2-3 天）

9. **创建 `agent/recovery-engine.ts`** — 恢复策略引擎
   - 实现策略注册与选择
   - 实现恢复循环
   - 实现预算管理

10. **创建 `agent/recovery-strategies/*.ts`** — 恢复策略
    - 瞬时错误重试
    - 参数纠正
    - 角色重定向
    - 任务分解
    - 质量诊断修复
    - 用户升级

11. **创建 `agent/diagnostic-analyzer.ts`** — 诊断分析
    - 从 `project-agent-v2-remediation.ts` 提取逻辑
    - 实现诊断分类
    - 实现修复建议生成

### Phase 4：集成与迁移（2-3 天）

12. **重写 `routes/project-agent-v3.ts`** — 新路由
    - 纯 HTTP/SSE 表现层
    - 调用 Orchestrator 完成所有逻辑
    - 目标：~150 行（当前 968 行）

13. **创建迁移适配器**
    - 支持旧 V2 会话读取
    - 支持平滑升级

14. **更新 `formflow-tool-registry.ts`**
    - 支持工具推荐
    - 支持工具使用统计

### Phase 5：测试与优化（2-3 天）

15. **单元测试**
    - 每个策略独立测试
    - 决策引擎测试
    - 恢复引擎测试

16. **集成测试**
    - 端到端场景测试
    - 失败恢复测试
    - 并发安全测试

17. **性能优化**
    - 工具调用批处理
    - 上下文压缩优化
    - 事件流优化

---

## 五、与现有系统的兼容性

### 5.1 保持不变的部分

- **MCP 工具系统** — `formflow-tool-registry.ts` 和 `tools/*.ts` 完全不变
- **数据模型** — `.formflow` 项目包结构不变
- **认证/授权** — 中间件不变
- **LLM Provider** — `llm-provider-client.ts` 不变

### 5.2 需要迁移的部分

- **会话格式** — V2 → V3，需要兼容读取
- **API 端点** — V2 端点保留，V3 端点新增
- **事件格式** — 保持向后兼容

### 5.3 可以删除的部分

- `project-agent-loop.ts` — 旧轮次协调器，已被 Actions 替代
- 路由中的内联逻辑 — 全部提取到 agent/ 模块

---

## 六、预期收益

| 指标 | 当前 | 重写后 |
|------|------|--------|
| 路由文件行数 | 968 | ~150 |
| 恢复策略数 | 3-4 种硬编码 | 6+ 可插拔策略 |
| 决策策略数 | 1 种（LLM 直接决策） | 5+ 可组合策略 |
| 自省能力 | 无 | 每步自省 + 策略调整 |
| 新增工具成本 | 修改路由 | 注册即用 |
| 新增恢复策略 | 修改路由 | 新增文件即用 |
| 测试覆盖 | 集成测试为主 | 单元测试为主 |
| 可观测性 | 事件流 | 事件流 + 决策推理链 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 迁移期间 V2/V3 并存 | 维护成本 | 用适配器隔离，逐步迁移 |
| 新架构引入 Bug | 用户体验 | 充分测试，灰度发布 |
| LLM 调用成本增加 | 运营成本 | 预算控制 + 缓存优化 |
| 专家执行延迟 | 响应时间 | 并行执行 + 超时控制 |

---

## 八、总结

当前项目智能体是一个"能用但不好改"的系统。重写的**核心目标**是：

1. **分离关注点** — 路由、编排、执行、恢复各司其职
2. **策略可插拔** — 新增决策/恢复策略只需新增文件
3. **自省驱动** — 每步执行后观察、总结、调整
4. **可观测性** — 每个决策都有完整的推理链

这不是一次"推倒重来"，而是一次"结构化重构"——保留所有已验证的业务逻辑，用更好的架构重新组织它们。

---

## 九、第二轮追问与深度完善

### 🔥 追问 1：LLM 协调器能被规则引擎替代吗？

**答案：不能，但可以被约束。**

当前系统有**两种完全不同的 LLM 使用方式**：

| 角色 | 调用方式 | 输入 | 输出 | 能否用规则替代 |
|------|---------|------|------|-------------|
| **协调器** | `chat()` + structured output | 完整上下文（需求、观察、失败、工具归属） | `NextActionDecision` (assign/complete/ask_user/abort) | ❌ 不能 |
| **专家** | `startAgent()` gRPC → Python 运行时 → tool_call 循环 | 系统提示词 + 工具定义 | 工具调用序列 | ❌ 不能 |

**关键发现**：协调器通过 `chat()` 发送一次请求，获得结构化的 `NextActionDecision`。专家通过 gRPC `startAgent()` 让 Python 端的 LLM 运行时自主执行多步工具调用循环。

**修正方案**：DecisionEngine 不替代 LLM，而是**在 LLM 决策前后加约束层**：

```
┌─────────────────────────────────────────────────────┐
│                DecisionEngine (新)                    │
│                                                      │
│  1. Pre-决策约束（规则）                               │
│     - 需求覆盖检查 → 强制未覆盖需求优先                │
│     - 失败任务检查 → 强制先处理失败                    │
│     - 写任务序列化 → 强制只允许一个写任务               │
│     - 风险检查 → 强制破坏性操作需确认                  │
│                                                      │
│  2. LLM 决策（保留现有 requestNextAction 逻辑）        │
│     - 发送约束后的上下文                               │
│     - 获得结构化决策                                   │
│                                                      │
│  3. Post-决策验证（规则）                              │
│     - 验证决策合法性（现有 validateNextActionDecision） │
│     - 检测风险扩展（现有 decisionExpandsRisk）          │
│     - 强制 completion 门禁（现有 completionBlockers）   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**好处**：LLM 负责创造性判断（选什么工具、怎么解决问题），规则负责确定性约束（不能做什么、必须先做什么）。

---

### 🔥 追问 2：Observer 每步运行的性能开销有多大？

**答案：当前 `verifyTask()` 每个任务 2-6 次 MCP 调用。**

精确的调用计数：

| 任务类型 | verifyTask() 调用的工具 | 调用次数 |
|---------|----------------------|---------|
| **data** (写) | `data_source.get` + `data_keys.validate` + `project.validate` + `project.quality.inspect` | 4-6 |
| **behavior** (写) | `rule_syntax.lint` + `rule_test.run` + `behavior.list` + `project.validate` + `project.quality.inspect` | 5-7 |
| **quality** (门禁) | `project.validate` + `project.quality.inspect` | 2-3 |
| **delivery** | `project.validate` + `release.preview` | 2-3 |
| **普通 read** | `project.validate` | 1 |
| **无项目** | 0（只检查工具结果） | 0 |

`checkCurrentProjectState()`（提问前的复核）调用 3×N 次（N = 限定项目数）：
- `project.inspect` × N
- `project.validate` × N
- `project.get` × N

**修正方案**：Observer 不每步全量检查，而是**分层观察**：

```typescript
// agent/observer.ts — 分层观察
export class Observer {
  // 轻量观察：每步都跑，只检查任务状态（0 次 MCP 调用）
  observeQuick(session, plan): QuickObservation {
    return {
      coverage: refreshRequirementCoverage(session.requirements, plan.tasks, session.artifacts),
      progress: this.analyzeProgress(plan),
      failures: this.analyzeFailures(plan),
      blockers: completionBlockers(session, plan),
    };
  }

  // 中量观察：任务完成后跑（1-2 次 MCP 调用）
  observeAfterTask(session, plan, task): TaskObservation {
    const quick = this.observeQuick(session, plan);
    const validation = await executeLlmTool('project.validate', { projectId: task.projectId });
    return { ...quick, validation };
  }

  // 重量观察：提问或恢复前跑（3×N 次 MCP 调用）
  observeDeep(session, reason): DeepObservation {
    return await checkCurrentProjectState(session, run, reason);
  }
}
```

---

### 🔥 追问 3：会话格式迁移复杂度有多高？

**答案：`AgentSessionV2` 有 30+ 字段，全部在使用中。**

完整字段清单（标记 V3 建议）：

| 字段 | 类型 | V2 使用 | V3 建议 |
|------|------|---------|---------|
| `schemaVersion` | 2 | 版本标识 | → 3 |
| `id`, `tenantId`, `userId` | string | 核心标识 | 保留 |
| `projectId`, `projectIds` | string[] | 项目范围 | 保留 |
| `projectRevisions` | Record<string,string> | Revision 追踪 | 保留 |
| `title`, `profileId` | string | 元信息 | 保留 |
| `capabilityBundleVersionId` | string | 能力包引用 | 保留 |
| `phase` | AgentPhase (13 种) | 生命周期 | 保留，新增 `reflecting` |
| `turnId` | string | 当前轮次 | 保留 |
| `plans` | AgentPlanRevision[] | 计划历史 | 保留 |
| `activePlanId` | string | 当前计划 | 保留 |
| `questions` | AgentQuestion[] | 待回答问题 | 保留 |
| `requirements` | AgentRequirement[] | 需求契约 | 保留 |
| `requirementCoverage` | AgentRequirementCoverage | 覆盖统计 | 保留 |
| `requirementRevision` | number | 需求版本 | 保留 |
| `messages` | Array<...> | 对话历史 | 保留 |
| `conversationSummary` | string | 压缩摘要 | 保留 |
| `artifacts` | AgentArtifact[] | 产物 | 保留 |
| `events` | AgentEvent[] | 事件流 | 保留 |
| `checkpointRevision` | string | 检查点 | 保留 |
| `pendingApproval` | PendingApproval | 待确认操作 | 保留 |
| `activeRunId` | string | 当前 gRPC run | 保留 |
| `controlSignal` | string | 控制信号 | 保留 |
| `pendingSteer` | string | 转向指令 | 保留 |
| `recovery` | {...} | 恢复状态 | 保留，结构微调 |
| `orchestration` | AgentOrchestrationState | 编排状态 | **重构**：合并 steps/rounds |
| `rounds` | AgentOrchestrationRound[] | 旧轮次 | **删除**（已被 steps 替代） |
| `steps` | AgentOrchestrationStep[] | 决策步 | 保留 |
| `observations` | AgentObservation[] | 观察记录 | 保留 |
| `pinnedAt` | string | 置顶 | 保留 |
| `archived` | boolean | 归档 | 保留 |
| `createdAt`, `updatedAt` | string | 时间戳 | 保留 |

**关键发现**：`rounds` 字段是旧 V1 轮次系统的遗留，当前 V2 路由代码中**完全没有使用**。可以安全删除。

**修正方案**：V3 会话 = V2 会话 - `rounds` + `reflections`：

```typescript
interface AgentSessionV3 extends Omit<AgentSessionV2, 'schemaVersion' | 'rounds'> {
  schemaVersion: 3;
  reflections?: AgentReflection[];  // 自省记录
}
```

迁移适配器：
```typescript
function migrateV2toV3(v2: AgentSessionV2): AgentSessionV3 {
  const { schemaVersion, rounds, ...rest } = v2;
  return { ...rest, schemaVersion: 3, reflections: [] };
}
```

---

### 🔥 追问 4：`project-agent-loop.ts`（旧轮次系统）真的可以删除吗？

**答案：路由文件不使用它，但类型定义被引用。**

检查结果：
- `routes/project-agent-v2.ts` 导入了 `project-agent-loop.ts` 的 `PROJECT_AGENT_ROLES` 和 `DEFAULT_MAX_LOOP_ROUNDS`
- 但这些常量在 `project-agent-actions.ts` 中有**完全相同的重复定义**
- 路由中的 `ensureOrchestrationState()` 调用来自 `project-agent-loop.ts`，但它被 `project-agent-actions.ts` 的 `ensureActionState()` 替代了
- `rounds` 字段在路由代码中**从未被读取或写入**（只在 store 的兼容逻辑中初始化为空数组）

**结论**：可以安全删除 `project-agent-loop.ts`，只需将 `PROJECT_AGENT_ROLES` 和 `DEFAULT_MAX_LOOP_ROUNDS` 的导入源改为 `project-agent-actions.ts`。

---

### 🔥 追问 5：新路由真的能压缩到 150 行吗？

**答案：不能，但可以压缩到 ~300 行。**

当前 968 行的分解：

| 职责 | 行数 | 提取目标 |
|------|------|---------|
| HTTP 路由定义（20+ 端点） | ~120 | 保留在路由 |
| 会话 CRUD 辅助函数 | ~80 | 保留在路由 |
| `planTurn()` 规划流程 | ~120 | → `agent/orchestrator.ts` |
| `executePlan()` 执行循环 | ~100 | → `agent/orchestrator.ts` |
| `runSpecialist()` 专家执行 | ~200 | → `agent/specialist-runner.ts` |
| `verifyTask()` 验证逻辑 | ~150 | → `agent/verifier.ts` |
| `recoverFailedTask()` 恢复 | ~100 | → `agent/recovery-engine.ts` |
| `requestNextAction()` 决策 | ~50 | → `agent/decision-engine.ts` |
| LLM 调用辅助函数 | ~50 | → `agent/llm-client.ts` |

路由保留：HTTP 定义 + CRUD 辅助 + SSE 事件流 = **~300 行**。

**修正**：目标从 150 行调整为 300 行，更现实。

---

### 🔥 追问 6：Tool Pipeline 和 Specialist Runner 有什么区别？

**答案：它们是同一层，应该合并。**

上一轮 plan 中分了 `tool-pipeline.ts` 和 `specialist-runner.ts`，但实际逻辑是：

```
Specialist Runner = 启动 gRPC agent → while(tool_call) { 准备参数 → 执行 → 处理结果 }
```

工具调用管线就是专家执行器的核心循环，不需要独立文件。

**修正**：合并为 `agent/specialist-runner.ts`，删除 `tool-pipeline.ts`。

---

### 🔥 追问 7：如何测试 LLM 驱动的决策？

**答案：分层测试 + Mock LLM 响应。**

```
Layer 1: 纯函数测试（无 LLM）
  - parseNextActionDecision() — 测试 Schema 解析
  - validateNextActionDecision() — 测试约束验证
  - classifyAgentFailure() — 测试失败分类
  - refreshRequirementCoverage() — 测试覆盖计算
  - completionBlockers() — 测试门禁逻辑

Layer 2: 策略测试（Mock LLM）
  - DecisionEngine.decide() — Mock 所有策略，验证选择逻辑
  - RecoveryEngine.recover() — Mock 恢复策略，验证分发逻辑
  - Observer.observeQuick() — 验证纯计算逻辑

Layer 3: 集成测试（Mock gRPC）
  - Orchestrator.runTurn() — Mock llmProviderClient，验证完整流程
  - SpecialistRunner.run() — Mock startAgent/resumeAgent，验证工具调用循环
```

---

### 🔥 追问 8：渐进式迁移如何并存 V2 和 V3？

**答案：共享存储层，分离路由层。**

```
V2 路由: /api/ai/project-agent/v2/sessions/*
  ↓ 调用
V2 编排逻辑 (现有代码，不修改)
  ↓ 共享
Session Store (v2-store.ts，读写同一份 JSON/PostgreSQL)
  ↑ 共享
V3 编排逻辑 (新代码)
  ↑ 调用
V3 路由: /api/ai/project-agent/v3/sessions/*
```

V2 和 V3 读写同一个 `project-agent-v2.json` 文件。V3 读取 V2 创建的会话时，通过适配器补充缺失字段。V2 读取 V3 创建的会话时，忽略未知字段。

**关键约束**：同一会话不能同时被 V2 和 V3 执行。通过 lease 机制（已有）保证互斥。

---

## 十、修订后的实施计划

### Phase 1：基础提取（1-2 天）

**目标**：从路由中提取可独立测试的模块，不改变行为。

| 文件 | 来源 | 行数 | 职责 |
|------|------|------|------|
| `agent/types.ts` | `v2-types.ts` + `v2-store.ts` 类型重导出 | ~100 | 统一类型 |
| `agent/llm-client.ts` | 路由中的 `chat()` 函数 | ~40 | LLM 调用封装 |
| `agent/verifier.ts` | 路由中的 `verifyTask()` | ~180 | 任务验证 |
| `agent/state-checker.ts` | 路由中的 `checkCurrentProjectState()` + `state-check.ts` | ~80 | 项目状态检查 |

**验证**：现有测试全部通过。

### Phase 2：核心编排提取（2-3 天）

**目标**：将编排逻辑从路由中提取为独立模块。

| 文件 | 来源 | 行数 | 职责 |
|------|------|------|------|
| `agent/orchestrator.ts` | 路由中的 `planTurn()` + `executePlan()` + 执行循环 | ~250 | 主编排 |
| `agent/specialist-runner.ts` | 路由中的 `runSpecialist()` | ~200 | 专家执行 |
| `agent/decision-engine.ts` | 路由中的 `requestNextAction()` + `actions.ts` 验证 | ~100 | 决策封装 |
| `agent/recovery-engine.ts` | 路由中的 `recoverFailedTask()` + `v3-recovery.ts` | ~150 | 恢复封装 |

**验证**：端到端场景测试通过。

### Phase 3：Observer 与自省（2 天）

**目标**：新增自省能力。

| 文件 | 来源 | 行数 | 职责 |
|------|------|------|------|
| `agent/observer.ts` | 新建 | ~120 | 分层观察（quick/after-task/deep） |
| `agent/reflector.ts` | 新建 | ~80 | 自省与策略调整建议 |

**验证**：Observer 能检测重复失败模式并建议策略调整。

### Phase 4：路由瘦身与迁移（1-2 天）

**目标**：新路由只做 HTTP 表现层。

| 文件 | 行数 | 职责 |
|------|------|------|
| `routes/project-agent-v3.ts` | ~300 | HTTP + SSE + 调用 Orchestrator |
| `agent/v2-compat.ts` | ~50 | V2→V3 会话适配 |

**验证**：V3 端点功能与 V2 一致。

### Phase 5：清理与测试（1-2 天）

**目标**：删除废弃代码，补充测试。

| 操作 | 详情 |
|------|------|
| 删除 `project-agent-loop.ts` | 旧轮次系统，已被 Actions 替代 |
| 清理 `v2-store.ts` 中的 `rounds` 兼容逻辑 | 不再需要 |
| 单元测试 | 纯函数、策略、验证器 |
| 集成测试 | Orchestrator + SpecialistRunner |

**总工时**：7-11 天（比上一轮估算更精确）

---

## 十一、文件清单（最终版）

```
server/src/agent/
├── types.ts                # 统一类型定义（~100 行）
├── llm-client.ts           # LLM 调用封装（~40 行）
├── orchestrator.ts         # 主编排循环（~250 行）
├── specialist-runner.ts    # 专家执行器（~200 行）
├── decision-engine.ts      # 决策引擎（~100 行）
├── recovery-engine.ts      # 恢复策略引擎（~150 行）
├── verifier.ts             # 任务验证器（~180 行）
├── state-checker.ts        # 项目状态检查（~80 行）
├── observer.ts             # 分层观察（~120 行）
├── reflector.ts            # 自省与策略调整（~80 行）
├── v2-compat.ts            # V2→V3 适配（~50 行）
└── __tests__/
    ├── orchestrator.test.ts
    ├── specialist-runner.test.ts
    ├── decision-engine.test.ts
    ├── recovery-engine.test.ts
    ├── verifier.test.ts
    └── observer.test.ts

server/src/routes/
├── project-agent-v2.ts     # 保留，不修改
└── project-agent-v3.ts     # 新路由（~300 行）

删除：
├── server/src/services/project-agent-loop.ts  # 旧轮次系统
```

---

## 十二、关键设计决策总结

| 决策 | 选择 | 理由 |
|------|------|------|
| LLM 协调器替代 | **不替代**，加约束层 | LLM 负责创造性判断，规则负责确定性约束 |
| Observer 频率 | **分层**：quick 每步，deep 按需 | 避免每步 3-6 次 MCP 调用的开销 |
| 会话迁移 | **增量**：V3 = V2 - rounds + reflections | 最小化迁移风险 |
| 旧代码删除 | **只删 `project-agent-loop.ts`** | 其他模块仍在使用 |
| 路由行数 | **~300 行**（非 150） | HTTP 定义 + CRUD + SSE 本身就需要这些 |
| Tool Pipeline | **合并进 Specialist Runner** | 不是独立关注点 |
| 测试策略 | **分层**：纯函数 → 策略 Mock → 集成 Mock | 每层可独立验证 |
