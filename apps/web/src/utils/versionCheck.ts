/**
 * Version detection system to detect when the app has been updated
 * and force refresh if needed to prevent stale chunk errors
 */

const VERSION_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
const VERSION_STORAGE_KEY = 'omnara_app_version';
const LAST_CHECK_STORAGE_KEY = 'omnara_last_version_check';

/**
 * Get the current app version from the build
 * In production, this would be set during the build process
 */
function getCurrentVersion(): string {
  // Try to get version from meta tag (can be injected during build)
  const versionMeta = document.querySelector('meta[name="app-version"]');
  if (versionMeta) {
    return versionMeta.getAttribute('content') || 'unknown';
  }
  
  // Fallback to timestamp-based versioning
  // This will be different for each build
  return import.meta.env.VITE_APP_VERSION || 'dev';
}

/**
 * Get the stored version from localStorage
 */
function getStoredVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Store the current version in localStorage
 */
function storeVersion(version: string): void {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the timestamp of the last version check
 */
function getLastCheckTime(): number {
  try {
    const stored = localStorage.getItem(LAST_CHECK_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Store the current timestamp as last check time
 */
function storeLastCheckTime(): void {
  try {
    localStorage.setItem(LAST_CHECK_STORAGE_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if the app version has changed
 * @returns true if version has changed, false otherwise
 */
export function hasVersionChanged(): boolean {
  const currentVersion = getCurrentVersion();
  const storedVersion = getStoredVersion();
  
  // First load, no stored version
  if (!storedVersion) {
    storeVersion(currentVersion);
    return false;
  }
  
  // Version has changed
  if (currentVersion !== storedVersion && storedVersion !== 'dev') {
    return true;
  }
  
  return false;
}

/**
 * Check for version updates by fetching index.html
 * This is useful for detecting updates in production
 */
async function checkForUpdates(): Promise<boolean> {
  try {
    // Fetch the index.html with cache bypass
    const response = await fetch('/index.html', {
      method: 'HEAD',
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!response.ok) {
      return false;
    }
    
    // Check ETag or Last-Modified headers
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');
    
    const storedEtag = localStorage.getItem('omnara_etag');
    const storedLastModified = localStorage.getItem('omnara_last_modified');
    
    // Store current values
    if (etag) {
      localStorage.setItem('omnara_etag', etag);
    }
    if (lastModified) {
      localStorage.setItem('omnara_last_modified', lastModified);
    }
    
    // Check if they've changed
    if (storedEtag && etag && storedEtag !== etag) {
      return true;
    }
    if (storedLastModified && lastModified && storedLastModified !== lastModified) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('[VersionCheck] Failed to check for updates:', error);
    return false;
  }
}

/**
 * Initialize version checking
 * This should be called once when the app starts
 */
export function initializeVersionCheck(): void {
  // Check if version has changed on app load
  if (hasVersionChanged()) {
    console.log('[VersionCheck] App version has changed. New version detected.');
    const currentVersion = getCurrentVersion();
    storeVersion(currentVersion);
  }
  
  // Set up periodic checks for updates (only in production)
  if (import.meta.env.PROD) {
    const performCheck = async () => {
      const now = Date.now();
      const lastCheck = getLastCheckTime();
      
      // Only check if enough time has passed
      if (now - lastCheck > VERSION_CHECK_INTERVAL) {
        storeLastCheckTime();
        
        const hasUpdate = await checkForUpdates();
        if (hasUpdate) {
          console.log('[VersionCheck] Update detected. Notifying user...');
          
          // You could show a toast notification here
          // For now, we'll just log it
          // The chunk error handler will handle the actual refresh
        }
      }
    };
    
    // Check immediately
    performCheck();
    
    // Set up interval
    setInterval(performCheck, VERSION_CHECK_INTERVAL);
  }
}

/**
 * Force a version update by clearing stored version and refreshing
 */
export function forceVersionUpdate(): void {
  try {
    localStorage.removeItem(VERSION_STORAGE_KEY);
    localStorage.removeItem('omnara_etag');
    localStorage.removeItem('omnara_last_modified');
  } catch {
    // Ignore errors
  }
  
  // Force reload
  window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
}