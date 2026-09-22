// GENERATED - do not edit by hand.
// Source: scripts/studies/buildShippingCostStudy.mjs, computed OFFLINE
// from the frozen snapshot named in `reproducibility` below. Re-running
// step 2 against that snapshot reproduces this file byte for byte; the
// snapshot itself is private project evidence and is not published.
export const STUDY = {
  "generatedAt": "2026-09-22T12:17:36.259Z",
  "observationCutoff": "2026-09-22T12:17:36.259Z",
  "methodRevision": 3,
  "reproducibility": {
    "inputsFrozenBeforeCalculation": true,
    "inputCount": 1390,
    "inputDigest": "647777d6f6f3a4f7994da0abf2eed91d3cbbae010827db5b159cf0fdca098f55",
    "digestAlgorithm": "sha256",
    "computedOffline": true
  },
  "minimumNForCharacterisation": 20,
  "population": {
    "activeRows": 1390,
    "fixedPrice": 1231,
    "afterDeduplication": 1100,
    "byShippingState": {
      "unconfirmed": 671,
      "confirmed": 429
    },
    "usable": 429,
    "excludedNotConfirmed": 671,
    "excludedShareOfDeduplicatedPct": 61,
    "sampleGrowthIfIncludedPct": 156.4
  },
  "marketplaces": [
    {
      "marketplace": "EBAY_GB",
      "label": "GB",
      "currency": "GBP",
      "n": 194,
      "medianItem": 26.93,
      "medianShipping": 7.12,
      "medianShippingPctOfItem": 25.9,
      "shareAtLeast20Pct": 58,
      "characterised": true
    },
    {
      "marketplace": "EBAY_US",
      "label": "US",
      "currency": "USD",
      "n": 93,
      "medianItem": 50.24,
      "medianShipping": 5.27,
      "medianShippingPctOfItem": 9.5,
      "shareAtLeast20Pct": 16,
      "characterised": true
    },
    {
      "marketplace": "EBAY_AU",
      "label": "AU",
      "currency": "AUD",
      "n": 62,
      "medianItem": 52.13,
      "medianShipping": 23.72,
      "medianShippingPctOfItem": 40,
      "shareAtLeast20Pct": 61,
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
      "n": 26,
      "medianItem": 69.94,
      "medianShipping": 20.3,
      "medianShippingPctOfItem": 26.1,
      "shareAtLeast20Pct": 58,
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
  "printingIdentity": {
    "byResolution": {
      "catalogue_after_exclusion": 48,
      "catalogue_uncontested": 314,
      "unresolved_id_covers_multiple_finishes": 18,
      "evidenced": 24,
      "unresolved_parallel_unevidenced": 1,
      "unresolved_no_catalogue_printing": 23,
      "unresolved_contradicted": 1
    },
    "resolvedListings": 386,
    "unresolvedListings": 43,
    "unresolvedSharePct": 10,
    "productIdsCoveringMultipleFinishes": 5
  },
  "comparableGroups": {
    "eligibleRows": 386,
    "droppedForMissingIdentity": 0,
    "droppedForUnresolvedPrinting": 43,
    "groups": 44,
    "rankFlips": 6,
    "rankFlipPct": 14,
    "groupsWithItemPriceTie": 7,
    "tiesNotCountedAsReversals": 3,
    "identityFields": [
      "card_tcgplayer_id",
      "printing_family",
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
