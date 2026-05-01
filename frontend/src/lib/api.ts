import axios from "axios";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, "");
const apiBaseUrl = normalizedApiUrl.endsWith("/api/v1")
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api/v1`;

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

export interface Summoner {
  puuid: string;
  id: string | null;
  profileIconId: number;
  summonerLevel: number;
  region?: string;
  game_name?: string | null;
  tag_line?: string | null;
  riot_id_slug?: string | null;
}

export async function getSummoner(puuid: string): Promise<Summoner> {
  const res = await api.get<Summoner>(`/summoners/${puuid}`);
  return res.data;
}

export async function getSummonerByRiotSlug(
  region: string,
  riotIdSlug: string
): Promise<Summoner> {
  const res = await api.get<Summoner>(
    `/summoners/by-riot-id/${encodeURIComponent(region)}/${encodeURIComponent(riotIdSlug)}`
  );
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

export interface SummonerSuggestion {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
  region?: string | null;
  game_name: string;
  tag_line: string;
  riot_id_slug: string;
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

export async function getSummonerSuggestions(
  query: string,
  region: string,
  limit = 5
): Promise<SummonerSuggestion[]> {
  const res = await api.get<SummonerSuggestion[]>("/summoners/suggest", {
    params: { query, region, limit },
  });
  return res.data;
}

export interface TaskStatus {
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";
  message?: string;
  result: unknown | null;
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const res = await api.get<TaskStatus>(`/tasks/${taskId}/status`);
  return res.data;
}

export interface RefreshAcceptedResponse {
  status: "accepted";
  task_id: string;
  puuid: string;
}

export async function refreshSummoner(puuid: string): Promise<RefreshAcceptedResponse> {
  const res = await api.post<RefreshAcceptedResponse>(`/summoners/${puuid}/refresh`);
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

export interface TiltPrediction {
  tilt_score: number | null;
  tilt_level: string;
  reasons: string[];
  games_analyzed: number;
}

export interface RankedTrendPoint {
  game_index: number;
  net_wins: number;
  win: boolean;
  game_start_timestamp: number;
}

export interface RankedRecentSummary {
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avg_kda: number;
  net_wins: number;
  trend: RankedTrendPoint[];
}

export interface RankedQueueSummary {
  queue_type: string;
  tier: string;
  rank: string | null;
  league_points: number;
  wins: number;
  losses: number;
  winrate: number;
  hot_streak: boolean;
  veteran: boolean;
  fresh_blood: boolean;
  inactive: boolean;
}

export interface RankHistoryPoint {
  queue_type: string;
  tier: string;
  rank: string | null;
  league_points: number;
  wins: number;
  losses: number;
  captured_at: string;
}

export interface RoleSummary {
  role: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avg_kda: number;
  share: number;
}

export interface RankedSummary {
  solo: RankedQueueSummary | null;
  flex: RankedQueueSummary | null;
  solo_source: string;
  flex_source: string;
  solo_history: RankHistoryPoint[];
  flex_history: RankHistoryPoint[];
  favorite_role: string | null;
  top_roles: RoleSummary[];
  tracked_recent_30d: RankedRecentSummary | null;
  live_rank_status: string;
  live_rank_message: string;
  note: string;
}

export interface IngestionStatus {
  puuid: string;
  total_matches: number;
  last_ingested: string | null;
  pending_tasks: number;
}

export interface DraftPredictionRequest {
  puuid: string;
  ally_champion_ids: number[];
  enemy_champion_ids: number[];
  player_champion_id: number;
}

export interface DraftPrediction {
  win_probability: number;
  confidence: string;
  player_champion_games: number;
  player_champion_winrate: number;
  note: string;
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

export async function getRankedSummary(puuid: string): Promise<RankedSummary> {
  const res = await api.get<RankedSummary>(`/summoners/${puuid}/ranked-summary`);
  return res.data;
}

export async function getIngestionStatus(puuid: string): Promise<IngestionStatus> {
  const res = await api.get<IngestionStatus>(`/summoners/${puuid}/ingestion-status`);
  return res.data;
}

export async function getTiltPrediction(puuid: string): Promise<TiltPrediction> {
  const res = await api.get<TiltPrediction>(`/predict/tilt/${puuid}`);
  return res.data;
}

export async function getDraftPrediction(
  payload: DraftPredictionRequest
): Promise<DraftPrediction> {
  const res = await api.post<DraftPrediction>("/predict/draft", payload);
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

export interface MatchObjectiveSummary {
  dragons: number;
  barons: number;
  heralds: number;
  elders: number;
  turrets: number;
  plates: number;
  first_turret: boolean;
}

export interface MatchDetail {
  blue_team: MatchParticipant[];
  red_team: MatchParticipant[];
  match: {
    duration: number;
    patch: string | null;
    game_start_timestamp: number;
    winning_team: number | null;
  };
  objectives: {
    blue: MatchObjectiveSummary;
    red: MatchObjectiveSummary;
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
