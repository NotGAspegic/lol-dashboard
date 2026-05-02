import Link from "next/link";

const RIOT_DISCLAIMER =
  "Farsight isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-primary/10 bg-[var(--footer-bg)]">
      <div className="max-w-6xl mx-auto px-4 py-5 text-center">
        <p className="text-[11px] leading-relaxed text-dim max-w-4xl mx-auto">
          {RIOT_DISCLAIMER}
        </p>
        <p className="mt-2 text-xs text-primary/65">
          <Link href="/legal" className="hover:text-white transition-colors">
            Legal
          </Link>
          {" • "}
          <a
            href="https://github.com/NotGAspegic/lol-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Source Code
          </a>
          {" • Built with Next.js + FastAPI"}
        </p>
      </div>
    </footer>
  );
}
