"use client";

import { useEffect } from "react";

import { writeCurrentSummoner } from "@/lib/currentSummoner";


export default function CurrentSummonerTracker({
  puuid,
  region,
  gameName,
  tagLine,
}: {
  puuid: string;
  region?: string;
  gameName?: string | null;
  tagLine?: string | null;
}) {
  useEffect(() => {
    try {
      writeCurrentSummoner({
        puuid,
        region,
        gameName,
        tagLine,
      });
    } catch {
      // ignore localStorage availability issues
    }
  }, [puuid, region, gameName, tagLine]);

  return null;
}
