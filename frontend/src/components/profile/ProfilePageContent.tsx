import Image from "next/image";

import TiltBanner from "@/components/ml/TiltBanner";
import TiltPredictionPrefetch from "@/components/ml/TiltPredictionPrefetch";
import Card from "@/components/ui/Card";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import CurrentSummonerTracker from "@/components/profile/CurrentSummonerTracker";
import RankedOverview from "@/components/profile/RankedOverview";
import StatsOverviewCards from "@/components/profile/StatsOverviewCards";
import RefreshButton from "@/components/profile/RefreshButton";
import Tabs from "@/components/profile/Tabs";
import { StatsOverview, Summoner } from "@/lib/api";
import { formatSummonerDisplayName } from "@/lib/summonerRoute";

function profilePulse(stats: StatsOverview): { title: string; body: string; tone: string } {
  if (stats.win_streak >= 3) {
    return {
      title: "Momentum is on your side",
      body: `You're on a ${stats.win_streak}-game streak with ${stats.winrate.toFixed(1)}% tracked win rate.`,
      tone: "text-green-300",
    };
  }

  if (stats.avg_kda >= 4) {
    return {
      title: "High-efficiency recent form",
      body: `Your tracked games are averaging ${stats.avg_kda.toFixed(2)} KDA, which is strong enough to build around.`,
      tone: "text-cyan-300",
    };
  }

  if (stats.total_games >= 60) {
    return {
      title: "Large enough sample to trust trends",
      body: `${stats.total_games} tracked games gives the dashboard enough volume for matchup and playstyle reads.`,
      tone: "text-primary",
    };
  }

  return {
    title: "Profile still warming up",
    body: "A few more tracked matches will make the deeper insights much more representative.",
    tone: "text-amber-300",
  };
}


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
  const pulse = profilePulse(stats);

  return (
    <div className="flex flex-col gap-6">
      <CurrentSummonerTracker
        puuid={puuid}
        region={summoner.region}
        gameName={summoner.game_name}
        tagLine={summoner.tag_line}
      />
      <TiltPredictionPrefetch puuid={puuid} />

      <Card
        className="flex flex-col gap-5"
        style={{
          background: "linear-gradient(135deg, rgba(10,22,40,0.98) 0%, rgba(14,31,57,0.96) 100%)",
          borderColor: "rgba(30,155,232,0.22)",
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <Image
                src={profileIconUrl}
                alt={`${displayName} profile icon`}
                width={80}
                height={80}
                className="rounded-2xl border-2 border-primary/40"
              />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-surface2 px-2 py-0.5 text-xs font-mono text-primary">
                Lv {summoner.summonerLevel}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {displayName}
                </h1>
                <div className="mt-1 text-xs font-mono uppercase tracking-[0.24em] text-dim">
                  {summoner.region?.toUpperCase() ?? "—"} · tracked ranked profile
                </div>
              </div>
              <div className={`text-sm font-semibold ${pulse.tone}`}>
                {pulse.title}
              </div>
              <p className="max-w-2xl text-sm text-dim">{pulse.body}</p>
            </div>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3 lg:items-end">
            <RefreshButton puuid={puuid} />
            <div className="w-full">
              <DataFreshnessBadge puuid={puuid} compact />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-primary/10 bg-surface2/45 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Tracked Games</div>
            <div className="mt-1 text-2xl font-semibold text-white">{stats.total_games}</div>
          </div>
          <div className="rounded-xl border border-primary/10 bg-surface2/45 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Win Rate</div>
            <div className="mt-1 text-2xl font-semibold text-white">{stats.winrate.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-primary/10 bg-surface2/45 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Average KDA</div>
            <div className="mt-1 text-2xl font-semibold text-white">{stats.avg_kda.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-primary/10 bg-surface2/45 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Current Streak</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {stats.win_streak > 0 ? `${stats.win_streak}W` : "Flat"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] xl:items-start">
        <RankedOverview puuid={puuid} />
        <div className="flex flex-col gap-6">
          <StatsOverviewCards stats={stats} />
          <TiltBanner puuid={puuid} />
        </div>
      </div>
      <Tabs puuid={puuid} />
    </div>
  );
}
