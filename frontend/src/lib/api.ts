import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + "/api/v1",
  headers: { "Content-Type": "application/json" },
});

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

export async function getSummoner(puuid: string) {
  const res = await api.get(`/summoners/${puuid}`);
  return res.data;
}

export default api;