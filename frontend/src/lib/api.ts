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

export default api;
