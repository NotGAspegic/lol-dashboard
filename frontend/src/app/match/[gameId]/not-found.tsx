import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-2">Match Not Found</h1>
        <p className="text-dim text-lg mb-4">
          This match doesn't exist or has already been deleted.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2 bg-primary/20 border border-primary/40 text-primary rounded-lg hover:bg-primary/30 transition-colors"
        >
          ← Back Home
        </Link>
      </div>
    </div>
  );
}
