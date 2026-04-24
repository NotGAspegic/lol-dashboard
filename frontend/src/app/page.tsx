import { searchSummoner } from "@/lib/api";

export default async function Home() {
  const result = await searchSummoner("G2 Caps", "1323", "euw1");
  console.log(result);
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}