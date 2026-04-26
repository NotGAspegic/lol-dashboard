"use client";

import { useEffect } from "react";
import Image from "next/image";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <Image
        src="/farsight.png"
        alt="Farsight"
        width={64}
        height={64}
        className="rounded-xl opacity-40"
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="text-dim text-sm max-w-sm">
          An unexpected error occurred. This has been noted.
        </p>
        {error.digest && (
          <p className="text-dim text-xs font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="px-5 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-sm font-mono"
      >
        ↺ Try Again
      </button>
    </div>
  );
}