"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root error boundary. Renders a small paper-and-hairline page in the same
 * design language as the rest of the app. No stack trace leaks to the
 * browser — the digest below is the correlation handle for the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged this. Client-side is only for the
    // browser console if devtools happen to be open.
    console.error("logbook error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-[600px] px-4 py-24 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Something broke.</h1>
      <p className="mt-4 max-w-prose text-sm text-ink-muted">
        The server encountered an error while rendering this page. Try again — most of
        the time this is a transient database blip.
      </p>
      {error.digest && (
        <p className="num mt-4 text-[0.75rem] text-ink-muted">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 border border-ink px-4 text-sm font-semibold hover:bg-ink hover:text-paper"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink"
        >
          Back to garage
        </Link>
      </div>
    </main>
  );
}
