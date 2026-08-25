import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_LOAD_KEYWORDS = [
  'ChunkLoadError',
  'Loading chunk',
  'Loading CSS chunk',
  'Failed to fetch dynamically imported module',
  'Unable to preload CSS',
  'dynamically imported module',
  'importing a module failed',
];

function isChunkLoadError(error: Error): boolean {
  const msg = (error.message || error.name || '').toLowerCase();
  return CHUNK_LOAD_KEYWORDS.some((kw) => msg.includes(kw.toLowerCase()));
}

let hasAutoRetried = false;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    if (isChunkLoadError(error) && !hasAutoRetried) {
      hasAutoRetried = true;
      setTimeout(() => window.location.reload(), 300);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunk = this.state.error && isChunkLoadError(this.state.error);

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '2rem',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            background: '#0f0f1a',
            color: '#e0e0e0',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              padding: '2.5rem 2rem',
              borderRadius: 16,
              background: '#1a1a2e',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: isChunk ? 'rgba(255, 196, 9, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                fontSize: 28,
              }}
            >
              {isChunk ? '↻' : '!'}
            </div>
            <h2
              style={{
                margin: '0 0 0.5rem',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#ffffff',
              }}
            >
              {isChunk ? 'Updating app...' : 'Something went wrong'}
            </h2>
            <p
              style={{
                margin: '0 0 1.5rem',
                fontSize: '0.9rem',
                color: '#9ca3af',
                lineHeight: 1.5,
              }}
            >
              {isChunk
                ? 'A new version is available. Reloading to apply updates...'
                : 'The app encountered an unexpected error. You can try again or reload the page.'}
            </p>
            {this.state.error && !isChunk && (
              <details
                style={{
                  marginBottom: '1.5rem',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                  }}
                >
                  Error details
                </summary>
                <pre
                  style={{
                    margin: 0,
                    padding: '0.75rem',
                    borderRadius: 8,
                    background: '#0d0d1a',
                    fontSize: '0.75rem',
                    color: '#ef4444',
                    overflow: 'auto',
                    maxHeight: 120,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              {!isChunk && (
                <button
                  onClick={this.handleRetry}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent',
                    color: '#e0e0e0',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Try Again
                </button>
              )}
              <button
                onClick={this.handleReload}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 10,
                  border: 'none',
                  background: '#ffc409',
                  color: '#0f0f1a',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isChunk ? 'Reload Now' : 'Reload Page'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
