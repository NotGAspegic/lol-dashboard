"use client";

import type { MouseEvent } from "react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import RegionSelect from "@/components/ui/RegionSelect";
import { getSummonerSuggestions, searchSummoner, getTaskStatus } from "@/lib/api";
import { buildSummonerProfilePath } from "@/lib/summonerRoute";
import {
  FavoriteSummonerIdentity,
  readFavoriteSummonersSnapshot,
  subscribeToFavoriteSummonersStore,
  toggleFavoriteSummoner,
} from "@/lib/favoriteSummoners";

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("euw1");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasFocus, setHasFocus] = useState(false);
  const [debouncedQuery] = useDebounce(query, 250);

  const parts = debouncedQuery.split("#");
  const isValid = parts.length === 2 && parts[0].trim() !== "" && parts[1].trim() !== "";
  const suggestionsQuery = useQuery({
    queryKey: ["summoner-suggestions", debouncedQuery, region],
    queryFn: () => getSummonerSuggestions(debouncedQuery, region),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });
  const showSuggestions =
    hasFocus &&
    debouncedQuery.trim().length >= 2 &&
    !loading &&
    (
      suggestionsQuery.isLoading ||
      suggestionsQuery.isFetching ||
      (suggestionsQuery.data?.length ?? 0) > 0
    );
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
  const favoriteIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.puuid)),
    [favorites]
  );

  const handleSearch = async () => {
    if (!isValid || loading) return;

    const [gameName, tagLine] = parts;
    setLoading(true);
    setMessage("Searching...");

    try {
      const result = await searchSummoner(
        gameName.trim(),
        tagLine.trim(),
        region
      );
      const destination = buildSummonerProfilePath({
        puuid: result.puuid,
        region: result.region,
        gameName: result.game_name ?? gameName.trim(),
        tagLine: result.tag_line ?? tagLine.trim(),
      });

      if (result.status === "ready") {
        router.push(destination);
        return;
      }

      // onboarding — poll until done
      setMessage("Fetching summoner data...");
      const interval = setInterval(async () => {
        try {
          const status = await getTaskStatus(result.task_id!);
          setMessage(status.message ?? "Ingesting match history...");

          if (status.status === "SUCCESS") {
            clearInterval(interval);
            router.push(destination);
          }
          if (status.status === "FAILURE") {
            clearInterval(interval);
            setMessage("Something went wrong. Please try again.");
            setLoading(false);
          }
        } catch {
          clearInterval(interval);
          setMessage("Lost connection. Please try again.");
          setLoading(false);
        }
      }, 2000);
    } catch {
      setMessage("Failed to reach the API. Is it running?");
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: Awaited<ReturnType<typeof getSummonerSuggestions>>[number]) => {
    setQuery(`${suggestion.game_name}#${suggestion.tag_line}`);
    setHasFocus(false);
    router.push(
      buildSummonerProfilePath({
        puuid: suggestion.puuid,
        region: suggestion.region ?? undefined,
        gameName: suggestion.game_name,
        tagLine: suggestion.tag_line,
      })
    );
  };

  const handleFavoriteToggle = (
    event: MouseEvent<HTMLButtonElement>,
    summoner: FavoriteSummonerIdentity
  ) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavoriteSummoner(summoner);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
      {/* Logo + title */}
      <div className="flex flex-col items-center gap-3">
        <Image
          src="/farsight.png"
          alt="Farsight"
          width={72}
          height={72}
          className="rounded-xl"
          priority
        />
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Farsight
        </h1>
        <p className="text-dim text-sm">
          League of Legends advanced analytics
        </p>
      </div>

      {/* Search box */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="w-full bg-surface2 border border-primary/20 rounded-lg px-4 py-3 text-white placeholder:text-dim focus:outline-none focus:border-primary/50 transition-colors text-sm"
              placeholder="Name#TAG"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setHasFocus(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  setHasFocus(false);
                }, 120);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              disabled={loading}
              autoFocus
            />
            {showSuggestions ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-lg border border-primary/20 bg-surface shadow-2xl">
                {suggestionsQuery.isLoading || suggestionsQuery.isFetching ? (
                  <div className="px-4 py-3 text-sm text-dim">Searching tracked summoners...</div>
                ) : (
                  suggestionsQuery.data?.map((suggestion) => (
                    <div
                      key={suggestion.puuid}
                      className="flex items-center justify-between gap-3 border-b border-primary/10 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface2"
                    >
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSuggestionClick(suggestion);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm text-white">
                          {suggestion.game_name}#{suggestion.tag_line}
                        </div>
                        <div className="truncate text-xs font-mono text-dim">
                          {suggestion.region?.toUpperCase() ?? region.toUpperCase()} • level {suggestion.summonerLevel}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-mono text-primary/60">
                          tracked
                        </div>
                        <button
                          type="button"
                          aria-label={favoriteIds.has(suggestion.puuid) ? "Remove favorite" : "Add favorite"}
                          aria-pressed={favoriteIds.has(suggestion.puuid)}
                          onMouseDown={(event) => {
                            handleFavoriteToggle(event, {
                              puuid: suggestion.puuid,
                              region: suggestion.region ?? region,
                              gameName: suggestion.game_name,
                              tagLine: suggestion.tag_line,
                              profileIconId: suggestion.profileIconId,
                              summonerLevel: suggestion.summonerLevel,
                            });
                          }}
                          className={`rounded-md border p-2 transition-colors ${
                            favoriteIds.has(suggestion.puuid)
                              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                              : "border-primary/15 bg-surface2 text-dim hover:text-white"
                          }`}
                        >
                          <Star className="h-3.5 w-3.5" fill={favoriteIds.has(suggestion.puuid) ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <RegionSelect value={region} onChange={setRegion} />
          <button
            className="bg-primary hover:bg-primary-dim text-white font-semibold px-5 py-3 rounded-lg disabled:opacity-40 transition-colors text-sm"
            onClick={handleSearch}
            disabled={!isValid || loading}
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        {/* Hint or status message */}
        <div className="h-5 flex items-center justify-center">
          {message ? (
            <div className="flex items-center gap-2">
              {loading && (
                <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
              <p className="text-primary text-xs">{message}</p>
            </div>
          ) : (
            <p className="text-dim text-xs">
              Enter your Riot ID in{" "}
              <span className="text-white font-mono">Name#TAG</span> format
            </p>
          )}
        </div>

        {favorites.length > 0 ? (
          <div className="rounded-2xl border border-primary/15 bg-surface/70 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-[0.24em] text-dim">
                Pinned Summoners
              </div>
              <div className="text-xs text-primary/60">
                Quick launch from home
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {favorites.map((favorite) => (
                <div
                  key={favorite.puuid}
                  className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-surface2/65 px-3 py-3 transition-colors hover:border-primary/30 hover:bg-surface2"
                >
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        buildSummonerProfilePath({
                          puuid: favorite.puuid,
                          region: favorite.region ?? undefined,
                          gameName: favorite.gameName,
                          tagLine: favorite.tagLine,
                        })
                      )
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-semibold text-white">
                      {favorite.gameName}#{favorite.tagLine}
                    </div>
                    <div className="truncate text-xs font-mono uppercase tracking-wide text-dim">
                      {favorite.region?.toUpperCase() ?? "Unknown"}{favorite.summonerLevel ? ` • level ${favorite.summonerLevel}` : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove favorite"
                    onClick={(event) => handleFavoriteToggle(event, favorite)}
                    className="rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-amber-300 transition-colors hover:bg-amber-400/15"
                  >
                    <Star className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
