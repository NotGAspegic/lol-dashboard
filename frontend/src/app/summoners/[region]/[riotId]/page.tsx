import ProfilePageContent from "@/components/profile/ProfilePageContent";
import UnknownSummonerState from "@/components/profile/UnknownSummonerState";
import { getStatsOverview, getSummonerByRiotSlug } from "@/lib/api";


interface FriendlyProfilePageProps {
  params: Promise<{ region: string; riotId: string }>;
}

export default async function FriendlyProfilePage({ params }: FriendlyProfilePageProps) {
  const { region, riotId } = await params;

  const summoner = await getSummonerByRiotSlug(region, riotId).catch(() => null);
  if (!summoner) {
    return <UnknownSummonerState region={region} riotIdSlug={riotId} />;
  }

  const stats = await getStatsOverview(summoner.puuid).catch(() => ({
    total_games: 0,
    winrate: 0,
    avg_kda: 0,
    win_streak: 0,
    most_played_champion_id: null,
  }));

  return <ProfilePageContent puuid={summoner.puuid} summoner={summoner} stats={stats} />;
}
