import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#141517',
          color: '#e8eaed',
          fontFamily: 'system-ui, sans-serif',
          padding: '40px',
          textAlign: 'center',
          gap: '16px',
        }}>
          <div style={{ fontSize: '48px', opacity: 0.5 }}>⚠</div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Algo deu errado</h1>
          <p style={{ margin: 0, color: '#9ca3af', fontSize: '14px', maxWidth: '400px' }}>
            O Prelo encontrou um erro inesperado. Seu projeto está salvo no navegador.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '8px',
              padding: '8px 24px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
          <details style={{ marginTop: '16px', textAlign: 'left', fontSize: '11px', color: '#6b7280', maxWidth: '500px' }}>
            <summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary>
            <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {this.state.error?.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
