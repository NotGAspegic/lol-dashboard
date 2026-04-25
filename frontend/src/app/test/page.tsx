import ChampionIcon from "@/components/ui/ChampionIcon";
import { getChampionById } from "@/lib/champions";

export default async function TestPage() {
  const yasuo = await getChampionById(157);
  const naafiri = await getChampionById(950);

  return (
    <div className="flex flex-col gap-4 p-8">
      <p className="text-white">Champion 157: {yasuo?.name}</p>
      <p className="text-white">Champion 950: {naafiri?.name}</p>
      <div className="flex gap-4">
        <ChampionIcon championId={157} size={60} />
        <ChampionIcon championId={950} size={60} />
      </div>
    </div>
  );
}