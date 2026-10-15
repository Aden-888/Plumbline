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
       --banks                    use a ready list of 32 US banks, brokers and insurers instead
       --fresh-test 500           the 500 largest US companies in the SEC list, SKIPPING every company in the four lists
                                  above, so results come from companies never used to make a decision
       --bank-holdout             use a second list of 36 banks, brokers, lenders and insurers (none in the --banks list)
       --holdout                  use a second list of 50 other large US companies (none in the default list), to check
                                  that a finding from the default list also holds on stocks it was not drawn from
       --out NAME                 save results in backtest-output-NAME (banks go to backtest-output-banks by default)
       --floor 0.08               minimum cost of equity for every company (0 = no minimum)
       --gcap 0                   turn off the cap that keeps long-run growth at or below the risk-free rate
       --lifecycle 0              turn off the v3.8 life-cycle rules (cycle-average margins for cyclicals, beta of 1
                                  in the terminal value for growth companies), to compare against them
       --fresh                    ignore saved downloads and fetch everything again

   For every stock and every test date it:
     1. hides every SEC filing submitted after that date (only facts an investor could have seen),
     2. uses the share price on that date (with later stock splits undone, so it matches the share count),
     3. measures beta over the 5 years before the date and uses the 10-year Treasury yield of that date,
     4. runs the same methods as the website (nine, or seven for banks and insurers) and records the verdict,
     5. measures the stock's total return (with dividends) over the next 12 months against SPY (S&P 500).

   v2.8: every call is also valued four ways (median, simple average, trimmed mean, and the median of the
   intrinsic methods only), and section 6 of the summary compares them on the same calls.

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
var BANK_TICKERS = ("JPM BAC WFC C USB PNC TFC MTB FITB HBAN RF KEY CFG BK STT SCHW GS MS COF AXP " +
  "TRV CB ALL PGR AIG HIG CINF MET PRU AFL L BRK-B").split(" ");
/* accepts --banks, -banks, --bank or just "banks" */
var BANKS = process.argv.slice(2).some(function (a) { return /^-{0,2}banks?$/i.test(a); });
var HOLDOUT_TICKERS = ("ACN ADP BKNG CL GIS HSY KMB MDLZ MO PM SYY TGT TJX ROST YUM CMG DE ETN EMR GD GE ITW NOC RTX WM " +
  "FDX CSX NSC DHR BMY GILD MDT SYK ISRG ZTS VRTX REGN BDX CI CVS ADI KLAC NXPI ADSK CDNS SNPS ANET EBAY EA COP").split(" ");
var HOLDOUT = process.argv.slice(2).some(function (a) { return /^-{0,2}holdout$/i.test(a); });
var BANK_HOLDOUT_TICKERS = ("ZION CMA FHN WAL EWBC WBS SNV CFR PB ONB FNB WTFC VLY BPOP CBSH NTRS RJF SF IBKR SYF ALLY SLM " +
  "AFG ACGL WRB MKL EG RLI SIGI ORI UNM GL LNC PFG VOYA AIZ").split(" ");
var BANK_HOLDOUT = process.argv.slice(2).some(function (a) { return /^-{0,2}bank-?holdout$/i.test(a); });
var FRESH_N = process.argv.indexOf("--fresh-test") > 0 ? (+arg("fresh-test", 500) || 500) : 0;
var USED = {}; DEFAULT_TICKERS.concat(BANK_TICKERS, HOLDOUT_TICKERS, BANK_HOLDOUT_TICKERS).forEach(function (t) { USED[t] = 1; });
var TICKERS = arg("tickers", null) ? arg("tickers").toUpperCase().split(/[,\s]+/).filter(Boolean) : BANK_HOLDOUT ? BANK_HOLDOUT_TICKERS : BANKS ? BANK_TICKERS : HOLDOUT ? HOLDOUT_TICKERS : DEFAULT_TICKERS;
/* the four ways of turning the method values into one intrinsic value (v3.2) */
var INTRINSIC = { dcf20: 1, dfcf20: 1, dni20: 1, dfcft: 1, ddm: 1, fcfe: 1, excess: 1, jpb: 1 };
var WAYS = [
  { id: "med", name: "Median of all methods (current)" },
  { id: "avg", name: "Simple average of all methods" },
  { id: "trim", name: "Trimmed mean (drop highest and lowest)" },
  { id: "intr", name: "Median of intrinsic methods only" }
];
function combine(r) {
  var ok = function (m) { return typeof m.value === "number" && isFinite(m.value); };
  var all = r.methods.filter(ok).map(function (m) { return m.value; });
  var intr = r.methods.filter(function (m) { return ok(m) && INTRINSIC[m.id]; }).map(function (m) { return m.value; });
  return { med: r.stats.median, avg: r.stats.mean, trim: r.stats.trimmed, intr: intr.length ? median(intr) : NaN, nIntr: intr.length, nAll: all.length };
}
/* rank correlation (Spearman) between two lists: +1 = same order, 0 = no link, -1 = opposite order */
function ranks(a) { var idx = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; }), r = new Array(a.length), i = 0; while (i < idx.length) { var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (var k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; }
function spearman(x, y) { if (x.length < 3) return NaN; var rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry), c = 0, vx = 0, vy = 0; for (var i = 0; i < x.length; i++) { c += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) * (rx[i] - mx); vy += (ry[i] - my) * (ry[i] - my); } return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : NaN; }
var TOP = +arg("top", 0), FREQ = String(arg("freq", "annual")).toLowerCase();
var MONTHS = FREQ.indexOf("q") === 0 ? [1, 4, 7, 10] : [MONTH];
var FRESH = process.argv.indexOf("--fresh") > 0;
/* each run gets its own results folder: backtest-output (default list), backtest-output-banks, or --out NAME */
var OUT_NAME = arg("out", null) ? "backtest-output-" + String(arg("out")).replace(/[^A-Za-z0-9_-]/g, "") : FRESH_N ? "backtest-output-fresh" : arg("out", null) ? "backtest-output-" + String(arg("out")).replace(/[^A-Za-z0-9_-]/g, "") : BANK_HOLDOUT ? "backtest-output-bank-holdout" : BANKS ? "backtest-output-banks" : HOLDOUT ? "backtest-output-holdout" : arg("tickers", null) ? "backtest-output-custom" : "backtest-output";
var CACHE = path.join(__dirname, "backtest-cache"), OUT = path.join(__dirname, OUT_NAME);
[CACHE, OUT].forEach(function (d) { if (!fs.existsSync(d)) fs.mkdirSync(d); });
if (!process.env.SEC_CONTACT) console.log("Note: no SEC_CONTACT found in .env. The SEC may refuse requests without it.");

/* ---------- helpers ---------- */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cached(name, fn) {
  var f = path.join(CACHE, name.replace(/[^A-Za-z0-9_.\-]/g, "_") + ".json");
  if (!FRESH && fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8")));
  return fn().then(function (d) { fs.writeFileSync(f, JSON.stringify(d)); return d; });
}
/* Prices for the backtest: daily bars over an exact period, turned into true month-end bars.
   (v2.8 fix: asking Yahoo for "max" history with monthly bars returns 3-month bars, which made the price on a
   test date really the price two months later, and left many dates with no price at all.)
   Each monthly bar is dated the 1st of its month and holds that month's last close, the same layout as Yahoo's
   monthly bars, so the rest of the backtest is unchanged. */
var PRICE_FROM = "2009-01-01";
function toMonthly(px) {
  var m = {}, order = [];
  px.bars.forEach(function (b) { var d = new Date(b.t), k = d.getUTCFullYear() * 12 + d.getUTCMonth(); if (!m[k]) order.push(k); m[k] = b; });
  var bars = order.map(function (k) { return { t: Date.UTC(Math.floor(k / 12), k % 12, 1), close: m[k].close, adj: m[k].adj }; });
  return { meta: px.meta, bars: bars, splits: px.splits };
}
function prices(sym) {
  return cached("yahooM_" + sym, function () {
    return Edgar.yahoo(sym, null, { from: PRICE_FROM, interval: "1d" }).then(function (px) {
      var gaps = []; for (var i = 1; i < px.bars.length; i++) gaps.push((px.bars[i].t - px.bars[i - 1].t) / 864e5);
      gaps.sort(function (a, b) { return a - b; });
      if (!px.bars.length || gaps[gaps.length >> 1] > 5) throw new Error("Yahoo did not return daily prices for " + sym);
      return toMonthly(px);
    });
  });
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
  /* the fresh test list: the largest companies in the SEC list (it is ordered by size), minus every company used before */
  if (FRESH_N) {
    var all = await Edgar.tickerList(), pick = [], seen = {};
    for (var q = 0; q < all.length && pick.length < FRESH_N; q++) {
      var tk = all[q][0];
      if (USED[tk] || seen[all[q][1]] || /[-.](P|W|U|R)[A-Z]?$/.test(tk) && !/^BRK/.test(tk)) continue; /* skip used, second share classes, preferreds, warrants, units */
      seen[all[q][1]] = 1; pick.push(tk);
    }
    TICKERS = pick;
    console.log("Fresh test: the " + pick.length + " largest US companies in the SEC list that were not in any earlier list.");
  }
  var dates = []; for (var y = FROM; y <= TO; y++) MONTHS.forEach(function (mo) { dates.push(new Date(Date.UTC(y, mo - 1, 1))); });
  if (TOP > 0) {
    /* the largest companies first, as ordered in the SEC list; one ticker per company */
    var seenName = {}, list = await Edgar.tickerList();
    TICKERS = [];
    list.forEach(function (r) { var nm = String(r[1]).toLowerCase(); if (TICKERS.length < TOP && !seenName[nm] && /^[A-Z][A-Z.\-]{0,5}$/.test(r[0])) { seenName[nm] = 1; TICKERS.push(r[0]); } });
  }
  var t0 = Date.now();
  if (!FRESH_N && !TOP) console.log(arg("tickers", null) ? "Using your own ticker list." : BANK_HOLDOUT ? "Using the bank holdout list (36 other banks, lenders and insurers)." : BANKS ? "Using the bank and insurer list." : HOLDOUT ? "Using the holdout list (50 other companies)." : "Using the default 54 stocks. For banks and insurers, run: node backtest.js --banks");
  console.log("Plumbline backtest: " + TICKERS.length + " stocks x " + dates.length + " dates (" + iso(dates[0]) + " to " + iso(dates[dates.length - 1]) + "), holding " + HOLD + " months.\n");
  var spy = await prices("SPY");
  var gspc = await prices("^GSPC");
  var tnx = await prices("^TNX").catch(function () { console.log("Note: the 10-year Treasury yield could not be loaded, so 5% is used."); return null; });
  var rows = [], now = Date.now();

  for (var i = 0; i < TICKERS.length; i++) {
    var t = TICKERS[i];
    process.stdout.write(pad("[" + (i + 1) + "/" + TICKERS.length + "] ", 10, true) + pad(t, 7, true));
    var co, raw, px;
    try {
      co = await Edgar.resolve(t);
      /* sec3_: slimmed files that include the v3.2 labels (dividends, buybacks, partners' capital); older sec2_ files lack them */
      raw = await cached("sec3_" + co.ticker, function () {
        var old = path.join(CACHE, "sec_" + co.ticker.replace(/[^A-Za-z0-9_.\-]/g, "_") + ".json");
        var get = !FRESH && fs.existsSync(old) ? Promise.resolve(JSON.parse(fs.readFileSync(old, "utf8"))) : Edgar.rawCompany(co);
        return get.then(slim);
      });
      px = await prices(co.ticker);
    } catch (e) { console.log("skipped: " + e.message); rows.push({ date: "", ticker: t, note: "download failed: " + e.message }); continue; }
    var ok = 0;
    for (var k = 0; k < dates.length; k++) {
      var D = dates[k], dISO = iso(D), row = { date: dISO, ticker: co.ticker, name: co.title };
      try {
        var f = factsAsOf(raw.facts, dISO), p = pricesAsOf(px, D), m = pricesAsOf(gspc, D);
        if (!(p.meta.regularMarketPrice > 0)) throw new Error("no share price on this date (not yet listed?)");
        var label = D.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
        var inp = Edgar._build(co.ticker, co, f, raw.sub, p, m, label);
        var s = Object.assign(IV.defaultSettings(inp, { noProfile: true }), inp.settings || {});
        var tb = tnx && barBefore(tnx.bars, D);
        if (tb && tb.close > 0.05 && tb.close < 15) s.rf = tb.close / 100; else row.note = "10-year yield not found, 5% used";
        if (arg("floor", null) != null) s.coeFloor = +arg("floor");
        if (arg("gcap", null) === "0") s.gCap = false;
        if (arg("lifecycle", null) === "0") s.lifecycle = false; /* v3.8: compare with and without the life-cycle rules */
        var qq = null; try { qq = QS.compute(inp); } catch (e) {}
        var r = IV.compute(inp, s); if (IV.applyValueTest) r = IV.applyValueTest(r, inp); if (IV.applyQuality) r = IV.applyQuality(r, qq);
        if (!r.stats.n) throw new Error("none of the methods could be calculated");
        row.price = inp.price; row.value = r.stats.median; row.upside = r.stats.upside; row.verdict = r.stats.verdict; row.verdictValue = r.stats.verdictValue; row.trap = r.stats.trap ? "yes" : "";
        row.methods = r.stats.n; row.beta = s.beta; row.rf = s.rf; row.financialsTo = inp.ttmEnd;
        row.group = r.group ? r.group.id : "general";
        row.type = r.type ? r.type.id : "";
        row.coe = r.fin ? r.fin.coe : r.wacc.coe;
        var cmb = combine(r);
        WAYS.forEach(function (w) { var v = cmb[w.id]; row["v_" + w.id] = v; row["u_" + w.id] = isFinite(v) ? v / inp.price - 1 : NaN; });
        row.nIntr = cmb.nIntr;
        /* every method's own upside, so section 7 can test each method on its own */
        row.m = {}; r.methods.forEach(function (mm) { if (typeof mm.value === "number" && isFinite(mm.value)) row.m[mm.short] = mm.value / inp.price - 1; });
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
  var MN = ["DCF-20", "DFCF-20", "DNI-20", "DFCF-Terminal", "Mean P/S", "Mean P/E", "Mean P/B", "PSG", "PEG", "DDM", "FCFE", "Excess return", "Justified P/B", "PEGY"];
  rows.forEach(function (r) { MN.forEach(function (n) { r["m_" + n] = r.m && r.m[n] != null ? r.m[n] : null; }); });
  var cols = ["date", "ticker", "name", "group", "type", "price", "value", "upside", "verdict", "verdictValue", "trap", "grade", "score", "ret", "spy", "excess", "beat", "methods", "u_avg", "u_trim", "u_intr", "nIntr", "beta", "rf", "coe", "financialsTo", "note"].concat(MN.map(function (n) { return "m_" + n; }));
  var head = ["Test date", "Ticker", "Company", "Group", "Company type", "Price", "Fair value", "Upside", "Verdict", "Verdict on value alone", "Value trap (cheap, grade D/F)", "Quality grade", "Quality score", HOLD + "m stock return", HOLD + "m SPY return", "Excess return", "Beat SPY", "Methods used", "Upside (average)", "Upside (trimmed mean)", "Upside (intrinsic median)", "Intrinsic methods used", "Beta", "Risk-free rate", "Cost of equity", "Financials to", "Notes"].concat(MN.map(function (n) { return n + " upside"; }));
  var fmt = function (c, v) { if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return ""; if (["upside", "ret", "spy", "excess", "rf", "coe", "u_avg", "u_trim", "u_intr"].indexOf(c) >= 0 || c.indexOf("m_") === 0) return (v * 100).toFixed(2) + "%"; if (c === "score") return v.toFixed(0); if (c === "price" || c === "value") return v.toFixed(2); if (c === "beta") return v.toFixed(2); return v; };
  fs.writeFileSync(path.join(OUT, "results.csv"), [head.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(fmt(c, r[c])); }).join(","); })).join("\n"));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ settings: { from: FROM, to: TO, month: MONTH, hold: HOLD, tickers: TICKERS, buy: 0.2, sell: -0.2 }, generated: new Date().toISOString(), rows: rows }, null, 1));

  /* ---------- summary ---------- */
  var done = rows.filter(function (r) { return r.verdict && isFinite(r.excess); });
  var L = [];
  L.push("PLUMBLINE BACKTEST SUMMARY");
  L.push("Generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
  L.push("Stocks: " + TICKERS.length + (TOP ? " (largest US-listed companies today)" : "") + " | Test dates: 1 " + MONTHS.map(function (mo) { return new Date(Date.UTC(2000, mo - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }); }).join(", ") + ", " + FROM + " to " + TO + " | Holding period: " + HOLD + " months | Benchmark: SPY (S&P 500, dividends included)");
  L.push("Minimum cost of equity: " + (arg("floor", null) != null ? (+arg("floor") * 100).toFixed(1) + "% (--floor)" : "8.0% (default)") + " | Long-run growth capped at the risk-free rate: " + (arg("gcap", null) === "0" ? "no (--gcap 0)" : "yes (default)") + " | Life-cycle rules (v3.8): " + (arg("lifecycle", null) === "0" ? "off (--lifecycle 0)" : "on (default)") + " | Results folder: " + OUT_NAME);
  if (FRESH_N) L.push("Fresh test: largest companies in the SEC list, skipping all 172 companies used in earlier lists.");
  L.push("Valuations made: " + rows.filter(function (r) { return r.verdict; }).length + " | With a finished holding period: " + done.length);
  L.push("");
  L.push("1) RESULTS BY VERDICT (BUY at +20% upside or more, SELL at -20% or worse)");
  L.push(pad("Verdict", 9, true) + pad("Calls", 7) + pad("Avg return", 12) + pad("Avg vs SPY", 12) + pad("Median vs SPY", 15) + pad("% beat SPY", 12));
  var groups = { BUY: [], HOLD: [], SELL: [], FAIL: [] }; done.forEach(function (r) { (groups[r.verdict] = groups[r.verdict] || []).push(r); });
  ["BUY", "HOLD", "SELL", "FAIL"].forEach(function (v) {
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

  L.push("6) WHICH WAY OF COMBINING THE METHODS WORKS BEST? (same calls, same +/-20% lines)");
  L.push("   Rank link = how well the upside ranked later returns vs SPY, from -1 to +1. Above 0 means more upside went with");
  L.push("   better returns. In stock picking, a steady 0.05 to 0.10 is already useful. BUY - SELL is the gap in average return vs SPY.");
  function waysTable(list, label) {
    if (!list.length) return;
    L.push("  " + label + " (" + list.length + " calls)");
    L.push("  " + pad("Way of combining", 40, true) + pad("BUY", 5) + pad("BUY vs SPY", 12) + pad("SELL", 6) + pad("SELL vs SPY", 13) + pad("BUY - SELL", 12) + pad("Rank link", 11));
    WAYS.forEach(function (w) {
      var g = list.filter(function (r) { return isFinite(r["u_" + w.id]); });
      var b = g.filter(function (r) { return r["u_" + w.id] >= 0.2; }), s2 = g.filter(function (r) { return r["u_" + w.id] <= -0.2; });
      var be = mean(b.map(function (r) { return r.excess; })), se = mean(s2.map(function (r) { return r.excess; }));
      /* rank link inside each test year, then averaged, so a strong or weak market year does not drive it */
      var yrs = {}; g.forEach(function (r) { (yrs[r.date.slice(0, 4)] = yrs[r.date.slice(0, 4)] || []).push(r); });
      var ics = Object.keys(yrs).map(function (y) { var a = yrs[y]; return spearman(a.map(function (r) { return r["u_" + w.id]; }), a.map(function (r) { return r.excess; })); }).filter(isFinite);
      L.push("  " + pad(w.name, 40, true) + pad(b.length, 5) + pad(pct(be), 12) + pad(s2.length, 6) + pad(pct(se), 13) + pad(pct(be - se), 12) + pad(ics.length ? (mean(ics) >= 0 ? "+" : "") + mean(ics).toFixed(3) : "n/a", 11));
    });
  }
  waysTable(done, "All stocks");
  var fins = done.filter(function (r) { return r.group === "financial"; }), gens = done.filter(function (r) { return r.group !== "financial"; });
  if (fins.length && gens.length) { waysTable(fins, "Banks and insurers"); waysTable(gens, "Other companies"); }
  L.push("  Read it this way: the best way has the widest BUY - SELL gap AND the highest rank link. If the four rows are");
  L.push("  close, the way of combining does not matter much, and the inputs (ROE, growth, discount rate) matter more.");
  L.push("  Fewer than about 100 calls is too few to trust small differences.");
  L.push("");

  L.push("7) WHICH METHODS CARRY THE SIGNAL? (each method on its own, BUY at +20% upside, SELL at -20%)");
  L.push("   A method with skill has a positive rank link in most years. Negative means its cheap picks tended to lag.");
  var names = []; done.forEach(function (r) { Object.keys(r.m || {}).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); }); });
  var mrows = names.map(function (k) {
    var g = done.filter(function (r) { return r.m && isFinite(r.m[k]); });
    var b = g.filter(function (r) { return r.m[k] >= 0.2; }), s2 = g.filter(function (r) { return r.m[k] <= -0.2; });
    var yrs = {}; g.forEach(function (r) { (yrs[r.date.slice(0, 4)] = yrs[r.date.slice(0, 4)] || []).push(r); });
    var ics = Object.keys(yrs).map(function (y) { var a = yrs[y]; return spearman(a.map(function (r) { return r.m[k]; }), a.map(function (r) { return r.excess; })); }).filter(isFinite);
    return { k: k, n: g.length, b: b, s: s2, ic: ics.length ? mean(ics) : NaN, pos: ics.filter(function (x) { return x > 0; }).length, ny: ics.length };
  }).sort(function (x, y) { return (isFinite(y.ic) ? y.ic : -9) - (isFinite(x.ic) ? x.ic : -9); });
  L.push("  " + pad("Method", 16, true) + pad("Calls", 7) + pad("BUY", 6) + pad("BUY vs SPY", 12) + pad("SELL", 6) + pad("SELL vs SPY", 13) + pad("Rank link", 11) + pad("Years > 0", 11));
  mrows.forEach(function (x) {
    L.push("  " + pad(x.k, 16, true) + pad(x.n, 7) + pad(x.b.length, 6) + pad(pct(mean(x.b.map(function (r) { return r.excess; }))), 12) + pad(x.s.length, 6) + pad(pct(mean(x.s.map(function (r) { return r.excess; }))), 13) +
      pad(isFinite(x.ic) ? (x.ic >= 0 ? "+" : "") + x.ic.toFixed(3) : "n/a", 11) + pad(x.pos + "/" + x.ny, 11));
  });
  L.push("  Methods are sorted from most to least useful. Treat differences below about 0.05 as noise.");
  L.push("");

  L.push("8) RESULTS BY COMPANY TYPE (types detected automatically: bank/insurer by industry, cyclical by industry,");
  L.push("   growth = revenue up more than 15% a year over 5 years, mature = the rest)");
  var TYPES = [["growth", "Growth"], ["cyclical", "Cyclical"], ["mature", "Mature"], ["financial", "Bank or insurer"]];
  var byType = {};
  TYPES.forEach(function (T) {
    var g = done.filter(function (r) { return r.type === T[0]; });
    if (!g.length) return;
    var yrs = {}; g.forEach(function (r) { (yrs[r.date.slice(0, 4)] = yrs[r.date.slice(0, 4)] || []).push(r); });
    function icOf(key) { var ics = Object.keys(yrs).map(function (y) { var a = yrs[y].filter(function (r) { return isFinite(key(r)); }); return spearman(a.map(key), a.map(function (r) { return r.excess; })); }).filter(isFinite); return { ic: ics.length ? mean(ics) : NaN, pos: ics.filter(function (x) { return x > 0; }).length, n: ics.length }; }
    var h = icOf(function (r) { return r.upside; });
    var b = g.filter(function (r) { return r.verdict === "BUY"; }), s2 = g.filter(function (r) { return r.verdict === "SELL"; });
    var per = {}; names.forEach(function (k) { per[k] = icOf(function (r) { return r.m && isFinite(r.m[k]) ? r.m[k] : NaN; }).ic; });
    byType[T[0]] = { h: h, per: per };
    L.push("  " + T[1] + ": " + g.length + " calls, " + new Set(g.map(function (r) { return r.ticker; })).size + " companies | rank link " + (isFinite(h.ic) ? (h.ic >= 0 ? "+" : "") + h.ic.toFixed(3) : "n/a") + " (positive in " + h.pos + "/" + h.n + " years) | BUY " + b.length + " calls " + pct(mean(b.map(function (r) { return r.excess; }))) + " vs SPY | SELL " + s2.length + " calls " + pct(mean(s2.map(function (r) { return r.excess; }))) + " vs SPY");
    L.push("     by method: " + names.filter(function (k) { return isFinite(per[k]); }).sort(function (x, y) { return per[y] - per[x]; }).map(function (k) { return k + " " + (per[k] >= 0 ? "+" : "") + per[k].toFixed(2); }).join(", "));
  });
  /* checks written down before the fresh test was run (15 Oct 2026) */
  L.push("  Pre-set checks (written before the fresh test):");
  function chk(label, ok) { L.push("   [" + (ok == null ? "n/a " : ok ? "PASS" : "FAIL") + "] " + label); }
  var G = byType.growth, C = byType.cyclical, M = byType.mature, Fq = byType.financial;
  chk("Growth: the headline rank link is below zero (the verdict misleads for growth companies)", G ? G.h.ic < 0 : null);
  var dcfAvg = C ? mean(["DCF-20", "DFCF-20", "DFCF-Terminal"].map(function (k) { return C.per[k]; }).filter(isFinite)) : NaN;
  var multAvg = C ? mean(["Mean P/E", "Mean P/S"].map(function (k) { return C.per[k]; }).filter(isFinite)) : NaN;
  chk("Cyclical: the cash flow DCFs (avg " + (isFinite(dcfAvg) ? dcfAvg.toFixed(3) : "n/a") + ") beat single-year P/E and P/S (avg " + (isFinite(multAvg) ? multAvg.toFixed(3) : "n/a") + ")", C ? dcfAvg > multAvg : null);
  chk("Mature: the headline rank link is zero or above", M ? M.h.ic >= 0 : null);
  chk("Banks and insurers: rank link +0.05 or higher and positive in at least 6 of 10 years", Fq ? Fq.h.ic >= 0.05 && Fq.h.pos >= 6 : null);
  L.push("9) DOES THE BUSINESS QUALITY GRADE PREDICT RETURNS?");
  ["A", "B", "C", "D", "F"].forEach(function (g) {
    var list = done.filter(function (r) { return r.grade === g; }), ex = list.map(function (r) { return r.excess; });
    L.push("  Grade " + g + "  " + pad(list.length, 4) + " calls   avg vs SPY " + pad(pct(mean(ex)), 8) + "   median vs SPY " + pad(pct(median(ex)), 8) + "   beat SPY " + (list.length ? (list.filter(function (r) { return r.excess > 0; }).length / list.length * 100).toFixed(0) + "%" : "n/a"));
  });
  var traps = done.filter(function (r) { return r.trap === "yes"; });
  L.push("  Value traps held back (cheap on value, grade D or F): " + traps.length + " calls, avg vs SPY " + pct(mean(traps.map(function (r) { return r.excess; }))) + ", median " + pct(median(traps.map(function (r) { return r.excess; }))) + "  <- if these did worse than BUY, the quality check helped");
  var combo = done.filter(function (r) { return r.verdict === "BUY" && (r.grade === "A" || r.grade === "B"); });
  L.push("  BUY and grade A/B: " + combo.length + " calls, avg vs SPY " + pct(mean(combo.map(function (r) { return r.excess; }))) + ", median " + pct(median(combo.map(function (r) { return r.excess; }))));
  L.push("");
  L.push("10) WHY SOME STOCK-DATES HAVE NO RESULT");
  var why = {}; rows.forEach(function (r) { if (r.note && !(r.verdict && isFinite(r.excess) && !/skipped|failed|no price/.test(r.note))) { var k = r.note.replace(/[0-9.$,]+/g, "#").slice(0, 90); why[k] = (why[k] || 0) + 1; } });
  var wk = Object.keys(why).sort(function (a, b) { return why[b] - why[a]; });
  if (!wk.length) L.push("  None."); else wk.slice(0, 12).forEach(function (k) { L.push("  " + pad(why[k], 4) + "  " + k); });
  L.push("");

  L.push("LIMITS (state these whenever you share the results)");
  L.push("- Backtested, not real trading. Past results do not guarantee future results.");
  L.push("- Survivorship bias: the stock list is today's large companies, which all survived. Compare BUY with ALL stocks, not only with SPY.");
  L.push("- No past analyst forecasts: growth comes from each company's own past results, as on the free live site.");
  L.push("- Monthly prices: the price used is the last close of the month before the test date (built from daily prices).");
  if (MONTHS.length > 1) L.push("- Quarterly test dates: 12-month holding periods overlap, so the calls are not all independent. Treat the extra calls as more detail, not 4x more proof.");
  if (TOP) L.push("- The list is today's largest companies, chosen with hindsight. That flatters every group, so judge BUY against ALL stocks.");
  L.push("- No trading costs, taxes or currency effects.");
  var skipped = rows.filter(function (r) { return r.note && /skipped|failed/.test(r.note); }).length;
  L.push("- " + skipped + " stock-dates could not be valued (see the Notes column in results.csv).");
  var text = L.join("\n");
  fs.writeFileSync(path.join(OUT, "summary.txt"), text);
  console.log("\n" + text + "\n\nSaved: " + OUT_NAME + "/results.csv, summary.txt and results.json");
}

main().catch(function (e) { console.log("\nBacktest stopped: " + (e && e.message || e)); process.exitCode = 1; });
