import { Component, type ReactNode } from 'react';
import { reportClientError } from '@/services/clientLog';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Menangkap error render React, melaporkannya ke monitoring, dan menampilkan
 * fallback alih-alih layar putih.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    reportClientError({
      message: error.message || 'React render error',
      stack: error.stack,
      source: 'react-error-boundary',
      context: { componentStack: info?.componentStack?.slice(0, 4000) },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl text-gray-900">Terjadi kesalahan</h1>
          <p className="max-w-sm text-sm text-gray-600">
            Maaf, ada gangguan tak terduga. Coba muat ulang halaman.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Muat ulang
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
