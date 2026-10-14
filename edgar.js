/* Free data source for almost any US-listed company. Server-side only (needs Node 18+).
   - Company financials: SEC EDGAR "company facts" (official 10-K and 10-Q filings, free, no key).
   - Share price, price history and splits: Yahoo Finance public chart data (free, no key, unofficial).
   Analyst estimates are not available from either, so growth falls back to the company's own past growth.
   Everything is converted into the same input format that api.js produces, then api.map() finishes the job.
   v1.5: also collects the figures for the Business Quality scorecard (quality.js). */
"use strict";
var LiveData = require("./api.js");

var SEC = process.env.SEC_BASE || "https://data.sec.gov/";
var SEC_WWW = process.env.SEC_WWW_BASE || "https://www.sec.gov/";
var YF = process.env.YAHOO_BASE || "https://query1.finance.yahoo.com/";
var UA = "Plumbline " + (process.env.SEC_CONTACT || "student-project contact-not-set@example.com");
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function fail(msg, extra) { var e = new Error(msg); if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); return e; }

function getJSON(url, ua, what) {
  var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 25000);
  return fetch(url, { headers: { "User-Agent": ua, "Accept": "application/json" }, signal: ctl.signal }).then(function (r) {
    clearTimeout(tm);
    if (r.status === 404) throw fail(what + " has no data for this company.", { notFound: true });
    if (r.status === 429) throw fail(what + " is rate-limiting requests. Wait a minute and try again.");
    if (r.status === 403) throw fail(what + " refused the request (403). For SEC data, set SEC_CONTACT to your email address in the .env file.");
    if (!r.ok) throw fail(what + " returned an error (" + r.status + ").");
    return r.json();
  }, function (e) { clearTimeout(tm); throw fail("Could not reach " + what + " (" + (e && e.name === "AbortError" ? "timed out" : (e && e.cause && e.cause.code) || e.message) + ")."); });
}

/* ---------- ticker lookup ---------- */
var tickerCache = null;
function tickers() {
  if (tickerCache) return Promise.resolve(tickerCache);
  return getJSON(SEC_WWW + "files/company_tickers.json", UA, "the SEC ticker list").then(function (j) {
    var by = {}, list = [];
    Object.keys(j).forEach(function (k) { var r = j[k]; var o = { cik: r.cik_str, ticker: String(r.ticker).toUpperCase(), title: r.title }; by[o.ticker] = o; list.push(o); });
    tickerCache = { by: by, list: list }; return tickerCache;
  });
}
/* ---------- search: tickers, company names and near misses (engine shared with the browser) ---------- */
var SearchCore = require("./search-core.js");
function index(T) { if (!T.I) T.I = SearchCore.makeIndex(T.list); return T.I; }
function search(q, n) { return tickers().then(function (T) { return SearchCore.rank(index(T), q, n); }); }
/* the full list in compact form for the browser: [[ticker, title], ...], largest companies first */
function tickerList() { return tickers().then(function (T) { return T.list.map(function (o) { return [o.ticker, o.title]; }); }); }
function resolve(q) {
  return tickers().then(function (T) {
    var I = index(T), up = String(q).toUpperCase().replace(/\./g, "-").replace(/\s+/g, "");
    if (I.by[up]) return I.by[up];
    var hits = SearchCore.rank(I, q, 6);
    /* a company name (not a guess) opens the biggest matching company straight away */
    if (hits.length && hits[0].how === "name") return I.by[hits[0].symbol];
    throw fail(hits.length ? "Did you mean one of these?" : "We couldn't find a US-listed company with that name or ticker. Check the spelling, or try the company's ticker.", { suggest: hits.slice(0, 5) });
  });
}
function _setTickers(list) { var by = {}; list.forEach(function (o) { by[o.ticker] = o; }); tickerCache = { by: by, list: list }; }

/* ---------- reading XBRL facts ---------- */
function days(a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; }
function isAnnualForm(f) { return /^10-K|^20-F|^40-F/.test(f.form || ""); }

/* all facts for the first concept names that have data; a period reported under an earlier name is not repeated */
function collect(facts, names, unit) {
  var out = [], claimed = {};
  names.forEach(function (n) {
    var c = facts["us-gaap"] && facts["us-gaap"][n], arr = c && c.units && c.units[unit];
    if (!arr) return;
    var mine = {};
    arr.forEach(function (f) {
      var k = (f.start || "") + "|" + f.end;
      if (claimed[k]) return;
      mine[k] = 1; out.push(f);
    });
    Object.keys(mine).forEach(function (k) { claimed[k] = 1; });
  });
  return out;
}
/* annual facts keyed by period end: { first: first filed (as originally reported), last: latest filed } */
function annualMap(list) {
  var m = {};
  list.forEach(function (f) {
    if (!f.start || !isAnnualForm(f)) return;
    var d = days(f.start, f.end); if (d < 340 || d > 380) return;
    var a = m[f.end] || (m[f.end] = { first: f, last: f });
    if (f.filed < a.first.filed) a.first = f;
    if (f.filed >= a.last.filed) a.last = f;
  });
  return m;
}
/* trailing twelve months = last fiscal year + this year so far - same part of last year */
function ttm(list) {
  var A = annualMap(list), ends = Object.keys(A).sort().reverse();
  if (!ends.length) return null;
  var fyEnd = ends[0], fy = A[fyEnd].last.val;
  var cur = null;
  list.forEach(function (f) {
    if (!f.start || f.end <= fyEnd) return;
    var d = days(f.start, f.end);
    if (d >= 340 || Math.abs(days(fyEnd, f.start)) > 10) return;
    if (!cur || f.end > cur.end || (f.end === cur.end && (d > days(cur.start, cur.end) || (d === days(cur.start, cur.end) && f.filed > cur.filed)))) cur = f;
  });
  if (!cur) return { value: fy, end: fyEnd, fyEnd: fyEnd };
  var prior = null, dur = days(cur.start, cur.end);
  list.forEach(function (f) {
    if (!f.start) return;
    if (Math.abs(days(f.start, cur.start) - 365) > 12 || Math.abs(days(f.end, cur.end) - 365) > 12) return;
    if (Math.abs(days(f.start, f.end) - dur) > 12) return;
    if (!prior || f.filed > prior.filed) prior = f;
  });
  if (!prior) return { value: fy, end: fyEnd, fyEnd: fyEnd, partial: true };
  return { value: fy + cur.val - prior.val, end: cur.end, fyEnd: fyEnd };
}
/* newest point-in-time value (balance sheet) */
function latestInstant(list) {
  var best = null;
  list.forEach(function (f) { if (f.start) return; if (!best || f.end > best.end || (f.end === best.end && f.filed > best.filed)) best = f; });
  return best;
}
function instantAt(list, end, tolDays) {
  var best = null;
  list.forEach(function (f) { if (f.start) return; if (Math.abs(days(f.end, end)) > tolDays) return; if (!best || f.end > best.end || (f.end === best.end && f.filed > best.filed)) best = f; });
  return best;
}
/* point-in-time value closest to a date (either side) */
function nearestInstant(list, end, tolDays) {
  var best = null, bd = Infinity;
  list.forEach(function (f) { if (f.start) return; var d = Math.abs(days(f.end, end)); if (d > tolDays) return; if (d < bd || (d === bd && f.filed > best.filed)) { best = f; bd = d; } });
  return best;
}
function instantFirstFiled(list, end) {
  var best = null;
  list.forEach(function (f) { if (f.start || f.end !== end) return; if (!best || f.filed < best.filed) best = f; });
  return best;
}

var C = {
  rev: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet", "RevenuesNetOfInterestExpense"],
  ni: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
  tax: ["IncomeTaxExpenseBenefit"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"],
  software: ["PaymentsToDevelopSoftware", "PaymentsForSoftware"],
  eps: ["EarningsPerShareDiluted"],
  dil: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cashST: ["CashCashEquivalentsAndShortTermInvestments"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  sti: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
  debtAll: ["DebtLongtermAndShorttermCombinedAmount"],
  ltd: ["LongTermDebt"],
  ltdNC: ["LongTermDebtNoncurrent"],
  ltdC: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
  conv: ["ConvertibleNotesPayable", "ConvertibleDebtNoncurrent"],
  notes: ["SeniorNotes", "SeniorNotesNoncurrent", "LongTermNotesPayable", "UnsecuredLongTermDebt", "NotesPayable", "ConvertibleSeniorNotesPayable", "LongtermDebtNoncurrentExcludingCurrentPortion"],
  stb: ["ShortTermBorrowings", "CommercialPaper", "OtherShortTermBorrowings", "LinesOfCreditCurrent", "BridgeLoan"],
  /* Business Quality scorecard */
  gp: ["GrossProfit"],
  cost: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"],
  opInc: ["OperatingIncomeLoss"],
  da: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization", "Depreciation"],
  interest: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense", "InterestPaidNet"],
  curA: ["AssetsCurrent"],
  curL: ["LiabilitiesCurrent"],
  inv: ["InventoryNet"],
  ret: ["RetainedEarningsAccumulatedDeficit"],
  recv: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"],
  defRev: ["ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"],
  /* lease obligations, counted as debt (same as stockanalysis.com) */
  opLease: ["OperatingLeaseLiability"], opLeaseC: ["OperatingLeaseLiabilityCurrent"], opLeaseNC: ["OperatingLeaseLiabilityNoncurrent"],
  finLease: ["FinanceLeaseLiability"], finLeaseC: ["FinanceLeaseLiabilityCurrent"], finLeaseNC: ["FinanceLeaseLiabilityNoncurrent"]
};

/* ---------- Yahoo price data ---------- */
function yahoo(sym, range) {
  var url = YF + "v8/finance/chart/" + encodeURIComponent(sym) + "?range=" + range + "&interval=1mo&events=split";
  return getJSON(url, BROWSER_UA, "the price data source").then(function (j) {
    var r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) throw fail("No price data was found for " + sym + ".");
    var q = r.indicators.quote[0].close, adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
    var bars = [];
    r.timestamp.forEach(function (ts, i) { if (q[i] != null) bars.push({ t: ts * 1000, close: q[i], adj: adj && adj[i] != null ? adj[i] : q[i] }); });
    var splits = [];
    if (r.events && r.events.splits) Object.keys(r.events.splits).forEach(function (k) { var s = r.events.splits[k]; if (s.numerator > 0 && s.denominator > 0) splits.push({ t: s.date * 1000, f: s.numerator / s.denominator }); });
    return { meta: r.meta || {}, bars: bars, splits: splits };
  });
}
/* Latest price and price history for the chart. range: 1mo, 6mo, 1y or 5y (5y uses weekly points). */
var QUOTE_INT = { "1mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1wk" };
function quote(sym, range) {
  range = QUOTE_INT[range] ? range : "1y";
  var url = YF + "v8/finance/chart/" + encodeURIComponent(String(sym).toUpperCase().replace(/\./g, "-")) + "?range=" + range + "&interval=" + QUOTE_INT[range];
  return getJSON(url, BROWSER_UA, "the price data source").then(function (j) {
    var r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) throw fail("No price data was found for " + sym + ".");
    var m = r.meta || {}, c = r.indicators.quote[0].close, pts = [];
    r.timestamp.forEach(function (ts, i) { if (c[i] != null) pts.push([ts * 1000, Math.round(c[i] * 100) / 100]); });
    var price = m.regularMarketPrice != null ? m.regularMarketPrice : (pts.length ? pts[pts.length - 1][1] : null);
    /* the day's change needs daily points: the close before the latest one */
    var prev = QUOTE_INT[range] === "1d" && pts.length > 1 ? pts[pts.length - 2][1] : (m.previousClose != null ? m.previousClose : null);
    return { symbol: m.symbol || sym, price: price, prevClose: prev, time: (m.regularMarketTime || 0) * 1000, currency: m.currency || "USD",
      exchange: m.fullExchangeName || m.exchangeName || "", range: range, points: pts };
  });
}
function monthKey(ms) { var d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
function barAt(bars, endDate) {
  var k = monthKey(Date.parse(endDate)), best = null;
  bars.forEach(function (b) { if (monthKey(b.t) <= k) best = b; });
  return best && k - monthKey(best.t) <= 2 ? best : null;
}
function splitAfter(splits, endDate) {
  var f = 1, t = Date.parse(endDate);
  splits.forEach(function (s) { if (s.t > t) f *= s.f; });
  return f;
}
function beta(stock, mkt) {
  var m = {}; mkt.bars.forEach(function (b) { m[monthKey(b.t)] = b.adj; });
  var pairs = [], prevS = null, prevM = null;
  stock.bars.forEach(function (b) {
    var k = monthKey(b.t), mv = m[k];
    if (mv == null) { prevS = null; prevM = null; return; }
    if (prevS != null && prevM != null) pairs.push([b.adj / prevS - 1, mv / prevM - 1]);
    prevS = b.adj; prevM = mv;
  });
  pairs = pairs.slice(-60);
  if (pairs.length < 24) return null;
  var n = pairs.length, ms = 0, mm = 0, i;
  pairs.forEach(function (p) { ms += p[0] / n; mm += p[1] / n; });
  var cov = 0, vr = 0;
  pairs.forEach(function (p) { cov += (p[0] - ms) * (p[1] - mm); vr += (p[1] - mm) * (p[1] - mm); });
  return vr > 0 ? cov / vr : null;
}

/* ---------- Business Quality figures ($ millions) ---------- */
function qualityData(us, tRev, bEnd, rA, fyRows, ocf, capex, soft) {
  var M = 1e6;
  function tt(names) { var r = ttm(collect(us, names, "USD")); return r ? r.value : null; }
  function inst(names) { var f = instantAt(collect(us, names, "USD"), bEnd, 20); return f ? f.val : null; }
  function d(v) { return v == null ? undefined : v / M; }
  /* gross profit and the revenue for the same period (some filers report gross profit only once a year) */
  function revFor(end) { return end === tRev.end ? tRev.value : (rA[end] ? rA[end].last.val : null); }
  var gp = null, gpRev = null, g1 = ttm(collect(us, C.gp, "USD"));
  if (g1) { gp = g1.value; gpRev = revFor(g1.end); }
  else { var c1 = ttm(collect(us, C.cost, "USD")); if (c1) { gpRev = revFor(c1.end); if (gpRev != null) gp = gpRev - c1.value; } }
  if (gpRev == null) gp = null;
  var opInc = tt(C.opInc), da = tt(C.da), interest = tt(C.interest);
  var curA = inst(C.curA), curL = inst(C.curL), inv = inst(C.inv);

  /* last six fiscal years, oldest first */
  var ends = Object.keys(rA).sort().reverse().slice(0, 6).reverse();
  var ocfA = annualMap(ocf), capA = annualMap(capex), softA = annualMap(soft), retList = collect(us, C.ret, "USD");
  var epsBy = {}; fyRows.forEach(function (r) { epsBy[r.date] = r.epsDiluted; });
  var q = { years: [], rev: [], eps: [], fcf: [], retained: [] };
  ends.forEach(function (end) {
    q.years.push("FY" + end.slice(0, 4));
    q.rev.push(rA[end].last.val / M);
    q.eps.push(typeof epsBy[end] === "number" ? epsBy[end] : null);
    var o = ocfA[end] ? ocfA[end].last.val : null;
    q.fcf.push(o == null ? null : (o - (capA[end] ? capA[end].last.val : 0) - (softA[end] ? softA[end].last.val : 0)) / M);
    var re = instantAt(retList, end, 20);
    q.retained.push(re ? re.val / M : null);
  });
  q.gp = d(gp); q.gpRev = d(gpRev); q.opInc = d(opInc); q.da = d(da); q.interest = interest == null ? undefined : Math.abs(interest) / M;
  q.curAssets = d(curA); q.curLiab = d(curL); q.inventory = inv == null ? 0 : inv / M;
  return q;
}

/* ---------- main ---------- */
function build(t, co, facts, sub, px, mkt, today) {
  var us = facts.facts || {};
  var hasUSD = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "NetIncomeLoss", "ProfitLoss"].some(function (n) { return us["us-gaap"] && us["us-gaap"][n] && us["us-gaap"][n].units && us["us-gaap"][n].units.USD; });
  if (!hasUSD) throw fail(t + " does not file US-style (US GAAP, in dollars) financial statements with the SEC, so this free source cannot value it. Foreign companies (for example ASML) need a paid data plan or the manual entry form.");

  var rev = collect(us, C.rev, "USD"), ni = collect(us, C.ni, "USD"), pretax = collect(us, C.pretax, "USD"), tax = collect(us, C.tax, "USD");
  var ocf = collect(us, C.ocf, "USD"), capex = collect(us, C.capex, "USD"), soft = collect(us, C.software, "USD");
  var eps = collect(us, C.eps, "USD/shares"), dil = collect(us, C.dil, "shares");
  var tRev = ttm(rev), tNi = ttm(ni), tOcf = ttm(ocf), tEps = ttm(eps);
  if (!tRev || !tNi) throw fail("The SEC filings for " + t + " do not contain a full year of revenue and profit yet, so it cannot be valued (recent listings often lack this).");
  if (!tOcf) throw fail("Cash flow figures are missing in the SEC filings for " + t + ".");
  var tPre = ttm(pretax), tTax = ttm(tax), tCap = ttm(capex), tSoft = ttm(soft);
  var caveats = [];

  /* balance sheet at the newest date */
  var eqAll = collect(us, C.equity, "USD"), eq = latestInstant(eqAll);
  if (!eq) throw fail("Balance sheet figures (shareholders' equity) are missing in the SEC filings for " + t + ".");
  var bEnd = eq.end;
  function inst(names, at, tol, near) { var l = collect(us, names, "USD"), f = near ? nearestInstant(l, at, tol) : instantAt(l, at || bEnd, tol || 20); return f ? f.val : null; }
  /* balance sheet items at any date (used now and one year earlier, for averages) */
  function cashAt(at, tol) {
    var c = inst(C.cashST, at, tol);
    if (c != null) return c;
    var c1 = inst(C.cash, at, tol), c2 = inst(C.sti, at, tol);
    return c1 == null && c2 == null ? null : (c1 || 0) + (c2 || 0);
  }
  /* borrowings = long-term debt (including its current part) + short-term borrowings such as commercial paper */
  function borrowAt(at, tol, near) {
    var all = inst(C.debtAll, at, tol, near);
    if (all != null) return all;
    var lt = inst(C.ltd, at, tol, near);
    if (lt == null) { var nc = inst(C.ltdNC, at, tol, near), lc = inst(["LongTermDebtCurrent"], at, tol, near); lt = nc == null && lc == null ? null : (nc || 0) + (lc || 0); }
    if (lt == null) lt = inst(C.notes, at, tol, near);
    var st = inst(C.stb, at, tol, near);
    if (st == null) { var dc = inst(["DebtCurrent"], at, tol, near); if (dc != null) st = Math.max(0, dc - (inst(["LongTermDebtCurrent"], at, tol, near) || 0)); }
    var cv = inst(C.conv, at, tol, near);
    if (lt == null && st == null && cv == null) return null;
    return (lt || 0) + (st || 0) + (cv || 0);
  }
  function sumOr(total, cur, nc, at, tol) { var t0 = inst(total, at, tol); if (t0 != null) return t0; var a = inst(cur, at, tol), b2 = inst(nc, at, tol); return a == null && b2 == null ? 0 : (a || 0) + (b2 || 0); }
  function leasesAt(at, tol) { return sumOr(C.opLease, C.opLeaseC, C.opLeaseNC, at, tol) + sumOr(C.finLease, C.finLeaseC, C.finLeaseNC, at, tol); }

  var cash = cashAt(bEnd);
  if (cash == null) { cash = 0; caveats.push("Cash could not be read from the filings and is set to zero. Check the balance sheet."); }
  var borrowings = borrowAt(bEnd);
  if (!borrowings) { borrowings = 0; caveats.push("No borrowings were found in the filings, so debt is set to zero. Check the balance sheet for loans or bonds."); }
  var debt = borrowings;
  /* add lease obligations (office, store and equipment rent contracts) so debt matches the usual "total debt" */
  var leases = leasesAt(bEnd);
  if (leases > 0) {
    debt += leases;
    caveats.push("Debt includes " + (leases / 1e9).toFixed(1) + " billion dollars of lease obligations (rent contracts for offices, stores and equipment), in line with how stockanalysis.com reports total debt.");
  }

  /* shares: cover-page count, checked against the diluted weighted count */
  var dei = facts.facts && facts.facts.dei && facts.facts.dei.EntityCommonStockSharesOutstanding && facts.facts.dei.EntityCommonStockSharesOutstanding.units && facts.facts.dei.EntityCommonStockSharesOutstanding.units.shares;
  var deiNow = dei && dei.length ? dei.slice().sort(function (a, b) { return a.end < b.end ? 1 : (a.end > b.end ? -1 : (a.filed < b.filed ? 1 : -1)); })[0] : null;
  var dilNow = null; dil.forEach(function (f) { if (!dilNow || f.end > dilNow.end || (f.end === dilNow.end && days(f.start, f.end) > days(dilNow.start, dilNow.end))) dilNow = f; });
  var shares = deiNow ? deiNow.val : null;
  if (dilNow && (!shares || shares / dilNow.val < 0.6 || shares / dilNow.val > 1.6)) {
    if (shares) caveats.push("The share count on the filing cover (" + (shares / 1e6).toFixed(0) + "M) did not match the weighted diluted count (" + (dilNow.val / 1e6).toFixed(0) + "M), which can happen with several share classes. The diluted count was used.");
    shares = dilNow.val;
  }
  if (!shares) throw fail("The share count is missing in the SEC filings for " + t + ".");

  var price = px.meta.regularMarketPrice;
  if (!(price > 0)) throw fail("No share price was found for " + t + ".");
  var cur = String(px.meta.currency || "USD").toUpperCase();
  if (cur !== "USD") throw fail(t + " trades in " + cur + ", but its SEC filings are in US dollars. This free source cannot compare them. Use the manual entry form.");

  /* history: as-originally-reported annual figures matched to the price at each fiscal year end, adjusted for stock splits */
  var rA = annualMap(rev), eA = annualMap(eps), nA = annualMap(ni), dA = annualMap(dil);
  var ends = Object.keys(rA).sort().reverse().slice(0, 6);
  var fyRows = [], ratioRows = [];
  var cfA = annualMap(ocf);
  ends.forEach(function (end) {
    var sf = splitAfter(px.splits, end);
    var epsO = eA[end] ? eA[end].first.val : null, dilO = dA[end] ? dA[end].first.val : null;
    var epsAdj = epsO != null ? epsO / sf : null, dilAdj = dilO != null ? dilO * sf : null;
    var revO = rA[end].first.val;
    fyRows.push({ date: end, revenue: rA[end].last.val, epsDiluted: epsAdj != null ? epsAdj : undefined, reportedCurrency: "USD" });
    var bar = barAt(px.bars, end), eqO = instantFirstFiled(eqAll, end);
    if (!bar) return;
    var row = { date: end, fiscalYear: end.slice(0, 4), priceToEarningsRatio: epsAdj > 0 ? bar.close / epsAdj : NaN };
    if (dilAdj > 0) {
      var mc = bar.close * dilAdj;
      row.priceToSalesRatio = revO > 0 ? mc / revO : NaN;
      row.priceToBookRatio = eqO && eqO.val > 0 ? mc / eqO.val : NaN;
    }
    ratioRows.push(row);
  });
  ratioRows = ratioRows.slice(0, 5);
  /* the newest fiscal year takes the latest filed values for the income statement fields used as the base */
  var fyEnd = tRev.fyEnd;
  var fyTop = fyRows.length ? fyRows[0] : null;
  if (fyTop && fyTop.date === fyEnd) {
    fyTop.netIncome = nA[fyEnd] ? nA[fyEnd].last.val : undefined;
    if (eA[fyEnd]) fyTop.epsDiluted = eA[fyEnd].last.val / splitAfter(px.splits, fyEnd);
  }
  var recentSplit = px.splits.some(function (s) { return Date.now() - s.t < 400 * 864e5; });
  if (recentSplit) caveats.push("This stock split in the last year. Per-share history is adjusted for the split, but check the earnings per share and share count against another source.");

  var months = Math.max(0, days(tRev.fyEnd, tRev.end) / 30.44);
  var calWeight = Math.max(0.05, Math.min(1, 1 - months / 12));
  if (tRev.partial) caveats.push("The matching period from last year was missing in the filings, so the last full fiscal year (" + tRev.fyEnd + ") is used instead of the latest twelve months.");

  var b = null;
  if (mkt) { b = beta(px, mkt); }
  var betaUse = b == null ? 1 : Math.max(0.5, Math.min(2, b));
  caveats.push(b == null ? "Beta (how much the stock moves with the market) could not be calculated, so 1.0 is used." : "Beta of " + betaUse.toFixed(2) + " was calculated from the last 5 years of monthly price moves against the S&P 500" + (betaUse !== b ? " (capped between 0.5 and 2.0)." : "."));
  caveats.push("Data comes from SEC filings (financials) and Yahoo Finance (prices). The multiples history is rebuilt from each year's filing and the share price at that year's end, so it can differ a little from sites like stockanalysis.com. Net income may include one-off gains or losses that are not removed.");

  var ttmDate = tRev.end;
  var R = {
    quote: [{ price: price, marketCap: price * shares }],
    profile: [{ companyName: sub.name || co.title, exchange: (sub.exchanges && sub.exchanges[0]) || px.meta.exchangeName || "", sector: sub.sicDescription || "", industry: sub.sicDescription || "", beta: betaUse, currency: "USD" }],
    balance: [{ totalStockholdersEquity: eq.val, cashAndShortTermInvestments: cash, totalDebt: debt }],
    incomeTTM: [{ date: ttmDate, reportedCurrency: "USD", revenue: tRev.value, netIncome: tNi.value, incomeBeforeTax: tTax ? tNi.value + tTax.value : (tPre ? tPre.value : undefined), incomeTaxExpense: tTax ? tTax.value : undefined, epsDiluted: tEps ? tEps.value / splitAfter(px.splits, tEps.end) * 1 : undefined, weightedAverageShsOutDil: dilNow ? dilNow.val : shares }],
    cashTTM: [{ operatingCashFlow: tOcf.value, capitalExpenditure: -((tCap ? tCap.value : 0) + (tSoft ? tSoft.value : 0)) }],
    ratios: ratioRows,
    incomeFY: fyRows,
    cashFY: Object.keys(rA).sort().reverse().slice(0, 5).map(function (end) {
      var cA = annualMap(capex)[end], sA = annualMap(soft)[end];
      return cA ? { date: end, capitalExpenditure: -((cA.last.val) + (sA ? sA.last.val : 0)) } : null;
    }).filter(Boolean),
    estimates: [],
    fx: 1,
    calWeight: calWeight,
    estNote: "Analyst estimates are not available from the free data source.",
    extraCaveats: caveats
  };
  /* the TTM EPS mixes filings from different dates, so for a recent split use net income over diluted shares instead */
  if (!(R.incomeTTM[0].epsDiluted > 0) || recentSplit) { if (dilNow && tNi.value) R.incomeTTM[0].epsDiluted = tNi.value / dilNow.val; }
  var inp = LiveData.map(t, R, today);
  inp.source = "SEC filings + Yahoo Finance";
  inp.industry = sub.sicDescription || "";
  try {
    inp.quality = qualityData(us, tRev, bEnd, rA, fyRows, ocf, capex, soft);
    var recv = inst(C.recv), dr = inst(C.defRev);
    if (recv != null) inp.quality.quickAssets = (cash + recv) / 1e6;
    inp.quality.leases = leases / 1e6;
    inp.quality.taxRate = inp.ttm.tax;
    /* the same balance sheet one year earlier, so ROE and ROIC can use averages (the standard method) */
    var yAgo = new Date(Date.parse(bEnd) - 365 * 864e5).toISOString().slice(0, 10);
    var eqPrev = instantAt(eqAll, yAgo, 45), bPrev = borrowAt(yAgo, 45), cPrev = cashAt(yAgo, 45), bNote = null;
    /* some quarterly filings do not tag debt; fall back to the nearest balance sheet within about six months */
    if (bPrev == null) { bPrev = borrowAt(yAgo, 200, true); if (bPrev != null) bNote = "nearest available filing"; }
    if (eqPrev) inp.quality.prev = { equity: eqPrev.val / 1e6, borrowings: bPrev == null ? null : bPrev / 1e6, cash: cPrev == null ? null : cPrev / 1e6, date: eqPrev.end, borrowNote: bNote };
    if (dr != null) inp.quality.deferredRev = dr / 1e6;
  } catch (e) { inp.quality = null; }
  return inp;
}

function load(input) {
  var today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return resolve(input).then(function (co) {
    var cik = String(co.cik).padStart(10, "0"), t = co.ticker.replace(/-/g, "-");
    var yt = co.ticker; /* Yahoo uses the same dash style, for example BRK-B */
    return Promise.all([
      getJSON(SEC + "api/xbrl/companyfacts/CIK" + cik + ".json", UA, "the SEC filings database"),
      getJSON(SEC + "submissions/CIK" + cik + ".json", UA, "the SEC filings database").catch(function () { return {}; }),
      yahoo(yt, "10y"),
      yahoo("^GSPC", "10y").catch(function () { return null; })
    ]).then(function (r) { return build(co.ticker, co, r[0], r[1] || {}, r[2], r[3], today); });
  });
}

/* raw downloads for one company, used by backtest.js */
function rawCompany(co) {
  var cik = String(co.cik).padStart(10, "0");
  return Promise.all([
    getJSON(SEC + "api/xbrl/companyfacts/CIK" + cik + ".json", UA, "the SEC filings database"),
    getJSON(SEC + "submissions/CIK" + cik + ".json", UA, "the SEC filings database").catch(function () { return {}; })
  ]).then(function (r) { return { facts: r[0], sub: r[1] || {} }; });
}

module.exports = { load: load, quote: quote, rawCompany: rawCompany, yahoo: yahoo, _concepts: C, resolve: resolve, search: search, tickerList: tickerList, _setTickers: _setTickers, _build: build, _ttm: ttm, _collect: collect };
