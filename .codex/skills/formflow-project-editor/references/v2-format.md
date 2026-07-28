# Frozen FormFlow v2 package format

## Contents

- Directory layout
- Package files
- Extension policy

## Directory layout

```text
project.formflow/
├── project.json
├── release.json                 # only when release exists
├── forms/_index.json
├── forms/<id>.json
├── forms/<id>.behaviors.json
├── data/_index.json
├── data/<original-file>
├── data/<id>.meta.json
├── data/<id>.behaviors.json
├── global-behaviors.json
├── workflows/workflows.json
└── outputs/outputs.json
```

## Package files

- `project.json`: `{kind:"formflow-project", formatVersion:2, config, settings?, release?, relations?, templateInstances?, templatePresets?, customOperationTemplates?, analysisTasks?, modelRuns?}`. `config.access` may contain the server-managed `{ownerId?, members?}` project ACL.
- `forms/_index.json`: `{forms:[{id,name,formMode?,fileName,behaviorsFileName}], defaultFormId?}`.
- A form design contains `id`, `name`, optional `formMode`, `viewport`, `gridSize`, required `coordinateSpace`, `formWindow`, `components`, `bindings`, `createdAt`, and `updatedAt`. v2 writes `coordinateSpace: "window-content-v1"`: component `x` and `y` are local to the content area below the fixed 52 px title bar and configured padding. `formWindow` is the form instance's non-deletable surface (`x`, `y`, `width`, `height`, and extension-bearing `props`); it is never stored as a component.
- `data/_index.json`: `{sources:[{id,fileName,fileType,metaFile,behaviorsFile,uploadedAt}]}`.
- Data metadata contains `id`, original file facts, `sheets`, and optional record caches. A sheet contains `name`, counts, `headers`, inferred `columns`, `preview`, and `config`.
- Form behavior containers contain `{behaviors, ruleCode}`; `ruleCode` is the form-specific controlled rule DSL source and defaults to `""`. Global behavior containers contain `behaviors`; global/workflow/output containers also contain `exportedAt`.
- `workflows/workflows.json`: `{workflows:[...], exportedAt}`.
- `outputs/outputs.json`: `{outputs:[...], exportedAt}`.

JSON is UTF-8, two-space indented, ends with a newline, and uses stable object-key and ID ordering. ZIP entries use forward slashes and a fixed timestamp for deterministic archives.

## Extension policy

This skill deliberately freezes v2. Unknown keys are accepted only inside extension-bearing maps (`component.props`, binding `config`, workflow node `data`, and behavior code/config payloads). Unknown structural keys elsewhere are errors. Add future fields to the CLI allowlist and this reference together; never silently strip them.
