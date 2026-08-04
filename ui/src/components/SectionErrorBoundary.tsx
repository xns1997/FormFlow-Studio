/**
 * SectionErrorBoundary — wraps a major UI section so a crash in one area
 * doesn't take down the entire app. Shows a minimal inline fallback.
 *
 * 支持两类恢复动作：
 *  - 「重试」：重置本区域（也会响应 formflow:section-retry 事件，供诊断面板按区域重试）；
 *  - 「刷新页面」：整页刷新，用于环境类问题（如 URLSearchParams 残缺）。
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../services/engine/errorManager';

const SECTION_RETRY_EVENT = 'formflow:section-retry';

/** 通知指定名称的错误边界区域执行「重试」。 */
export function dispatchSectionRetry(section: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SECTION_RETRY_EVENT, { detail: { section } }));
}

/** 从错误信息中解析区域名称：优先取 context.section，其次从「xx 区域崩溃」标题反推。 */
export function getSectionNameFromError(error: { title?: string; context?: Record<string, unknown> } | undefined): string | undefined {
  const fromContext = error?.context?.section;
  if (typeof fromContext === 'string' && fromContext.trim()) return fromContext;
  const title = error?.title || '';
  const match = title.match(/^(.+?)\s*区域崩溃/);
  return match ? match[1] : undefined;
}

interface Props {
  children: ReactNode;
  name: string;
  fallback?: ReactNode;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetVersion: number;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, resetVersion: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, resetVersion: 0 };
  }

  componentDidMount() {
    if (typeof window !== 'undefined') {
      window.addEventListener(SECTION_RETRY_EVENT, this.handleSectionRetry);
    }
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener(SECTION_RETRY_EVENT, this.handleSectionRetry);
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportError({
      severity: 'error',
      source: 'ui',
      title: `${this.props.name} 区域崩溃`,
      message: error.message,
      stack: error.stack,
      context: { componentStack: errorInfo.componentStack, section: this.props.name },
    });
  }

  componentDidUpdate(previousProps: Props) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState((state) => ({ hasError: false, error: null, resetVersion: state.resetVersion + 1 }));
    }
  }

  handleReset = () => {
    this.setState((state) => ({ hasError: false, error: null, resetVersion: state.resetVersion + 1 }));
  };

  handleSectionRetry = (event: Event) => {
    const detail = (event as CustomEvent<{ section?: unknown }>).detail;
    if (detail?.section !== this.props.name) return;
    if (this.state.hasError) {
      this.setState((state) => ({ hasError: false, error: null, resetVersion: state.resetVersion + 1 }));
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="section-error-fallback" role="alert">
          <span className="section-error-fallback__icon">⚠️</span>
          <div className="section-error-fallback__content">
            <strong className="section-error-fallback__title">{this.props.name}出现错误</strong>
            <span className="section-error-fallback__message">{this.state.error?.message || '未知错误'}</span>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-xs"
            onClick={this.handleReset}
          >
            重试
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-xs"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetVersion}>{this.props.children}</React.Fragment>;
  }
}
