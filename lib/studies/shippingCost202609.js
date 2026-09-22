// GENERATED - do not edit by hand.
// Source: scripts/studies/buildShippingCostStudy.mjs (read-only over
// retained `deals` records). Frozen so the published figures cannot
// drift from the analysis. Re-running produces a NEW study with a new
// cutoff; it does not update this one in place.
export const STUDY = {
  "generatedAt": "2026-09-22T11:33:22.525Z",
  "observationCutoff": "2026-09-22T11:33:22.525Z",
  "methodRevision": 2,
  "minimumNForCharacterisation": 20,
  "population": {
    "activeRows": 1394,
    "fixedPrice": 1236,
    "afterDeduplication": 1104,
    "byShippingState": {
      "unconfirmed": 670,
      "confirmed": 434
    },
    "usable": 434,
    "excludedNotConfirmed": 670,
    "excludedShareOfDeduplicatedPct": 60.7,
    "sampleGrowthIfIncludedPct": 154.4
  },
  "marketplaces": [
    {
      "marketplace": "EBAY_GB",
      "label": "GB",
      "currency": "GBP",
      "n": 193,
      "medianItem": 26.93,
      "medianShipping": 7.11,
      "medianShippingPctOfItem": 25,
      "shareAtLeast20Pct": 57,
      "characterised": true
    },
    {
      "marketplace": "EBAY_US",
      "label": "US",
      "currency": "USD",
      "n": 92,
      "medianItem": 47.75,
      "medianShipping": 5.22,
      "medianShippingPctOfItem": 9.5,
      "shareAtLeast20Pct": 16,
      "characterised": true
    },
    {
      "marketplace": "EBAY_AU",
      "label": "AU",
      "currency": "AUD",
      "n": 70,
      "medianItem": 46.66,
      "medianShipping": 24.34,
      "medianShippingPctOfItem": 41.9,
      "shareAtLeast20Pct": 64,
      "characterised": true
    },
    {
      "marketplace": "EBAY_DE",
      "label": "DE",
      "currency": "EUR",
      "n": 48,
      "medianItem": 22.5,
      "medianShipping": 15,
      "medianShippingPctOfItem": 30.5,
      "shareAtLeast20Pct": 71,
      "characterised": true
    },
    {
      "marketplace": "EBAY_CA",
      "label": "CA",
      "currency": "CAD",
      "n": 25,
      "medianItem": 69.94,
      "medianShipping": 20.59,
      "medianShippingPctOfItem": 30.1,
      "shareAtLeast20Pct": 60,
      "characterised": true
    },
    {
      "marketplace": "EBAY_IT",
      "label": "IT",
      "currency": "EUR",
      "n": 6,
      "medianItem": 27.23,
      "medianShipping": 8.73,
      "medianShippingPctOfItem": 23.7,
      "shareAtLeast20Pct": 67,
      "characterised": false
    }
  ],
  "comparableGroups": {
    "eligibleRows": 434,
    "droppedForMissingIdentity": 0,
    "groups": 50,
    "rankFlips": 7,
    "rankFlipPct": 14,
    "groupsWithItemPriceTie": 7,
    "tiesNotCountedAsReversals": 3,
    "identityFields": [
      "card_tcgplayer_id",
      "card_language",
      "marketplace",
      "condition",
      "is_graded",
      "grader",
      "grade",
      "is_local"
    ]
  }
};
