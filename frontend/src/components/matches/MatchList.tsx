"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMatches, Match } from "@/lib/api";
import MatchRow from "./MatchRow";
import Skeleton from "@/components/ui/Skeleton";

interface MatchListProps {
  puuid: string;
}

export default function MatchList({ puuid }: MatchListProps) {
  const [extraMatches, setExtraMatches] = useState<Match[]>([]);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["matches", puuid],
    queryFn: () => getMatches(puuid, 20, 0),
  });

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const newOffset = offset + 20;
    const more = await getMatches(puuid, 20, newOffset);
    setExtraMatches((prev) => [...prev, ...more]);
    setOffset(newOffset);
    setLoadingMore(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-red-400 text-sm font-mono p-4 border border-red-500/20 rounded-lg">
        Failed to load match history.
      </div>
    );
  }

  // combine React Query data (persists across tab switches) with load-more pages
  const allMatches = [...(data ?? []), ...extraMatches];

  if (allMatches.length === 0) {
    return (
      <div className="text-dim text-sm font-mono p-4 border border-primary/10 rounded-lg">
        No matches found. This summoner hasn&apos;t played ranked recently.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {allMatches.map((match) => (
        <MatchRow key={match.gameId} match={match} puuid={puuid} />
      ))}
      <button
        onClick={handleLoadMore}
        disabled={loadingMore}
        className="mt-2 w-full py-2 rounded-lg border border-primary/20 text-dim hover:text-white hover:border-primary/40 transition-colors text-sm font-mono disabled:opacity-40"
      >
        {loadingMore ? "Loading..." : "Load More"}
      </button>
    </div>
  );
}