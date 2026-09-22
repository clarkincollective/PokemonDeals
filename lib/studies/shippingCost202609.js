// GENERATED - do not edit by hand.
// Source: scripts/studies/buildShippingCostStudy.mjs (read-only over
// retained `deals` records). Frozen so the published figures cannot
// drift from the analysis. Re-running produces a NEW study with a new
// cutoff; it does not update this one in place.
export const STUDY = {
  "generatedAt": "2026-09-22T10:40:54.232Z",
  "observationCutoff": "2026-09-22T10:40:54.232Z",
  "minimumNForCharacterisation": 20,
  "population": {
    "activeRows": 1405,
    "fixedPrice": 1251,
    "afterDeduplication": 1119,
    "byShippingState": {
      "unconfirmed": 679,
      "confirmed": 440
    },
    "usable": 440
  },
  "marketplaces": [
    {
      "marketplace": "EBAY_GB",
      "label": "GB",
      "currency": "GBP",
      "n": 206,
      "medianItem": 26.7,
      "medianShipping": 7.1,
      "medianShippingPctOfItem": 29.8,
      "shareAtLeast20Pct": 58,
      "characterised": true
    },
    {
      "marketplace": "EBAY_US",
      "label": "US",
      "currency": "USD",
      "n": 95,
      "medianItem": 45.25,
      "medianShipping": 5.17,
      "medianShippingPctOfItem": 9.7,
      "shareAtLeast20Pct": 18,
      "characterised": true
    },
    {
      "marketplace": "EBAY_AU",
      "label": "AU",
      "currency": "AUD",
      "n": 57,
      "medianItem": 46.34,
      "medianShipping": 23.76,
      "medianShippingPctOfItem": 45.3,
      "shareAtLeast20Pct": 68,
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
      "n": 28,
      "medianItem": 69.94,
      "medianShipping": 20.9,
      "medianShippingPctOfItem": 30.5,
      "shareAtLeast20Pct": 64,
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
    "groups": 54,
    "rankFlips": 14,
    "rankFlipPct": 26
  }
};
