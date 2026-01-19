/**
 * Utility to detect and handle chunk loading errors
 * 
 * This is particularly important for Safari which has aggressive caching
 * and may fail to load updated chunks after deployments.
 */

const CHUNK_LOAD_ERROR_REFRESH_KEY = 'omnara_chunk_error_refresh';
const MAX_REFRESH_ATTEMPTS = 2;

/**
 * Check if an error is a chunk loading error
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Common patterns for chunk loading errors
  const chunkErrorPatterns = [
    'Loading chunk',
    'ChunkLoadError',
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'Failed to load module script',
    'error loading dynamically imported module',
  ];
  
  return chunkErrorPatterns.some(pattern => 
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Get the number of refresh attempts for chunk errors
 */
function getRefreshAttempts(): number {
  try {
    const attempts = sessionStorage.getItem(CHUNK_LOAD_ERROR_REFRESH_KEY);
    return attempts ? parseInt(attempts, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the refresh attempt counter
 */
function incrementRefreshAttempts(): void {
  try {
    const attempts = getRefreshAttempts();
    sessionStorage.setItem(CHUNK_LOAD_ERROR_REFRESH_KEY, String(attempts + 1));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset the refresh attempt counter
 */
export function resetRefreshAttempts(): void {
  try {
    sessionStorage.removeItem(CHUNK_LOAD_ERROR_REFRESH_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Handle chunk loading error by refreshing the page
 * 
 * This will only refresh up to MAX_REFRESH_ATTEMPTS times to prevent
 * infinite refresh loops.
 * 
 * @param error - The error that occurred
 * @returns true if page was refreshed, false otherwise
 */
export function handleChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }
  
  const attempts = getRefreshAttempts();
  
  if (attempts < MAX_REFRESH_ATTEMPTS) {
    console.warn(
      `[ChunkErrorHandler] Chunk loading failed (attempt ${attempts + 1}/${MAX_REFRESH_ATTEMPTS}). Refreshing page...`,
      error
    );
    
    incrementRefreshAttempts();
    
    // Use location.reload(true) to force reload from server, bypassing cache
    // Note: The boolean parameter is deprecated but still works in some browsers
    // We'll use a combination of cache control headers and hard reload
    window.location.href = window.location.href.split('#')[0] + '?refresh=' + Date.now();
    
    return true;
  }
  
  console.error(
    `[ChunkErrorHandler] Max refresh attempts (${MAX_REFRESH_ATTEMPTS}) reached. Not refreshing.`,
    error
  );
  
  return false;
}

/**
 * Setup a global listener for chunk loading errors
 * Should be called early in application initialization
 */
export function setupChunkErrorHandler(): void {
  // Reset counter on successful page load
  if (document.readyState === 'complete') {
    resetRefreshAttempts();
  } else {
    window.addEventListener('load', resetRefreshAttempts);
  }
  
  // Handle unhandled promise rejections (where dynamic imports often fail)
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault(); // Prevent default error logging
      handleChunkError(event.reason);
    }
  });
}