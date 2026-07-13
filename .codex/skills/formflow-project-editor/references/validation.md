# Validation and delivery gates

## Structural gates

- Require `kind: formflow-project`, `formatVersion: 2`, a valid config ID, and all indexes.
- Reject duplicate IDs within each resource collection and duplicate component/node IDs within their owner.
- Require index filenames and indexed resource IDs to match actual files.
- Reject unknown structural fields with their JSON paths.

## Reference gates

- Require edge endpoints to exist in the same workflow.
- Validate catalogued source/target handles against `node-ports-v2.json`.
- Require form flow triggers and linkage `runWorkflow` actions to reference existing workflows.
- Require `release.defaultFormId` and sheet behavior table/sheet pairs to exist.
- Require component `parentId` and `children` references to remain inside the same form.

## Data gates

- Require supported source extensions and readable source files during creation.
- For every non-read-only sheet, require configured key fields.
- Require key headers to exist and every composite key to be non-empty and unique.
- Treat read-only lookup sheets as valid without keys.

## Delivery gates

- Create output in a temporary sibling directory and rename only after validation succeeds.
- Refuse an output path equal to the input path or an already existing output path.
- Emit both directory and ZIP by default. Validate the directory before packing.
- Report errors as JSON with `--json`; otherwise print concise `ERROR <code> <path>: <message>` lines.
