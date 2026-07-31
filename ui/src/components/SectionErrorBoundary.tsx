/**
 * SectionErrorBoundary — wraps a major UI section so a crash in one area
 * doesn't take down the entire app. Shows a minimal inline fallback.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../services/engine/errorManager';

interface Props {
  children: ReactNode;
  name: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportError({
      severity: 'error',
      source: 'ui',
      title: `${this.props.name} 区域崩溃`,
      message: error.message,
      stack: error.stack,
      context: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
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
        </div>
      );
    }

    return this.props.children;
  }
}
