import React, { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { isChunkLoadError, handleChunkError } from '@/utils/chunkErrorHandler';
import { reportError } from '@/integrations/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

/**
 * Error boundary specifically designed to handle lazy-loaded component failures
 * 
 * This component:
 * 1. Catches errors from lazy-loaded React components
 * 2. Detects chunk loading errors (common in Safari after deployments)
 * 3. Automatically refreshes the page to load updated chunks
 * 4. Provides a user-friendly fallback UI if auto-refresh fails
 */
export class LazyLoadErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const isChunk = isChunkLoadError(error);
    
    return {
      hasError: true,
      error,
      isChunkError: isChunk,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[LazyLoadErrorBoundary] Caught error:', error, errorInfo);
    
    // Report to Sentry with context
    reportError(error, {
      context: 'LazyLoadErrorBoundary',
      extras: {
        componentStack: errorInfo.componentStack,
        isChunkError: isChunkLoadError(error),
      },
      tags: {
        errorBoundary: 'LazyLoad',
      },
    });

    // Try to handle chunk errors automatically
    if (isChunkLoadError(error)) {
      // handleChunkError will refresh the page if within retry limits
      const didRefresh = handleChunkError(error);
      
      if (!didRefresh) {
        // If we didn't refresh, update state to show error UI
        this.setState({ isChunkError: true });
      }
      // If we did refresh, the page will reload and this component will unmount
    }
  }

  handleManualRefresh = (): void => {
    // Clear any retry counters and force a hard refresh
    window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Show different UI based on error type
      if (this.state.isChunkError) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Update Available</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              A new version of the application is available. Please refresh the page to continue.
            </p>
            <button
              onClick={this.handleManualRefresh}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
              Refresh Page
            </button>
          </div>
        );
      }

      // Generic error fallback
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleManualRefresh}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}