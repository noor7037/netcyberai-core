'use client';

import { useState } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { ErrorState, Skeleton } from '@/components/app-ui/States';

// The error state with a working "Try again": it shows loading, then the
// error again, so the retry path can be seen and tested by keyboard.
export function GalleryInteractive() {
  const [loading, setLoading] = useState(false);
  return (
    <AppCard title="Error">
      {loading ? (
        <Skeleton lines={2} />
      ) : (
        <ErrorState
          message="The list could not be loaded. Check the connection and try again."
          onRetry={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 600);
          }}
        />
      )}
    </AppCard>
  );
}
