/* Pre-loaded stocks. Every number comes from the Excel models (stockanalysis.com / S&P Global data, Oct 9 2026).
   $ in millions unless per share.
   `quality` feeds the Business Quality scorecard (stockanalysis.com financial statements, checked Oct 11 2026).
   quickAssets = cash & short-term investments + receivables. prev = balance sheet one year earlier (for average ROE and ROIC). Total debt above already includes leases (as stockanalysis.com reports it).
   Yearly lists run oldest first. */
window.PRESETS = {
  NVDA: {
    ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", asOf: "Oct 9, 2026", ttmEnd: "Jul 26, 2026", fyEnd: "late January",
    price: 229.28, shares: 24147, dilShares: 24398, cash: 56600, debt: 38860, equity: 228984, beta: 2.22,
    ttm: { rev: 302970, ni: 192880, gain: 30552, tax: 0.1605, ocf: 134360, capex: 7354, epsGaap: 7.91 },
    hist: { labels: ["FY2022","FY2023","FY2024","FY2025","FY2026"],
      pe: [58.55, 114.74, 50.65, 47.93, 37.98], ps: [21.22, 18.58, 24.74, 26.77, 21.12], pb: [21.46, 22.68, 35.08, 44.03, 28.99] },
    cur: { pe: 28.99, ps: 18.27, pb: 24.18 },
    est: { rev: [215938, 411650, 411650 * 1.6815, 215938 * Math.pow(1.6112, 3)],
           eps: [4.77, 9.31, 15.91, 4.77 * Math.pow(1.6478, 3)],
           cagrRev: 0.6112, cagrEps: 0.6478, cfG1: null, calWeight: 0.5, analysts: 54, target: 328.72 },
    settings: { g5: 0.20, g10: 0.10 },
    quality: {
      gp: 226241, opInc: 197579, da: 3687, interest: 464,
      curAssets: 197412, curLiab: 43019, inventory: 31575, quickAssets: 62469 + 63059, leases: 509 + 4985, deferredRev: 4616,
      prev: { date: "Jul 27, 2025", equity: 100131, borrowings: 10598 - 301 - 1831, cash: 56791 },
      years: ["FY2022", "FY2023", "FY2024", "FY2025", "FY2026"],
      rev: [26914, 26974, 60922, 130497, 215938],
      eps: [0.39, 0.17, 1.19, 2.94, 4.90],
      fcf: [8132, 3808, 27021, 60853, 96676],
      retained: [16235, 10171, 29817, 68038, 146973]
    },
    caveats: [
      "About $30.6 billion of the last 12 months of net income came from investment gains. The P/E, PEG and net income methods remove these.",
      "Cash conversion has weakened. Operating cash flow in the latest quarter fell to $24.1 billion from $50.3 billion as receivables rose.",
      "The 20-year methods depend mostly on the growth path and the discount rate. The discount rate here is high (about 14%) because the stock's measured beta is 2.2 (1.8 after adjustment towards 1).",
      "The mean-multiple methods assume the stock returns to its own five-year average. Those years were a period of very fast growth."
    ]
  },
  CRM: {
    ticker: "CRM", name: "Salesforce, Inc.", exchange: "NYSE", asOf: "Oct 9, 2026", ttmEnd: "Jul 31, 2026", fyEnd: "January 31",
    price: 229.13, shares: 823, dilShares: 827, cash: 11403, debt: 42376, equity: 38378, beta: 1.26,
    ttm: { rev: 43938, ni: 9662, gain: 4245, tax: 0.2216, ocf: 15750, capex: 596, epsGaap: 10.79, sbc: 3665 },
    hist: { labels: ["FY2022","FY2023","FY2024","FY2025","FY2026"],
      pe: [158.69, 800.28, 65.79, 52.77, 26.68], ps: [8.65, 5.31, 7.81, 8.63, 4.79], pb: [3.94, 2.85, 4.56, 5.35, 3.36] },
    cur: { pe: 21.23, ps: 4.29, pb: 4.91 },
    est: { rev: [41525, 46300, 46300 * 1.0972, 41525 * Math.pow(1.1031, 3)],
           eps: [12.52, 16.75 - 2.53, 16.02, 12.52 * Math.pow(1.1387, 3)],
           cagrRev: 0.1031, cagrEps: 0.1387, cfG1: 0.045, calWeight: 0.5, analysts: null, target: 283.36 },
    settings: { g5: 0.08, g10: 0.05 },
    quality: {
      gp: 33956, opInc: 9455, da: 3444, interest: 1004,
      curAssets: 22083, curLiab: 26336, inventory: 0, quickAssets: 11403 + 6320, leases: 678 + 2410, deferredRev: 18787,
      prev: { date: "Jul 31, 2025", equity: 61328, borrowings: 11809 - 750 - 2623, cash: 15372 },
      years: ["FY2022", "FY2023", "FY2024", "FY2025", "FY2026"],
      rev: [26492, 31352, 34857, 37895, 41525],
      eps: [1.48, 0.21, 4.20, 6.36, 7.80],
      fcf: [5283, 6313, 9498, 12434, 14402],
      retained: [7377, 7585, 11721, 16369, 22221]
    },
    caveats: [
      "About $4.2 billion of the last 12 months of net income came from investment gains. The P/E, PEG and net income methods remove these.",
      "Stock-based pay is about $3.7 billion a year (roughly 24% of free cash flow) and is not deducted from free cash flow.",
      "Debt jumped from $17.7 billion to $42.4 billion to fund a share buyback and acquisitions. This lowers book value per share and the price-to-book value.",
      "Near-term cash flow growth follows company guidance (about 4.5%), which is well below revenue growth because interest and cash taxes have stepped up.",
      "Two of the five historical P/E readings (158.7x and 800.3x) were far above normal, so the model ignores them."
    ]
  }
};
