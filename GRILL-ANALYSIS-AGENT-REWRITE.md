# 🔥 Grill-Me 深度分析：项目智能体重写方案

> 分析日期：2026-07-30
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
