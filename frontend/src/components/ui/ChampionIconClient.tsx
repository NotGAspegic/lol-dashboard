"use client";

import { useEffect, useState } from "react";

interface ChampionIconClientProps {
  championId: number;
  size?: number;
}

export default function ChampionIconClient({
  championId,
  size = 40,
}: ChampionIconClientProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    // fetch patch version then build URL
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then(async (versions: string[]) => {
        const patch = versions[0];
        // fetch champion data
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`
        );
        const data = await res.json();
        const champions = data.data as Record<string, { key: string; name: string }>;
        const found = Object.entries(champions).find(
          ([, c]) => parseInt(c.key) === championId
        );
        if (found) {
          const [keyName, champion] = found;
          setName(champion.name);
          setImageUrl(
            `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${keyName}.png`
          );
        }
      })
      .catch(() => {});
  }, [championId]);

  if (!imageUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-md bg-surface2 animate-pulse flex-shrink-0"
      />
    );
  }

  return (
    <div
      title={name}
      style={{ width: size, height: size, flexShrink: 0 }}
      className="rounded-md overflow-hidden border border-primary/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className="object-cover w-full h-full"
      />
    </div>
  );
}