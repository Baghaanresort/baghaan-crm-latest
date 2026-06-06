'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-stone-50"
    >
      <div className="text-center max-w-md">
        <h1
          className="text-2xl text-emerald-900 mb-3"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          Something went wrong
        </h1>
        <p className="text-stone-500 italic mb-6 text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="bg-emerald-900 text-amber-100 px-6 py-2.5 text-sm tracking-wider hover:bg-emerald-800 transition"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
