import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { LazyLoadErrorBoundary } from './LazyLoadErrorBoundary';
import { handleChunkError } from '@/utils/chunkErrorHandler';

// Loading component
export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Wrapper for lazy imports that adds retry logic for chunk loading errors
 * This helps handle Safari's aggressive caching issues
 */
function lazyWithRetry<T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  retries = 1
): React.LazyExoticComponent<T> {
  return lazy(() => {
    return importFunc().catch((error) => {
      // If this is a chunk loading error, try to handle it
      if (handleChunkError(error)) {
        // Page will refresh, return a never-resolving promise
        // to prevent React from rendering anything
        return new Promise(() => {});
      }
      
      // If we have retries left, try again after a short delay
      if (retries > 0) {
        return new Promise<{ default: T }>((resolve) => {
          setTimeout(() => {
            resolve(
              lazyWithRetry(importFunc, retries - 1)
                .type()
                .catch((retryError) => {
                  throw retryError;
                })
            );
          }, 1000);
        });
      }
      
      // No more retries, throw the error
      throw error;
    });
  });
}

// Lazy load heavy components with retry logic
export const CommandCenter = lazyWithRetry(() => import('@/pages/CommandCenter'));
export const AllInstances = lazyWithRetry(() => import('@/pages/AllInstances'));
export const UserAgents = lazyWithRetry(() => import('@/pages/UserAgents'));
export const Pricing = lazyWithRetry(() => import('@/pages/Pricing'));
export const Billing = lazyWithRetry(() => import('@/pages/dashboard/Billing'));
export const Settings = lazyWithRetry(() => import('@/pages/dashboard/Settings'));
export const InstanceDetail = lazyWithRetry(() => 
  import('@/components/dashboard').then(module => ({ 
    default: module.InstanceDetail 
  }))
);
export const InstanceList = lazyWithRetry(() => 
  import('@/components/dashboard').then(module => ({ 
    default: module.InstanceList 
  }))
);
export const APIKeyManagement = lazyWithRetry(() => 
  import('@/components/dashboard').then(module => ({ 
    default: module.APIKeyManagement 
  }))
);

// Wrapper component for lazy loaded routes
export function LazyRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}