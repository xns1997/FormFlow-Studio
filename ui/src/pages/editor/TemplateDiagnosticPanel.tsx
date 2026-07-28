import React from 'react';
import { Alert, Button } from 'antd';
import { TemplateToolError } from '../../services/templates/operationTemplateClient';

export interface TemplateDiagnostic {
  title: string;
  error: Error;
  action?: string;
}

function diagnosticText(diagnostic: TemplateDiagnostic) {
  const error = diagnostic.error as TemplateToolError;
  return JSON.stringify({ title: diagnostic.title, action: diagnostic.action, code: error.code, message: error.message, path: error.path, retryable: error.retryable, details: error.details }, null, 2);
}

export default function TemplateDiagnosticPanel({ diagnostic, onDismiss, onRetry }: { diagnostic?: TemplateDiagnostic; onDismiss(): void; onRetry?: () => void }) {
  if (!diagnostic) return null;
  const error = diagnostic.error as TemplateToolError;
  return (
    <section className="template-diagnostic" aria-label="操作诊断" role="alert">
      <Alert
        type="error"
        showIcon
        message={diagnostic.title}
        description={<div className="template-diagnostic-copy"><p>{error.message}</p>{error.path && <p><strong>定位：</strong><code>{error.path}</code></p>}{error.code && <p><strong>错误码：</strong><code>{error.code}</code></p>}</div>}
      />
      <div className="template-diagnostic-actions">
        {onRetry && <Button onClick={onRetry}>重试上一步</Button>}
        <Button onClick={() => void navigator.clipboard.writeText(diagnosticText(diagnostic))}>复制诊断</Button>
        <Button type="text" onClick={onDismiss}>关闭</Button>
      </div>
    </section>
  );
}
