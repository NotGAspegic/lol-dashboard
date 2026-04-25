import { notFound } from "next/navigation";
import { getSummoner, getStatsOverview } from "@/lib/api";
import StatsOverviewCards from "@/components/profile/StatsOverviewCards";
import RefreshButton from "@/components/profile/RefreshButton";

interface ProfilePageProps {
  params: Promise<{ puuid: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { puuid } = await params;

  // fetch both in parallel
  const [summoner, stats] = await Promise.allSettled([
    getSummoner(puuid),
    getStatsOverview(puuid),
  ]);

  if (summoner.status === "rejected") {
    notFound();
  }

  const summonerData = summoner.value;
  const statsData =
    stats.status === "fulfilled"
      ? stats.value
      : { total_games: 0, winrate: 0, avg_kda: 0, win_streak: 0, most_played_champion_id: null };

  const shortId = puuid.slice(0, 8).toUpperCase();
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/16.8.1/img/profileicon/${summonerData.profileIconId}.png`;

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Profile icon */}
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profileIconUrl}
              alt="Profile icon"
              width={72}
              height={72}
              className="rounded-xl border-2 border-primary/40"
            />
            <span
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-surface2 border border-primary/30 text-primary text-xs font-mono px-2 py-0.5 rounded-full whitespace-nowrap"
            >
              {summonerData.summonerLevel}
            </span>
          </div>

          {/* Name + region */}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {shortId}
            </h1>
            <span className="text-dim text-xs font-mono">
              {summonerData.region?.toUpperCase() ?? "—"}
            </span>
          </div>
        </div>

        <RefreshButton puuid={puuid} />
      </div>

      {/* Stats overview */}
      <StatsOverviewCards stats={statsData} />

      {/* Placeholder for the rest of the page — Day 7+ */}
      <div className="border border-primary/10 rounded-lg p-8 flex items-center justify-center">
        <p className="text-dim text-sm font-mono">
          // match history coming in Day 7
        </p>
      </div>
    </div>
  );
}