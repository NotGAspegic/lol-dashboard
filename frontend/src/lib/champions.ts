export interface ChampionData {
  id: number;
  name: string;
  key: string; // e.g. "Yasuo" — used in image URLs
}

interface MerakiChampion {
  id: number;
  name: string;
  key: string;
}

// fetch champion map: { [id: number]: ChampionData }
async function fetchChampionMap(): Promise<Record<number, ChampionData>> {
  const patch = await fetchLatestPatch();

  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`,
    { next: { revalidate: 86400 } }
  );

  if (!res.ok) throw new Error("Failed to fetch champion data");

  const raw = await res.json();
  const champions = raw.data as Record<string, { key: string; name: string }>;

  const map: Record<number, ChampionData> = {};
  for (const [keyName, champion] of Object.entries(champions)) {
    const numericId = parseInt(champion.key, 10);
    map[numericId] = {
      id: numericId,
      name: champion.name,
      key: keyName, // e.g. "Yasuo" — used in image URLs
    };
  }
  return map;
}

// fetch latest patch version
async function fetchLatestPatch(): Promise<string> {
  const res = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json",
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return "14.10.1"; // fallback
  const versions: string[] = await res.json();
  return versions[0];
}

// module-level cache so we only fetch once per server lifecycle
let championMapCache: Record<number, ChampionData> | null = null;
let patchCache: string | null = null;

export async function getChampionMap(): Promise<Record<number, ChampionData>> {
  if (!championMapCache) {
    championMapCache = await fetchChampionMap();
  }
  return championMapCache;
}

export async function getLatestPatch(): Promise<string> {
  if (!patchCache) {
    patchCache = await fetchLatestPatch();
  }
  return patchCache;
}

export async function getChampionById(
  id: number
): Promise<ChampionData | null> {
  const map = await getChampionMap();
  return map[id] ?? null;
}

export async function getChampionImageUrl(id: number): Promise<string> {
  const [champion, patch] = await Promise.all([
    getChampionById(id),
    getLatestPatch(),
  ]);

  if (!champion) {
    return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/Aatrox.png`;
  }

  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${champion.key}.png`;
}