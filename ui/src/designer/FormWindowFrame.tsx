import React from 'react';
import type { FormWindowConfig } from '../project/types';
import { getFormWindowLayout } from '../../../shared/form-window-layout';

interface FormWindowFrameProps {
  formWindow: FormWindowConfig;
  mode: 'design' | 'preview' | 'runtime';
  children?: React.ReactNode;
  selected?: boolean;
  onClose?: () => void;
  onSubmit?: () => void;
  onReset?: () => void;
}

export function FormWindowFrame({
  formWindow,
  mode,
  children,
  selected = false,
  onClose,
  onSubmit,
  onReset,
}: FormWindowFrameProps) {
  const layout = getFormWindowLayout(formWindow);
  const props = formWindow.props || {};
  return (
    <section
      className={`form-window-frame is-${mode}${selected ? ' is-selected' : ''}`}
      data-form-window="true"
      data-form-window-mode={mode}
      style={{
        width: layout.outer.width,
        height: layout.outer.height,
        borderRadius: props.borderRadius ?? 12,
        background: props.background || '#fff',
      }}
    >
      <header className="form-window-frame-header" style={{ height: layout.header.height }}>
        <div className="form-window-frame-heading">
          <h2 title={String(props.title || '表单')}>{props.title || '表单'}</h2>
          {!!props.subtitle && <p title={String(props.subtitle)}>{props.subtitle}</p>}
        </div>
        {mode === 'runtime' && onClose && (
          <button type="button" className="form-window-frame-close" onClick={onClose} aria-label={`关闭${String(props.title || '表单')}`}>
            ×
          </button>
        )}
      </header>
      <div
        className="form-window-frame-content"
        data-form-content="true"
        style={{
          left: layout.padding.left,
          top: layout.header.height + layout.padding.top,
          width: layout.content.width,
          height: layout.content.height,
        }}
      >
        {children}
      </div>
      {layout.footer && (
        <footer className="form-window-frame-footer" style={{ height: layout.footer.height }}>
          <button type="button" className="btn-secondary" disabled={mode === 'design'} onClick={onReset}>
            {props.resetText || '重置'}
          </button>
          <button type="button" className="btn-primary" disabled={mode === 'design'} onClick={onSubmit}>
            {props.submitText || '提交'}
          </button>
        </footer>
      )}
    </section>
  );
}
