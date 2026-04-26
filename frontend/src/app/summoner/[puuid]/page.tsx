import { notFound } from "next/navigation";
import { getSummoner, getStatsOverview } from "@/lib/api";
import StatsOverviewCards from "@/components/profile/StatsOverviewCards";
import RefreshButton from "@/components/profile/RefreshButton";
import Tabs from "@/components/profile/Tabs";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <img
              src={profileIconUrl}
              alt={`${shortId} profile icon`}
              width={72}
              height={72}
              className="rounded-xl border-2 border-primary/40"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-surface2 border border-primary/30 text-primary text-xs font-mono px-2 py-0.5 rounded-full whitespace-nowrap">
              {summonerData.summonerLevel}
            </span>
          </div>
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

      <Tabs puuid={puuid} />
    </div>
  );
}