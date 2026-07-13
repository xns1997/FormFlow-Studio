import React, { useEffect, useState } from 'react';
import { AntdSelectInput, AntdTextAreaInput, AntdTextInput } from '../../../components/AntdFormControls';
import type { ValidationRule } from '../../../models';
import { buildPropertyDependencyGraph, extractPropertyReferences, findPropertyDependencyCycles } from '../../../services/engine/propertyDependencies';
import { evaluatePropertyExpression, interpolatePropertyTemplate, PROPERTY_EXPRESSION_FUNCTIONS, PROPERTY_EXPRESSION_FUNCTION_DETAILS } from '../../../services/engine/propertyExpression';
import { compileRegex, REGEX_EXAMPLES, testRegex, type RegexSampleResult } from '../../../services/engine/regexTester';
import { validateField } from '../../../services/engine/validator';
import { isCompositePropDef } from '../../types';
import type { PropertyEditorContext } from '../propertyEditorRegistry';

export function RegexVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: string) => void; onValidity: (valid: boolean) => void }) {
  const pattern = String(value ?? '');
  const [samples, setSamples] = useState('13800138000\nabc@example.com\nnot-valid');
  const [results, setResults] = useState<RegexSampleResult[]>([]);
  const [testError, setTestError] = useState('');
  const syntaxError = compileRegex(pattern);
  useEffect(() => onValidity(!syntaxError), [syntaxError, onValidity]);
  const run = async () => {
    const result = await testRegex(pattern, samples.split('\n'));
    setResults(result.results);
    setTestError(result.error || '');
  };
  return <div className="property-editor-stack">
    <div className="property-editor-examples">{REGEX_EXAMPLES.map((example) => <button key={example.label} type="button" onClick={() => { onChange(example.pattern); setSamples(example.sample); }} title={example.category}>{example.label}</button>)}</div>
    <label className="property-editor-label"><span>正则表达式</span><AntdTextInput value={pattern} placeholder="^\\d+$" onChange={onChange} /></label>
    {syntaxError && <div className="property-editor-error">语法错误：{syntaxError}</div>}
    <label className="property-editor-label"><span>测试样本（每行一条）</span><AntdTextAreaInput value={samples} rows={6} onChange={setSamples} /></label>
    <button className="toolbar-btn" type="button" disabled={!!syntaxError || !pattern} onClick={run}>运行安全测试</button>
    {testError && <div className="property-editor-error">{testError}</div>}
    {results.length > 0 && <div className="property-regex-results">{results.map((result, index) => <div key={`${index}-${result.sample}`} className={result.matched ? 'matched' : 'unmatched'}><b>{result.matched ? '匹配' : '未匹配'}</b><code>{result.sample || '（空行）'}</code>{result.match && <span>命中：{result.match}</span>}</div>)}</div>}
  </div>;
}

export function ValidationRulesVisual({ value, fields, onChange, onValidity }: { value: unknown; fields: string[]; onChange: (value: ValidationRule[]) => void; onValidity: (valid: boolean) => void }) {
  const rules: ValidationRule[] = Array.isArray(value) ? value as ValidationRule[] : [];
  const [sample, setSample] = useState('');
  const invalid = rules.some((rule) => !rule.type || (['pattern', 'min', 'max', 'minLength', 'maxLength', 'minSelect', 'maxSelect'].includes(rule.type) && !rule.param) || (rule.type === 'compare' && !rule.field));
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const types: ValidationRule['type'][] = ['required', 'email', 'phone', 'url', 'idcard', 'number', 'integer', 'min', 'max', 'minLength', 'maxLength', 'pattern', 'minSelect', 'maxSelect', 'date', 'compare'];
  const labels: Partial<Record<ValidationRule['type'], string>> = { required: '必填', email: '邮箱', phone: '手机号', url: '网址', idcard: '身份证号', number: '数字', integer: '整数', min: '最小值', max: '最大值', minLength: '最小长度', maxLength: '最大长度', pattern: '正则格式', minSelect: '最少选择', maxSelect: '最多选择', date: '日期', compare: '跨字段比较' };
  const previewError = validateField(sample, rules, Object.fromEntries(fields.map((field) => [field, sample])));
  return <div className="property-editor-stack">
    {rules.map((rule, index) => <div className="property-array-card" key={index}>
      <div className="property-array-card-head"><strong>规则 {index + 1}</strong><div><button type="button" onClick={() => { const next = [...rules]; if (index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>↑</button><button type="button" onClick={() => onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))}>删除</button></div></div>
      <div className="property-array-grid">
        <label><span>规则类型</span><AntdSelectInput value={rule.type} options={types.map((type) => ({ label: labels[type] || type, value: type }))} onChange={(type) => onChange(rules.map((item, ruleIndex) => ruleIndex === index ? { ...item, type: type as ValidationRule['type'] } : item))} /></label>
        {rule.type === 'compare' ? <><label><span>比较字段</span><AntdSelectInput value={rule.field || ''} options={fields.map((field) => ({ label: field, value: field }))} onChange={(field) => onChange(rules.map((item, ruleIndex) => ruleIndex === index ? { ...item, field: String(field) } : item))} /></label><label><span>比较方式</span><AntdSelectInput value={rule.operator || 'eq'} options={[['eq', '等于'], ['ne', '不等于'], ['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于']].map(([nextValue, label]) => ({ value: nextValue, label }))} onChange={(operator) => onChange(rules.map((item, ruleIndex) => ruleIndex === index ? { ...item, operator: operator as ValidationRule['operator'] } : item))} /></label></> : !['required', 'email', 'phone', 'url', 'idcard', 'number', 'integer', 'date'].includes(rule.type) && <label><span>参数 / 正则</span><AntdTextInput value={rule.param || ''} onChange={(param) => onChange(rules.map((item, ruleIndex) => ruleIndex === index ? { ...item, param } : item))} /></label>}
        <label><span>错误提示</span><AntdTextInput value={rule.message || ''} placeholder="留空使用默认提示" onChange={(message) => onChange(rules.map((item, ruleIndex) => ruleIndex === index ? { ...item, message } : item))} /></label>
      </div>
    </div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rules, { type: 'required', message: '' }])}>添加校验规则</button>
    {invalid && <div className="property-editor-error">请补全规则参数</div>}
    <label className="property-editor-label"><span>用示例值测试规则</span><AntdTextInput value={sample} placeholder="输入一个测试值" onChange={setSample} /></label>
    <div className={previewError ? 'property-editor-error' : 'property-editor-preview'}>{previewError ? `未通过：${previewError}` : '通过全部规则'}</div>
  </div>;
}

export function ExpressionVisual({ kind, value, context, onChange, onValidity }: { kind: string; value: unknown; context: PropertyEditorContext; onChange: (value: string) => void; onValidity: (valid: boolean) => void }) {
  const expression = String(value ?? '');
  const sampleValues = Object.fromEntries(context.fields.map((field) => [field, context.fieldCatalog?.find((item) => item.path === field)?.sample ?? context.values[field] ?? '示例值']));
  const result = kind === 'template' ? interpolatePropertyTemplate(expression, { form: sampleValues, component: context.values }) : evaluatePropertyExpression(expression, { form: sampleValues, component: context.values });
  const references = extractPropertyReferences(expression);
  const missing = references.filter((reference) => !context.fields.includes(reference));
  const dependencyComponents = (context.components || []).map((component) => component.id === context.component?.id && !isCompositePropDef(context.def) ? { ...component, props: { ...component.props, [context.def.key]: expression } } : component);
  const cycles = findPropertyDependencyCycles(buildPropertyDependencyGraph(dependencyComponents));
  const currentField = String(context.component?.fieldBinding || context.component?.props.name || '');
  const currentCycles = cycles.filter((cycle) => cycle.includes(currentField));
  useEffect(() => onValidity(result.ok && currentCycles.length === 0), [result.ok, currentCycles.length, onValidity]);
  const insert = (text: string) => onChange(`${expression}${expression ? ' ' : ''}${text}`);
  return <div className="property-editor-stack">
    <div className="property-editor-examples">{context.fields.slice(0, 16).map((field) => <button key={field} type="button" title={`${context.fieldCatalog?.find((item) => item.path === field)?.type || 'unknown'} · ${context.fieldCatalog?.find((item) => item.path === field)?.sourceLabel || '当前表单'}`} onClick={() => insert(kind === 'template' ? `{{form.${field}}}` : `form.${field}`)}>{field}</button>)}</div>
    {kind === 'expression' && <div className="property-editor-examples subtle">{PROPERTY_EXPRESSION_FUNCTIONS.map((fn) => <button key={fn} type="button" title={PROPERTY_EXPRESSION_FUNCTION_DETAILS[fn]} onClick={() => insert(`${fn}()`)}>{fn}</button>)}</div>}
    <AntdTextAreaInput value={expression} rows={8} placeholder={kind === 'template' ? '您好，{{form.customerName}}' : 'coalesce(form.quantity, 0) * form.price'} onChange={onChange} />
    <div className={result.ok ? 'property-editor-preview' : 'property-editor-error'}><b>{result.ok ? `结果预览 · ${Array.isArray(result.value) ? 'array' : result.value === null ? 'null' : typeof result.value}` : '表达式错误'}</b><pre>{result.ok ? JSON.stringify(result.value, null, 2) : result.error}</pre></div>
    {references.length > 0 && <div className="property-impact"><b>依赖字段</b><span>{references.join('、')}</span></div>}
    {missing.length > 0 && <div className="property-editor-warning">未找到字段：{missing.join('、')}。配置会保留，但运行时将产生诊断。</div>}
    {currentCycles.map((cycle) => <div className="property-editor-error" key={cycle.join('→')}>循环依赖：{cycle.join(' → ')}</div>)}
    <p className="property-editor-help">仅支持字段引用、算术/比较/逻辑运算和白名单函数，不执行 JavaScript。</p>
  </div>;
}
