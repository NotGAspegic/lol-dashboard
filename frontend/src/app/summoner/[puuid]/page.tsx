import { notFound, redirect } from "next/navigation";
import { getSummoner, getStatsOverview } from "@/lib/api";
import ProfilePageContent from "@/components/profile/ProfilePageContent";
import { buildSummonerProfilePath } from "@/lib/summonerRoute";

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
  const canonicalPath = buildSummonerProfilePath({
    puuid,
    region: summonerData.region,
    gameName: summonerData.game_name,
    tagLine: summonerData.tag_line,
  });

  if (canonicalPath !== `/summoner/${puuid}`) {
    redirect(canonicalPath);
  }

  return (
    <ProfilePageContent puuid={puuid} summoner={summonerData} stats={statsData} />
  );
}
