import re, urllib.request, sys
sys.stdout.reconfigure(encoding="utf-8")
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent":"Mozilla/5.0"}), timeout=45).read().decode("utf-8","replace")
BAD = ["Altered Pin Holes", "Dark Gengar 12/105 holo ENG Neo Destiny POOR", "INKED Kyogre", "German Pokémon Platinum",
       "ITALIAN WOTC", "Korean Blastoise", "Espeon GX Full Art Secret Rare Holo 152/149"]
for label, u in [
    ("home / Top Deals", "https://pokemondealfinder.com/"),
    ("Top USA Deals", "https://pokemondealfinder.com/?country=EBAY_US"),
    ("/deals grid", "https://pokemondealfinder.com/deals"),
    ("/deals?country=EBAY_US", "https://pokemondealfinder.com/deals?country=EBAY_US"),
    ("/deals/vintage", "https://pokemondealfinder.com/deals/vintage"),
]:
    try: h = get(u)
    except Exception as e:
        print(f"{label}: ERR {e}"); continue
    hits = [b for b in BAD if b in h]
    n = h.count('data-deal') + len(re.findall(r'/deals/\d+', h))
    print(f"{label:26} disqualified-title hits: {hits if hits else 'NONE ✓'}  (~{n} deal refs)")
