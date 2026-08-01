// 全局错误边界 - 防止未捕获错误导致白屏

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetVersion: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, resetVersion: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, resetVersion: 0 };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  componentDidUpdate(previousProps: Props) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState((state) => ({ hasError: false, error: null, resetVersion: state.resetVersion + 1 }));
    }
  }

  handleReset = () => {
    this.setState((state) => ({ hasError: false, error: null, resetVersion: state.resetVersion + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '40px 20px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
            页面出现错误
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, maxWidth: 400 }}>
            当前区域已停止渲染，其他功能仍可继续使用。{this.state.error?.message ? `（${this.state.error.message}）` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={this.handleReset}
              className="ui-btn"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetVersion}>{this.props.children}</React.Fragment>;
  }
}

// 用于包装页面组件的 HOC
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
