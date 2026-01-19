/**
 * Version detection utility to help prevent stale cache issues
 * by detecting when the deployed version has changed.
 */

const VERSION_CHECK_KEY = 'app-version-last-checked';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets the current build version from the meta tag in index.html
 */
export const getBuildVersion = (): string | null => {
  const metaTag = document.querySelector('meta[name="build-version"]');
  return metaTag?.getAttribute('content') || null;
};

/**
 * Stores the current build version in localStorage
 */
export const storeBuildVersion = (version: string): void => {
  try {
    localStorage.setItem('app-build-version', version);
  } catch {
    // Ignore storage errors
  }
};

/**
 * Gets the stored build version from localStorage
 */
export const getStoredBuildVersion = (): string | null => {
  try {
    return localStorage.getItem('app-build-version');
  } catch {
    return null;
  }
};

/**
 * Checks if the current build version matches the stored version
 * If there's a mismatch, it means a new deployment has occurred
 */
export const isNewVersionAvailable = (): boolean => {
  const currentVersion = getBuildVersion();
  const storedVersion = getStoredBuildVersion();

  // If we can't get versions, assume no new version
  if (!currentVersion || !storedVersion) {
    return false;
  }

  return currentVersion !== storedVersion;
};

/**
 * Initializes version tracking
 * Should be called when the app first loads
 */
export const initializeVersionTracking = (): void => {
  const currentVersion = getBuildVersion();
  
  if (currentVersion) {
    const storedVersion = getStoredBuildVersion();
    
    // If no stored version, this is first load - store it
    if (!storedVersion) {
      storeBuildVersion(currentVersion);
      return;
    }

    // If versions don't match, a new deployment occurred
    // Clear the reload attempt counter since this is a fresh deployment
    if (currentVersion !== storedVersion) {
      console.log('[Version Detection] New version detected, updating stored version');
      storeBuildVersion(currentVersion);
      
      try {
        sessionStorage.removeItem('chunk-load-reload-attempt');
      } catch {
        // Ignore storage errors
      }
    }
  }
};

/**
 * Periodically checks for new versions by fetching index.html
 * and comparing the build-version meta tag
 */
export const startVersionPolling = (onNewVersion?: () => void): (() => void) => {
  const checkForNewVersion = async () => {
    try {
      const lastCheck = sessionStorage.getItem(VERSION_CHECK_KEY);
      const now = Date.now();

      // Only check if enough time has passed
      if (lastCheck && now - parseInt(lastCheck, 10) < VERSION_CHECK_INTERVAL) {
        return;
      }

      sessionStorage.setItem(VERSION_CHECK_KEY, String(now));

      // Fetch index.html with cache busting
      const response = await fetch(`/?t=${now}`, {
        method: 'HEAD',
        cache: 'no-cache',
      });

      // Check if ETag or Last-Modified changed
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');
      
      const storedEtag = localStorage.getItem('app-etag');
      const storedLastModified = localStorage.getItem('app-last-modified');

      let hasChanged = false;

      if (etag && storedEtag && etag !== storedEtag) {
        hasChanged = true;
        localStorage.setItem('app-etag', etag);
      } else if (etag && !storedEtag) {
        localStorage.setItem('app-etag', etag);
      }

      if (lastModified && storedLastModified && lastModified !== storedLastModified) {
        hasChanged = true;
        localStorage.setItem('app-last-modified', lastModified);
      } else if (lastModified && !storedLastModified) {
        localStorage.setItem('app-last-modified', lastModified);
      }

      if (hasChanged && onNewVersion) {
        console.log('[Version Polling] New version detected');
        onNewVersion();
      }
    } catch (error) {
      // Silently fail - don't disrupt the app
      console.warn('[Version Polling] Failed to check for new version:', error);
    }
  };

  // Check immediately
  checkForNewVersion();

  // Then check periodically
  const intervalId = setInterval(checkForNewVersion, VERSION_CHECK_INTERVAL);

  // Return cleanup function
  return () => clearInterval(intervalId);
};