/* Plumbline SGX loader (v3.11): Singapore-listed stocks from Yahoo Finance.
   v3.13: the same loader also values US-listed foreign companies whose SEC filings use foreign-style (IFRS)
   accounts, such as TSMC and ASML (loadForeign). It works out how many ordinary shares each US share (ADS) holds.
   The SEC has no filings for SGX companies, so financial statements come from Yahoo Finance's free
   fundamentals-timeseries data (annual figures for about 4 years, plus the last 12 months) and prices from the same
   chart data the US loader uses. The result has the same shape as the SEC loader's, so the valuation engine,
   business-quality scorecard and bank methods all work unchanged.
   Works in Node (server.js, Vercel) and in the browser (used only for testing). */
(function (root) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var LiveData = isNode ? require("./api.js") : root.LiveData;
  var Edgar = isNode ? require("./edgar.js") : null;
  var YF = (typeof process !== "undefined" && process.env && process.env.YAHOO_BASE) || "https://query1.finance.yahoo.com/";
  var M = 1e6;

  /* Well-known SGX stocks for search and for the industry label (Yahoo's company profile needs a login).
     code | name | industry. The industry decides the valuation group: banks and insurers use the bank methods,
     REITs are valued as normal companies but skip the scorecard. */
  var LIST = ("D05|DBS Group Holdings|Banks;O39|Oversea-Chinese Banking Corp (OCBC)|Banks;U11|United Overseas Bank (UOB)|Banks;" +
    "Z74|Singapore Telecommunications (Singtel)|Telecom Services;S68|Singapore Exchange (SGX)|Financial Exchanges & Data;" +
    "C38U|CapitaLand Integrated Commercial Trust|REIT - Retail;A17U|CapitaLand Ascendas REIT|REIT - Industrial;9CI|CapitaLand Investment|Real Estate Services;" +
    "C6L|Singapore Airlines|Airlines;BN4|Keppel Ltd|Conglomerates;U96|Sembcorp Industries|Utilities;S63|Singapore Technologies Engineering (ST Engineering)|Aerospace & Defense;" +
    "G13|Genting Singapore|Resorts & Casinos;F34|Wilmar International|Farm Products;Y92|Thai Beverage|Beverages;BS6|Yangzijiang Shipbuilding|Shipbuilding;" +
    "H78|Hongkong Land Holdings|Real Estate Development;J36|Jardine Matheson Holdings|Conglomerates;C09|City Developments|Real Estate Development;U14|UOL Group|Real Estate Development;" +
    "ME8U|Mapletree Industrial Trust|REIT - Industrial;M44U|Mapletree Logistics Trust|REIT - Industrial;N2IU|Mapletree Pan Asia Commercial Trust|REIT - Retail;" +
    "BUOU|Frasers Logistics & Commercial Trust|REIT - Industrial;J69U|Frasers Centrepoint Trust|REIT - Retail;AJBU|Keppel DC REIT|REIT - Specialty;" +
    "V03|Venture Corporation|Electronic Components;5E2|Seatrium|Shipbuilding;S58|SATS Ltd|Airport Services;C52|ComfortDelGro|Transport;" +
    "OV8|Sheng Siong Group|Grocery Stores;AIY|iFAST Corporation|Capital Markets;G07|Great Eastern Holdings|Insurance - Life;BSL|Raffles Medical Group|Medical Care;" +
    "H02|Haw Par Corporation|Drug Manufacturers;S59|SIA Engineering|Aerospace & Defense;CC3|StarHub|Telecom Services;CJLU|NetLink NBN Trust|Telecom Services;" +
    "T82U|Suntec REIT|REIT - Office;K71U|Keppel REIT|REIT - Office;C2PU|Parkway Life REIT|REIT - Healthcare;U10|UOB-Kay Hian Holdings|Capital Markets;" +
    "S41|Hong Leong Finance|Finance Services;E5H|Golden Agri-Resources|Farm Products;EB5|First Resources|Farm Products;VC2|Olam Group|Food Distribution;" +
    "AWX|AEM Holdings|Semiconductor Equipment;558|UMS Integration|Semiconductor Equipment;E28|Frencken Group|Electronic Components;D01|DFI Retail Group|Grocery Stores;" +
    "NS8U|Hutchison Port Holdings Trust|Marine Shipping;AU8U|CapitaLand China Trust|REIT - Retail;S08|Singapore Post|Integrated Freight & Logistics").split(";").map(function (s) {
    var p = s.split("|"); return { code: p[0], ticker: p[0] + ".SI", title: p[1], industry: p[2] };
  });
  var BY = {}; LIST.forEach(function (o) { BY[o.code] = o; });

  function fin(x) { return typeof x === "number" && isFinite(x); }
  function fail(msg) { return new Error(msg); }

  /* "D05.SI", "d05-si" or a listed code with a digit ("D05", "C38U") -> "D05.SI". With names: true, company names
     from the list also match ("dbs", "ocbc", "singtel"); the loader tries those only after the US lookup fails, so a
     US ticker such as GOLD is never taken for an SGX name. */
  function normalize(input, opt) {
    var s = String(input || "").trim(), up = s.toUpperCase().replace(/\s+/g, "");
    var m = up.match(/^([A-Z0-9]{2,5})[.\-]SI$/);
    if (m) return m[1] + ".SI";
    if (BY[up] && /\d/.test(up)) return up + ".SI";
    if (!(opt && opt.names)) return null;
    var q = s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (q.length >= 3) {
      var hit = LIST.filter(function (o) { var n = o.title.toLowerCase().replace(/[^a-z0-9 ]/g, " "); return n.indexOf(q) === 0 || (" " + n).indexOf(" " + q + " ") >= 0 || n.indexOf("(" + q) >= 0 || n.indexOf(" " + q) >= 0; })[0];
      if (hit) return hit.ticker;
    }
    return null;
  }
  function isSgx(input) { return !!normalize(input); }

  /* ---------- downloads ---------- */
  var ANNUAL = ["TotalRevenue", "NetIncomeCommonStockholders", "NetIncome", "PretaxIncome", "TaxProvision", "DilutedEPS", "DilutedAverageShares",
    "OperatingCashFlow", "CapitalExpenditure", "StockholdersEquity", "CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments", "OtherShortTermInvestments",
    "TotalDebt", "CapitalLeaseObligations", "OrdinarySharesNumber", "CashDividendsPaid", "CommonStockDividendPaid", "RepurchaseOfCapitalStock", "GrossProfit", "OperatingIncome",
    "ReconciledDepreciation", "InterestExpense", "CurrentAssets", "CurrentLiabilities", "Inventory", "RetainedEarnings", "AccountsReceivable", "PreferredStock"];
  var TRAILING = ["TotalRevenue", "NetIncomeCommonStockholders", "NetIncome", "PretaxIncome", "TaxProvision", "DilutedEPS", "OperatingCashFlow", "CapitalExpenditure",
    "GrossProfit", "OperatingIncome", "ReconciledDepreciation", "InterestExpense", "CashDividendsPaid", "RepurchaseOfCapitalStock", "MarketCap"];
  var QUARTERLY = ["StockholdersEquity", "CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments", "OtherShortTermInvestments", "TotalDebt",
    "CapitalLeaseObligations", "OrdinarySharesNumber", "CurrentAssets", "CurrentLiabilities", "Inventory", "AccountsReceivable", "MarketCap"];

  function timeseries(get, sym) {
    var types = ANNUAL.map(function (k) { return "annual" + k; }).concat(TRAILING.map(function (k) { return "trailing" + k; }), QUARTERLY.map(function (k) { return "quarterly" + k; }));
    var p2 = Math.floor(Date.now() / 1000) + 86400, p1 = p2 - 7 * 365 * 86400;
    var url = YF + "ws/fundamentals-timeseries/v1/finance/timeseries/" + encodeURIComponent(sym) + "?type=" + types.join(",") + "&period1=" + p1 + "&period2=" + p2;
    return get(url).then(function (j) {
      var res = j && j.timeseries && j.timeseries.result;
      if (!res || !res.length) throw fail("Yahoo Finance has no financial statements for " + sym + ".");
      var S = {};
      res.forEach(function (r) {
        var k = r.meta && r.meta.type && r.meta.type[0]; if (!k) return;
        var pts = (r[k] || []).filter(function (x) { return x && x.reportedValue && fin(x.reportedValue.raw); })
          .map(function (x) { return { end: x.asOfDate, val: x.reportedValue.raw, cur: x.currencyCode || null }; })
          .sort(function (a, b) { return a.end < b.end ? -1 : 1; });
        if (pts.length) S[k] = pts;
      });
      return S;
    });
  }
  function chart(get, sym, range, interval) {
    return get(YF + "v8/finance/chart/" + encodeURIComponent(sym) + "?range=" + range + "&interval=" + interval).then(function (j) {
      var r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r || !r.timestamp) throw fail("No price data was found for " + sym + ".");
      var q = r.indicators.quote[0].close, adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose, bars = [];
      r.timestamp.forEach(function (ts, i) { if (q[i] != null) bars.push({ t: ts * 1000, close: q[i], adj: adj && adj[i] != null ? adj[i] : q[i] }); });
      return { meta: r.meta || {}, bars: bars };
    });
  }
  /* monthly beta against the Straits Times Index (same method as the US loader uses against the S&P 500) */
  function betaOf(px, mkt) {
    if (!mkt) return null;
    var key = function (t) { var d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
    var m = {}; mkt.bars.forEach(function (b) { m[key(b.t)] = b.adj; });
    var pairs = [], ps = null, pm = null;
    px.bars.forEach(function (b) { var mv = m[key(b.t)]; if (mv == null) { ps = pm = null; return; } if (ps != null) pairs.push([b.adj / ps - 1, mv / pm - 1]); ps = b.adj; pm = mv; });
    pairs = pairs.slice(-60); if (pairs.length < 24) return null;
    var n = pairs.length, a = 0, c = 0, cov = 0, vr = 0;
    pairs.forEach(function (p) { a += p[0] / n; c += p[1] / n; });
    pairs.forEach(function (p) { cov += (p[0] - a) * (p[1] - c); vr += (p[1] - c) * (p[1] - c); });
    return vr > 0 ? cov / vr : null;
  }

  /* v3.13: ordinary shares per US-traded share (ADS). Yahoo reports a foreign company's share count and EPS per
     ordinary share, but its US price is per ADS (one TSMC ADS holds 5 shares). Yahoo's market value divided by the
     ADS price gives the number of ADSs; the share count divided by that gives the ratio, which is then rounded to a
     usual ratio (1, 2, 5, 8 ...). When Yahoo has no market value, the checked list in edgar.js (ADS_RATIO) is used. */
  var NICE_RATIO = [0.1, 0.2, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100];
  function adsRatio(S, px, X, priceCur, repCur, known) {
    var mcs = (S.trailingMarketCap || []).concat(S.quarterlyMarketCap || []).sort(function (a, b) { return a.end < b.end ? -1 : 1; });
    var mc = mcs.length ? mcs[mcs.length - 1] : null, shs = (S.quarterlyOrdinarySharesNumber || []).concat(S.annualOrdinarySharesNumber || []);
    var out = { ratio: known || 1, detected: null, known: known || null, raw: null };
    if (!mc || !shs.length || !px.bars.length) return out;
    var near = function (arr, end, get) { var t = Date.parse(end), best = null, bd = Infinity; arr.forEach(function (x) { var d = Math.abs(get(x) - t); if (d < bd) { bd = d; best = x; } }); return { v: best, d: bd / 864e5 }; };
    var mcCur = mc.cur ? String(mc.cur).toUpperCase() : priceCur;
    var mcap = mcCur === priceCur ? mc.val : mcCur === repCur ? mc.val * X : null;
    var sh = near(shs, mc.end, function (x) { return Date.parse(x.end); }), bar = near(px.bars, mc.end, function (b) { return b.t; });
    /* Yahoo's latest market value is today's, so it is compared with today's price rather than a monthly close */
    var lastBar = px.bars[px.bars.length - 1], pNow = px.meta && px.meta.regularMarketPrice;
    var pAt = Date.parse(mc.end) >= lastBar.t && pNow > 0 ? pNow : (bar.v && bar.d <= 45 ? bar.v.close : null);
    if (!(mcap > 0) || !sh.v || sh.d > 400 || !(pAt > 0)) return out;
    var raw = sh.v.val / (mcap / pAt), best = null, bd = Infinity;
    NICE_RATIO.forEach(function (n) { var d = Math.abs(Math.log(raw / n)); if (d < bd) { bd = d; best = n; } });
    out.raw = raw;
    if (bd < Math.log(1.2)) { out.detected = best; out.ratio = best; }
    return out;
  }

  /* ---------- build the model input ---------- */
  /* opt (v3.13, foreign companies only): { foreign: true, title, industry, exchange, ads (checked ratio or null), indexName } */
  function build(sym, S, px, mkt, fxRate, today, opt) {
    opt = opt || {};
    var foreign = !!opt.foreign;
    var code = sym.replace(/\.SI$/, ""), info = foreign ? { title: opt.title || px.meta.longName || px.meta.shortName || sym, industry: opt.industry || "" } : (BY[code] || { title: px.meta.longName || px.meta.shortName || sym, industry: "" });
    var priceCur = String(px.meta.currency || (foreign ? "USD" : "SGD")).toUpperCase(), price = px.meta.regularMarketPrice;
    if (!(price > 0)) throw fail("No share price was found for " + sym + ".");
    var X = fxRate || 1; /* converts the statements' currency into the price currency */
    var last = function (k) { var a = S[k]; return a && a.length ? a[a.length - 1] : null; };
    var v = function (k) { var p = last(k); return p ? p.val * X : null; };
    var first = function () { for (var i = 0; i < arguments.length; i++) { var x = v(arguments[i]); if (fin(x)) return x; } return null; };
    var yearly = function (k) { var o = {}; (S["annual" + k] || []).forEach(function (p) { o[p.end] = p.val * X; }); return o; };
    var caveats = [];
    var repCur = String(((S.annualTotalRevenue || [])[0] || {}).cur || priceCur).toUpperCase();
    /* v3.13: per-ADS figures for foreign companies (RA = ordinary shares per US-traded share) */
    var ads = foreign ? adsRatio(S, px, X, priceCur, repCur, opt.ads) : { ratio: 1 }, RA = ads.ratio;

    var revA = yearly("TotalRevenue"), niA = Object.keys(yearly("NetIncomeCommonStockholders")).length ? yearly("NetIncomeCommonStockholders") : yearly("NetIncome");
    var epsA = yearly("DilutedEPS"), dilA = {}; (S.annualDilutedAverageShares || []).forEach(function (p) { dilA[p.end] = p.val / RA; });
    Object.keys(epsA).forEach(function (k) { epsA[k] = epsA[k] * RA; });
    var eqA = yearly("StockholdersEquity"), ocfA = yearly("OperatingCashFlow"), capA = yearly("CapitalExpenditure");
    var ends = Object.keys(revA).sort();
    if (ends.length < 2) throw fail("Yahoo Finance has fewer than two years of results for " + sym + ", so it cannot be valued.");
    var fyEnd = ends[ends.length - 1];

    /* last 12 months: Yahoo's trailing figures, or the last full year when they are missing */
    var tEnd = last("trailingTotalRevenue") ? last("trailingTotalRevenue").end : fyEnd;
    var tt = function (k) { var x = v("trailing" + k); return fin(x) ? x : v("annual" + k); };
    var rev = tt("TotalRevenue"), ni = fin(v("trailingNetIncomeCommonStockholders")) ? v("trailingNetIncomeCommonStockholders") : fin(v("trailingNetIncome")) ? v("trailingNetIncome") : niA[fyEnd];
    var ocf = tt("OperatingCashFlow"), capex = tt("CapitalExpenditure"), pre = tt("PretaxIncome"), taxP = tt("TaxProvision");
    if (!fin(rev) || !fin(ni)) throw fail("Revenue or profit is missing in Yahoo Finance's data for " + sym + ".");
    if (!fin(ocf)) throw fail("Cash flow figures are missing in Yahoo Finance's data for " + sym + ".");
    if (!last("trailingTotalRevenue")) caveats.push("Last-12-month figures were not available, so the last full fiscal year (" + fyEnd + ") is used.");

    /* balance sheet: the latest quarter when reported, otherwise the last year-end */
    var bq = function (k) { var q = v("quarterly" + k), a = v("annual" + k), qd = last("quarterly" + k), ad = last("annual" + k); return qd && (!ad || qd.end >= ad.end) && fin(q) ? q : a; };
    var equity = bq("StockholdersEquity");
    if (!fin(equity)) throw fail("Shareholders' equity is missing in Yahoo Finance's data for " + sym + ".");
    var cash = bq("CashCashEquivalentsAndShortTermInvestments");
    if (!fin(cash)) { var c1 = bq("CashAndCashEquivalents"), c2 = bq("OtherShortTermInvestments"); cash = (c1 || 0) + (c2 || 0); }
    var debt = bq("TotalDebt") || 0, leases = bq("CapitalLeaseObligations") || 0;
    var shNow = (function () { var q = last("quarterlyOrdinarySharesNumber"), a = last("annualOrdinarySharesNumber"); var p = q && (!a || q.end >= a.end) ? q : a; return p ? p.val / RA : null; })();
    var dilNow = dilA[fyEnd] || null;
    var shares = shNow || dilNow;
    if (!(shares > 0)) throw fail("The share count is missing in Yahoo Finance's data for " + sym + ".");
    if (dilNow && (shares / dilNow < 0.6 || shares / dilNow > 1.6)) { caveats.push("The latest share count did not match the diluted share count, so the diluted count was used."); shares = dilNow; }
    var epsTTM = tt("DilutedEPS");
    if (fin(epsTTM)) epsTTM *= RA;
    if (!fin(epsTTM) || !(epsTTM !== 0)) epsTTM = ni / (dilNow || shares);

    /* history: each year's figures against the share price at that year's end */
    var barAt = function (end) { var t = Date.parse(end) + 15 * 864e5, b = null; px.bars.forEach(function (x) { if (x.t <= t) b = x; }); return b; };
    var fyRows = [], ratioRows = [];
    ends.slice(-6).forEach(function (end) {
      /* EPS as reported, or profit over the year's diluted shares (or today's share count) when Yahoo leaves it out */
      var eps = fin(epsA[end]) ? epsA[end] : fin(niA[end]) ? niA[end] / (dilA[end] > 0 ? dilA[end] : shares) : null;
      fyRows.push({ date: end, revenue: revA[end], epsDiluted: eps != null ? eps : undefined, netIncome: niA[end], reportedCurrency: priceCur });
      var bar = barAt(end); if (!bar || Date.parse(end) - bar.t > 70 * 864e5) return;
      var sh = dilA[end] || shares, mc = bar.close * sh;
      ratioRows.push({ date: end, fiscalYear: end.slice(0, 4), priceToEarningsRatio: eps > 0 ? bar.close / eps : NaN,
        priceToSalesRatio: revA[end] > 0 ? mc / revA[end] : NaN, priceToBookRatio: eqA[end] > 0 ? mc / eqA[end] : NaN });
    });

    var months = Math.max(0, (Date.parse(tEnd) - Date.parse(fyEnd)) / 864e5 / 30.44);
    var b = betaOf(px, mkt), betaUse = b == null ? 1 : Math.max(0.5, Math.min(2, b));
    var curNote = X !== 1 ? " Financial statements are reported in " + repCur + " and were converted to " + priceCur + " at today's rate of " + X.toFixed(4) + " (past years use the same rate, so the history of ratios ignores currency moves)." : "";
    if (foreign) {
      var fx = function (n) { return n === 0.5 ? "half an" : n === 0.25 ? "a quarter of an" : n === 0.2 ? "a fifth of an" : n === 0.1 ? "a tenth of an" : String(n); };
      if (RA !== 1) caveats.unshift("Each US-traded share (ADS) of " + sym + " represents " + fx(RA) + " ordinary share" + (RA > 1 ? "s" : "") + " (" + (ads.detected ? "worked out from Yahoo Finance's market value and share count" + (ads.known && ads.known !== ads.detected ? "; Plumbline's own list says " + ads.known + ", so check the company's 20-F" : "") : "from Plumbline's checked list") + "). Shares and earnings per share were converted to per-ADS figures to match the share price.");
      else if (!ads.detected && !ads.known) caveats.unshift("Plumbline could not confirm how many ordinary shares each US-traded share (ADS) of " + sym + " holds, so it assumed one. If the ADS holds several shares (see the company's 20-F cover page), the per-share values are off by that ratio; use the manual entry form.");
      caveats.push(b == null ? "Beta could not be calculated, so 1.0 is used." : "Beta of " + betaUse.toFixed(2) + " was calculated from the last 5 years of monthly price moves against " + (opt.indexName || "the S&P 500") + (betaUse !== b ? " (capped between 0.5 and 2.0)." : "."));
      caveats.push(sym + " is a foreign company that files foreign-style (IFRS) accounts with the SEC, which the free SEC data cannot read. Its financial statements come from Yahoo Finance instead, which reports about four years of results, so the history used is shorter than for US companies." + curNote);
      caveats.push("Values are in US$ per US-traded share.");
    } else {
      caveats.push(b == null ? "Beta could not be calculated, so 1.0 is used." : "Beta of " + betaUse.toFixed(2) + " was calculated from the last 5 years of monthly price moves against Singapore's Straits Times Index" + (betaUse !== b ? " (capped between 0.5 and 2.0)." : "."));
      caveats.push("Data comes from Yahoo Finance (financial statements and prices), which reports about four years of results for SGX companies, so the history used is shorter than for US stocks." + curNote);
      caveats.push("Values are in " + priceCur + ".");
    }
    if (leases > 0) caveats.push("Debt includes about " + (leases / 1e9).toFixed(1) + " billion of lease obligations.");

    var exch = foreign ? (opt.exchange || px.meta.fullExchangeName || px.meta.exchangeName || "") : "SGX";
    var R = {
      quote: [{ price: price, marketCap: price * shares }],
      profile: [{ companyName: info.title, exchange: exch, sector: info.industry, industry: info.industry, beta: betaUse, currency: priceCur }],
      balance: [{ totalStockholdersEquity: equity, cashAndShortTermInvestments: cash, totalDebt: debt }],
      incomeTTM: [{ date: tEnd, reportedCurrency: priceCur, revenue: rev, netIncome: ni, incomeBeforeTax: pre, incomeTaxExpense: taxP, epsDiluted: epsTTM }],
      cashTTM: [{ operatingCashFlow: ocf, capitalExpenditure: -Math.abs(capex || 0) }],
      ratios: ratioRows.slice(-5),
      incomeFY: fyRows.slice().reverse(),
      cashFY: ends.slice().reverse().map(function (end) { return fin(capA[end]) ? { date: end, capitalExpenditure: -Math.abs(capA[end]) } : null; }).filter(Boolean),
      estimates: [], fx: 1,
      calWeight: Math.max(0.05, Math.min(1, 1 - months / 12)),
      estNote: "Analyst estimates are not available from the free data source.",
      extraCaveats: caveats
    };
    var inp = LiveData.map(sym, R, today);
    if (!(pre > 0)) inp.ttm.tax = foreign ? 0.21 : 0.17; /* Singapore's (or the US) corporate tax rate when the effective rate cannot be measured */
    inp.source = foreign ? "Yahoo Finance (foreign company filing IFRS accounts)" : "Yahoo Finance (SGX)";
    inp.industry = info.industry;
    inp.currency = priceCur;
    inp.exchange = exch;
    if (foreign) { inp.foreign = true; inp.adsRatio = RA; }

    /* bank and insurer figures (same shape as the SEC loader's) */
    try {
      var divA = Object.keys(yearly("CashDividendsPaid")).length ? yearly("CashDividendsPaid") : yearly("CommonStockDividendPaid"), bbA = yearly("RepurchaseOfCapitalStock");
      var fyrs = ends.slice(-5), divFound = fyrs.some(function (e) { return fin(divA[e]); }), bbFound = fyrs.some(function (e) { return fin(bbA[e]); });
      var mm = function (x) { return fin(x) ? x / M : null; }, prev = function (e) { var i = ends.indexOf(e); return i > 0 ? eqA[ends[i - 1]] : null; };
      var tDiv = v("trailingCashDividendsPaid"), tBb = v("trailingRepurchaseOfCapitalStock");
      inp.fin = { years: fyrs.map(function (e) { return "FY" + e.slice(0, 4); }), ni: fyrs.map(function (e) { return mm(niA[e]); }),
        eqEnd: fyrs.map(function (e) { return mm(eqA[e]); }), eqStart: fyrs.map(function (e) { return mm(prev(e)); }),
        divs: fyrs.map(function (e) { return fin(divA[e]) ? Math.abs(divA[e]) / M : null; }), buybacks: fyrs.map(function (e) { return fin(bbA[e]) ? Math.abs(bbA[e]) / M : 0; }),
        prefDivs: fyrs.map(function () { return 0; }), prefEqEnd: fyrs.map(function () { return 0; }), prefEqStart: fyrs.map(function () { return 0; }),
        ttm: { divs: fin(tDiv) ? Math.abs(tDiv) / M : (fin(divA[fyEnd]) ? Math.abs(divA[fyEnd]) / M : null), buybacks: fin(tBb) ? Math.abs(tBb) / M : (fin(bbA[fyEnd]) ? Math.abs(bbA[fyEnd]) / M : 0), prefDivs: 0 },
        prefEqNow: 0, divFound: divFound, buybackFound: bbFound };
    } catch (e) { inp.fin = null; }

    /* business-quality figures ($ millions in the price currency) */
    try {
      var retA = yearly("RetainedEarnings"), qy = ends.slice(-6);
      var gp = tt("GrossProfit"), recv = bq("AccountsReceivable");
      var prevEnd = ends.length > 1 ? ends[ends.length - 2] : null;
      var yAgoDebt = (function () { var a = S.annualTotalDebt || []; for (var i = a.length - 1; i >= 0; i--) if (a[i].end < (last("annualStockholdersEquity") || {}).end) return a[i].val * X; return null; })();
      inp.quality = {
        years: qy.map(function (e) { return "FY" + e.slice(0, 4); }),
        rev: qy.map(function (e) { return fin(revA[e]) ? revA[e] / M : null; }),
        eps: qy.map(function (e) { var r = fyRows.filter(function (x) { return x.date === e; })[0]; return r && fin(r.epsDiluted) ? r.epsDiluted : null; }),
        fcf: qy.map(function (e) { return fin(ocfA[e]) ? (ocfA[e] - Math.abs(capA[e] || 0)) / M : null; }),
        retained: qy.map(function (e) { return fin(retA[e]) ? retA[e] / M : null; }),
        capex: qy.map(function (e) { return fin(capA[e]) ? Math.abs(capA[e]) / M : null; }),
        gp: fin(gp) && gp !== 0 ? gp / M : null, opInc: fin(tt("OperatingIncome")) ? tt("OperatingIncome") / M : null,
        da: fin(tt("ReconciledDepreciation")) ? tt("ReconciledDepreciation") / M : null, interest: fin(tt("InterestExpense")) ? Math.abs(tt("InterestExpense")) / M : null,
        curAssets: fin(bq("CurrentAssets")) ? bq("CurrentAssets") / M : null, curLiab: fin(bq("CurrentLiabilities")) ? bq("CurrentLiabilities") / M : null,
        inventory: fin(bq("Inventory")) ? bq("Inventory") / M : null,
        quickAssets: fin(recv) ? (cash + recv) / M : null,
        leases: leases / M, taxRate: inp.ttm.tax,
        prev: prevEnd && fin(eqA[prevEnd]) ? { equity: eqA[prevEnd] / M, borrowings: fin(yAgoDebt) ? Math.max(0, yAgoDebt - leases) / M : null, cash: null, date: prevEnd } : null
      };
      if (!inp.quality.prev) delete inp.quality.prev;
    } catch (e) { inp.quality = null; }
    return inp;
  }

  function nodeGet(url) {
    return Edgar.getJSON(url, Edgar.BROWSER_UA, "Yahoo Finance");
  }
  /* exchange rate from the statements' currency to the price currency */
  function fxFor(get, sym, S, px, defCur) {
    var priceCur = String(px.meta.currency || defCur).toUpperCase();
    var repCur = ((S.annualTotalRevenue || [])[0] || {}).cur;
    repCur = repCur ? String(repCur).toUpperCase() : priceCur;
    if (repCur === priceCur) return Promise.resolve(1);
    return chart(get, repCur + priceCur + "=X", "5d", "1d").then(function (f) {
      var x = f.meta.regularMarketPrice; if (!(x > 0)) throw 0; return x;
    }).catch(function () { throw fail(sym + " reports in " + repCur + " but trades in " + priceCur + ", and the exchange rate could not be loaded."); });
  }
  function load(input, get) {
    get = get || nodeGet;
    var sym = normalize(input);
    if (!sym) return Promise.reject(fail("\"" + input + "\" is not an SGX ticker. Use the stock code with .SI, for example D05.SI for DBS."));
    var today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return Promise.all([timeseries(get, sym), chart(get, sym, "10y", "1mo"), chart(get, "^STI", "10y", "1mo").catch(function () { return null; })]).then(function (r) {
      return fxFor(get, sym, r[0], r[1], "SGD").then(function (X) { return build(sym, r[0], r[1], r[2], X, today); });
    });
  }
  /* v3.13: a US-listed foreign company (TSM, ASML, NVO ...) whose SEC filings use IFRS. opt comes from the SEC loader:
     { title, industry, exchange, ads }. Beta is measured against the S&P 500, as for US companies. */
  function loadForeign(ticker, opt, get) {
    get = get || nodeGet;
    var sym = String(ticker || "").toUpperCase().replace(/\./g, "-");
    var o = Object.assign({ foreign: true, indexName: "the S&P 500" }, opt || {});
    var today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return Promise.all([timeseries(get, sym), chart(get, sym, "10y", "1mo"), chart(get, "^GSPC", "10y", "1mo").catch(function () { return null; })]).then(function (r) {
      return fxFor(get, sym, r[0], r[1], "USD").then(function (X) { return build(sym, r[0], r[1], r[2], X, today, o); });
    });
  }

  var api = { load: load, loadForeign: loadForeign, build: build, adsRatio: adsRatio, normalize: normalize, isSgx: isSgx, LIST: LIST };
  if (isNode) module.exports = api;
  root.SGX = api;
})(typeof window !== "undefined" ? window : globalThis);
