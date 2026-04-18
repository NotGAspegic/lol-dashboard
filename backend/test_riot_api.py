import requests
from config import settings

def main():
    api_key = settings.riot_api_key.get_secret_value()
    platform = settings.riot_platform
    url = f"https://{platform}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5"
    
    headers = {
        "X-Riot-Token": api_key
    }
    
    response = requests.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        entries = data.get("entries", [])
        print(f"Total Entry Count: {len(entries)}")
        
        for i, entry in enumerate(entries[:3]):
            sorted_keys = sorted(entry.keys())
            print(f"Entry {i} sorted keys: {sorted_keys}")
            has_puuid = "puuid" in entry
            has_summonerId = "summonerId" in entry
            print(f"Entry {i} has puuid: {has_puuid}, has summonerId: {has_summonerId}")
    else:
        print("Failed to fetch data from Riot API")
        print(response.text)

if __name__ == "__main__":
    main()
