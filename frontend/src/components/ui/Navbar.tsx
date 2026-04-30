"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, UserRound } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import FavoriteSummonerCard from "@/components/ui/FavoriteSummonerCard";
import {
  CurrentSummonerIdentity,
  readCurrentSummonerSnapshot,
  subscribeToCurrentSummonerStore,
} from "@/lib/currentSummoner";
import {
  FavoriteSummonerIdentity,
  readFavoriteSummonersSnapshot,
  subscribeToFavoriteSummonersStore,
} from "@/lib/favoriteSummoners";
import { buildSummonerProfilePath, formatSummonerDisplayName } from "@/lib/summonerRoute";

export default function Navbar() {
  const pathname = usePathname();
  const currentSummonerSnapshot = useSyncExternalStore(
    subscribeToCurrentSummonerStore,
    readCurrentSummonerSnapshot,
    () => ""
  );
  const currentSummoner = useMemo<CurrentSummonerIdentity | null>(() => {
    if (!currentSummonerSnapshot) return null;

    try {
      return JSON.parse(currentSummonerSnapshot) as CurrentSummonerIdentity;
    } catch {
      return null;
    }
  }, [currentSummonerSnapshot]);
  const favoriteSnapshot = useSyncExternalStore(
    subscribeToFavoriteSummonersStore,
    readFavoriteSummonersSnapshot,
    () => "[]"
  );
  const favorites = useMemo<FavoriteSummonerIdentity[]>(() => {
    try {
      return JSON.parse(favoriteSnapshot) as FavoriteSummonerIdentity[];
    } catch {
      return [];
    }
  }, [favoriteSnapshot]);
  const quickFavorites = favorites.slice(0, 2);

  return (
    <nav
      className="border-b sticky top-0 z-50 backdrop-blur-sm"
      style={{
        background: "rgba(10,22,40,0.85)",
        borderColor: "rgba(30,155,232,0.15)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Image
            src="/farsight.png"
            alt="Farsight"
            width={28}
            height={28}
            className="rounded-sm group-hover:brightness-125 transition-all"
          />
          <span className="font-bold text-base tracking-tight text-white">
            Farsight
          </span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {quickFavorites.length > 0 ? (
            <div className="hidden xl:flex items-center gap-2">
              {quickFavorites.map((favorite) => {
                const href = buildSummonerProfilePath({
                  puuid: favorite.puuid,
                  region: favorite.region ?? undefined,
                  gameName: favorite.gameName,
                  tagLine: favorite.tagLine,
                });
                return (
                  <div
                    key={`quick-${favorite.puuid}`}
                    className="w-[220px]"
                  >
                    <FavoriteSummonerCard favorite={favorite} variant="chip" active={pathname === href} />
                  </div>
                );
              })}
            </div>
          ) : null}
          {favorites.length > 0 ? (
            <details className="group relative">
              <summary
                className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-primary/15 bg-surface2/45 px-3 py-2 text-dim transition-colors hover:border-primary/30 hover:text-white"
              >
                <Star className="h-3.5 w-3.5 text-amber-300" fill="currentColor" />
                <span className="hidden sm:inline">Pinned</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary">
                  {favorites.length}
                </span>
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.6rem)] z-40 w-96 rounded-xl border border-primary/20 bg-surface p-2 shadow-2xl">
                {currentSummoner ? (
                  <div className="mb-2 rounded-lg border border-primary/10 bg-surface2/55 px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-dim">
                      <UserRound className="h-3.5 w-3.5" />
                      Current Profile
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {formatSummonerDisplayName({
                        puuid: currentSummoner.puuid,
                        gameName: currentSummoner.gameName,
                        tagLine: currentSummoner.tagLine,
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="mb-2 px-1 text-[11px] font-mono uppercase tracking-[0.18em] text-dim">
                  Pinned Profiles
                </div>
                <div className="grid gap-2">
                  {favorites.map((favorite) => {
                    const href = buildSummonerProfilePath({
                      puuid: favorite.puuid,
                      region: favorite.region ?? undefined,
                      gameName: favorite.gameName,
                      tagLine: favorite.tagLine,
                    });
                    return (
                      <FavoriteSummonerCard
                        key={favorite.puuid}
                        favorite={favorite}
                        compact
                        active={pathname === href}
                      />
                    );
                  })}
                </div>
              </div>
            </details>
          ) : null}
          <Link
            href="/draft"
            style={{ color: "#3A5070" }}
            className="hover:text-white transition-colors"
          >
            Draft
          </Link>
          <a
            aria-label="View source on GitHub"
            href="https://github.com/NotGAspegic/lol-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3A5070" }}
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
