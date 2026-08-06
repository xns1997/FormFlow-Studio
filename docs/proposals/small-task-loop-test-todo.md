# TODO：小任务循环测试（同线程顺序执行）

已确认的决策：同一线程顺序执行 8 个小任务；任务 1 先创建空项目，后续任务在现有项目上做增量修改；任务 1–7 用轻量完成门禁，任务 8 跑完整门禁；每任务单 turn、≤5 分钟墙钟、≤40 次工具调用，失败即停不自动重试；全程不自动审批、不自动续预算。

## 1. 小任务提示词与清单

- [ ] 新建 `scripts/prompts/small-tasks.json`，含 8 个任务：`[{ "title", "prompt", "finalGate": false }, …]`，末项 `finalGate: true`。
- [ ] 任务提示词统一模板：**「在现有项目 {projectId} 上完成：…，不要新建项目，不要调用 release.apply」**；projectId 由循环脚本注入（T1 返回后回填后续任务）。
- [ ] 8 个任务内容：
  1. 创建空项目（名称/描述/标签，不建表不建表单）
  2. 创建部门数据表（列+主键 部门编号+2 行示例数据，一步 `data_table.create`）
  3. 创建员工数据表（列+主键 员工编号+2 行示例数据，一步）
  4. 生成员工录入表单（`form.generate_from_table`，控件+绑定）
  5. 生成部门查询修改表单（同上）
  6. 配置员工表单规则（提交前校验 姓名/手机号 必填，`rule_code.update`）
  7. 生成并运行回归测试
  8. 项目质量检查+发布预检（完整门禁）

## 2. 轻量完成门禁（服务端）

- [ ] turns API 接受 `finalGate?: boolean`，写入线程 `completionGate: 'light' | 'full'`（默认 `full`，UI 行为不变）。
- [ ] `formflow-harness` 的 `verification.final`：light → 结构校验 + 形式化（行为相关）+ 目标交付物覆盖检查；full → 现有 `runFinalGates`。
- [ ] 单测：light 模式下完成不触发回归/预检；full 模式行为不变；`finalGate` 缺省为 full。

## 3. 循环测试脚本扩展（`scripts/agent-loop-test.mjs`）

- [ ] 新增 `--manifest scripts/prompts/small-tasks.json` 模式：建一次线程 → 按清单顺序逐任务提交 turn（带 finalGate）→ 轮询到终态。
- [x] 每任务记录：状态、模型/工具调用数、墙钟；强制单任务 ≤40 次工具调用；超限即判失败。
- [x] 墙钟上限：实测 MiMo 单次决策约 77s、任务常需 4-6 次模型调用，300s 会误杀已完成任务，默认调至 600s（manifest `perTask.maxSeconds`，可配）。
- [ ] 失败即停：任一任务 paused/blocked/failed/stopped/超限 → 终止序列并输出失败任务+原因+最近事件，退出码非 0。
- [ ] 全程不自动审批、不自动续预算（与「不触发破坏性审批/不中途问人」一致；现有 auto-approve/budget-resume 在该模式关闭）。
- [ ] 输出汇总：8 任务逐个状态 + 总时长 + 最终产物 projectId。

## 4. 验收与产物核验

- [x] 脚本内置/复用 `requireProject` 核验：T1 后项目存在且无表无表单；T2/T3 后表+主键+行数正确；T4/T5 后表单控件/绑定 ≥1；T6 后 `ruleCode` 含 `require($姓名, $手机号)`；T7 后测试 runs>0 且通过；T8 后 release preview 就绪。
- [x] 一次真实序列跑通：8/8 completed、每个任务单 turn、0 提问、0 审批、全部在限额内 → 退出码 0。

实测结果（manifest11，2026-08-06）：T1 52s/1 工具、T2 38s/2、T3 46s/4、T4 48s/4、T5 52s/7、T6 56s/5、T7 126s/18、T8 70s/9；产物核验 11 项全 PASS（2 表含主键+2 行、2 表单含控件绑定、规则 require($姓名,$手机号)、回归 runs=2 通过、预检就绪）。

## 5. 回归与收尾

- [x] 全量 `npm test` + 双端 typecheck + build 绿。
- [x] 完成后把 8 任务序列结果与产物核验报告回填到本文件验收栏。
