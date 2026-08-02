import {
  batchProjectRows, fullSourceRows, generatedForm, normalizeFormDesign, toolError, validateProjectModel, type JsonObject,
} from '../project-authoring';
import { DataRelation, FeasibilityCheck, FeasibilityReport, FeasibilityStatus, FieldRole, NormalizedField, TemplateSelection, crossTableFieldCatalog, finiteFieldValues, normalizeSheetFields, parameters, parseTimeValue, resolveCrossTableFieldReferences, resolveSelectedFieldSet, resolveTables, sameFieldSequence, selectedSheet, validateRelation } from './shared';
import { getOperationTemplate } from './definitions';

function inferRoles(normalizedFields: NormalizedField[], selected: string[] = [], readOnlySheet = false) {
  const activeFields = selected.length ? selected : normalizedFields.map((field) => field.name);
  return activeFields.flatMap((fieldName) => {
    const field = normalizedFields.find((item) => item.name === fieldName);
    if (!field) return [];
    const roles: Array<{ field: string; role: FieldRole; confidence: number }> = [];
    if (field.key) roles.push({ field: field.name, role: 'key', confidence: 1 });
    if (['number', 'integer', 'decimal', 'currency', 'percentage'].includes(field.type)) roles.push({ field: field.name, role: 'metric', confidence: 0.95 }, { field: field.name, role: 'feature', confidence: 0.85 });
    if (['date', 'datetime', 'time'].includes(field.type)) roles.push({ field: field.name, role: 'time', confidence: Math.max(0.8, field.typeConfidence) });
    if (['enum', 'multi-enum', 'relation-key'].includes(field.type) || field.unique === false) roles.push({ field: field.name, role: 'dimension', confidence: Math.max(0.76, field.typeConfidence) });
    roles.push({ field: field.name, role: readOnlySheet || field.readOnly ? 'readonly' : 'editable', confidence: 0.92 });
    return roles;
  });
}


export function analyzeOperationTemplate(project: JsonObject, templateId: string, selection: TemplateSelection = {}, suppliedParameters: JsonObject = {}): FeasibilityReport {
  const template = getOperationTemplate(templateId, project);
  const checks: FeasibilityCheck[] = [];
  const tables = resolveTables(project, selection);
  const contract = template.selectionContract;
  const fail = (code: string, message: string, path?: string, fix?: FeasibilityCheck['fix']) => checks.push({ code, status: 'failed', message, path, fix });
  const warn = (code: string, message: string, path?: string) => checks.push({ code, status: 'warning', message, path });
  const pass = (code: string, message: string) => checks.push({ code, status: 'passed', message });

  if (tables.length < (contract.minTables || 0)) fail('TABLE_REQUIRED', `至少选择 ${contract.minTables} 张表`, 'selection.tableIds');
  else if (contract.maxTables && tables.length > contract.maxTables) fail('TOO_MANY_TABLES', `最多选择 ${contract.maxTables} 张表`, 'selection.tableIds');
  else pass('TABLE_SELECTION_VALID', `已选择 ${tables.length} 张表`);
  const missingTables = [...new Set([...(selection.tableIds || []), ...(selection.tableId ? [selection.tableId] : [])])].filter((id) => !tables.some((table: JsonObject) => table.id === id));
  if (missingTables.length) fail('TABLE_NOT_FOUND', `数据表不存在：${missingTables.join('、')}`, 'selection.tableIds');

  const sheet = selectedSheet(tables[0], selection);
  if (tables[0] && !sheet) fail('SHEET_NOT_FOUND', '所选 Sheet 不存在', 'selection.sheetName');
  const normalizedFields = normalizeSheetFields(tables[0], sheet);
  const headers = new Set(normalizedFields.map((field) => field.name));
  const { selectionFields, parameterSelectedFields, effectiveFields } = resolveSelectedFieldSet(selection, suppliedParameters, normalizedFields);
  const chosenFields = selectionFields;
  const duplicateSelectedFields = chosenFields.filter((field, index) => chosenFields.indexOf(field) !== index);
  if (duplicateSelectedFields.length) fail('DUPLICATE_SELECTED_FIELDS', `selection.fields 存在重复字段：${[...new Set(duplicateSelectedFields)].join('、')}`, 'selection.fields');
  const missingFields = chosenFields.filter((field) => !headers.has(field));
  if (missingFields.length) fail('FIELD_NOT_FOUND', `字段不存在：${missingFields.join('、')}`, 'selection.fields');
  if (parameterSelectedFields.length && parameterSelectedFields.some((field) => !headers.has(field))) {
    const unavailable = parameterSelectedFields.filter((field) => !headers.has(field));
    fail('SELECTED_FIELDS_INVALID', `selectedFields 包含不存在字段：${unavailable.join('、')}`, 'parameters.selectedFields');
  }
  if (selectionFields.length && parameterSelectedFields.length && !sameFieldSequence(selectionFields, parameterSelectedFields)) {
    fail('SELECTED_FIELDS_MISMATCH', 'selection.fields 与 parameters.selectedFields 必须指向同一字段集合且顺序一致。', 'parameters.selectedFields');
  }
  if (contract.minFields && (effectiveFields.length || headers.size) < contract.minFields) fail('FIELDS_REQUIRED', `至少选择 ${contract.minFields} 个字段`, 'selection.fields');
  const fieldCount = effectiveFields.length || headers.size;
  if (fieldCount > 49 && template.category !== 'analysis' && template.category !== 'prediction') fail('FIELD_COUNT_EXCEEDED', `字段数量 ${fieldCount} 超过上限 49；请分组或筛选字段后再生成`, 'selection.fields');
  if (contract.requiresWritable && tables.some((table: JsonObject) => (table.sheets || []).some((item: JsonObject) => item.config?.readOnly))) fail('READ_ONLY_TABLE', '模板需要可写数据表', 'selection.tableIds');
  const keyless = tables.flatMap((table: JsonObject) => (table.sheets || []).filter((item: JsonObject) => !(item.config?.keyFields || []).length).map((item: JsonObject) => `${table.id}/${item.name}`));
  if (contract.requiresKey && keyless.length) fail('KEY_REQUIRED', `缺少非空唯一主键：${keyless.join('、')}`, 'data.config.keyFields', { action: 'configure-key', label: '配置并校验主键' });
  else if (contract.requiresKey) {
    const keyIssues: Array<{ code: string; source: string; rows: number[] }> = [];
    for (const table of tables) for (const candidate of table.sheets || []) {
      const keys: string[] = candidate.config?.keyFields || []; const rows = fullSourceRows(project, table, candidate); const seen = new Map<string, number>(); const empty: number[] = []; const duplicate: number[] = [];
      rows.forEach((row: JsonObject, index: number) => { const values = keys.map((key) => row[key]); if (values.some((value) => value === null || value === undefined || value === '')) { empty.push(index + 1); return; } const signature = JSON.stringify(values); if (seen.has(signature)) duplicate.push(index + 1); else seen.set(signature, index + 1); });
      if (empty.length) keyIssues.push({ code: 'EMPTY_KEY', source: `${table.id}/${candidate.name}`, rows: empty });
      if (duplicate.length) keyIssues.push({ code: 'DUPLICATE_KEY', source: `${table.id}/${candidate.name}`, rows: duplicate });
    }
    for (const issue of keyIssues) fail(issue.code, `${issue.source} 存在${issue.code === 'EMPTY_KEY' ? '空主键' : '重复主键'}（行 ${issue.rows.slice(0, 5).join('、')}）`, 'data.config.keyFields', { action: 'configure-key', label: '修复主键数据' });
    if (!keyIssues.length) pass('KEY_AVAILABLE', '主键已配置且样本中非空唯一');
  }

  const relations: DataRelation[] = project.relations || [];
  const selectedRelations = (selection.relationIds || []).map((id) => relations.find((item) => item.id === id)).filter(Boolean) as DataRelation[];
  const primaryRelation = selectedRelations[0];
  if (contract.requiresRelation && !selectedRelations.length) fail('RELATION_REQUIRED', '需要选择已声明的数据关系', 'selection.relationIds', { action: 'create-relation', label: '创建数据关系' });
  for (const relation of selectedRelations) checks.push(...validateRelation(project, relation).checks);
  if (template.id === 'join-query-update' && selectedRelations.some((relation) => relation.cardinality === 'many-to-many')) {
    fail('AMBIGUOUS_MANY_TO_MANY_UPDATE', '多对多关系无法唯一定位写回记录；请改为只读查询，或拆成两个可唯一定位的关系。', 'selection.relationIds');
  }
  if ((template.id === 'master-detail-view' || template.id === 'master-detail-entry') && selectedRelations.some((relation) => !['one-to-many', 'one-to-one'].includes(relation.cardinality))) fail('MASTER_DETAIL_DIRECTION_INVALID', '主从模板要求关系左侧为主表、右侧为明细表（一对多或一对一）。', 'selection.relationIds');

  const roles = inferRoles(normalizedFields, effectiveFields, !!sheet?.config?.readOnly);
  const numeric = new Set(roles.filter((item) => item.role === 'metric').map((item) => item.field));
  const times = new Set(roles.filter((item) => item.role === 'time').map((item) => item.field));
  if (contract.requiresNumeric && numeric.size < contract.requiresNumeric) fail('NUMERIC_FIELDS_REQUIRED', `至少需要 ${contract.requiresNumeric} 个有效数值字段`, 'selection.fields');
  if (contract.requiresTime && !times.size) fail('TIME_FIELD_REQUIRED', '需要可解析的时间字段', 'selection.fields');
  else if (contract.requiresTime && sheet) {
    const timeField = String(suppliedParameters.timeField || [...times][0]); const values = fullSourceRows(project, tables[0], sheet).map((row) => row[timeField]).filter((value) => value !== null && value !== undefined && value !== '');
    const parseable = values.filter((value) => typeof value === 'number' ? Number.isFinite(value) : !Number.isNaN(Date.parse(String(value)))).length;
    if (values.length && parseable / values.length < 0.8) fail('TIME_FIELD_UNPARSABLE', `${timeField} 只有 ${Math.round(parseable / values.length * 100)}% 的值可解析为时间`, `parameters.timeField`);
    else pass('TIME_FIELD_PARSEABLE', `${timeField} 可解析为时间`);
    if (template.id === 'trend-analysis' && values.length) {
      const grain = String(suppliedParameters.grain || 'month');
      const parsedDates = values.map((value) => parseTimeValue(value)).filter(Boolean) as Date[];
      if (parsedDates.length >= 2) {
        const minTime = Math.min(...parsedDates.map((item) => item.getTime()));
        const maxTime = Math.max(...parsedDates.map((item) => item.getTime()));
        const spanDays = Math.max(1, Math.round((maxTime - minTime) / 86400000) + 1);
        const limits = {
          day: { min: 3, max: 366 },
          week: { min: 14, max: 1095 },
          month: { min: 60, max: 3650 },
          quarter: { min: 180, max: Number.POSITIVE_INFINITY },
          year: { min: 730, max: Number.POSITIVE_INFINITY },
        } as const;
        const limit = limits[grain as keyof typeof limits];
        if (limit) {
          if (spanDays < limit.min) fail('TIME_GRAIN_SPAN_TOO_NARROW', `${grain} 粒度至少需要覆盖 ${limit.min} 天，当前约 ${spanDays} 天`, 'parameters.grain');
          else if (spanDays > limit.max) fail('TIME_GRAIN_SPAN_TOO_WIDE', `${grain} 粒度最多建议覆盖 ${limit.max} 天，当前约 ${spanDays} 天`, 'parameters.grain');
          else pass('TIME_GRAIN_SPAN_MATCHED', `${grain} 粒度与约 ${spanDays} 天的数据跨度匹配`);
        }
      }
    }
  }
  const rowCount = Number(sheet?.rowCount ?? sheet?.preview?.length ?? 0);
  if (contract.minimumRows && rowCount < contract.minimumRows) fail('SAMPLE_TOO_SMALL', `至少需要 ${contract.minimumRows} 行，当前 ${rowCount} 行`, 'data.rowCount');
  if (template.category === 'prediction' && rowCount > 0 && numeric.size > Math.max(1, Math.floor(rowCount / 10))) warn('FEATURE_RATIO_HIGH', '特征数相对样本量偏高，可能导致过拟合', 'selection.fields');

  const properties = (template.parameterSchema.properties || {}) as JsonObject;
  const isEmptyParameter = (value: unknown) => value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  const roleParameterNames = ['selectedFields', 'queryFields', 'displayFields', 'editableFields', 'editableFieldsLeft', 'editableFieldsRight', 'metrics', 'dimensions', 'rowDimension', 'columnDimension', 'timeField', 'metric', 'fields', 'target', 'features'];
  const crossTableReferences = selectedRelations.length ? crossTableFieldCatalog(project, selection, primaryRelation) : [];
  for (const [name, rawSchema] of Object.entries(properties)) {
    const value = suppliedParameters[name];
    if (isEmptyParameter(value)) continue;
    const schema = rawSchema as JsonObject;
    if (schema.const !== undefined && value !== schema.const) fail('PARAMETER_CONST_MISMATCH', `${name} 必须为 ${String(schema.const)}`, `parameters.${name}`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) fail('PARAMETER_ENUM_INVALID', `${name} 不是允许的选项`, `parameters.${name}`);
    if (schema.type === 'array' && !Array.isArray(value)) fail('PARAMETER_TYPE_INVALID', `${name} 必须是列表`, `parameters.${name}`);
    if (Array.isArray(value) && Number(schema.minItems || 0) > value.length) fail('PARAMETER_ITEMS_REQUIRED', `${name} 至少选择 ${schema.minItems} 项`, `parameters.${name}`);
    if ((schema.type === 'number' || schema.type === 'integer') && !Number.isFinite(Number(value))) fail('PARAMETER_NUMBER_INVALID', `${name} 必须是有效数字`, `parameters.${name}`);
    if (schema.minimum !== undefined && Number(value) < Number(schema.minimum)) fail('PARAMETER_BELOW_MINIMUM', `${name} 不能小于 ${schema.minimum}`, `parameters.${name}`);
    if (schema.maximum !== undefined && Number(value) > Number(schema.maximum)) fail('PARAMETER_ABOVE_MAXIMUM', `${name} 不能大于 ${schema.maximum}`, `parameters.${name}`);
  }
  const parameterFields = (name: string) => {
    const value = suppliedParameters[name];
    return Array.isArray(value) ? value.map(String) : isEmptyParameter(value) ? [] : [String(value)];
  };
  for (const name of roleParameterNames) {
    const values = parameterFields(name);
    const duplicates = values.filter((field, index) => values.indexOf(field) !== index);
    if (duplicates.length) fail('PARAMETER_FIELD_DUPLICATE', `${name} 存在重复字段：${[...new Set(duplicates)].join('、')}`, `parameters.${name}`);
  }
  const availableFields = new Set(effectiveFields.length ? effectiveFields : [...headers]);
  const crossTableRoleParameterNames = new Set(['dimensions', 'metrics', 'queryFields', 'displayFields', 'editableFieldsLeft', 'editableFieldsRight']);
  if ((template.id === 'cross-table-summary' || template.id === 'join-query-update') && crossTableReferences.length) {
    for (const name of crossTableRoleParameterNames) {
      if (template.id === 'cross-table-summary' && !['dimensions', 'metrics'].includes(name)) continue;
      if (template.id === 'join-query-update' && !['queryFields', 'displayFields', 'editableFieldsLeft', 'editableFieldsRight'].includes(name)) continue;
      const refs = resolveCrossTableFieldReferences(crossTableReferences, parameterFields(name));
      for (const issue of refs.errors) {
        if (issue.error === 'ambiguous') fail('CROSS_TABLE_FIELD_AMBIGUOUS', `${name} 中的字段 ${issue.input} 在多张表中同名；请改用稳定限定名（如 ${issue.candidates[0]?.qualifiedName || issue.candidates[0]?.tableQualifiedName || issue.input}）。`, `parameters.${name}`);
        else fail('CROSS_TABLE_FIELD_NOT_FOUND', `${name} 包含不存在的跨表字段：${issue.input}`, `parameters.${name}`);
      }
    }
  }
  if (!['cross-table-summary', 'join-query-update'].includes(template.id)) {
    for (const name of roleParameterNames) {
      const unavailable = parameterFields(name).filter((field) => !availableFields.has(field));
      if (unavailable.length) fail('PARAMETER_FIELD_NOT_SELECTED', `${name} 包含未选字段：${unavailable.join('、')}`, `parameters.${name}`);
    }
  }
  const numericParameterNames = template.id === 'classification-prediction'
    ? ['features']
    : ['metrics', 'metric', 'fields', 'target', 'features'];
  const crossTableNumericFields = new Set(
    template.id === 'cross-table-summary'
      ? resolveCrossTableFieldReferences(crossTableReferences, parameterFields('metrics')).resolved
        .filter((field) => ['number', 'integer', 'decimal', 'currency', 'percentage'].includes(field.type))
        .map((field) => field.input)
      : [],
  );
  if (template.id !== 'cross-table-summary') for (const name of numericParameterNames) {
    const invalid = parameterFields(name).filter((field) => !numeric.has(field));
    if (invalid.length) fail('NUMERIC_PARAMETER_REQUIRED', `${name} 只能使用数值字段：${invalid.join('、')}`, `parameters.${name}`);
  }
  if (template.id === 'cross-table-summary') {
    const invalidMetrics = parameterFields('metrics').filter((field) => !crossTableNumericFields.has(field));
    if (invalidMetrics.length) fail('NUMERIC_PARAMETER_REQUIRED', `metrics 只能使用数值字段：${invalidMetrics.join('、')}`, 'parameters.metrics');
  }
  const timeParameters = parameterFields('timeField');
  if (timeParameters.some((field) => !times.has(field))) fail('TIME_PARAMETER_REQUIRED', `timeField 必须使用可解析的时间字段`, 'parameters.timeField');
  const target = parameterFields('target')[0];
  const features = parameterFields('features');
  if (target && features.includes(target)) fail('TARGET_FEATURE_OVERLAP', '目标字段不能同时作为特征字段', 'parameters.features');
  if (suppliedParameters.rowDimension && suppliedParameters.rowDimension === suppliedParameters.columnDimension) fail('PIVOT_DIMENSIONS_DUPLICATE', '行维度和列维度不能相同', 'parameters.columnDimension');
  if (template.id === 'single-table-lookup-edit') {
    const queryFields = parameterFields('queryFields');
    const displayFields = parameterFields('displayFields');
    const editableFields = parameterFields('editableFields');
    const overlap = queryFields.filter((field) => editableFields.includes(field));
    if (overlap.length) fail('LOOKUP_FIELD_ROLE_OVERLAP', `查询字段和编辑字段不能重叠：${overlap.join('、')}`, 'parameters.editableFields');
    const invalidDisplay = displayFields.filter((field) => queryFields.includes(field));
    if (invalidDisplay.length) fail('LOOKUP_QUERY_DISPLAY_OVERLAP', `查询字段和展示字段不能重叠：${invalidDisplay.join('、')}`, 'parameters.displayFields');
    const keyFields = new Set(sheet?.config?.keyFields || []);
    const invalidEditable = editableFields.filter((field) => keyFields.has(field));
    if (invalidEditable.length) fail('LOOKUP_KEY_NOT_EDITABLE', `主键不可作为编辑字段：${invalidEditable.join('、')}`, 'parameters.editableFields');
  }
  if (template.id === 'join-query-update' && crossTableReferences.length) {
    const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || '');
    const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation | undefined;
    const leftTableId = String(relation?.left.tableId || '');
    const rightTableId = String(relation?.right.tableId || '');
    const displayFields = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('displayFields')).resolved;
    const editableLeft = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('editableFieldsLeft')).resolved;
    const editableRight = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('editableFieldsRight')).resolved;
    const queryFields = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('queryFields')).resolved;
    if (!queryFields.length) fail('JOIN_QUERY_FIELDS_REQUIRED', '跨表查询模板至少需要一个查询字段。', 'parameters.queryFields');
    if (!displayFields.length) fail('JOIN_DISPLAY_FIELDS_REQUIRED', '跨表查询模板至少需要一个展示字段。', 'parameters.displayFields');
    const invalidLeft = editableLeft.filter((field) => field.tableId !== leftTableId);
    if (invalidLeft.length) fail('JOIN_EDITABLE_LEFT_INVALID', `editableFieldsLeft 只能包含左表字段：${invalidLeft.map((field) => field.input).join('、')}`, 'parameters.editableFieldsLeft');
    const invalidRight = editableRight.filter((field) => field.tableId !== rightTableId);
    if (invalidRight.length) fail('JOIN_EDITABLE_RIGHT_INVALID', `editableFieldsRight 只能包含右表字段：${invalidRight.map((field) => field.input).join('、')}`, 'parameters.editableFieldsRight');
    const relationKeys = new Set([
      ...((relation?.left.fields || []).map((field) => `${leftTableId}.${field}`)),
      ...((relation?.right.fields || []).map((field) => `${rightTableId}.${field}`)),
    ]);
    const nonEditableProtected = [...editableLeft, ...editableRight].filter((field) => field.normalized.key || relationKeys.has(field.tableQualifiedName));
    if (nonEditableProtected.length) fail('JOIN_PROTECTED_FIELD_NOT_EDITABLE', `主键与关系键不可编辑：${nonEditableProtected.map((field) => field.input).join('、')}`, 'parameters.editableFieldsLeft');
  }
  if (template.id === 'correlation-analysis' && sheet) {
    const correlationFields = parameterFields('fields');
    if (correlationFields.length < 2) fail('CORRELATION_FIELDS_REQUIRED', '相关性分析至少需要两个不同的数值字段。', 'parameters.fields');
    else {
      const rows = fullSourceRows(project, tables[0], sheet);
      if (rows.length >= 2) {
        let hasAlignedPair = false;
        for (let left = 0; left < correlationFields.length; left += 1) {
          for (let right = left + 1; right < correlationFields.length; right += 1) {
            const aligned = rows.filter((row: JsonObject) => row[correlationFields[left]] !== null && row[correlationFields[left]] !== undefined && row[correlationFields[left]] !== '' && row[correlationFields[right]] !== null && row[correlationFields[right]] !== undefined && row[correlationFields[right]] !== '' && Number.isFinite(Number(row[correlationFields[left]])) && Number.isFinite(Number(row[correlationFields[right]])));
            if (aligned.length >= 2) {
              hasAlignedPair = true;
              break;
            }
          }
          if (hasAlignedPair) break;
        }
        if (!hasAlignedPair) fail('CORRELATION_ALIGNED_SAMPLES_REQUIRED', '至少需要一对字段拥有 2 组以上对齐的有效数值样本。', 'parameters.fields');
      }
    }
  }
  if (template.id === 'anomaly-detection' && sheet) {
    const anomalyFields = parameterFields('fields');
    if (!anomalyFields.length) fail('ANOMALY_FIELDS_REQUIRED', '异常检测至少需要一个数值字段。', 'parameters.fields');
    else {
      const rows = fullSourceRows(project, tables[0], sheet);
      if (rows.length >= 2) {
        const informativeField = anomalyFields.find((field) => {
          const values = finiteFieldValues(rows, field);
          return new Set(values.map((value) => String(value))).size > 1;
        });
        if (!informativeField) fail('ANOMALY_FIELDS_CONSTANT', '所选异常检测字段全部为常量或空值，无法形成有效异常得分。', 'parameters.fields');
      }
    }
  }
  if (template.id === 'regression-prediction' && sheet) {
    const rows = fullSourceRows(project, tables[0], sheet);
    if (rows.length >= 3 && target) {
      const targetValues = finiteFieldValues(rows, target);
      if (new Set(targetValues.map((value) => String(value))).size < 2) fail('REGRESSION_CONSTANT_TARGET', '回归目标字段不能是常量。', 'parameters.target');
      const highMissingFeatures = features.filter((field) => {
        const validCount = rows.filter((row: JsonObject) => row[field] !== null && row[field] !== undefined && row[field] !== '' && Number.isFinite(Number(row[field]))).length;
        return validCount / Math.max(1, rows.length) < 0.5;
      });
      if (highMissingFeatures.length) fail('FEATURE_MISSING_TOO_HIGH', `以下特征字段缺失率过高：${highMissingFeatures.join('、')}`, 'parameters.features');
      const usableRows = rows.filter((row: JsonObject) => Number.isFinite(Number(row[target])) && features.every((field) => row[field] !== null && row[field] !== undefined && row[field] !== '' && Number.isFinite(Number(row[field]))));
      if (usableRows.length < 3) fail('REGRESSION_USABLE_ROWS_REQUIRED', '可同时用于目标和特征计算的有效样本不足，无法完成回归评估。', 'parameters.features');
    }
  }
  if (template.id === 'classification-prediction' && sheet && target) {
    const rows = fullSourceRows(project, tables[0], sheet);
    if (rows.length >= 3) {
      const classes = rows.map((row: JsonObject) => row[target]).filter((value) => value !== null && value !== undefined && value !== '').map(String);
      const uniqueClasses = [...new Set(classes)];
      if (uniqueClasses.length < 2) fail('CLASS_COUNT_TOO_LOW', '分类目标字段至少需要两个类别。', 'parameters.target');
      const counts = new Map<string, number>();
      for (const item of classes) counts.set(item, (counts.get(item) || 0) + 1);
      const rareClasses = [...counts.entries()].filter(([, count]) => count < 2).map(([clazz]) => clazz);
      if (rareClasses.length) fail('CLASS_SAMPLE_TOO_SMALL', `以下类别样本过少：${rareClasses.join('、')}`, 'parameters.target');
      const total = classes.length;
      const majority = Math.max(...[...counts.values(), 0]);
      if (total > 0 && majority / total > 0.95) fail('CLASS_IMBALANCE_TOO_HIGH', '分类目标字段过度失衡，无法形成稳定评估。', 'parameters.target');
    }
  }
  if (template.id === 'time-series-prediction' && sheet) {
    const rows = fullSourceRows(project, tables[0], sheet);
    const timeField = timeParameters[0];
    const horizon = Number(suppliedParameters.horizon || 6);
    if (rows.length >= 3 && timeField && target) {
      const usableRows = rows.filter((row: JsonObject) => row[timeField] !== null && row[timeField] !== undefined && row[timeField] !== '' && row[target] !== null && row[target] !== undefined && row[target] !== '' && !Number.isNaN(Date.parse(String(row[timeField]))) && Number.isFinite(Number(row[target])));
      const timeValues = usableRows.map((row: JsonObject) => String(row[timeField]));
      if (new Set(timeValues).size !== timeValues.length) fail('TIME_FIELD_DUPLICATE', '时间序列预测要求时间字段在有效样本中唯一。', 'parameters.timeField');
      if (usableRows.length && horizon >= usableRows.length) fail('TIME_SERIES_HORIZON_TOO_LONG', `预测期 ${horizon} 不能大于等于有效历史样本数 ${usableRows.length}。`, 'parameters.horizon');
    }
  }
  const keyFieldList = Array.isArray(sheet?.config?.keyFields) ? sheet.config.keyFields.filter(Boolean) : [];
  if (['single-table-entry', 'single-table-lookup-edit', 'single-table-batch-update'].includes(template.id) && keyFieldList.length > 1) {
    fail('COMPOSITE_KEY_UNSUPPORTED', '当前模板仅支持单主键；组合主键请先拆分或改用支持组合键的模板。', 'data.config.keyFields', { action: 'split-or-switch-template', label: '拆分主键或改用支持组合键的模板' });
  }
  if (template.id === 'single-table-entry' && keyFieldList.length !== 1) {
    fail('ENTRY_KEY_CONFIGURATION_REQUIRED', '单表录入模板当前要求先配置一个稳定单主键，再生成可写保存流程。', 'data.config.keyFields', { action: 'configure-key', label: '配置单主键' });
  }
  const selectedOrAllFields = effectiveFields.length ? effectiveFields : normalizedFields.map((field) => field.name);
  const visibleBusinessFields = selectedOrAllFields.filter((field) => !keyFieldList.includes(field));
  const effectiveFieldCount = visibleBusinessFields.length || selectedOrAllFields.length;
  if ((template.id === 'single-table-entry' || template.id === 'basic-entry') && effectiveFieldCount > 48) {
    fail('TOO_MANY_FIELDS_FOR_DIRECT_FORM', `当前选择了 ${effectiveFieldCount} 个字段；超过 48 个字段时必须先分组或筛选，再生成表单。`, 'selection.fields', { action: 'narrow-fields', label: '减少字段或分组' });
  }

  const required = Array.isArray(template.parameterSchema.required) ? template.parameterSchema.required as string[] : [];
  const unanswered = required.filter((key) => isEmptyParameter(suppliedParameters[key]));
  const activeFieldNames = new Set(
    (effectiveFields.length ? effectiveFields : normalizedFields.map((field) => field.name))
      .concat(...roleParameterNames.map((name) => parameterFields(name))),
  );
  const lowConfidenceFields = normalizedFields.filter((field) => activeFieldNames.has(field.name) && field.needsConfiguration);
  lowConfidenceFields.forEach((field) => warn('FIELD_TYPE_CONFIRMATION_REQUIRED', `字段 ${field.name} 当前推断为 ${field.type}（置信度 ${Math.round(field.typeConfidence * 100)}%），生成前需要确认。`, `fields.${field.name}`));
  const configurationQuestions = lowConfidenceFields.map((field) => ({
    id: `field_type:${field.name}`,
    label: `确认字段 ${field.name} 的类型`,
    type: 'field-type',
    required: true,
  }));
  const requiredQuestions = [
    ...unanswered.map((key) => ({ id: key, label: key, type: String((template.parameterSchema.properties as JsonObject)?.[key]?.type || 'string'), required: true })),
    ...configurationQuestions,
  ];
  const failed = checks.filter((item) => item.status === 'failed').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const status: FeasibilityStatus = failed ? 'blocked' : requiredQuestions.length ? 'needs-configuration' : warnings ? 'warning' : 'ready';
  const score = Math.max(0, Math.min(100, 100 - failed * 25 - warnings * 8 - requiredQuestions.length * 5));
  return { status, score, summary: failed ? `${failed} 项条件未满足` : requiredQuestions.length ? `还需配置 ${requiredQuestions.length} 项参数` : warnings ? `${warnings} 项风险需要确认` : '可以生成', checks, inferredRoles: roles, requiredQuestions, generationPreview: template.generation };
}

