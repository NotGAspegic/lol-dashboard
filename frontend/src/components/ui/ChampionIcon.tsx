import Image from "next/image";
import { getChampionById, getLatestPatch } from "@/lib/champions";

interface ChampionIconProps {
  championId: number;
  size?: number;
}

export default async function ChampionIcon({
  championId,
  size = 40,
}: ChampionIconProps) {
  const [champion, patch] = await Promise.all([
    getChampionById(championId),
    getLatestPatch(),
  ]);

  const name = champion?.name ?? "Unknown";
  const key = champion?.key ?? "Aatrox";
  const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${key}.png`;

  return (
    <div
      title={name}
      style={{ width: size, height: size, flexShrink: 0 }}
      className="relative rounded-md overflow-hidden border border-primary/40"
    >
      <Image
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        loading="eager"
        className="object-cover"
        unoptimized
      />
    </div>
  );
}