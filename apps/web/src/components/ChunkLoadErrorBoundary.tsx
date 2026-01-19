import React, { Component, ReactNode } from 'react';
import { reportError } from '@/integrations/sentry';

interface ChunkLoadErrorBoundaryProps {
  children: ReactNode;
}

interface ChunkLoadErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = 'chunk-load-reload-attempt';
const MAX_RELOAD_ATTEMPTS = 3;

/**
 * Error boundary specifically designed to catch chunk loading errors
 * that occur during dynamic imports in Safari and other browsers.
 * 
 * When a chunk fails to load (typically due to stale cache after deployment),
 * this boundary will automatically refresh the page to fetch the latest chunks.
 */
export class ChunkLoadErrorBoundary extends Component<
  ChunkLoadErrorBoundaryProps,
  ChunkLoadErrorBoundaryState
> {
  constructor(props: ChunkLoadErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChunkLoadErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isChunkLoadError = this.isChunkLoadError(error);

    // Report to Sentry with appropriate context
    reportError(error, {
      context: isChunkLoadError 
        ? 'ChunkLoadError detected - likely stale cache' 
        : 'Error in ChunkLoadErrorBoundary',
      extras: {
        errorInfo,
        isChunkLoadError,
        errorName: error.name,
        errorMessage: error.message,
      },
      tags: {
        errorType: isChunkLoadError ? 'chunk_load_error' : 'unknown_error',
      },
    });

    if (isChunkLoadError) {
      this.handleChunkLoadError();
    }
  }

  /**
   * Detects if the error is related to chunk loading failures
   */
  private isChunkLoadError(error: Error): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';

    // Common chunk load error patterns
    const chunkLoadPatterns = [
      'loading chunk',
      'chunk load',
      'failed to fetch',
      'importing a module script failed',
      'dynamically imported module',
      'error loading dynamically imported module',
    ];

    return chunkLoadPatterns.some(
      (pattern) =>
        errorMessage.includes(pattern.toLowerCase()) ||
        errorName.includes(pattern.toLowerCase())
    );
  }

  /**
   * Handles chunk load errors by reloading the page with safeguards
   * against infinite reload loops
   */
  private handleChunkLoadError() {
    const reloadAttempts = this.getReloadAttempts();

    if (reloadAttempts >= MAX_RELOAD_ATTEMPTS) {
      console.error(
        '[ChunkLoadErrorBoundary] Max reload attempts reached. Not reloading to prevent infinite loop.'
      );
      return;
    }

    // Increment reload counter
    this.incrementReloadAttempts();

    console.log(
      `[ChunkLoadErrorBoundary] Chunk load error detected. Reloading page (attempt ${reloadAttempts + 1}/${MAX_RELOAD_ATTEMPTS})...`
    );

    // Use setTimeout to allow error reporting to complete
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  private getReloadAttempts(): number {
    try {
      const stored = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  }

  private incrementReloadAttempts() {
    try {
      const current = this.getReloadAttempts();
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(current + 1));

      // Clear the counter after 30 seconds if page loads successfully
      setTimeout(() => {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      }, 30000);
    } catch {
      // Ignore storage errors
    }
  }

  render() {
    if (this.state.hasError && !this.isChunkLoadError(this.state.error!)) {
      // For non-chunk-load errors, show a fallback UI
      return (
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}