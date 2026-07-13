---
name: formflow-project-editor
description: Create, inspect, normalize, validate, pack, and unpack FormFlow v2 project packages from compact YAML specifications. Use when Codex needs to generate a new FormFlow project, import Excel/CSV/JSON data into one, make ID-addressed changes to an existing .formflow directory or ZIP, audit project references and data keys, or produce a deterministic distributable FormFlow ZIP without writing repetitive package JSON by hand.
---

# FormFlow Project Editor

Use `scripts/formflow-project.mjs` instead of writing package JSON manually. Run commands from the repository root so the script can resolve `yaml`, `xlsx`, and `jszip`.

## Workflow

1. Inspect an existing package before editing:
   `node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs inspect <project>`
2. Read [authoring-spec.md](references/authoring-spec.md) before authoring YAML. Read [v2-format.md](references/v2-format.md) only when raw package details are needed.
3. Create with `create <spec.yaml> --out <new-path>`, or edit with `normalize <project> --spec <patch.yaml> --out <new-path>`.
4. Never use the input path as `--out`. The tool refuses in-place writes.
5. Run `validate <output> --json` and fix every error. Read [validation.md](references/validation.md) when a rule is unclear.
6. Deliver the `.formflow` directory and its sibling `.zip`; creation and normalization emit both by default.

## Editing rules

- Address resources by stable ID. Use `upsert` and `delete` in patch YAML.
- Treat normalization as a full v2 rewrite. If the tool reports unknown fields, stop and surface their JSON paths; do not delete or bypass them.
- Preserve input data files through normalization unless their source is deleted or replaced.
- Prefer explicit `now` in YAML when byte-for-byte reproducibility across separate runs matters.
- Keep scripts, large default objects, inferred columns, indexes, coordinates, and ZIP layout out of the prompt; let the tool expand them.

## Commands

Run `node .codex/skills/formflow-project-editor/scripts/formflow-project.mjs help` for the complete CLI synopsis. Failed commands return a non-zero exit code and do not publish a partial output.
