# 用形式化验证优化 FormFlow Behavior Rule DSL：目标、评价方法与优化路线调研

> 调研日期：2026-08-03
> 定位：为 Behavior Rule DSL 引入形式化验证方法提供**目标清单、评价方法和基于评价的优化闭环**。
> 方法与资料口径：本地一手资料（DSL 文档、编译器/校验器/运行时源码、现有测试）+ 外部一手来源（官方文档、论文、工具站点）。

## 0. 摘要（TL;DR）

1. **最有价值的三个目标**：(a) 把 `docs/behavior-rule-syntax.md` 里的 EBNF 变成可执行文法（如 ANTLR v4），让"文档语法"和"编译器语法"成为同一份事实；(b) 为 DSL 写出可执行参考语义（reference interpreter），让编译器和运行时有了可对标的 oracle；(c) 把静态属性（表达式类型安全、跨规则计算依赖无环、条件/反向分支完备、引用全量解析）从"正则启发式警告"升级为可证明/可反例的形式化检查。
2. **评价方法按性价比排序**：符合性测试套件（先做，锚定文档每个 MUST 约束）→ 基于文法的模糊测试 + 差分测试（自动化找分歧）→ 变异测试（评价测试本身的质量，驱动补测试/补检查）→ 性质测试与模型检查（对静态属性做深验证）。
3. **优化闭环**：形式化（文法+语义）→ 自动生成测试与文档 → 模糊/变异/模型检查找反例 → 反例转回归用例 → 修复编译器与校验器 → CI 门禁（符合性 100%、变异得分阈值、差分分歧为 0）。反例和幸存变异体是"评价结果"到"优化动作"的桥梁。
4. 当前实现的最大风险点：编译器是**正则驱动的逐行解析**（`shared/formflow-core/behaviorDsl/parser.ts`），文档明确说 EBNF "描述的是结构约束，真正可执行边界以语法硬约束为准"——即语法事实没有单一来源；跨规则 compute 回写环只在单条规则上提示（FFR302），跨字段环没有全局检测。
5. 建议先做 Phase 0-1（基线盘点 + 文法形式化 + 符合性套件），1-2 周内即可产出可量化的改进；重型工具（K Framework 可执行语义、TLA+ 行为模型）放到 Phase 2-3，按需引入。

---

## 1. 背景与现状盘点

### 1.1 DSL 是什么

FormFlow Behavior Rule DSL 1.0 是表单联动的小型受限规则语言，覆盖五类场景：条件显隐、必填/可选、计算与同步、选项与流程联动、提交前守卫。权威语义文档是 `docs/behavior-rule-syntax.md`，其中给出 EBNF、语法硬约束、表达式约束、动作参考、执行逻辑和 FFR 诊断编号表（FFR000-399）。

### 1.2 当前实现与校验链

| 环节 | 位置 | 现状 |
| --- | --- | --- |
| 语法解析 | `shared/formflow-core/behaviorDsl/parser.ts` | 按行正则匹配（`OPERATOR_MAP` 在 [parser.ts:6](shared/formflow-core/behaviorDsl/parser.ts:6) 起按固定顺序尝试正则；`parseCondition` 在 [parser.ts:76](shared/formflow-core/behaviorDsl/parser.ts:76)） |
| 动作解析 | `parser.ts:98` `parseCanonicalAction` | 按动作名+参数个数匹配，不做表达式子语言校验 |
| 引用校验 | `parser.ts:269` `lintRules` | 字段/控件/表/流程引用检查（FFR2xx）；只读性检查有限 |
| 循环提示 | `parser.ts:288` | FFR302 只检查"动作写回**同一条规则**的触发字段"，是 warning 而非全局环检测 |
| 表达式解释器 | `shared/formflow-core/propertyExpression.ts` | 手写 tokenizer + Pratt 解析 + 运行时求值；有基于依赖图的环检测（[propertyExpression.ts:35](shared/formflow-core/propertyExpression.ts:35)、[:342](shared/formflow-core/propertyExpression.ts:342)），但只覆盖 `valueExpression` 属性图，不覆盖 DSL `compute` 编译产物 |
| 语义校验 | `server/src/services/project-semantic-validation.ts` | `BEHAVIOR_WRITE_CONFLICT`、控件类型匹配、状态值一致性等；部分依赖正则启发式（如 `actionableScript`、`unsupportedLookup`） |
| 运行时 | `ui/src/services/engine/formEventExecutor.ts` | 事件触发 → 命中规则 → 顺序执行动作 |
| 测试 | `ui/src/services/engine/behaviorDsl.test.ts`（156 行）、`server/src/services/behavior-tool-preflight.test.ts` 等 | node:test 手写用例，无随机生成、无变异、无符合性套件概念 |

### 1.3 已观察到的可形式化改进点（gap 清单）

1. **文法没有单一事实来源**：文档 EBNF 与实现正则各自演化，文档自己声明 EBNF 只是"结构约束"。正则按顺序首匹配解析条件（`OPERATOR_MAP`），存在歧义与漏检风险（如操作符关键字出现在字面量/字段名中的边界情况、`parseCondition` 对"匹配到哪个运算符"的顺序依赖）。
2. **表达式子语言在编译期不校验**：`compute $x = <expr> watch(...)` 和 `set($x, <expr>)` 的表达式只存字符串，编译期只做 `$字段` 正则抽取（`lintRules`），不按 `propertyExpression` 的语法/函数白名单校验——`set($x, fetch("/api"))` 这类越界表达式要到项目语义校验层才被启发式正则拦（`project-semantic-validation.ts` 的 `actionableScript`/`unsupportedLookup`）。
3. **跨规则计算环无全局检测**：FFR302 只对单条规则"动作写回自身触发字段"告警；`compute A = f(B) watch(B)` + `compute B = g(A) watch(A)` 编译为两条规则后互相触发，编译期不会报错（`propertyExpression.ts` 的环检测不作用于 DSL 编译产物）。文档 13.4 也把"计算规则互相回写"列为反例，但当前实现只对同一行 `when` 写回自触发字段给 warning。
4. **`else` 反向语义依赖手工表**：`INVERSE_OPERATOR`（`parser.ts:193`）手工维护 12 个运算符的反向映射，无机械证明"when 成立 ⇔ else 条件不成立"（空值语义、`contains` 家族、类型转换下的互补性）。
5. **守卫/常规动作语境约束不完备**：动作在 guard 语境与普通语境有允许集合差异，但解析只在 `parseCanonicalAction(phrase, mode)` 中区分，缺少按触发器类型的形式化"动作类型系统"。
6. **诊断编号与约束没有双向追踪**：FFR000-399 在文档中定义，但缺少"每条约束 → 对应测试用例 → 对应诊断码"的可追踪矩阵，无法度量校验器的完备性。

这些 gap 决定了第一部分"目标"的选取：形式化验证不是为验证而验证，而是**把上述启发式/手工维护的事实变成可检验、可证明、可反例的形式化对象**。

---

## 2. 第一部分：具体要实现什么目标

### 2.1 目标分层

把目标分成 5 层，从轻到重：

- **L1 语法层**：可执行文法 + AST，替代正则解析。
- **L2 语义层**：可执行参考语义（oracle），对齐文档 11.x 的执行逻辑。
- **L3 静态属性层**：类型安全、依赖无环、条件完备、引用解析健全、动作语境约束。
- **L4 运行时行为层**：确定性、终止性、触发调度一致性。
- **L5 基础设施层**：符合性套件、性质/变异/模糊/差分测试流水线、CI 门禁。

### 2.2 可验收目标清单

| 编号 | 目标 | 动机（对应 gap） | 形式化手段 | 验收标准（度量 + 阈值） |
| --- | --- | --- | --- | --- |
| G1 | 文法单一事实来源：把 EBNF 落地为 ANTLR v4 `.g4`，生成 parser/AST | gap 1 | 文法形式化（[Xtext 语法语言](https://eclipse.dev/Xtext/documentation/301_grammarlanguage.html) 同样主张"文法 → lexer/parser/linker/validation"）；ANTLR 生成解析器 | 文档 EBNF 与 `.g4` 逐规则对齐；`docs/behavior-rule-syntax.md` 全部示例编译结果不变；Grammarinator 可直接消费 `.g4`（见 3.2） |
| G2 | 可执行参考语义：按文档 11.x 写 reference interpreter（或 K 语义原型） | gap 2/6；文档声明自己为权威语义 | 操作语义/指称语义（工业实践见 [Keshishzadeh et al. 2015](https://ar5iv.labs.arxiv.org/html/1511.08049)：formal semantics 作为所有 transformation 的统一参考）；[K Framework](https://kframework.org/) 可从单一语法+语义描述提取 parser/interpreter/symbolic execution | 差分测试 0 分歧（见 3.4）；文档示例在参考语义与产品编译器上行为一致 |
| G3.1 | 表达式类型安全：编译期类型检查 `compute`/`set` 表达式 | gap 2 | 基于字段类型（sheet columns `dataType`）的简单类型系统；对照 [电子表格静态分析（抽象解释）](https://rd.springer.com/chapter/10.1007/978-3-662-46669-8_2) 的思路 | 所有类型不安全用例（数字字段做 `contains`、除以字符串等）编译期报错；合法用例零误报；用变异注入的类型错误 100% 检出 |
| G3.2 | 跨规则依赖无环：compute/写回图全局环检测 | gap 3 | 数据流图 + 拓扑排序/强连通分量（复用 `propertyExpression.ts` 的 DFS 思路，提升到 DSL 编译产物层） | `compute A=f(B)` + `compute B=g(A)` 编译期报错；图规模 ≤1000 条规则时 lint 在预算时间内完成 |
| G3.3 | 条件与反向分支完备：`else` 恰为 `when` 的补 | gap 4 | 用 SMT（[Z3](https://microsoft.github.io/z3guide/)）证明 `INVERSE_OPERATOR` 对（如 `>`↔`<=`、`contains`↔`not contains`）在值域上互补；检测不可满足条件（如 `$x>5 && $x<3`） | 12 个运算符对全部机械化验证；对每个运算符族生成反例矩阵；不可满足条件报 warning |
| G3.4 | 引用解析健全：所有动作参数槽穷尽引用校验 | gap 6 | 把动作签名表（参数槽类型：字段/控件/表/流程/字面量）形式化，`lintRules` 按签名全量校验 | 每个动作类型都有正/反符合性用例；不存在"接受但引用悬空"的合法编译 |
| G3.5 | 动作语境类型系统：guard 动作只在守卫语境、普通动作规则化 | gap 5 | 类型化规则（trigger × action 的相容矩阵） | 违反矩阵的写法编译期报错；文档 10.2 守卫动作表与矩阵一致 |
| G4 | 确定性：同一输入下编译结果与运行时行为确定 | 文档 11.7 声明顺序语义 | 记录"书写顺序 → 执行顺序"的形式化证明或差分测试；[Alloy](https://alloytools.org/about) 建模触发器/动作关系找反例 | 编译产物 byte 级确定性（重复编译哈希一致）；调度反例集合为空 |
| G5 | 终止性：事件触发链有界（compute 链、options 刷新、消息循环） | gap 3 运行时表现 | [TLA+](https://lamport.azurewebsites.net/tla/tla.html)（TLC 模型检查）或 [mCRL2](https://www.mcrl2.org/)（等价检查/模型检查）建模触发调度 | 有限状态抽象下所有可达状态无无限循环；每个反例路径自动转回归用例 |
| G6 | 评价基础设施：符合性套件 + 模糊/性质/变异/差分流水线 | gap 6 | 见第二部分 | 符合性通过率 100%；DSL 核心变异得分 ≥90%；差分分歧 = 0；模糊运行在固定时间预算内 0 crash |

### 2.3 关键设计决策：形式化到什么程度

- **轻量优先**：本 DSL 规模小（5 类语句、~20 个动作、12 个运算符、受限表达式），不需要 Coq/Isabelle 级别的机器证明来获得收益。G1/G3.1/G3.2/G3.4 用 parser generator + 图算法 + 类型检查即可落地，成本低、收益直接。
- **oracle 优先于证明**：参考解释器（G2）比"证明编译器正确"便宜得多，还能同时驱动差分测试和模型测试；K Framework 等重型可执行语义框架（[PLDI 2023 教程](https://pldi23.sigplan.org/details/pldi-2023-tutorials/5/From-Zero-to-Proving-Building-Your-First-Language-with-the-K-Framework)）留作 G2 的进阶选项。
- **模型检查用于"找反例"而非"证明全覆盖"**：Alloy/TLA+ 对小规模抽象做穷举搜索（有限范围），产出反例 → 转回归用例；不追求无限状态证明。这与 [Alloy 官方定位](https://alloytools.org/about)（generating counterexamples / exploring structures）一致。
- **验收标准必须可度量**：每个目标都绑定"度量 + 阈值"，避免"做了形式化"却无法验收。

---

## 3. 第二部分：评价方法

评价对象分三层：**DSL 设计本身**（语法/语义是否自洽）、**编译器与校验器实现**（是否忠于语义）、**测试与验证基础设施**（是否能抓住回归）。下面每种方法都给出：官方/权威来源、适用对象、产出指标、成本与落地建议。

### 3.1 符合性测试套件（Conformance Suite）——先做

思路：把文档中每条 MUST/MUST NOT 约束变成"正例（应编译）+ 反例（应拒绝且给出 FFR 码）"的用例库，并建立需求追踪矩阵。这是 W3C 等标准组织验证实现符合性的标准做法（[W3C XML Conformance Test Suite](https://www.w3.org/XML/Test/)，[W3C QA Framework 指南](https://www.w3.org/TR/qaframe-ops/)）。

- 适用对象：L1/L3 的语法、硬约束、引用校验、动作签名、FFR 诊断码。
- 产出指标：**符合性通过率**（= 通过用例/总用例）、约束覆盖矩阵（每条约束 ≥1 正例 + ≥1 反例）。
- 落地建议：从 `docs/behavior-rule-syntax.md` 的 13.x 常见错误反例和 12.x 用例出发建立首批用例；每个 FFR 码至少一个用例；CI 中跑满。
- 成本：低（用例是纯数据），收益高（把文档约束变成机器可执行的验收）。

### 3.2 基于文法的模糊测试（Grammar-Based Fuzzing）

思路：用文法（ANTLR v4 `.g4`）自动生成大量语法合法/畸形输入喂给编译器。代表性工具：[Grammarinator](https://grammarinator.readthedocs.io/en/stable/introduction.html)（从 ANTLR v4 文法生成测试、支持变异/重组、可集成 libFuzzer/AFL++ 做引导式模糊、支持 `afl-tmin` 用例最小化）；方法论见 [The Fuzzing Book 的文法章节](https://www.fuzzingbook.org/html/Grammars.html)（含 [Efficient Grammar Fuzzing](https://www.fuzzingbook.org/classic/GrammarFuzzer.html)、[Grammar Coverage](http://www.fuzzingbook.org/classic/GrammarCoverageFuzzer.html)、[Greybox Grammar Fuzzing](https://www.fuzzingbook.org/html/GreyboxGrammarFuzzer.html)）。

- 适用对象：编译器（parser.ts）、表达式解释器（propertyExpression.ts）、运行时求值。
- 产出指标：**0 crash / 0 无限循环**、文法规则覆盖率、发现的分歧/崩溃数；[libFuzzer](https://llvm.org/docs/LibFuzzer.html) 的语料库（corpus）同时作为回归测试集（其官方文档明确 corpus 可作 regression check）。
- 落地建议：G1 完成后 Grammarinator 可直接消费 `.g4`；无 crash 断言 + 与参考解释器差分（见 3.4）。
- 成本：中（需要 `.g4` + fuzz target），自动化程度高。

### 3.3 性质测试（Property-Based Testing）

思路：声明"对所有满足某规范的输入，性质 P 成立"，由工具随机生成输入并收缩（shrinking）。代表性工具：[QuickCheck](https://www.stackage.org/lts-24.36/package/QuickCheck-2.15.0.1)（Haskell，起源，随机生成 + 失败收缩）、[Hypothesis](https://hypothesis.readthedocs.io/)（Python，本仓库已有 python-service 可用）、TypeScript 侧的 [fast-check](https://fast-check.dev/)（与本仓库 TS 栈最匹配）。

适合本 DSL 的性质示例：

- 全函数性：任意（含畸形）输入调用 `compileBehaviorDsl` 不抛异常、诊断行号落在文件行数范围内。
- `else` 互补性：对随机字段值，`when C -> A` 与 `else -> B` 恰好一个命中。
- watch 完备性：`compute` 表达式中出现的 `$字段` ⊆ `watch(...)` 字段（文档 11.6/13.5 约束）。
- 确定性：同一输入两次编译产物一致（G4）。
- 无环：随机生成规则集，跨规则环检测结果与参考图算法一致（G3.2）。

产出指标：性质通过率、发现的反例（自动最小化）。
成本：中低；落地建议用 fast-check 与现有 node:test 集成。

### 3.4 差分测试（Differential Testing）

思路：同一输入喂给多个实现，比较输出。经典出处是 McKeeman 的 [Differential Testing for Software](https://www.cs.tufts.edu/~nr/cs257/archive/david-differences/differential-testing.pdf)（Digital Technical Journal 1998）；工业 DSL 实践中与形式语义结合做等价检查（equivalence checking）与模型测试（model-based testing）见 [Keshishzadeh et al. 2015](https://ar5iv.labs.arxiv.org/html/1511.08049)。

- 适用对象：G2 的参考解释器 vs 产品编译器/运行时；正则解析器 vs 新文法解析器（迁移期黄金对照）。
- 产出指标：**分歧数 = 0**；每个分歧自动生成最小复现。
- 落地建议：参考解释器必须按文档 11.x 实现（顺序语义、else 判定、compute 触发链），否则差分测试会"测出"文档本身的问题——这正好是目标：让文档语义可执行。
- 成本：中（写参考解释器），但一次投入长期复用（还可驱动模型测试）。

### 3.5 变异测试（Mutation Testing）

思路：对实现或 DSL 输入做微小变异（如把 `>=` 改 `>`、删掉 `watch` 字段、调换 `show`/`hide`），跑现有测试，存活变异体 = 测试或校验的盲区。权威说明：[Stryker 文档](https://stryker-mutator.io/docs/)（"The higher the percentage of mutants killed, the more effective your tests are"）；综述见 [Jia & Harman, IEEE TSE 2011](https://ieeexplore.ieee.org/document/5719575)。

- 适用对象：两层——(a) 对 parser/lint/表达式解释器代码做 Stryker 变异；(b) 对 DSL 输入做"语义变异"（运算符反转、else 删除、watch 字段删除、引用替换、动作类型替换），验证符合性套件与校验器能否检出。
- 产出指标：**变异得分（killed/total）**；幸存变异体清单 = 测试/校验改进清单。
- 落地建议（注意本仓库约束）：测试跑在 node:test 上；StrykerJS 7.0 起提供 [TAP runner](https://stryker-mutator.io/blog/announcing-stryker-js-7/)，可执行产生 TAP 输出的 node:test，但有"细粒度覆盖不可用、可能误报未覆盖"的限制（对应 [GitHub issue #5421](https://github.com/stryker-mutator/stryker-js/issues/5421)）。两条路：把 DSL 相关测试迁到 Vitest 以获得官方完整支持，或先做 (b) 的"DSL 级变异 harness"（在仓库内自建，输入变异 + 断言编译结果/诊断码变化），成本更低且直接评价 DSL 校验质量。
- 成本：中（运行时间长，需限定变异范围与增量模式），对评价"测试评价能力"是唯一直接方法。

### 3.6 蜕变测试（Metamorphic Testing）

思路：没有 oracle 时用"输入变换后输出应满足的关系"（metamorphic relation）评价。系统性综述：[Yakusheva & Khritankov 2024](https://m.mathnet.ru/php/archive.phtml?wshow=paper&jrnid=ps&paperid=442&option_lang=eng)。

本 DSL 的蜕变关系示例：

- 条件否定 + when/else 对调 → 编译后规则集语义等价（对应 INVERSE_OPERATOR）。
- 追加一条永远不可达的规则（如 `when $x == $x -> ...`）→ 其余规则编译结果不变。
- `set($a, $b + 0)` 与 `set($a, $b)` → 求值结果等价（数值域）。
- 交换 `$a + $b` 为 `$b + $a` → 结果等价（整数算术）。

产出指标：蜕变关系违规数。
成本：低；适合作为性质测试的补充（不需要参考实现）。

### 3.7 模型检查与约束求解（Alloy / TLA+ / Z3 / mCRL2）

- [Alloy](https://alloytools.org/about)：一阶关系逻辑 + Alloy Analyzer，生成满足约束的结构或反例。适用：形式化触发器/动作/字段的静态关系（G3.3 条件互补、G4 确定性、引用图结构），在有限范围内穷举反例。
- [TLA+](https://lamport.azurewebsites.net/tla/tla.html)（TLC 模型检查器 + TLAPS 证明系统）：适用：运行时触发调度的状态机建模（G5 终止性、触发链有界性）。AWS 等工业使用记录见 [Lamport 的 Industrial Use 页面](https://lamport.azurewebsites.net/tla/industrial-use.html)。
- [Z3](https://microsoft.github.io/z3guide/)：SMT 求解，适用：表达式/条件的可满足性与等价性判定（G3.3 的互补证明、不可满足条件检测、`range/compare` 约束一致性）。
- [mCRL2](https://www.mcrl2.org/)：进程代数 + 工具集，工业 DSL 案例用它做等价检查与模型测试（见 [Keshishzadeh et al. 2015](https://ar5iv.labs.arxiv.org/html/1511.08049)）。

产出指标：反例集合（自动转回归）、被证明的属性声明。
成本：中-高；建议只对**有限抽象**建模（如 3 个字段、2 条规则的状态空间），并设置 scope 上限控制检查时间。

### 3.8 覆盖率与基准

- 行/分支覆盖率：作为**基线**而非目标（Stryker 文档明确：覆盖率不说明测试有效性）。用 `node --experimental-test-coverage` 或 vitest coverage 对 parser/lint/表达式解释器出基线报告。
- 文法覆盖率：语法产生式/终端覆盖比例（[Grammar Coverage Fuzzer](http://www.fuzzingbook.org/classic/GrammarCoverageFuzzer.html) 的思路），指导模糊生成。
- 基准（benchmark）：大规则集（如 1000 条）的 lint 延迟、编译产物大小、运行时事件处理吞吐；用于守住性能目标，防止形式化改造引入退化。

### 3.9 评价方法汇总

| 方法 | 评价对象 | 主要产出指标 | 成本 | 依赖前置 |
| --- | --- | --- | --- | --- |
| 符合性套件 | 语法/硬约束/引用/诊断码 | 通过率 100%、约束矩阵 | 低 | 文档约束清单 |
| 文法模糊测试 | 编译器、表达式解释器 | 0 crash、文法覆盖率、语料库 | 中 | G1（.g4） |
| 性质测试 | 语义属性 | 反例数（应收敛为 0） | 低-中 | 属性清单 |
| 差分测试 | 参考语义 vs 产品实现 | 分歧 = 0 | 中 | G2（参考解释器） |
| 变异测试 | 测试质量 + 校验完备性 | 变异得分 ≥90% | 中-高 | 测试基线 |
| 蜕变测试 | 语义等价关系 | 违规数 = 0 | 低 | 蜕变关系清单 |
| 模型检查/求解 | 静态与运行时属性 | 反例集合 | 中-高 | 抽象模型 |
| 覆盖率/基准 | 基线 + 性能 | 覆盖率报告、延迟/吞吐预算 | 低 | — |

---

## 4. 第三部分：基于评价标准的优化方法

评价不是终点；关键是**把评价结果（反例、幸存变异体、差分分歧、覆盖率盲区）映射成对 DSL 的具体优化动作**，并固化为回归。

### 4.1 单一事实来源：文法 + 语义驱动一切产出

核心原则：让"文档、lint、编译器、运行时、测试生成"共享同一份形式化定义，从根上消除 gap 1/6 的漂移。

- 文法（`.g4`）驱动：解析器生成（ANTLR）、符合性用例生成（Grammarinator）、文法覆盖率、文档 EBNF 校对。
- 参考语义驱动：差分测试 oracle、自然语言 preview 生成（现有 `behaviorRulesToNaturalLanguage` 可改为从参考语义派生）、文档 11.x 执行逻辑的机器可执行版本。
- 这对应工业界结论："a formal semantics is essential for checking the consistency between the generated artifacts"（[Keshishzadeh et al. 2015](https://ar5iv.labs.arxiv.org/html/1511.08049)），也对应语言工作台（[Xtext](https://eclipse.dev/Xtext/documentation/301_grammarlanguage.html)）"从文法推断模型并自动生成 parser/linker/validator"的架构。

### 4.2 反例驱动优化（Counterexample-Driven Refinement）

流程：模型检查/求解/性质测试产出反例 → 人工裁决（是 DSL 缺陷、编译器缺陷还是模型缺陷）→ 若为真实缺陷，最小化反例 → 转成符合性套件回归用例 → 修复 → 重跑全量。这是 [Alloy Analyzer 定位](https://alloytools.org/about)（"check properties by generating counterexamples"）在工程上的标准用法。

优化动作示例：

- 反例"`else` 在 `$x=null` 时与 `when` 同时不成立"→ 修正空值语义（文档 8 已定义空值含 null/undefined/空串/空数组），或把该语义写进 `INVERSE_OPERATOR` 的机械化验证。
- 反例"两个 compute 规则互相写回形成环"→ 实现 G3.2 全局环检测并升级为 error（当前 FFR302 是 warning）。
- 反例"`set` 表达式包含白名单外函数"→ 把 `propertyExpression` 的语法/函数白名单接入 `lintRules` 编译期校验。

### 4.3 变异得分驱动"测试加固 + 实现加固"

幸存变异体分两类处理：

- **幸存于测试**：测试没断言到 → 补符合性用例/性质用例（3.1/3.3）。
- **幸存于校验器**：说明校验器漏检（如 `>=` 变异成 `>` 没有被 lint 拒绝）→ 加静态检查规则或升级严重级别。

设阈值门槛（如 DSL 核心变异得分 ≥90%），把得分趋势纳入 CI 报告；Stryker 的增量模式（[Incremental](https://stryker-mutator.io/docs/stryker-js/incremental/)）控制运行成本。若使用 node:test + TAP runner 受限，按 3.5 的建议做 DSL 级变异 harness。

### 4.4 模糊-差分修复与回归固化

流程：Grammarinator/libFuzzer 生成输入 → 产品编译器与参考解释器差分 → 分歧最小化（`afl-tmin` / `-minimize_crash`）→ 修复 → 输入加入语料库。libFuzzer 官方将语料库同时定位为回归检查（"corpus can also act as a sanity/regression check"）。每次修复后 `-merge=1` 保持语料最小化。

### 4.5 性质驱动的静态分析增强

把性质测试/模型检查发现的属性固化为**编译期静态分析器**：表达式类型推导、跨规则依赖图环检测、条件可满足性（Z3）、动作语境矩阵。即"运行期可验证 → 编译期可拒绝"的迁移，这直接提升 DSL 的可用性（错误前置），也是本 DSL 相对通用语言的定位优势（受限语言 → 可静态化）。

### 4.6 持续门禁与发布控制

结合仓库现有质量门禁文化（`project.validate`、`release.preview` 作为发布前置），为 DSL 增加独立门禁：

- 符合性套件通过率 = 100%（新增 FFR 码必须带用例）。
- DSL 核心变异得分 ≥90%。
- 差分分歧 = 0；性质测试反例数 = 0。
- 基准预算：1000 条规则 lint 延迟上限、语料回归全绿。
- 文档与文法一致性检查：EBNF/`.g4`/动作签名表三方 diff 门禁。

### 4.7 优化闭环总览

```mermaid
flowchart LR
  A["形式化：文法 .g4 + 参考语义"] --> B["自动产出：解析器/测试生成/文档"]
  B --> C["评价：符合性 / 模糊 / 性质 / 变异 / 差分 / 模型检查"]
  C -->|"反例 / 幸存变异 / 分歧"| D["裁决与最小化"]
  D -->|"真实缺陷"| E["修复：编译期静态分析 / 语义修订 / 文档修订"]
  E --> F["回归固化：转符合性用例 + 语料库"]
  F --> G["CI 门禁：通过率 100% / 变异≥90% / 分歧=0"]
  G -->|"门禁达标"| H["发布 DSL 新版本"]
  H --> A
```

---

## 5. 推荐分阶段落地路线图

| 阶段 | 内容 | 产出 | 退出标准 |
| --- | --- | --- | --- |
| Phase 0（基线，约 2-3 天） | 盘点现有测试；对 parser/lint/表达式解释器出覆盖率基线；用文档 12/13 示例建立首批语料 | 基线报告 + 首批语料 | 覆盖率与测试缺口清单 |
| Phase 1（文法形式化，约 1-2 周） | EBNF → ANTLR `.g4`；新解析器与旧解析器差分对照；符合性套件骨架（含全部 FFR 码用例）；接入 Grammarinator | `.g4` + 新 parser + 符合性套件 + 模糊流水线 | 套件通过率 100%；新老解析器对语料零分歧 |
| Phase 2（静态属性，约 2-4 周） | 表达式类型检查；跨规则 compute 环检测（升级 FFR3xx）；引用/动作签名全量校验；Z3 验证运算符互补 | G3 全部落地 | 变异注入的类型错误/环/悬空引用全部检出 |
| Phase 3（语义与行为，约 3-6 周） | 参考解释器（差分测试 + 模型测试）；Alloy/TLA+ 行为模型（G4/G5） | 参考语义 + 差分流水线 + 反例库 | 差分分歧 = 0；行为反例全转回归 |
| Phase 4（门禁与持续改进） | 变异测试接入（Vitest 迁移或 DSL 级 harness）；CI 门禁与基准预算；文档/文法一致性检查 | 全自动质量门禁 | 门禁连续 4 周全绿，变异得分 ≥90% |

优先级建议：Phase 0 → Phase 1 收益最大且成本最低（直接消除"文法无单一来源"这一根因）；Phase 2 解决用户可见的"计算环/类型错误前置"问题；Phase 3-4 是深水区，按团队节奏决定是否引入 K/TLA+。

---

## 6. 参考来源

### 本地一手资料（本仓库）

- `docs/behavior-rule-syntax.md`：DSL 1.0 规范（EBNF、硬约束、表达式约束、动作参考、执行逻辑、FFR 诊断表、反例）。
- `shared/formflow-core/behaviorDsl/parser.ts`：正则驱动的编译/校验实现（OPERATOR_MAP、parseCondition、lintRules、FFR301-303）。
- `shared/formflow-core/propertyExpression.ts`：属性表达式 tokenizer/parser/求值器与依赖图环检测。
- `server/src/services/project-semantic-validation.ts`、`server/src/services/behavior-tool-preflight.ts`、`server/src/services/rule-agent.ts`：项目语义校验、行为工具预检、规则 lint/沙箱。
- `ui/src/services/engine/behaviorDsl.test.ts`、`ui/src/services/engine/formEventExecutor.ts`：现有测试与运行时。

### 外部权威来源

- Keshishzadeh, Mooij, Hooman, *Industrial Experiences with a Formal DSL Semantics to Check Correctness of DSL Transformations* (arXiv:1511.08049): https://ar5iv.labs.arxiv.org/html/1511.08049 —— 形式语义作为多 transformation 的一致参考；等价检查 + 模型测试。
- K Framework 官方站点: https://kframework.org/ ；PLDI 2023 K 教程: https://pldi23.sigplan.org/details/pldi-2023-tutorials/5/From-Zero-to-Proving-Building-Your-First-Language-with-the-K-Framework
- Alloy 官方: https://alloytools.org/about
- TLA+（Lamport 主页，TLC/TLAPS）: https://lamport.azurewebsites.net/tla/tla.html ；工业使用案例: https://lamport.azurewebsites.net/tla/industrial-use.html
- Dafny 官方: https://dafny.org/
- Z3 Online Guide: https://microsoft.github.io/z3guide/
- mCRL2: https://www.mcrl2.org/
- Xtext Grammar Language: https://eclipse.dev/Xtext/documentation/301_grammarlanguage.html
- Grammarinator 文档（A-TEST 2018 论文收录于其引用页）: https://grammarinator.readthedocs.io/en/stable/introduction.html
- The Fuzzing Book（Zeller 等）文法章节: https://www.fuzzingbook.org/html/Grammars.html ；文法覆盖率: http://www.fuzzingbook.org/classic/GrammarCoverageFuzzer.html
- libFuzzer 官方文档: https://llvm.org/docs/LibFuzzer.html
- QuickCheck（Hackage/Stackage）: https://www.stackage.org/lts-24.36/package/QuickCheck-2.15.0.1 ；Claessen & Hughes 2000 原始论文。
- Hypothesis 官方文档: https://hypothesis.readthedocs.io/ ；fast-check（TS）: https://fast-check.dev/
- Stryker 变异测试文档: https://stryker-mutator.io/docs/ ；StrykerJS 7.0 公告（TAP runner）: https://stryker-mutator.io/blog/announcing-stryker-js-7/ ；node:test 原生支持 issue: https://github.com/stryker-mutator/stryker-js/issues/5421
- Jia & Harman, *An Analysis and Survey of the Development of Mutation Testing*, IEEE TSE 2011（DOI 10.1109/TSE.2010.62）: https://www.semanticscholar.org/paper/An-Analysis-and-Survey-of-the-Development-of-Jia-Harman/d7c38286734419b52de4262c9802ebdfcf4b9447 ；作者版预印本: https://nms.kcl.ac.uk/informatics/techreports/papers/TR-09-06.pdf
- McKeeman, *Differential Testing for Software*, Digital Technical Journal 10(1), 1998: https://www.cs.swarthmore.edu/~bylvisa1/cs97/f13/Papers/DifferentialTestingForSoftware.pdf
- Yakusheva & Khritankov, *A systematic review of methods for deriving metamorphic relations*, 2024: https://m.mathnet.ru/php/archive.phtml?wshow=paper&jrnid=ps&paperid=442&option_lang=eng
- W3C XML Conformance Test Suite: https://www.w3.org/XML/Test/ ；W3C QA Framework 指南: https://www.w3.org/TR/qaframe-ops/
- *Static Analysis of Spreadsheet Applications for Type-Unsafe Operations Detection*（抽象解释，INRIA）: https://rd.springer.com/chapter/10.1007/978-3-662-46669-8_2
