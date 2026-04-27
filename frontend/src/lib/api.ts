import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + "/api/v1",
  headers: { "Content-Type": "application/json" },
});

export interface Summoner {
  puuid: string;
  id: string | null;
  profileIconId: number;
  summonerLevel: number;
  region?: string;
}

export async function getSummoner(puuid: string): Promise<Summoner> {
  const res = await api.get<Summoner>(`/summoners/${puuid}`);
  return res.data;
}

export interface KDATrendPoint {
  game_index: number;
  kda: number;
  rolling_avg: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  champion_id: number;
  game_start: number;
}

export async function getKdaTrend(
  puuid: string,
  limit = 20
): Promise<KDATrendPoint[]> {
  const res = await api.get<KDATrendPoint[]>(
    `/summoners/${puuid}/kda-trend`,
    { params: { limit } }
  );
  return res.data;
}

export interface ScatterPoint {
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  damage_share: number;
  champion_id: number;
  win: boolean;
  game_duration: number;
}

export async function getPerformanceScatter(
  puuid: string
): Promise<ScatterPoint[]> {
  const res = await api.get<ScatterPoint[]>(
    `/summoners/${puuid}/performance-scatter`
  );
  return res.data;
}

export interface GoldCurvePoint {
  minute: number;
  avg_gold: number;
}

export async function getGoldCurves(
  puuid: string,
  championId?: number
): Promise<GoldCurvePoint[]> {
  const params: Record<string, string | number> = {};
  if (championId !== undefined) params.champion_id = championId;
  const res = await api.get<GoldCurvePoint[]>(
    `/summoners/${puuid}/gold-curves`,
    { params }
  );
  return res.data;
}

export interface VisionImpactPoint {
  quartile: number;
  label: string;
  avg_vision: number;
  win_rate: number;
  game_count: number;
}

export async function getVisionImpact(puuid: string): Promise<VisionImpactPoint[]> {
  const res = await api.get<VisionImpactPoint[]>(
    `/summoners/${puuid}/vision-impact`
  );
  return res.data;
}

export interface DamageEfficiencyGame {
  gameId: number;
  win: boolean;
  championId: number;
  damage_share: number;
  gold_share: number;
  bucket: string;
}

export interface DamageEfficiency {
  games: DamageEfficiencyGame[];
  bucket_counts: Record<string, number>;
  median_damage_share: number;
  efficiency_score: number;
  total_games: number;
}

export async function getDamageEfficiency(
  puuid: string
): Promise<DamageEfficiency> {
  const res = await api.get<DamageEfficiency>(
    `/summoners/${puuid}/damage-efficiency`
  );
  return res.data;
}

export interface SummonerSearchResponse {
  status: "onboarding" | "ready";
  task_id?: string;
  task_type?: string;
  puuid: string;
  game_name?: string;
  tag_line?: string;
  region: string;
  profileIconId?: number;
  summonerLevel?: number;
}

export async function searchSummoner(
  gameName: string,
  tagLine: string,
  region: string
): Promise<SummonerSearchResponse> {
  const res = await api.post<SummonerSearchResponse>("/summoners/search", {
    game_name: gameName,
    tag_line: tagLine,
    region,
  });
  return res.data;
}

export async function getTaskStatus(taskId: string) {
  const res = await api.get(`/tasks/${taskId}/status`);
  return res.data;
}

export interface Match {
  gameId: number;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  individualPosition: string;
  gameDuration: number;
  gameStartTimestamp: number;
  cs_per_min: number;
}

export interface ChampionStat {
  championId: number;
  games: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
  winrate: number;
}

export interface StatsOverview {
  total_games: number;
  winrate: number;
  avg_kda: number;
  most_played_champion_id: number | null;
  win_streak: number;
}

export async function getMatches(
  puuid: string,
  limit = 20,
  offset = 0
): Promise<Match[]> {
  const res = await api.get<Match[]>(`/summoners/${puuid}/matches`, {
    params: { limit, offset },
  });
  return res.data;
}

export async function getChampionStats(puuid: string): Promise<ChampionStat[]> {
  const res = await api.get<ChampionStat[]>(`/summoners/${puuid}/champion-stats`);
  return res.data;
}

export async function getStatsOverview(puuid: string): Promise<StatsOverview> {
  const res = await api.get<StatsOverview>(`/summoners/${puuid}/stats-overview`);
  return res.data;
}

export interface MatchupEntry {
  enemy_champion_id: number;
  games: number;
  wins: number;
  win_rate: number;
  avg_kda_in_matchup: number;
}

export async function getMatchups(puuid: string): Promise<MatchupEntry[]> {
  const res = await api.get<MatchupEntry[]>(`/summoners/${puuid}/matchups`);
  return res.data;
}

export interface PlaystyleScores {
  aggression: number;
  farming: number;
  vision: number;
  objective_control: number;
  teamfight: number;
  consistency: number;
}

export async function getPlaystyle(puuid: string): Promise<PlaystyleScores> {
  const res = await api.get<PlaystyleScores>(`/summoners/${puuid}/playstyle`);
  return res.data;
}

export interface MatchParticipant {
  puuid: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  individualPosition: string;
  win: boolean;
  cs_per_min: number;
  damage_share: number;
  kill_participation: number;
}

export interface MatchDetail {
  blue_team: MatchParticipant[];
  red_team: MatchParticipant[];
  match: {
    duration: number;
    patch: string | null;
    winning_team: number | null;
  };
}

export async function getMatchDetail(gameId: number): Promise<MatchDetail> {
  const res = await api.get<MatchDetail>(`/matches/${gameId}`);
  return res.data;
}

export interface GoldDiffPoint {
  minute: number;
  blue_gold: number;
  red_gold: number;
  gold_diff: number;
}

export async function getMatchGoldDiff(gameId: number): Promise<GoldDiffPoint[]> {
  const res = await api.get<GoldDiffPoint[]>(`/matches/${gameId}/gold-diff`);
  return res.data;
}

export default api;
