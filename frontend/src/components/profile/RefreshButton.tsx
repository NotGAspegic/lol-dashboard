"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface RefreshButtonProps {
  puuid: string;
}

export default function RefreshButton({ puuid }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/summoners/${puuid}/refresh`,
        { method: "POST" }
      );
      // wait 3s then invalidate all queries for this summoner
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["matches", puuid] });
        queryClient.invalidateQueries({ queryKey: ["champion-stats", puuid] });
        queryClient.invalidateQueries({ queryKey: ["stats-overview", puuid] });
        queryClient.invalidateQueries({ queryKey: ["tilt-prediction", puuid] });
        setLoading(false);
      }, 3000);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      aria-label="Refresh summoner data"
      onClick={handleRefresh}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-sm text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
    >
      {loading ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Refreshing...
        </>
      ) : (
        "↻ Refresh"
      )}
    </button>
  );
}
