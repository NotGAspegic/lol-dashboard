"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import Skeleton from "@/components/ui/Skeleton";
import { getMatchups, MatchupEntry } from "@/lib/api";

interface MatchupMatrixProps {
  puuid: string;
}

function useChampionNames(ids: number[]) {
  const [names, setNames] = useState<Record<number, string>>({});
  useEffect(() => {
    if (ids.length === 0) return;
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then(async (versions: string[]) => {
        const patch = versions[0];
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`
        );
        const data = await res.json();
        const champions = data.data as Record<string, { key: string; name: string }>;
        const map: Record<number, string> = {};
        for (const c of Object.values(champions)) {
          const id = parseInt(c.key);
          if (ids.includes(id)) map[id] = c.name;
        }
        setNames(map);
      })
      .catch(() => {});
  }, [ids.join(",")]);
  return names;
}

export default function MatchupMatrix({ puuid }: MatchupMatrixProps) {
  const [sort, setSort] = useState<"worst" | "best">("worst");
  const [minGames, setMinGames] = useState<number>(3);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["matchups", puuid],
    queryFn: () => getMatchups(puuid),
  });

  const filtered = useMemo(() => {
    if (!data) return [] as MatchupEntry[];
    return data.filter((d) => d.games >= minGames);
  }, [data, minGames]);

  const ids = useMemo(() => [...new Set(filtered.map((f) => f.enemy_champion_id))], [filtered]);
  const names = useChampionNames(ids);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => (sort === "worst" ? a.win_rate - b.win_rate : b.win_rate - a.win_rate));
    return copy;
  }, [filtered, sort]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError || !data) {
    return (
      <div className="h-48 flex items-center justify-center rounded-lg border text-sm font-mono" style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}>
        Not enough matchup data.
      </div>
    );
  }

  function tintForRate(rate: number) {
    if (rate < 45) return "rgba(232,82,60,0.08)"; // red tint
    if (rate > 55) return "rgba(76,175,114,0.08)"; // green tint
    return "rgba(58,80,112,0.06)"; // neutral
  }

  function colorForRate(rate: number) {
    if (rate < 45) return "#E8523C";
    if (rate > 55) return "#4CAF72";
    return "#C8C0B0";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort("worst")}
            className={`text-xs font-mono px-2 py-1 rounded border ${sort === "worst" ? "border-primary text-primary bg-primary/6" : "border-primary/20 text-dim"}`}
          >
            Worst First
          </button>
          <button
            onClick={() => setSort("best")}
            className={`text-xs font-mono px-2 py-1 rounded border ${sort === "best" ? "border-primary text-primary bg-primary/6" : "border-primary/20 text-dim"}`}
          >
            Best First
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-dim text-xs font-mono">min games:</span>
          <button
            onClick={() => setMinGames(3)}
            className={`text-xs font-mono px-2 py-1 rounded border ${minGames === 3 ? "border-primary text-primary bg-primary/6" : "border-primary/20 text-dim"}`}
          >
            3
          </button>
          <button
            onClick={() => setMinGames(5)}
            className={`text-xs font-mono px-2 py-1 rounded border ${minGames === 5 ? "border-primary text-primary bg-primary/6" : "border-primary/20 text-dim"}`}
          >
            5
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 15 }}>
        {sorted.map((m) => (
          <div key={m.enemy_champion_id} style={{ width: 80, height: 100 }} className="rounded-lg border flex flex-col items-center p-2" role="button" tabIndex={0}>
            <div style={{ width: 48, height: 48, borderRadius: 6, background: tintForRate(m.win_rate), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChampionIconClient championId={m.enemy_champion_id} size={40} />
            </div>
            <div className="text-xs font-mono mt-2 text-center" style={{ color: "#C8C0B0", lineHeight: "1rem", maxWidth: 76 }}>
              {names[m.enemy_champion_id] ?? `#${m.enemy_champion_id}`}
            </div>
            <div className="mt-1 text-sm font-mono" style={{ color: colorForRate(m.win_rate), fontWeight: 700 }}>
              {m.win_rate.toFixed(0)}%
            </div>
            <div className="text-xs font-mono text-dim">{m.games}g</div>
          </div>
        ))}
      </div>
    </div>
  );
}
