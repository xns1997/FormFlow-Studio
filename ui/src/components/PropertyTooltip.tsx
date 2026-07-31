/**
 * PropertyTooltip — contextual help tooltip for property panel fields.
 * Shows short explanation, example, and optional "learn more" link.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface PropertyTooltipProps {
  label: string;
  description?: string;
  example?: string;
  children: React.ReactNode;
}

export default function PropertyTooltip({ label, description, example, children }: PropertyTooltipProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number>(0);

  const show = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(true), 300);
  }, []);

  const hide = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(false), 150);
  }, []);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  if (!description && !example) return <>{children}</>;

  return (
    <div className="property-tooltip-wrapper" ref={containerRef} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      <button
        type="button"
        className="property-tooltip-trigger"
        aria-label={`查看 ${label} 的帮助`}
        onFocus={show}
        onBlur={hide}
        onClick={() => setVisible((v) => !v)}
      >
        ?
      </button>
      {visible && (
        <div className="property-tooltip-content" role="tooltip">
          <div className="property-tooltip-label">{label}</div>
          {description && <div className="property-tooltip-desc">{description}</div>}
          {example && (
            <div className="property-tooltip-example">
              <span className="property-tooltip-example-label">示例:</span> {example}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Common tooltip data for frequently used property fields.
 */
export const PROPERTY_HELP: Record<string, { description: string; example?: string }> = {
  label: { description: '用户看到的字段名称，如"员工姓名"', example: '员工姓名' },
  name: { description: '系统内部使用的字段标识，用于数据绑定和引用', example: 'employee_name' },
  fieldBinding: { description: '绑定到数据表的字段名', example: '姓名' },
  placeholder: { description: '输入框为空时显示的提示文字', example: '请输入员工姓名' },
  defaultValue: { description: '表单加载时自动填入的值', example: '2026-01-01' },
  required: { description: '开启后，用户必须填写此字段才能提交' },
  readonly: { description: '开启后，用户可以查看但不能修改此字段' },
  disabled: { description: '开启后，字段变为灰色且不可操作' },
  minLength: { description: '输入内容的最少字符数', example: '2' },
  maxLength: { description: '输入内容的最大字符数', example: '50' },
  min: { description: '数字的最小值', example: '0' },
  max: { description: '数字的最大值', example: '100' },
  pattern: { description: '用正则表达式校验输入格式', example: '^[A-Z]{2}\\d{6}$' },
  options: { description: '下拉选择的可选项列表' },
  visibleExpression: { description: '满足条件时才显示此字段', example: 'form.类型 === "VIP"' },
  disabledExpression: { description: '满足条件时禁用此字段', example: 'form.状态 === "已完成"' },
  requiredExpression: { description: '满足条件时此字段变为必填', example: 'form.类型 === "正式"' },
  dataBinding: { description: '配置数据的来源和流向' },
  flowTriggers: { description: '按钮点击时触发的流程' },
  linkageRules: { description: '当一个字段变化时，自动影响其他字段' },
};
