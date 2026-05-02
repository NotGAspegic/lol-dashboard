import Link from "next/link";
import Image from "next/image";

export default function SummonerNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <Image
        src="/favicon/favicon.svg"
        alt="Farsight"
        width={128}
        height={128}
        loading="eager"
        className="rounded-xl opacity-40"
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white">Summoner Not Found</h1>
        <p className="text-dim text-sm max-w-sm">
          This summoner doesn't exist in our database yet. Search for them to
          start tracking their stats.
        </p>
      </div>
      <Link
        href="/"
        className="px-5 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-sm font-mono"
      >
        ← Back to Search
      </Link>
    </div>
  );
}