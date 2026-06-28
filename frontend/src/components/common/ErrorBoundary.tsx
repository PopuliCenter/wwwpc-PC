import { Component, type ReactNode } from 'react';
import { reportClientError } from '@/services/clientLog';

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
          <h1 className="text-lg font-semibold text-gray-900">Terjadi kesalahan</h1>
          <p className="max-w-sm text-sm text-gray-500">
            Maaf, ada gangguan tak terduga. Coba muat ulang halaman.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Muat ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
