# Compact YAML authoring specification

## Contents

- Create documents
- Data sources
- Forms and behaviors
- Workflows and outputs
- Normalization patches

## Create documents

```yaml
project:
  id: employee-app
  name: 员工管理
  description: 员工资料维护
  version: 2.0.0
  author: FormFlow Agent
  tags: [员工, CRUD]
now: 2026-07-13T00:00:00.000Z # optional; stabilizes timestamps
settings:
  publish:
    format: xlsx
    allowWriteBack: true
release:
  mode: design
data: []
forms: []
behaviors: []
workflows: []
outputs: []
```

Only `project.id` and `project.name` are required. IDs must match `[A-Za-z0-9_-]+`. Omitted collections become empty and settings receive FormFlow defaults.

## Data sources

```yaml
data:
  - id: employees
    path: ./inputs/employees.xlsx
    fileName: employees.xlsx      # optional
    sheets:
      员工表:
        key: [工号]
        readOnly: false
        frozenRows: 1
        frozenColumns: 1
        filterEnabled: true
```

`path` accepts `.xlsx`, `.xls`, `.csv`, and `.json`. Relative paths resolve from the YAML file. JSON may be an array of objects or an object whose array-valued properties become sheets. The tool infers headers, column types, nullability, unique counts, samples, preview rows, hashes, and indexes. Configure every editable sheet with a non-empty unique key. `readOnly: true` permits no key.

## Forms and behaviors

```yaml
forms:
  - id: employee-edit
    name: 员工编辑
    mode: edit
    components:
      - id: root
        type: form
        props: { title: 员工编辑 }
        children: [employee-id, employee-name, save]
      - id: employee-id
        type: text
        parentId: root
        field: 工号
        props: { name: employeeId, label: 工号, required: true }
      - id: employee-name
        type: text
        parentId: root
        field: 姓名
        props: { name: employeeName, label: 姓名 }
      - id: save
        type: button
        parentId: root
        props:
          name: save
          label: 保存
          flowTriggers:
            onClick: { enabled: true, workflowId: save-employee }
    bindings: []
    behaviors:
      - id: validate-name
        name: 校验姓名
        event: fieldChange
        code: "if (!value) showMessage('姓名不能为空', 'error')"
        priority: 0
        enabled: true
behaviors: []                 # global behaviors, same compact shape
sheetBehaviors:
  - tableId: employees
    sheetName: 员工表
    behaviors: []
```

Coordinates and sizes are optional. The deterministic grid layout uses component order. Explicit values win. Components may contain arbitrary `props`; bindings may contain arbitrary `config`.

## Workflows and outputs

```yaml
workflows:
  - id: save-employee
    name: 保存员工
    description: 写回员工表
    nodes:
      - id: input
        specId: generic:value-input
        data:
          properties: { name: employee, valueType: object }
      - id: display
        specId: generic:display-table
    edges:
      - source: input
        target: display
        sourceHandle: out:value
        targetHandle: in:data
outputs:
  - id: employee-export
    name: 员工导出
    format: xlsx
```

Node positions and edge IDs are optional. `data.properties` is converted to the runtime `propertiesJson` form. Node port names are checked against the frozen catalog in `references/node-ports-v2.json` when the node is catalogued.

## Normalization patches

Patch documents use the same compact resource shapes:

```yaml
project: { name: 员工管理 v2 }
upsert:
  forms: []
  workflows: []
  behaviors: []
  sheetBehaviors: []
  outputs: []
delete:
  forms: [obsolete-form]
  workflows: [obsolete-flow]
  behaviors: [obsolete-global-behavior]
  outputs: []
```

`project`, `settings`, and `release` are merged. Each `upsert` collection replaces an existing item with the same ID or appends it. Sheet behaviors use the composite ID `tableId/sheetName`. Data replacement is intentionally explicit: add a complete source to `upsert.data`; delete with `delete.data`.
