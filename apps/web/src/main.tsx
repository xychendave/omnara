import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './integrations/sentry'
import { reportError } from './integrations/sentry'
import { PostHogProvider } from 'posthog-js/react'
import { initializeVersionTracking } from './utils/versionDetection'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

// Initialize version tracking to detect new deployments
initializeVersionTracking();

const CHUNK_RELOAD_KEY = 'chunk-load-reload-attempt';
const MAX_RELOAD_ATTEMPTS = 3;

/**
 * Global error handler for unhandled promise rejections
 * This catches chunk loading errors that might not be caught by error boundaries
 */
const isChunkLoadError = (error: any): boolean => {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorName = error?.name?.toLowerCase() || '';
  const errorString = String(error)?.toLowerCase() || '';

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
      errorMessage.includes(pattern) ||
      errorName.includes(pattern) ||
      errorString.includes(pattern)
  );
};

const getReloadAttempts = (): number => {
  try {
    const stored = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
};

const handleChunkLoadError = (error: any) => {
  const reloadAttempts = getReloadAttempts();

  // Report to Sentry
  reportError(error, {
    context: 'Global unhandledrejection - chunk load error',
    extras: {
      reloadAttempts,
      errorType: typeof error,
      errorString: String(error),
    },
    tags: {
      errorType: 'chunk_load_error_unhandledrejection',
    },
  });

  if (reloadAttempts >= MAX_RELOAD_ATTEMPTS) {
    console.error(
      '[Global Error Handler] Max reload attempts reached. Not reloading to prevent infinite loop.'
    );
    return;
  }

  // Increment reload counter
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(reloadAttempts + 1));
    
    // Clear the counter after 30 seconds if page loads successfully
    setTimeout(() => {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }, 30000);
  } catch {
    // Ignore storage errors
  }

  console.log(
    `[Global Error Handler] Chunk load error detected. Reloading page (attempt ${reloadAttempts + 1}/${MAX_RELOAD_ATTEMPTS})...`
  );

  // Use setTimeout to allow error reporting to complete
  setTimeout(() => {
    window.location.reload();
  }, 100);
};

// Add global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault(); // Prevent default error logging
    handleChunkLoadError(event.reason);
  }
});

// Also handle regular errors
window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error)) {
    event.preventDefault(); // Prevent default error logging
    handleChunkLoadError(event.error);
  }
});

const withProviders = (node: React.ReactNode) => {
  if (POSTHOG_KEY) {
    return (
      <PostHogProvider
        apiKey={POSTHOG_KEY}
        options={{
          api_host: POSTHOG_HOST,
          debug: import.meta.env.MODE === 'development',
          persistence: 'localStorage',
          disable_session_recording: import.meta.env.MODE === 'development',
        }}
      >
        {node}
      </PostHogProvider>
    )
  }
  return <>{node}</>
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {withProviders(<App />)}
  </StrictMode>
);
