'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center p-8">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-4 text-gray-600">An unexpected error occurred.</p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
