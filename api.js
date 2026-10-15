/* Live data for tickers that are not pre-loaded.
   Uses the Financial Modeling Prep "stable" API. Works in two places:
   - in the browser (visitor pastes their own key), and
   - on the server (server.js reads FMP_API_KEY, so visitors need no key).
   NOTE: field names follow FMP's documentation. Check the first few tickers against stockanalysis.com. */
(function (root) {
  "use strict";
  var BASE = (typeof process !== "undefined" && process.env && process.env.FMP_BASE) || "https://financialmodelingprep.com/stable/";
  var M = 1e6;

  function get(path, params, key) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(BASE + path + "?" + q + "&apikey=" + encodeURIComponent(key)).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("The data provider rejected the API key. Check the key and try again.");
      if (r.status === 402 || r.status === 400 || r.status === 404) { var e = new Error("Financial Modeling Prep says \"" + path + "\" is not included in your plan, or the ticker is not covered (check the spelling, e.g. AAPL for Apple). Free plans cover only some US stocks and endpoints."); e.soft = true; throw e; }
      if (r.status === 429) throw new Error("The data provider's rate limit was reached. Wait a minute and try again.");
      if (!r.ok) throw new Error("The data provider returned an error (" + r.status + ").");
      return r.json();
    }).then(function (j) {
      if (j && !Array.isArray(j) && (j["Error Message"] || j.error)) throw new Error(j["Error Message"] || j.error);
      return j;
    });
  }
  function num(x, d) { return typeof x === "number" && isFinite(x) ? x : d; }
  /* the valuation engine (for its industry groups), in the browser or in Node */
  function engine() {
    if (root.IV) return root.IV;
    try { if (typeof require === "function") return require("./engine.js"); } catch (e) {}
    return null;
  }
  function first(a) { return Array.isArray(a) && a.length ? a[0] : null; }
  function ok(a) { return a.filter(function (v) { return isFinite(v) && v > 0; }); }

  /* Pure mapping from FMP responses to the model's input format (unit-tested in Node). */
  function map(t, R, today) {
    var q = first(R.quote), p = first(R.profile), bs = first(R.balance), rat = R.ratios, est = R.estimates;
    var X = 1, fxNote = null;
    var fyArr = (R.incomeFY || []).slice().sort(function (a, b) { return String(a.date) < String(b.date) ? 1 : -1; }); /* newest first */
    var fy = fyArr[0];
    var inc = first(R.incomeTTM), cf = first(R.cashTTM), annualBase = false;
    if (!inc || !cf) { inc = fy; cf = first(R.cashFY); annualBase = true; }
    if (!q || !inc || !bs) throw new Error("No data found for " + t + ". Check the ticker.");
    /* statements in a different currency from the share price (for example ASML reports in EUR) */
    var repCur = String(inc.reportedCurrency || "").toUpperCase(), priceCur = String((p && p.currency) || "USD").toUpperCase();
    if (repCur && priceCur && repCur !== priceCur) {
      if (!(R.fx > 0)) throw new Error(t + " reports in " + repCur + " but its share price is in " + priceCur + ", and the exchange rate could not be loaded, so the values cannot be compared.");
      X = R.fx; fxNote = "Financial statements are reported in " + repCur + " and were converted to " + priceCur + " at " + R.fx.toFixed(4) + " to match the share price.";
    }
    var price = num(q.price);
    var mcap = num(q.marketCap, p && p.marketCap);
    if (!(price > 0) || !(mcap > 0)) throw new Error("The data provider returned no price for " + t + ".");
    var shares = mcap / price / M;
    var pretax = num(inc.incomeBeforeTax), taxExp = num(inc.incomeTaxExpense, 0);
    var tax = pretax > 0 ? Math.min(0.35, Math.max(0, taxExp / pretax)) : 0.21;
    var ocf = X * num(cf && cf.operatingCashFlow, cf && cf.netCashProvidedByOperatingActivities);
    if (!isFinite(ocf)) throw new Error("Cash flow data is missing for " + t + ".");
    var capex = X * Math.abs(num(cf.capitalExpenditure, 0));

    var rows = (rat || []).slice().sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });
    var hist = {
      labels: rows.map(function (x) { return "FY" + String(x.fiscalYear || x.date).slice(0, 4); }),
      pe: rows.map(function (x) { return num(x.priceToEarningsRatio, NaN); }),
      ps: rows.map(function (x) { return num(x.priceToSalesRatio, NaN); }),
      pb: rows.map(function (x) { return num(x.priceToBookRatio, NaN); })
    };
    /* v2.8: price-to-book history is optional. Companies with negative equity (McDonald's, Starbucks, Hilton) have none. */
    if (ok(hist.ps).length < 2) throw new Error("Not enough valuation history for " + t + " (needs at least 2 years of share prices and sales; recent listings often lack this).");
    hist.ps = ok(hist.ps); hist.pb = ok(hist.pb); hist.pe = hist.pe.filter(function (v) { return isFinite(v); });

    var negEq = num(bs.totalStockholdersEquity, 0) < 0;
    var caveats = ["These figures were loaded automatically. The model assumes no one-off investment gains in earnings, and growth settings follow a default rule. Compare the inputs with the company's filings before you rely on the result."];
    (R.extraCaveats || []).forEach(function (c) { caveats.push(c); });
    if (negEq) caveats.push("Shareholders' equity is negative, usually because the company has spent more on buybacks and dividends than it has earned over the years (common at McDonald's, Starbucks and Hilton). Book value means little here, so the price-to-book method is left out and return on equity cannot be measured.");
    if (fxNote) caveats.push(fxNote + " Historical ratios come straight from the data provider, so check them against another source.");
    var ind = String((p && (p.industry || "")) + " " + (p && (p.sector || ""))).toLowerCase();
    var E = engine(), isFinGroup = E && E.classify ? E.classify({ industry: ind }).id === "financial" : false;
    if (isFinGroup) caveats.unshift("This is a bank, insurer or other lender. Their cash flow and debt work differently from other companies, so Plumbline values them with methods built for financial firms (following Aswath Damodaran): dividends, cash returned to shareholders, return on equity and book value. The cash flow and sales-based methods are not used, and the discount rate uses the average beta for its industry, not the stock's own beta.");
    else if (/bank|insurance|reit|real estate|asset management|capital markets|mortgage/.test(ind)) caveats.push("This looks like a financial or real estate company. Cash flow and book value mean different things for these businesses, so the cash flow and price-to-book methods can be misleading. Rely most on the earnings-based methods and check the nine values carefully.");
    if (annualBase) caveats.push("Your data plan does not include trailing 12-month figures, so revenue, profit and cash flow are from the last full fiscal year" + (fy ? " (" + String(fy.date).slice(0, 4) + ")" : "") + ". They may be up to a year out of date.");

    /* analyst estimates, or a clearly labelled fallback built from past growth */
    var lastDate = fy && fy.date;
    var fut = (est || []).filter(function (e) { return e.date > lastDate; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!fy) throw new Error("Income statement history is missing for " + t + ".");
    var R0 = X * num(fy.revenue) / M, E0 = X * num(fy.epsDiluted, fy.eps);
    var rv, ev, cagrRev, cagrEps;
    var estOK = fut.length >= 2 && fut.every(function (e) { return isFinite(num(e.revenueAvg)) && isFinite(num(e.epsAvg)); });
    if (estOK) {
      rv = fut.map(function (e) { return X * num(e.revenueAvg) / M; }); ev = fut.map(function (e) { return X * num(e.epsAvg); });
      var n = Math.min(3, rv.length);
      cagrRev = Math.pow(rv[n - 1] / R0, 1 / n) - 1;
      cagrEps = E0 > 0 && ev[n - 1] > 0 ? Math.pow(ev[n - 1] / E0, 1 / n) - 1 : 0;
    } else {
      /* fallback: past growth (capped) in place of analyst estimates */
      var old = fyArr[Math.min(fyArr.length - 1, 3)], yrs = Math.min(fyArr.length - 1, 3);
      if (yrs < 1 || !(num(old.revenue) > 0)) throw new Error("Analyst estimates are not available for " + t + " on your plan, and there is not enough history to estimate growth.");
      var hg = Math.pow(num(fy.revenue) / num(old.revenue), 1 / yrs) - 1;
      var eo = X * num(old.epsDiluted, old.eps);
      var he = E0 > 0 && eo > 0 ? Math.pow(E0 / eo, 1 / yrs) - 1 : hg;
      cagrRev = Math.max(-0.05, Math.min(0.35, hg)); cagrEps = Math.max(-0.05, Math.min(0.35, he));
      rv = [1, 2, 3].map(function (k) { return R0 * Math.pow(1 + cagrRev, k); });
      ev = [1, 2, 3].map(function (k) { return E0 * Math.pow(1 + cagrEps, k); });
      caveats.push((R.estNote || "Analyst estimates are not included in your data plan.") + " Growth for the next few years is based on the company's own growth over the last " + yrs + " years (revenue " + (cagrRev * 100).toFixed(1) + "% a year, earnings " + (cagrEps * 100).toFixed(1) + "% a year, capped between -5% and 35%). Treat the growth-based methods with extra caution.");
    }
    var R3 = rv.length > 2 ? rv[2] : rv[1] * (1 + cagrRev), E3 = ev.length > 2 ? ev[2] : ev[1] * (1 + cagrEps);

    var revTTM = X * num(inc.revenue) / M, equity = X * num(bs.totalStockholdersEquity, 0) / M;
    var epsTTM = X * num(inc.epsDiluted, inc.eps);
    return {
      ticker: t, name: (p && p.companyName) || t, exchange: (p && (p.exchange || p.exchangeFullName)) || "", sector: (p && p.sector) || "",
      asOf: today, ttmEnd: (inc.date || "latest") + (annualBase ? " (last fiscal year)" : ""), fyEnd: "", live: true,
      price: price, shares: shares,
      dilShares: num(inc.weightedAverageShsOutDil) ? inc.weightedAverageShsOutDil / M : shares,
      cash: X * num(bs.cashAndShortTermInvestments, num(bs.cashAndCashEquivalents, 0)) / M,
      debt: X * num(bs.totalDebt, 0) / M, equity: equity, beta: num(p && p.beta, 1),
      ttm: { rev: revTTM, ni: X * num(inc.netIncome) / M, gain: 0, tax: tax, ocf: ocf / M, capex: capex / M, epsGaap: epsTTM },
      hist: hist,
      cur: { pe: epsTTM > 0 ? price / epsTTM : null, ps: revTTM > 0 ? mcap / M / revTTM : null, pb: equity > 0 ? mcap / M / equity : null },
      est: { rev: [R0, rv[0], rv[1], R3], eps: [E0, ev[0], ev[1], E3], cagrRev: cagrRev, cagrEps: cagrEps, cfG1: null, calWeight: R.calWeight != null ? R.calWeight : (annualBase ? 1 : 0.5) },
      settings: {},
      caveats: caveats
    };
  }

  function soft(p) { return p.catch(function (e) { if (e && e.soft) return null; throw e; }); }

  function load(ticker, key) {
    var t = String(ticker).toUpperCase(), s = { symbol: t };
    return Promise.all([
      get("quote", s, key), get("profile", s, key),
      soft(get("income-statement-ttm", s, key)), soft(get("cash-flow-statement-ttm", s, key)),
      soft(get("balance-sheet-statement", { symbol: t, period: "quarter", limit: 1 }, key)),
      get("balance-sheet-statement", { symbol: t, limit: 1 }, key),
      get("ratios", { symbol: t, limit: 5 }, key),
      get("income-statement", { symbol: t, limit: 5 }, key),
      soft(get("cash-flow-statement", { symbol: t, limit: 1 }, key)),
      soft(get("analyst-estimates", { symbol: t, period: "annual", page: 0, limit: 10 }, key))
    ]).then(function (r) {
      var inc = first(r[2]) || first(r[7]), p = first(r[1]);
      var rep = inc && String(inc.reportedCurrency || "").toUpperCase(), cur = String((p && p.currency) || "USD").toUpperCase();
      var needFx = rep && rep !== cur;
      return (needFx ? soft(get("quote", { symbol: rep + cur }, key)) : Promise.resolve(null)).then(function (fxq) {
        var fx = fxq && first(fxq) ? num(first(fxq).price, null) : null;
        var today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return map(t, { quote: r[0], profile: r[1], incomeTTM: r[2], cashTTM: r[3], balance: (r[4] && r[4].length ? r[4] : r[5]), ratios: r[6], incomeFY: r[7], cashFY: r[8], estimates: r[9], fx: fx }, today);
      });
    }).catch(function (err) {
      /* offer "did you mean" suggestions when the ticker could not be loaded */
      return soft(get("search-symbol", { query: t, limit: 5 }, key)).catch(function () { return null; }).then(function (res) {
        if (res && res.length) err.suggest = res.slice(0, 5).map(function (x) { return { symbol: x.symbol, name: x.name || "" }; });
        throw err;
      });
    });
  }

  var api = { load: load, map: map };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LiveData = api;
})(typeof window !== "undefined" ? window : globalThis);
