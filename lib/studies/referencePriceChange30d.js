// GENERATED - do not edit by hand.
// Small aggregate for /market-data/pokemon-reference-price-changes.
// Emitted from the completed study's saved analysis (analysis-final.json)
// plus the saved provider responses, by tools/jtcg-emit-artifact.
//
// Deliberately contains ONLY aggregate figures. No raw provider response
// bodies, no per-request metadata, no quota counters and no credentials
// are present here, so none of that can reach a public asset or a client
// bundle. The study is a FIXED, DATED SNAPSHOT: these numbers describe
// 2026-08-12 to 2026-09-11 and are never refreshed at runtime.

export const STUDY = Object.freeze({
  "version": "2026-09-12.1",
  "id": "reference-price-change-30d-2026-09",
  "source": {
    "provider": "JustTCG",
    "kind": "reference-price observations, not completed sales"
  },
  "currency": {
    "current": "USD, documented by the provider for the current price field",
    "historical": "inferred USD - the provider does not state a currency for historical points and returns no currency field"
  },
  "window": {
    "earlyTarget": "2026-08-12",
    "lateTarget": "2026-09-11",
    "toleranceDays": 3,
    "endpointDates": {
      "early": [
        {
          "date": "2026-08-12",
          "variants": 1147
        }
      ],
      "late": [
        {
          "date": "2026-09-08",
          "variants": 1
        },
        {
          "date": "2026-09-10",
          "variants": 1
        },
        {
          "date": "2026-09-11",
          "variants": 1145
        }
      ]
    }
  },
  "sampling": {
    "seed": 20260912,
    "pilotRetained": 24,
    "seededAdded": 126,
    "addedPerGroup": 42,
    "method": "24 deliberately selected pilot records retained, then 126 further records chosen by seeded deterministic shuffle (42 per group)"
  },
  "coverage": {
    "products": 150,
    "responded": 150,
    "totalVariantRecords": 1290,
    "eligibleVariants": 1147,
    "excludedVariants": 143,
    "exclusions": {
      "endpoint_outside_tolerance": 26,
      "empty_history": 115,
      "single_point": 2
    }
  },
  "overall": {
    "products": 150,
    "median": 1.7,
    "up": 59.3,
    "down": 4.7,
    "flat": 36
  },
  "byEra": [
    {
      "group": "modern",
      "label": "Modern (SWSH / SV / ME)",
      "products": 50,
      "median": 0.9,
      "up": 50,
      "down": 6,
      "flat": 44
    },
    {
      "group": "ex-era",
      "label": "EX-era",
      "products": 50,
      "median": 2.1,
      "up": 68,
      "down": 0,
      "flat": 32
    },
    {
      "group": "wotc",
      "label": "WOTC-era",
      "products": 50,
      "median": 1.7,
      "up": 60,
      "down": 8,
      "flat": 32
    }
  ],
  "pooled": {
    "variants": 1147,
    "median": 1.4,
    "up": 51.3,
    "down": 22.1,
    "flat": 26.7
  },
  "sensitivity": {
    "flaggedVariants": 37,
    "excludingFlagged": {
      "products": 150,
      "median": 1.7,
      "up": 58,
      "down": 6,
      "flat": 36
    },
    "excludingPilot": {
      "products": 126,
      "median": 1.8,
      "up": 59.5,
      "down": 4,
      "flat": 36.5
    },
    "pilotOnly": {
      "products": 24,
      "median": 1.4,
      "up": 58.3,
      "down": 8.3,
      "flat": 33.3
    }
  },
  "eraComposition": [
    {
      "group": "modern",
      "label": "Modern (SWSH / SV / ME)",
      "sets": 28,
      "products": 50,
      "setNames": [
        "ME01: Mega Evolution",
        "ME03: Perfect Order",
        "ME: Mega Evolution Promo",
        "SV01: Scarlet & Violet Base Set",
        "SV02: Paldea Evolved",
        "SV03: Obsidian Flames",
        "SV04: Paradox Rift",
        "SV06: Twilight Masquerade",
        "SV09: Journey Together",
        "SV: Black Bolt",
        "SV: Paldean Fates",
        "SV: Prismatic Evolutions",
        "SV: Scarlet & Violet 151",
        "SV: Scarlet & Violet Promo Cards",
        "SV: Shrouded Fable",
        "SV: White Flare",
        "SWSH03: Darkness Ablaze",
        "SWSH04: Vivid Voltage",
        "SWSH05: Battle Styles",
        "SWSH06: Chilling Reign",
        "SWSH07: Evolving Skies",
        "SWSH10: Astral Radiance",
        "SWSH11: Lost Origin",
        "SWSH11: Lost Origin Trainer Gallery",
        "SWSH12: Silver Tempest",
        "SWSH: Crown Zenith",
        "SWSH: Crown Zenith: Galarian Gallery",
        "SWSH: Sword & Shield Promo Cards"
      ],
      "promoProducts": 6,
      "promoSets": [
        {
          "group": "modern",
          "set": "SWSH: Sword & Shield Promo Cards",
          "n": 3
        },
        {
          "group": "modern",
          "set": "ME: Mega Evolution Promo",
          "n": 1
        },
        {
          "group": "modern",
          "set": "SV: Scarlet & Violet Promo Cards",
          "n": 2
        }
      ],
      "galleryProducts": 2,
      "gallerySets": [
        {
          "set": "SWSH: Crown Zenith: Galarian Gallery",
          "products": 1
        },
        {
          "set": "SWSH11: Lost Origin Trainer Gallery",
          "products": 1
        }
      ]
    },
    {
      "group": "ex-era",
      "label": "EX-era",
      "sets": 16,
      "products": 50,
      "setNames": [
        "EX Battle Stadium",
        "EX Crystal Guardians",
        "EX Delta Species",
        "EX Deoxys",
        "EX Dragon",
        "EX Dragon Frontiers",
        "EX Emerald",
        "EX FireRed & LeafGreen",
        "EX Hidden Legends",
        "EX Holon Phantoms",
        "EX Legend Maker",
        "EX Power Keepers",
        "EX Ruby and Sapphire",
        "EX Team Magma vs Team Aqua",
        "EX Team Rocket Returns",
        "EX Unseen Forces"
      ],
      "promoProducts": 0,
      "promoSets": [],
      "galleryProducts": 0,
      "gallerySets": []
    },
    {
      "group": "wotc",
      "label": "WOTC-era",
      "sets": 11,
      "products": 50,
      "setNames": [
        "Base Set",
        "Base Set (Shadowless)",
        "Fossil",
        "Gym Challenge",
        "Gym Heroes",
        "Jungle",
        "Neo Destiny",
        "Neo Discovery",
        "Neo Genesis",
        "Neo Revelation",
        "Team Rocket"
      ],
      "promoProducts": 0,
      "promoSets": [],
      "galleryProducts": 0,
      "gallerySets": []
    }
  ],
  "identity": {
    "conflicts": 0,
    "crossSetPreserved": 15
  },
  "example": {
    "id": "45153",
    "name": "Cubone",
    "set": "Jungle",
    "median": 1.7,
    "variants": 10,
    "fallers": 5,
    "rows": [
      {
        "printing": "Unlimited",
        "condition": "Damaged",
        "from": 0.25,
        "to": 0.31,
        "changePct": 24
      },
      {
        "printing": "Unlimited",
        "condition": "Heavily Played",
        "from": 0.41,
        "to": 0.39,
        "changePct": -4.9
      },
      {
        "printing": "Unlimited",
        "condition": "Moderately Played",
        "from": 0.64,
        "to": 0.57,
        "changePct": -10.9
      },
      {
        "printing": "Unlimited",
        "condition": "Lightly Played",
        "from": 0.72,
        "to": 0.8,
        "changePct": 11.1
      },
      {
        "printing": "Unlimited",
        "condition": "Near Mint",
        "from": 2.23,
        "to": 1.98,
        "changePct": -11.2
      },
      {
        "printing": "1st Edition",
        "condition": "Damaged",
        "from": 2.57,
        "to": 2.21,
        "changePct": -14
      },
      {
        "printing": "1st Edition",
        "condition": "Moderately Played",
        "from": 2.08,
        "to": 2.66,
        "changePct": 27.9
      },
      {
        "printing": "1st Edition",
        "condition": "Heavily Played",
        "from": 3.4,
        "to": 3.02,
        "changePct": -11.2
      },
      {
        "printing": "1st Edition",
        "condition": "Lightly Played",
        "from": 4.79,
        "to": 5.31,
        "changePct": 10.9
      },
      {
        "printing": "1st Edition",
        "condition": "Near Mint",
        "from": 10.28,
        "to": 11.13,
        "changePct": 8.3
      }
    ]
  },
  "leadCards": [
    {
      "id": "42389",
      "name": "Charmander",
      "set": "Base Set",
      "group": "wotc"
    },
    {
      "id": "84932",
      "name": "Dratini",
      "set": "EX Dragon",
      "group": "ex-era"
    },
    {
      "id": "89489",
      "name": "Squirtle",
      "set": "EX FireRed & LeafGreen",
      "group": "ex-era"
    },
    {
      "id": "610522",
      "name": "Eevee ex",
      "set": "SV: Prismatic Evolutions",
      "group": "modern"
    }
  ]
});
