import type { NaturalRuleTranslation } from './types';
import { fieldRef, componentRef } from './parser';

function splitChineseList(source: string) {
  return source.split(/[、,，和及]/).map((item) => item.trim()).filter(Boolean);
}

export function naturalLanguageToBehaviorDsl(source: string): NaturalRuleTranslation {
  const lines: string[] = [];
  const preview: string[] = [];
  const diagnostics: string[] = [];
  const clauses = source.split(/[；;。\n]+/).map((item) => item.trim()).filter(Boolean);
  for (const clause of clauses) {
    let match: RegExpMatchArray | null;
    if ((match = clause.match(/^(?:当)?(.+?)(?:等于|是)(.+?)时(?:，)?(显示|隐藏|启用|禁用)(.+)$/))) {
      const action = ({ 显示: 'show', 隐藏: 'hide', 启用: 'enable', 禁用: 'disable' } as const)[match[3] as '显示'];
      const targets = splitChineseList(match[4]);
      lines.push(`when ${fieldRef(match[1])} == ${JSON.stringify(match[2].trim())} -> ${action}(${targets.map(componentRef).join(', ')})`);
      preview.push(`当"${match[1].trim()}"等于"${match[2].trim()}"时，${match[3]}"${targets.join('、')}"。`);
    } else if ((match = clause.match(/^(?:当)?(.+?)为空时(?:，)?(显示|隐藏|启用|禁用)(.+)$/))) {
      const action = ({ 显示: 'show', 隐藏: 'hide', 启用: 'enable', 禁用: 'disable' } as const)[match[2] as '显示'];
      const targets = splitChineseList(match[3]);
      lines.push(`when ${fieldRef(match[1])} is empty -> ${action}(${targets.map(componentRef).join(', ')})`);
      preview.push(`当"${match[1].trim()}"为空时，${match[2]}"${targets.join('、')}"。`);
    } else if ((match = clause.match(/^提交前(?:要求)?(.+?)(?:为)?必填$/))) {
      const fields = splitChineseList(match[1]);
      lines.push(`before submit -> require(${fields.map(fieldRef).join(', ')})`);
      preview.push(`提交前校验"${fields.join('、')}"为必填。`);
    } else if ((match = clause.match(/^(.+?)变化时(?:，)?计算(.+?)(?:为|=)(.+)$/))) {
      const fields = splitChineseList(match[1]);
      lines.push(`compute ${fieldRef(match[2])} = ${match[3].trim()} watch(${fields.map(fieldRef).join(', ')})`);
      preview.push(`${fields.join('、')}变化时计算"${match[2].trim()}"。`);
    } else diagnostics.push(`无法识别："${clause}"`);
  }
  return { dsl: lines.join('\n'), preview, diagnostics };
}
