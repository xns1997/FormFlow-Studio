# Skill: data —— 数据源与数据行领域

> 标题：数据专家
> 描述：数据源、Sheet、主键、数据行查询/批量写回与数据关系

## 何时使用

- 需要建表、导入数据、配置 Sheet 与主键、查询或写回业务行、声明数据关系。

## 领域边界

- `data_source.*`、`data_sheet.*`、`data_keys.*`、`data_rows.*`、`data_relation.*` 属于本领域。
- 字段名、行数据、Sheet 配置必须来自真实读取结果，禁止猜测或捏造。

## 执行前置

- 任何写操作前先读取项目最新 revision（`project.get` 或 `data_source.get`），写入参数必须带 `baseRevision` 与稳定 `idempotencyKey`。
- 可编辑表必须配置非空且唯一的组合主键（`data_sheet.configure` + `data_keys.validate`）；只读表必须明确声明只读。
- 内联数据限制：最多 5 MB、10 000 行；查询每页最多 500 行；单次 batch 最多 1 000 个变更。
- 数据导入只接受已上传 `fileId`、JSON `rows` 或 CSV 文本，不接受服务器路径或远程 URL。

## 工具手册使用约定

本 skill 的每个工具在下文「工具手册」中都有三部分：
- **传參**：必填/可选、类型与说明（以实时 Schema 为准）；
- **正确调用**：可直接照抄结构、替换真实 id/名称的 JSON；
- **错误调用**：常见“看起来对、实际会失败”的传参方式，附预期错误码，禁止照抄。

调用任何工具前先对照其传參；`rows` 是业务记录数组，字段定义必须放 `config.columns`；`fileId/csv/rows` 三选一；写操作必须带最新 `baseRevision` 与稳定 `idempotencyKey`。

## 标准工作流

1. 读取项目与现有数据源目录（`data_source.list/get`），确认目标表与 Sheet 名。
2. 建表/导入：`data_source.create`（空表用 `config.columns`；业务数据用 `rows` 或 `csv`）或 `data_source.import`；`rows` 里的每个对象是一条业务记录，不是字段定义。
3. 配置 Sheet：`data_sheet.configure` 设置主键/只读/冻结/筛选；随后 `data_keys.validate` 验证主键无空值、无重复。
4. 写行数据：`data_rows.batch`（单表原子）或 `data_rows.transaction`（跨表原子）；`adds/updates/deletes` 按稳定 rowKey 定位；含 deletes 时需确认。
5. 声明关系：`data_relation.suggest` 先建议，`data_relation.validate` 校验后 `data_relation.upsert` 写入。
6. 完成后运行 `project.validate`。

## 调用示例（照抄结构，替换真实值）

一步创建数据表（推荐：列 + 主键 + 枚举 + 可选示例数据，内部自动配置 Sheet 主键）：
```json
{"projectId":"device_mgmt","id":"device","columns":[{"name":"编号","type":"string"},{"name":"名称","type":"string"},{"name":"类型","type":"enum","enum":["机床","泵","阀门"]},{"name":"状态","type":"enum","enum":["正常","待检","停用"]},{"name":"评分","type":"number"}],"keyFields":["编号"],"rows":[{"编号":"D-001","名称":"机床A","类型":"机床","状态":"正常","评分":88}]}
```

创建空表（列 + 主键 + 枚举，一次完成）：
```json
{"projectId":"device_mgmt","id":"device","config":{"columns":[{"name":"编号","type":"string"},{"name":"名称","type":"string"},{"name":"类型","type":"enum","enum":["机床","泵","阀门"]},{"name":"状态","type":"enum","enum":["正常","待检","停用"]},{"name":"评分","type":"number"}],"keyFields":["编号"]}}
```

导入业务数据（adds 直接写业务记录，服务端按主键自动生成 rowKey）：
```json
{"projectId":"device_mgmt","tableId":"device","sheetName":"Sheet1","adds":[{"编号":"D-001","名称":"数控机床A","类型":"机床","状态":"正常","评分":88},{"编号":"D-002","名称":"离心泵B","类型":"泵","状态":"待检","评分":52}]}
```

配置主键/只读/筛选（tableId 来自 data_source.list/get 返回的 id）：
```json
{"projectId":"device_mgmt","tableId":"device","sheetName":"Sheet1","config":{"keyFields":["编号"],"readOnly":false,"filterEnabled":true}}
```

## 验收与门禁

- 可编辑表必须主键有效；写入后重新查询或读取 Sheet 核对行数与关键字段。
- `data_rows.batch` 的 deletes 与 `data_rows.transaction` 中含删除的 operations 必须等待确认。
- 计算字段（`sheet.config.computedFields`）质量检查会逐行验证目标字段与安全表达式一致。

## 常见错误与修复

- 把字段定义混进 rows → rows 是业务数据，字段定义必须放 `config.columns`。
- 主键与列名不一致 → 先读 `data_sheet.get`，用真实列名配置 keyFields 并 `data_keys.validate`。
- 重复 create 已存在表 → 已存在时改用 `data_source.update` 或读取后补数据，不要重放旧参数。
- 批量写回失败（如数据版本变化）→ 重新查询最新 `baseVersion` 与 revision 后再写。

错误调用示例（禁止照抄）：
```json
{"projectId":"device_mgmt","id":"device","rows":[{"fieldId":"编号","title":"编号","type":"string"}]}
```
把字段定义混进 rows → `DATA_SOURCE_INPUT_AMBIGUOUS` / 列结构错误；字段定义必须放 `config.columns`。
```json
{"projectId":"device_mgmt","id":"device","fileId":"<f>","csv":"编号,名称\nD-001,机床A"}
```
同时传多个数据来源 → `DATA_SOURCE_INPUT_AMBIGUOUS`，`fileId/csv/rows` 只能三选一。
