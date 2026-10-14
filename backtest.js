/* Plumbline backtest: how would Plumbline's calls have done in the past?

   Run it on your own computer (Node 18+), in the Plumbline folder:
       node backtest.js
   Options (all optional):
       --from 2016 --to 2025      first and last test year
       --month 4                  test date is the 1st of this month each year (4 = 1 April)
       --hold 12                  months to hold each stock after the call
       --tickers AAPL,MSFT,NVDA   use your own list instead of the default 54 stocks
       --top 500                  use the 500 largest US-listed companies in the SEC list instead
       --freq quarterly           test on 1 Jan, Apr, Jul and Oct each year (4x more valuations; holding periods overlap)
       --fresh                    ignore saved downloads and fetch everything again

   For every stock and every test date it:
     1. hides every SEC filing submitted after that date (only facts an investor could have seen),
     2. uses the share price on that date (with later stock splits undone, so it matches the share count),
     3. measures beta over the 5 years before the date and uses the 10-year Treasury yield of that date,
     4. runs the same nine methods as the website and records the verdict,
     5. measures the stock's total return (with dividends) over the next 12 months against SPY (S&P 500).

   Results go to the backtest-output folder: results.csv (every call, opens in Excel), summary.txt and results.json.
   Downloads are saved in backtest-cache, so a second run is fast. */
"use strict";
var fs = require("fs"), path = require("path");
try { fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach(function (l) { var m = l.match(/^\s*SEC_CONTACT\s*=\s*(.+?)\s*$/); if (m && !process.env.SEC_CONTACT) process.env.SEC_CONTACT = m[1].replace(/^["']|["']$/g, ""); }); } catch (e) {}
var Edgar = require("./edgar.js"), IV = require("./engine.js"), QS = require("./quality.js");

/* ---------- settings ---------- */
var DEFAULT_TICKERS = ("AAPL MSFT NVDA GOOGL AMZN META AVGO TSLA ORCL CSCO ADBE CRM INTC AMD QCOM TXN IBM NFLX INTU AMAT MU LRCX " +
  "KO PEP PG WMT COST HD LOW MCD SBUX NKE DIS CMCSA VZ T JNJ PFE MRK ABBV LLY UNH AMGN TMO ABT XOM CVX CAT HON UNP BA LMT UPS MMM").split(" ");
function arg(name, def) { var i = process.argv.indexOf("--" + name); return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf("--") !== 0 ? process.argv[i + 1] : def; }
var FROM = +arg("from", 2016), TO = +arg("to", 2025), MONTH = +arg("month", 4), HOLD = +arg("hold", 12);
var TICKERS = arg("tickers", null) ? arg("tickers").toUpperCase().split(/[,\s]+/).filter(Boolean) : DEFAULT_TICKERS;
var TOP = +arg("top", 0), FREQ = String(arg("freq", "annual")).toLowerCase();
var MONTHS = FREQ.indexOf("q") === 0 ? [1, 4, 7, 10] : [MONTH];
var FRESH = process.argv.indexOf("--fresh") > 0;
var CACHE = path.join(__dirname, "backtest-cache"), OUT = path.join(__dirname, "backtest-output");
[CACHE, OUT].forEach(function (d) { if (!fs.existsSync(d)) fs.mkdirSync(d); });
if (!process.env.SEC_CONTACT) console.log("Note: no SEC_CONTACT found in .env. The SEC may refuse requests without it.");

/* ---------- helpers ---------- */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cached(name, fn) {
  var f = path.join(CACHE, name.replace(/[^A-Za-z0-9_.\-]/g, "_") + ".json");
  if (!FRESH && fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8")));
  return fn().then(function (d) { fs.writeFileSync(f, JSON.stringify(d)); return d; });
}
function iso(d) { return d.toISOString().slice(0, 10); }
function addMonths(d, m) { var x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + m); return x; }
/* month-end price: the last monthly bar that starts before the date (its close is the last close before the date) */
function barBefore(bars, date) {
  var best = null, t = date.getTime();
  bars.forEach(function (b) { if (b.t < t && (!best || b.t > best.t)) best = b; });
  return best && t - best.t <= 45 * 864e5 ? best : null;
}
/* company facts as they stood on a date: only facts filed on or before it */
function factsAsOf(facts, dateISO) {
  var out = { cik: facts.cik, entityName: facts.entityName, facts: {} };
  Object.keys(facts.facts || {}).forEach(function (tax) {
    out.facts[tax] = {};
    Object.keys(facts.facts[tax]).forEach(function (concept) {
      var c = facts.facts[tax][concept], units = {};
      Object.keys(c.units || {}).forEach(function (u) {
        var arr = c.units[u].filter(function (f) { return f.filed && f.filed <= dateISO; });
        if (arr.length) units[u] = arr;
      });
      if (Object.keys(units).length) out.facts[tax][concept] = { units: units };
    });
  });
  return out;
}
/* price history as it looked on a date: bars before it, in that day's share terms (later splits undone) */
function pricesAsOf(px, date) {
  var t = date.getTime(), later = 1;
  px.splits.forEach(function (s) { if (s.t > t) later *= s.f; });
  var bars = px.bars.filter(function (b) { return b.t < t; }).map(function (b) { return { t: b.t, close: b.close * later, adj: b.adj }; });
  var last = bars[bars.length - 1];
  var meta = Object.assign({}, px.meta, { regularMarketPrice: last ? last.close : null });
  return { meta: meta, bars: bars, splits: px.splits.filter(function (s) { return s.t <= t; }) };
}
/* Daily prices from Yahoo, turned into clean month-end bars (one per calendar month, dated the 1st).
   Asking Yahoo for monthly bars over the "max" range can return irregular dates, which left many returns blank. */
var YF = process.env.YAHOO_BASE || "https://query1.finance.yahoo.com/";
function yahooDaily(sym) {
  var url = YF + "v8/finance/chart/" + encodeURIComponent(sym) + "?period1=1104537600&period2=" + Math.floor(Date.now() / 1000) + "&interval=1d&events=split";
  return fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json" } }).then(function (r) {
    if (!r.ok) throw new Error("Yahoo price data returned an error (" + r.status + ") for " + sym);
    return r.json();
  }).then(function (j) {
    var r = j && j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) throw new Error("no price data for " + sym);
    var q = r.indicators.quote[0].close, a = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose, months = {}, order = [];
    r.timestamp.forEach(function (ts, i) {
      if (q[i] == null) return;
      var d = new Date(ts * 1000), k = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      if (!months[k]) { months[k] = {}; order.push(k); }
      months[k].close = q[i]; months[k].adj = a && a[i] != null ? a[i] : q[i];
    });
    var bars = order.map(function (k) { return { t: k, close: months[k].close, adj: months[k].adj }; });
    var splits = [];
    if (r.events && r.events.splits) Object.keys(r.events.splits).forEach(function (k) { var x = r.events.splits[k]; if (x.numerator > 0 && x.denominator > 0) splits.push({ t: x.date * 1000, f: x.numerator / x.denominator }); });
    return { meta: Object.assign({}, r.meta || {}, { currency: (r.meta && r.meta.currency) || "USD" }), bars: bars, splits: splits };
  });
}
function rank(a) { var idx = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; }), r = new Array(a.length); idx.forEach(function (p, k) { r[p[1]] = k; }); return r; }
function corr(x, y) { var n = x.length; if (n < 3) return NaN; var mx = mean(x), my = mean(y), c = 0, vx = 0, vy = 0; for (var i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) * (x[i] - mx); vy += (y[i] - my) * (y[i] - my); } return vx && vy ? c / Math.sqrt(vx * vy) : NaN; }
/* keep only the figures the model reads, so 500 companies take megabytes instead of gigabytes */
var KEEP = {}; Object.keys(Edgar._concepts).forEach(function (k) { Edgar._concepts[k].forEach(function (n) { KEEP[n] = 1; }); });
["LongTermDebtCurrent", "DebtCurrent", "AccountsReceivableNetCurrent", "ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"].forEach(function (n) { KEEP[n] = 1; });
function slim(raw) {
  var f = raw.facts || {}, ug = (f.facts && f.facts["us-gaap"]) || {}, out = {};
  Object.keys(ug).forEach(function (n) { if (KEEP[n]) out[n] = ug[n]; });
  var dei = f.facts && f.facts.dei && f.facts.dei.EntityCommonStockSharesOutstanding;
  var sub = raw.sub || {};
  return { facts: { cik: f.cik, entityName: f.entityName, facts: { "us-gaap": out, dei: dei ? { EntityCommonStockSharesOutstanding: dei } : {} } },
    sub: { name: sub.name, exchanges: sub.exchanges, sicDescription: sub.sicDescription, sic: sub.sic } };
}
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
function median(a) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function pct(v, d) { return isFinite(v) ? (v >= 0 ? "+" : "") + (v * 100).toFixed(d == null ? 1 : d) + "%" : "n/a"; }
function pad(s, n, right) { s = String(s); return right ? (s + " ".repeat(n)).slice(0, n) : (" ".repeat(n) + s).slice(-n); }
function csvCell(v) { var s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/* ---------- main ---------- */
async function main() {
  var dates = []; for (var y = FROM; y <= TO; y++) MONTHS.forEach(function (mo) { dates.push(new Date(Date.UTC(y, mo - 1, 1))); });
  if (TOP > 0) {
    /* the largest companies first, as ordered in the SEC list; one ticker per company */
    var seenName = {}, list = await Edgar.tickerList();
    TICKERS = [];
    list.forEach(function (r) { var nm = String(r[1]).toLowerCase(); if (TICKERS.length < TOP && !seenName[nm] && /^[A-Z][A-Z.\-]{0,5}$/.test(r[0])) { seenName[nm] = 1; TICKERS.push(r[0]); } });
  }
  var t0 = Date.now();
  console.log("Plumbline backtest: " + TICKERS.length + " stocks x " + dates.length + " dates (" + iso(dates[0]) + " to " + iso(dates[dates.length - 1]) + "), holding " + HOLD + " months.\n");
  var spy = await cached("yd_SPY", function () { return yahooDaily("SPY"); });
  var gspc = await cached("yd_GSPC", function () { return yahooDaily("^GSPC"); });
  var tnx = await cached("yd_TNX", function () { return yahooDaily("^TNX"); }).catch(function () { return null; });
  var rows = [], now = Date.now();

  for (var i = 0; i < TICKERS.length; i++) {
    var t = TICKERS[i];
    process.stdout.write(pad("[" + (i + 1) + "/" + TICKERS.length + "] ", 10, true) + pad(t, 7, true));
    var co, raw, px;
    try {
      co = await Edgar.resolve(t);
      raw = await cached("sec2_" + co.ticker, function () {
        var old = path.join(CACHE, "sec_" + co.ticker.replace(/[^A-Za-z0-9_.\-]/g, "_") + ".json");
        var get = !FRESH && fs.existsSync(old) ? Promise.resolve(JSON.parse(fs.readFileSync(old, "utf8"))) : Edgar.rawCompany(co);
        return get.then(slim);
      });
      px = await cached("yd_" + co.ticker, function () { return yahooDaily(co.ticker); });
    } catch (e) { console.log("skipped: " + e.message); rows.push({ date: "", ticker: t, note: "download failed: " + e.message }); continue; }
    var ok = 0;
    for (var k = 0; k < dates.length; k++) {
      var D = dates[k], dISO = iso(D), row = { date: dISO, ticker: co.ticker, name: co.title };
      try {
        var f = factsAsOf(raw.facts, dISO), p = pricesAsOf(px, D), m = pricesAsOf(gspc, D);
        if (!(p.meta.regularMarketPrice > 0)) throw new Error("no share price on this date (not yet listed?)");
        var label = D.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
        var inp = Edgar._build(co.ticker, co, f, raw.sub, p, m, label);
        var s = Object.assign(IV.defaultSettings(inp), inp.settings || {});
        var tb = tnx && barBefore(tnx.bars, D);
        if (tb && tb.close > 0.05 && tb.close < 15) s.rf = tb.close / 100; else row.note = "10-year yield not found, 5% used";
        var r = IV.compute(inp, s);
        if (!r.stats.n) throw new Error("none of the nine methods could be calculated");
        row.price = inp.price; row.value = r.stats.median; row.upside = r.stats.upside; row.verdict = r.stats.verdict;
        row.methods = r.stats.n; row.beta = s.beta; row.rf = s.rf; row.financialsTo = inp.ttmEnd;
        row.m = {}; r.methods.forEach(function (mm) { if (isFinite(mm.value) && mm.value != null) row.m[mm.short] = mm.upside; });
        try { var q = QS.compute(inp); if (q.ok) { row.grade = q.grade; row.score = q.score; } } catch (e) {}
        /* what happened next: total return (adjusted close includes dividends) over the holding period */
        var D2 = addMonths(D, HOLD);
        if (D2.getTime() > now - 3 * 864e5) row.note = (row.note ? row.note + "; " : "") + "holding period not finished yet";
        else {
          var a0 = barBefore(px.bars, D), a1 = barBefore(px.bars, D2), s0 = barBefore(spy.bars, D), s1 = barBefore(spy.bars, D2);
          if (a0 && a1 && s0 && s1) { row.ret = a1.adj / a0.adj - 1; row.spy = s1.adj / s0.adj - 1; row.excess = row.ret - row.spy; row.beat = row.excess > 0 ? "yes" : "no"; }
          else row.note = (row.note ? row.note + "; " : "") + "no price at the end of the holding period (delisted or merged?)";
        }
        ok++;
      } catch (e) { row.note = "skipped: " + e.message; }
      rows.push(row);
    }
    var el = (Date.now() - t0) / 1000, left = el / (i + 1) * (TICKERS.length - i - 1);
    console.log(ok + " of " + dates.length + " dates valued" + (TICKERS.length > 20 ? "   (about " + Math.ceil(left / 60) + " min left)" : ""));
    await sleep(150);
  }

  /* ---------- write every call ---------- */
  var MN = ["DCF-20", "DFCF-20", "DNI-20", "DFCF-Terminal", "Mean P/S", "Mean P/E", "Mean P/B", "PSG", "PEG"];
  rows.forEach(function (r) { MN.forEach(function (n) { r["m_" + n] = r.m && r.m[n] != null ? r.m[n] : null; }); });
  var cols = ["date", "ticker", "name", "price", "value", "upside", "verdict", "grade", "score", "ret", "spy", "excess", "beat", "methods", "beta", "rf", "financialsTo", "note"].concat(MN.map(function (n) { return "m_" + n; }));
  var head = ["Test date", "Ticker", "Company", "Price", "Intrinsic value", "Upside", "Verdict", "Quality grade", "Quality score", HOLD + "m stock return", HOLD + "m SPY return", "Excess return", "Beat SPY", "Methods used", "Beta", "Risk-free rate", "Financials to", "Notes"].concat(MN.map(function (n) { return n + " upside"; }));
  var fmt = function (c, v) { if (v == null || v === "") return ""; if (["upside", "ret", "spy", "excess", "rf"].indexOf(c) >= 0 || c.indexOf("m_") === 0) return (v * 100).toFixed(2) + "%"; if (c === "score") return v.toFixed(0); if (c === "price" || c === "value") return v.toFixed(2); if (c === "beta") return v.toFixed(2); return v; };
  fs.writeFileSync(path.join(OUT, "results.csv"), [head.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(fmt(c, r[c])); }).join(","); })).join("\n"));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ settings: { from: FROM, to: TO, month: MONTH, hold: HOLD, tickers: TICKERS, buy: 0.2, sell: -0.2 }, generated: new Date().toISOString(), rows: rows }, null, 1));

  /* ---------- summary ---------- */
  var done = rows.filter(function (r) { return r.verdict && isFinite(r.excess); });
  var L = [];
  L.push("PLUMBLINE BACKTEST SUMMARY");
  L.push("Generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
  L.push("Stocks: " + TICKERS.length + (TOP ? " (largest US-listed companies today)" : "") + " | Test dates: 1 " + MONTHS.map(function (mo) { return new Date(Date.UTC(2000, mo - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }); }).join(", ") + ", " + FROM + " to " + TO + " | Holding period: " + HOLD + " months | Benchmark: SPY (S&P 500, dividends included)");
  L.push("Valuations made: " + rows.filter(function (r) { return r.verdict; }).length + " | With a finished holding period: " + done.length);
  L.push("");
  L.push("1) RESULTS BY VERDICT (BUY at +20% upside or more, SELL at -20% or worse)");
  L.push(pad("Verdict", 9, true) + pad("Calls", 7) + pad("Avg return", 12) + pad("Avg vs SPY", 12) + pad("Median vs SPY", 15) + pad("% beat SPY", 12));
  var groups = { BUY: [], HOLD: [], SELL: [] }; done.forEach(function (r) { groups[r.verdict].push(r); });
  ["BUY", "HOLD", "SELL"].forEach(function (v) {
    var g = groups[v], ex = g.map(function (r) { return r.excess; });
    L.push(pad(v, 9, true) + pad(g.length, 7) + pad(pct(mean(g.map(function (r) { return r.ret; }))), 12) + pad(pct(mean(ex)), 12) + pad(pct(median(ex)), 15) + pad(g.length ? (g.filter(function (r) { return r.excess > 0; }).length / g.length * 100).toFixed(0) + "%" : "n/a", 12));
  });
  var all = done.map(function (r) { return r.excess; });
  L.push(pad("All", 9, true) + pad(done.length, 7) + pad(pct(mean(done.map(function (r) { return r.ret; }))), 12) + pad(pct(mean(all)), 12) + pad(pct(median(all)), 15) + pad(done.length ? (done.filter(function (r) { return r.excess > 0; }).length / done.length * 100).toFixed(0) + "%" : "n/a", 12));
  var spread = mean(groups.BUY.map(function (r) { return r.excess; })) - mean(groups.SELL.map(function (r) { return r.excess; }));
  L.push("BUY minus SELL (average yearly gap): " + pct(spread));
  L.push("BUY minus ALL stocks in the list: " + pct(mean(groups.BUY.map(function (r) { return r.excess; })) - mean(all)) + "   <- the fairest test: it removes the boost from only testing companies that survived.");
  L.push("");

  L.push("2) YEAR BY YEAR (average return vs SPY)");
  L.push(pad("Year", 6, true) + pad("BUY", 6) + pad("BUY vs SPY", 12) + pad("SELL", 6) + pad("SELL vs SPY", 13) + pad("All vs SPY", 12) + pad("BUY - SELL", 12));
  var byYear = {}; done.forEach(function (r) { (byYear[r.date.slice(0, 4)] = byYear[r.date.slice(0, 4)] || []).push(r); });
  var byDate = {}; done.forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
  Object.keys(byYear).sort().forEach(function (yr) {
    var g = byYear[yr], b = g.filter(function (r) { return r.verdict === "BUY"; }), s2 = g.filter(function (r) { return r.verdict === "SELL"; });
    var be = mean(b.map(function (r) { return r.excess; })), se = mean(s2.map(function (r) { return r.excess; }));
    L.push(pad(yr, 6, true) + pad(b.length, 6) + pad(pct(be), 12) + pad(s2.length, 6) + pad(pct(se), 13) + pad(pct(mean(g.map(function (r) { return r.excess; }))), 12) + pad(pct(be - se), 12));
  });
  L.push("");

  L.push("3) GROWTH OF $10,000 (equal amounts in each stock, rebalanced once a year on 1 " + new Date(Date.UTC(2000, (MONTHS.indexOf(MONTH) >= 0 ? MONTH : MONTHS[0]) - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) + ")");
  var pv = { BUY: 10000, SELL: 10000, ALL: 10000, SPY: 10000 }, mainMonth = MONTHS.indexOf(MONTH) >= 0 ? MONTH : MONTHS[0];
  Object.keys(byDate).sort().filter(function (d) { return +d.slice(5, 7) === mainMonth; }).forEach(function (dk) {
    var g = byDate[dk];
    var r = function (list) { return list.length ? mean(list.map(function (x) { return x.ret; })) : 0; };
    pv.BUY *= 1 + r(g.filter(function (x) { return x.verdict === "BUY"; }));
    pv.SELL *= 1 + r(g.filter(function (x) { return x.verdict === "SELL"; }));
    pv.ALL *= 1 + r(g); pv.SPY *= 1 + g[0].spy;
  });
  L.push("  BUY stocks:  $" + Math.round(pv.BUY).toLocaleString("en-US"));
  L.push("  SELL stocks: $" + Math.round(pv.SELL).toLocaleString("en-US"));
  L.push("  All stocks:  $" + Math.round(pv.ALL).toLocaleString("en-US"));
  L.push("  SPY:         $" + Math.round(pv.SPY).toLocaleString("en-US"));
  L.push("  (A year with no BUY or SELL stocks is counted as cash at 0%. No trading costs or taxes.)");
  L.push("");

  L.push("4) DOES MORE UPSIDE MEAN BETTER RETURNS? (each test date's calls split into five equal groups by upside)");
  var qs = [[], [], [], [], []];
  Object.keys(byDate).forEach(function (dk) {
    var g = byDate[dk].slice().sort(function (a, b) { return a.upside - b.upside; });
    g.forEach(function (r, i) { qs[Math.min(4, Math.floor(i / g.length * 5))].push(r); });
  });
  ["Lowest upside (most overvalued)", "Low", "Middle", "High", "Highest upside (most undervalued)"].forEach(function (n, i) {
    L.push("  " + pad(n, 36, true) + pad(qs[i].length + " calls", 10) + "   avg vs SPY " + pct(mean(qs[i].map(function (r) { return r.excess; }))));
  });
  L.push("  A model with real skill shows returns rising from the top row to the bottom row.");
  L.push("");

  L.push("5) DO THE RESULTS DEPEND ON THE +/-20% LINES? (same valuations, different lines)");
  [0.1, 0.15, 0.2, 0.25, 0.3].forEach(function (th) {
    var b = done.filter(function (r) { return r.upside >= th; }), s2 = done.filter(function (r) { return r.upside <= -th; });
    L.push("  +/-" + pad((th * 100).toFixed(0) + "%", 4, true) + "  BUY " + pad(b.length, 4) + " calls " + pad(pct(mean(b.map(function (r) { return r.excess; }))), 8) + " vs SPY   |   SELL " + pad(s2.length, 4) + " calls " + pad(pct(mean(s2.map(function (r) { return r.excess; }))), 8) + " vs SPY");
  });
  L.push("");

  L.push("6) DOES THE BUSINESS QUALITY GRADE PREDICT RETURNS?");
  ["A", "B", "C", "D", "F"].forEach(function (g) {
    var list = done.filter(function (r) { return r.grade === g; }), ex = list.map(function (r) { return r.excess; });
    L.push("  Grade " + g + "  " + pad(list.length, 4) + " calls   avg vs SPY " + pad(pct(mean(ex)), 8) + "   median vs SPY " + pad(pct(median(ex)), 8) + "   beat SPY " + (list.length ? (list.filter(function (r) { return r.excess > 0; }).length / list.length * 100).toFixed(0) + "%" : "n/a"));
  });
  var combo = done.filter(function (r) { return r.verdict === "BUY" && (r.grade === "A" || r.grade === "B"); });
  L.push("  BUY and grade A/B: " + combo.length + " calls, avg vs SPY " + pct(mean(combo.map(function (r) { return r.excess; }))) + ", median " + pct(median(combo.map(function (r) { return r.excess; }))));
  L.push("");
  L.push("7) EACH METHOD ON ITS OWN (rank correlation between the method's upside and the next 12 months vs SPY, averaged over the test dates)");
  L.push("  Above 0 = more upside tended to mean better returns. Around 0 = no signal. Below 0 = the opposite. Values beyond +/-0.10 are worth noticing.");
  MN.forEach(function (n) {
    var ics = [];
    Object.keys(byDate).forEach(function (dk) {
      var g = byDate[dk].filter(function (r) { return r["m_" + n] != null; });
      if (g.length >= 8) ics.push(corr(rank(g.map(function (r) { return r["m_" + n]; })), rank(g.map(function (r) { return r.excess; }))));
    });
    var pos = ics.filter(function (v) { return v > 0; }).length;
    L.push("  " + pad(n, 18, true) + " average " + pad(isFinite(mean(ics)) ? (mean(ics) >= 0 ? "+" : "") + mean(ics).toFixed(2) : "n/a", 6) + "   positive on " + pos + " of " + ics.length + " test dates");
  });
  var icsAll = [];
  Object.keys(byDate).forEach(function (dk) { var g = byDate[dk]; if (g.length >= 8) icsAll.push(corr(rank(g.map(function (r) { return r.upside; })), rank(g.map(function (r) { return r.excess; })))); });
  L.push("  " + pad("Median (headline)", 18, true) + " average " + pad(isFinite(mean(icsAll)) ? (mean(icsAll) >= 0 ? "+" : "") + mean(icsAll).toFixed(2) : "n/a", 6) + "   positive on " + icsAll.filter(function (v) { return v > 0; }).length + " of " + icsAll.length + " test dates");
  L.push("");
  L.push("8) WHY SOME STOCK-DATES HAVE NO RESULT");
  var why = {}; rows.forEach(function (r) { if (r.note && !(r.verdict && isFinite(r.excess) && !/skipped|failed|no price/.test(r.note))) { var k = r.note.replace(/[0-9.$,]+/g, "#").slice(0, 90); why[k] = (why[k] || 0) + 1; } });
  var wk = Object.keys(why).sort(function (a, b) { return why[b] - why[a]; });
  if (!wk.length) L.push("  None."); else wk.slice(0, 12).forEach(function (k) { L.push("  " + pad(why[k], 4) + "  " + k); });
  L.push("");

  L.push("LIMITS (state these whenever you share the results)");
  L.push("- Backtested, not real trading. Past results do not guarantee future results.");
  L.push("- Survivorship bias: the stock list is today's large companies, which all survived. Compare BUY with ALL stocks, not only with SPY.");
  L.push("- No past analyst forecasts: growth comes from each company's own past results, as on the free live site.");
  L.push("- Monthly prices: the price used is the last close of the month before the test date.");
  if (MONTHS.length > 1) L.push("- Quarterly test dates: 12-month holding periods overlap, so the calls are not all independent. Treat the extra calls as more detail, not 4x more proof.");
  if (TOP) L.push("- The list is today's largest companies, chosen with hindsight. That flatters every group, so judge BUY against ALL stocks.");
  L.push("- No trading costs, taxes or currency effects.");
  var skipped = rows.filter(function (r) { return r.note && /skipped|failed/.test(r.note); }).length;
  L.push("- " + skipped + " stock-dates could not be valued (see the Notes column in results.csv).");
  var text = L.join("\n");
  fs.writeFileSync(path.join(OUT, "summary.txt"), text);
  console.log("\n" + text + "\n\nSaved: backtest-output/results.csv, summary.txt and results.json");
}

main().catch(function (e) { console.log("\nBacktest stopped: " + (e && e.message || e)); process.exitCode = 1; });
