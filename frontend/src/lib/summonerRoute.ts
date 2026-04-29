export function buildRiotIdSlug(gameName: string, tagLine: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "player";

  return `${normalize(gameName)}-${normalize(tagLine)}`;
}

export function formatSummonerRegion(region: string | undefined): string {
  const normalized = (region ?? "").trim().toLowerCase();
  const regionMap: Record<string, string> = {
    br1: "br",
    eun1: "eune",
    euw1: "euw",
    jp1: "jp",
    kr: "kr",
    la1: "lan",
    la2: "las",
    me1: "me",
    na1: "na",
    oc1: "oce",
    ph2: "ph",
    ru: "ru",
    sg2: "sg",
    th2: "th",
    tr1: "tr",
    tw2: "tw",
    vn2: "vn",
  };

  return regionMap[normalized] ?? normalized;
}

export function buildSummonerProfilePath({
  puuid,
  region,
  gameName,
  tagLine,
}: {
  puuid: string;
  region?: string;
  gameName?: string | null;
  tagLine?: string | null;
}): string {
  if (region && gameName && tagLine) {
    return `/summoners/${formatSummonerRegion(region)}/${buildRiotIdSlug(gameName, tagLine)}`;
  }

  return `/summoner/${puuid}`;
}

export function formatSummonerDisplayName({
  puuid,
  gameName,
  tagLine,
}: {
  puuid: string;
  gameName?: string | null;
  tagLine?: string | null;
}): string {
  if (gameName && tagLine) {
    return `${gameName}#${tagLine}`;
  }

  return puuid.slice(0, 8).toUpperCase();
}
