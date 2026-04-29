import Image from "next/image";

import TiltBanner from "@/components/ml/TiltBanner";
import TiltPredictionPrefetch from "@/components/ml/TiltPredictionPrefetch";
import CurrentSummonerTracker from "@/components/profile/CurrentSummonerTracker";
import RankedOverview from "@/components/profile/RankedOverview";
import StatsOverviewCards from "@/components/profile/StatsOverviewCards";
import RefreshButton from "@/components/profile/RefreshButton";
import Tabs from "@/components/profile/Tabs";
import { StatsOverview, Summoner } from "@/lib/api";
import { formatSummonerDisplayName } from "@/lib/summonerRoute";


export default function ProfilePageContent({
  puuid,
  summoner,
  stats,
}: {
  puuid: string;
  summoner: Summoner;
  stats: StatsOverview;
}) {
  const displayName = formatSummonerDisplayName({
    puuid,
    gameName: summoner.game_name,
    tagLine: summoner.tag_line,
  });
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/16.8.1/img/profileicon/${summoner.profileIconId}.png`;

  return (
    <div className="flex flex-col gap-6">
      <CurrentSummonerTracker
        puuid={puuid}
        region={summoner.region}
        gameName={summoner.game_name}
        tagLine={summoner.tag_line}
      />
      <TiltPredictionPrefetch puuid={puuid} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <Image
              src={profileIconUrl}
              alt={`${displayName} profile icon`}
              width={72}
              height={72}
              className="rounded-xl border-2 border-primary/40"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-surface2 px-2 py-0.5 text-xs font-mono text-primary">
              {summoner.summonerLevel}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight text-white">
              {displayName}
            </h1>
            <span className="text-dim text-xs font-mono">
              {summoner.region?.toUpperCase() ?? "—"}
            </span>
          </div>
        </div>
        <RefreshButton puuid={puuid} />
      </div>

      <RankedOverview puuid={puuid} />
      <StatsOverviewCards stats={stats} />
      <TiltBanner puuid={puuid} />
      <Tabs puuid={puuid} />
    </div>
  );
}
