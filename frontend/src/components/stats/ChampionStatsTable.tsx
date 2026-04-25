"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChampionStats, ChampionStat } from "@/lib/api";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import Skeleton from "@/components/ui/Skeleton";

type SortKey = "games" | "winrate" | "kda";
type SortDir = "asc" | "desc";

interface ChampionStatsTableProps {
  puuid: string;
}

function WinRateBar({ winrate }: { winrate: number }) {
  const color =
    winrate >= 55
      ? "#4CAF72"
      : winrate >= 45
      ? "#C89B3C"
      : "#E8523C";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${winrate}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>
        {winrate.toFixed(1)}%
      </span>
    </div>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-dim opacity-30 ml-1">↕</span>;
  return (
    <span className="text-primary ml-1">{dir === "desc" ? "↓" : "↑"}</span>
  );
}

export default function ChampionStatsTable({ puuid }: ChampionStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("games");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minGames, setMinGames] = useState(3);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["champion-stats", puuid],
    queryFn: () => getChampionStats(puuid),
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-red-400 text-sm font-mono">
        Failed to load champion stats.
      </p>
    );
  }

  const filtered = data
    .filter((c: ChampionStat) => c.games >= minGames)
    .sort((a: ChampionStat, b: ChampionStat) => {
      const mul = sortDir === "desc" ? -1 : 1;
      return (a[sortKey] - b[sortKey]) * mul;
    })
    .slice(0, 10);

  if (filtered.length === 0) {
    return (
      <p className="text-dim text-sm font-mono">
        No champions with {minGames}+ games yet.
      </p>
    );
  }

  const headerClass =
    "text-left text-xs font-mono uppercase tracking-wider text-dim cursor-pointer hover:text-white transition-colors select-none pb-2";

  return (
    <div className="flex flex-col gap-3">
      {/* Min games filter */}
      <div className="flex items-center gap-3">
        <span className="text-dim text-xs font-mono">Min games:</span>
        {[3, 5, 10].map((n) => (
          <button
            key={n}
            onClick={() => setMinGames(n)}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              minGames === n
                ? "border-primary text-primary bg-primary/10"
                : "border-primary/20 text-dim hover:text-white"
            }`}
          >
            {n}+
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-primary/10">
              <th className={`${headerClass} w-48`}>Champion</th>
              <th
                className={headerClass}
                onClick={() => handleSort("games")}
              >
                Games
                <SortArrow active={sortKey === "games"} dir={sortDir} />
              </th>
              <th
                className={`${headerClass} w-40`}
                onClick={() => handleSort("winrate")}
              >
                Win Rate
                <SortArrow active={sortKey === "winrate"} dir={sortDir} />
              </th>
              <th
                className={headerClass}
                onClick={() => handleSort("kda")}
              >
                KDA
                <SortArrow active={sortKey === "kda"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((champ: ChampionStat) => (
              <tr
                key={champ.championId}
                className="border-b border-primary/5 hover:bg-surface2/50 transition-colors"
              >
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <ChampionIconClient
                      championId={champ.championId}
                      size={32}
                    />
                    <ChampionName championId={champ.championId} />
                  </div>
                </td>
                <td className="py-2 pr-4">
                  <span className="text-white text-sm font-mono">
                    {champ.games}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <WinRateBar winrate={champ.winrate} />
                </td>
                <td className="py-2">
                  <span
                    className={`text-sm font-mono ${
                      champ.kda >= 4
                        ? "text-primary"
                        : champ.kda >= 2
                        ? "text-white"
                        : "text-dim"
                    }`}
                  >
                    {champ.kda.toFixed(2)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// separate mini client component to resolve champion name
function ChampionName({ championId }: { championId: number }) {
  const [name, setName] = useState<string>("...");

  useEffect(() => {
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then(async (versions: string[]) => {
        const patch = versions[0];
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`
        );
        const data = await res.json();
        const champions = data.data as Record<string, { key: string; name: string }>;
        const found = Object.values(champions).find(
          (c) => parseInt(c.key) === championId
        );
        if (found) setName(found.name);
      })
      .catch(() => setName("Unknown"));
  }, [championId]);

  return <span className="text-white text-sm">{name}</span>;
}