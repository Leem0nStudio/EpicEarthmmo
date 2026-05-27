'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ErrorBoundary] Caught rendering error:', error.message, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111',
            color: '#ccc',
            fontFamily: 'monospace',
            padding: 24,
            textAlign: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 32 }}>⚠️</span>
          <h2 style={{ margin: 0, fontSize: 18, color: '#ff6b6b' }}>Render Error</h2>
          <p style={{ margin: 0, fontSize: 13, maxWidth: 400, color: '#999' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              border: '1px solid #555',
              borderRadius: 4,
              background: '#222',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
