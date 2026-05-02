import Link from "next/link";
import Image from "next/image";

function decodeRiotSlug(riotIdSlug: string): { gameName: string; tagLine: string | null } {
  const normalized = riotIdSlug
    .split("-")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
    .join("-");

  const lastHyphen = normalized.lastIndexOf("-");
  if (lastHyphen === -1) {
    return { gameName: normalized || "Unknown player", tagLine: null };
  }

  return {
    gameName: normalized.slice(0, lastHyphen) || "Unknown player",
    tagLine: normalized.slice(lastHyphen + 1) || null,
  };
}

export default function UnknownSummonerState({
  region,
  riotIdSlug,
}: {
  region: string;
  riotIdSlug: string;
}) {
  const { gameName, tagLine } = decodeRiotSlug(riotIdSlug);
  const displayName = tagLine ? `${gameName}#${tagLine}` : gameName;

  return (
    <div className="mx-auto flex min-h-[68vh] w-full max-w-4xl items-center px-4 py-10">
      <div className="w-full overflow-hidden rounded-[1.75rem] border border-primary/15 bg-surface/75 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div
          className="border-b border-primary/10 px-6 py-8 sm:px-8"
          style={{ background: "var(--hero-bg)" }}
        >
          <div className="flex items-start gap-5">
            <Image
              src="/favicon/favicon.svg"
              alt="Farsight"
              width={72}
              height={72}
              loading="eager"
              className="rounded-2xl opacity-90"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-primary/70">
                Summoner Lookup
              </div>
              <h1 className="mt-3 break-words text-3xl font-bold tracking-tight text-white">
                {displayName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-dim sm:text-base">
                We couldn&apos;t find a tracked profile for this Riot ID in {region.toUpperCase()}.
                That usually means the name, tag, or region is off, or this summoner has not been onboarded yet.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-8 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-primary/10 bg-surface2/45 p-5">
            <div className="text-sm font-semibold text-white">What to check</div>
            <div className="mt-4 grid gap-3 text-sm text-dim">
              <div>Make sure the Riot ID is spelled exactly right, including uppercase/lowercase-sensitive special characters if applicable.</div>
              <div>Confirm the tagline after the `#` is correct.</div>
              <div>Double-check the selected region. A valid EUW player will still miss if searched under the wrong shard.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/10 bg-surface2/35 p-5">
            <div className="text-sm font-semibold text-white">Next move</div>
            <p className="mt-3 text-sm leading-6 text-dim">
              Go back to search and try the Riot ID again, for example `Name#TAG`.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim"
              >
                Back to Search
              </Link>
              <Link
                href="/#summoner-search"
                className="rounded-xl border border-primary/20 bg-surface2/55 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-primary/35"
              >
                Try Another Riot ID
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
