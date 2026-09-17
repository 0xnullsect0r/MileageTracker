import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[600px] px-4 py-24 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Not here.</h1>
      <p className="mt-4 max-w-prose text-sm text-ink-muted">
        No page at this address, or the vehicle, entry, or batch you were looking at
        has been removed.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center border border-ink px-4 text-sm font-semibold hover:bg-ink hover:text-paper"
        >
          Back to garage
        </Link>
      </div>
    </main>
  );
}
