const RIOT_DISCLAIMER =
  "Farsight isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="rounded-3xl border border-primary/15 bg-surface/80 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="text-xs font-mono uppercase tracking-[0.24em] text-primary/65">
          Legal
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Riot Games Disclaimer
        </h1>
        <p className="mt-6 text-sm leading-7 text-dim">
          {RIOT_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
