/* Intrinsic value engine: the same nine methods and formulas as the Excel models.
   Pure functions, no DOM. Works in the browser (window.IV) and in Node (module.exports). */
(function (root) {
  "use strict";

  var YEARS = 20;

  function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function fin(x) { return typeof x === "number" && isFinite(x); }

  /* Default settings. Anything the user can change on the site lives here. */
  function defaultSettings(inp) {
    var g2 = inp.est ? growthPath(inp).cf[1] : 0.05;
    var gT = 0.03;
    /* Fast growth rarely lasts: studies of company growth rates find it drifts back towards the economy's pace
       within a few years. So by year 5 growth keeps 60% of its lead over long-run growth, and by year 10 only 30%. */
    var g5 = Math.min(0.20, gT + 0.6 * (g2 - gT));
    var g10 = Math.max(gT, gT + 0.3 * (g2 - gT));
    if (g5 < gT) g5 = Math.max(0, gT + 0.6 * (g2 - gT)); /* shrinking companies recover towards long-run growth too */
    return {
      rf: 0.05, erp: 0.05, spread: 0.006, beta: adjBeta(inp.beta), capexNorm: 1,
      g5: g5, g10: g10, gT: gT,
      peg: 1, psg: 0.1, peCap: 100,
      buy: 0.2, sell: -0.2
    };
  }

  /* Adjusted beta (Blume): the measured beta pulled one third of the way towards 1, because extreme betas rarely last.
     Standard practice at data providers such as Bloomberg. */
  function adjBeta(b) { return fin(b) ? 0.67 * b + 0.33 : 1; }

  /* Normalised capital spending: latest revenue x the average capex-to-revenue ratio of the last five years
     (including the latest twelve months). A one-off spending surge, such as a data-centre build-out,
     then no longer wipes out free cash flow, and an unusually quiet year does not flatter it. */
  function capexInfo(inp) {
    var T = inp.ttm, h = (inp.capexHist || []).filter(function (x) { return x.rev > 0 && fin(x.capex); });
    var ratios = h.map(function (x) { return x.capex / x.rev; });
    if (T.rev > 0 && fin(T.capex)) ratios.push(T.capex / T.rev);
    if (ratios.length < 3 || !(T.rev > 0)) return { ok: false, ttm: T.capex, used: T.capex, years: ratios.length };
    var r = avg(ratios.slice(-6));
    return { ok: true, ttm: T.capex, used: T.rev * r, ratio: r, ratioTTM: T.rev > 0 ? T.capex / T.rev : null, years: Math.min(6, ratios.length) };
  }

  /* Years 1-2 growth from analyst estimates, calendarised to line up with the trailing twelve months. */
  function growthPath(inp) {
    var e = inp.est, w = fin(e.calWeight) ? e.calWeight : 0.5;
    var R = e.rev.slice(), E = e.eps.slice();
    var rg1 = (w * R[1] + (1 - w) * R[2]) / (w * R[0] + (1 - w) * R[1]) - 1;
    var rg2 = (w * R[2] + (1 - w) * R[3]) / (w * R[1] + (1 - w) * R[2]) - 1;
    var eg1 = (w * E[1] + (1 - w) * E[2]) / (w * E[0] + (1 - w) * E[1]) - 1;
    var eg2 = (w * E[2] + (1 - w) * E[3]) / (w * E[1] + (1 - w) * E[2]) - 1;
    var cf1 = fin(e.cfG1) ? e.cfG1 : rg1;
    return { rev: [rg1, rg2], eps: [eg1, eg2], cf: [cf1, rg2] };
  }

  /* Growth rate for each of the 20 years: two years of estimates, then three straight-line fades. */
  function fade(g1, g2, s) {
    var out = [g1, g2], t, prev;
    for (t = 3; t <= 5; t++) out.push(g2 + (s.g5 - g2) * (t - 2) / 3);
    for (t = 6; t <= 10; t++) out.push(s.g5 + (s.g10 - s.g5) * (t - 5) / 5);
    for (t = 11; t <= 20; t++) out.push(s.g10 + (s.gT - s.g10) * (t - 10) / 10);
    return out;
  }

  function project(base, growth) {
    var v = [base], t;
    for (t = 1; t <= YEARS; t++) v.push(v[t - 1] * (1 + growth[t - 1]));
    return v;
  }

  function compute(inp, s) {
    var T = inp.ttm, est = inp.est;
    var gp = growthPath(inp);
    var out = { inputs: inp, settings: s, methods: [], notes: [] };

    /* ---- per-share building blocks ---- */
    var niEx = T.ni - T.gain * (1 - T.tax);
    var epsEx = niEx / inp.dilShares;
    var salesPS = T.rev / inp.shares;
    var bookPS = inp.equity / inp.shares;
    var cx = capexInfo(inp), capexUsed = s.capexNorm && cx.ok ? cx.used : T.capex;
    var fcf = T.ocf - capexUsed;
    out.capex = { info: cx, used: capexUsed, normalised: !!(s.capexNorm && cx.ok) };
    var mcap = inp.price * inp.shares;

    /* ---- discount rate (CAPM + after-tax cost of debt) ---- */
    var coe = s.rf + s.beta * s.erp;
    var kd = s.rf + s.spread;
    var we = mcap / (mcap + inp.debt);
    var wacc = we * coe + (1 - we) * kd * (1 - T.tax);
    out.wacc = { rf: s.rf, beta: s.beta, erp: s.erp, coe: coe, kd: kd, we: we, tax: T.tax, wacc: wacc, mcap: mcap };
    out.base = { niEx: niEx, epsEx: epsEx, salesPS: salesPS, bookPS: bookPS, fcf: fcf, ocf: T.ocf, mcap: mcap, capex: capexUsed };

    /* ---- 20-year projections ---- */
    var gCF = fade(gp.cf[0], gp.cf[1], s);
    var gEPS = fade(gp.eps[0], gp.eps[1], s);
    var P = { years: [], ocf: project(T.ocf, gCF), fcf: project(fcf, gCF), ni: project(niEx, gEPS), gCF: gCF, gEPS: gEPS };
    for (var t = 0; t <= YEARS; t++) P.years.push(t);
    out.proj = P; out.growth = gp;

    function dcf(series, rate, n, withNetDebt) {
      if (!(series[0] > 0)) return { ok: false, why: "Needs positive starting cash flow or earnings" };
      if (!(rate > s.gT + 0.005)) return { ok: false, why: "Discount rate is too close to the long-run growth rate" };
      var pv = 0, i;
      for (i = 1; i <= n; i++) pv += series[i] / Math.pow(1 + rate, i);
      var tv = series[n] * (1 + s.gT) / (rate - s.gT);
      var pvTv = tv / Math.pow(1 + rate, n);
      var total = pv + pvTv;
      var eq = withNetDebt ? total + inp.cash - inp.debt : total;
      return { ok: true, pv: pv, tv: tv, pvTv: pvTv, total: total, equity: eq, perShare: eq / inp.shares, tvShare: pvTv / total, rate: rate };
    }

    var m = [];
    function add(o) {
      o.upside = fin(o.value) ? o.value / inp.price - 1 : null;
      out.methods.push(o);
    }

    var a = dcf(P.ocf, wacc, 20, true);
    add({ id: "dcf20", short: "DCF-20", name: "Discounted cash flow, 20 years", type: "Cash flow",
      value: a.ok ? a.perShare : null, why: a.why, d: a });
    var b = dcf(P.fcf, wacc, 20, true);
    add({ id: "dfcf20", short: "DFCF-20", name: "Discounted free cash flow, 20 years", type: "Cash flow",
      value: b.ok ? b.perShare : null, why: b.why, d: b });
    var c = dcf(P.ni, coe, 20, false);
    add({ id: "dni20", short: "DNI-20", name: "Discounted net income, 20 years", type: "Earnings",
      value: c.ok ? c.perShare : null, why: c.why, d: c });
    var d = dcf(P.fcf, wacc, 10, true);
    add({ id: "dfcft", short: "DFCF-Terminal", name: "Discounted free cash flow, 10 years + terminal value", type: "Cash flow",
      value: d.ok ? d.perShare : null, why: d.why, d: d });

    /* ---- multiple-based methods ---- */
    var H = inp.hist;
    var ps = avg(H.ps), pb = avg(H.pb);
    var peKeep = H.pe.filter(function (x) { return fin(x) && x > 0 && x <= s.peCap; });
    var peDropped = H.pe.filter(function (x) { return !(fin(x) && x > 0 && x <= s.peCap); });
    var pe = peKeep.length ? avg(peKeep) : NaN;
    add({ id: "ps", short: "Mean P/S", name: "Mean price-to-sales", type: "Multiple",
      value: salesPS * ps, d: { mult: ps, salesPS: salesPS, current: inp.cur ? inp.cur.ps : null, list: H.ps } });
    add({ id: "pe", short: "Mean P/E", name: "Mean price-to-earnings (excluding one-offs)", type: "Multiple",
      value: epsEx > 0 && fin(pe) ? pe * epsEx : null, why: epsEx > 0 ? "No usable historical P/E readings" : "Earnings excluding one-offs are not positive",
      d: { mult: pe, eps: epsEx, current: inp.cur ? inp.cur.pe : null, list: H.pe, kept: peKeep, dropped: peDropped, gaap: inp.ttm.epsGaap } });
    add({ id: "pb", short: "Mean P/B", name: "Mean price-to-book", type: "Multiple",
      value: bookPS > 0 ? pb * bookPS : null, why: "Book value is not positive",
      d: { mult: pb, bookPS: bookPS, current: inp.cur ? inp.cur.pb : null, list: H.pb } });

    /* ---- growth-adjusted methods ---- */
    var cagrRev = est.cagrRev * 100, cagrEps = est.cagrEps * 100;
    add({ id: "psg", short: "PSG", name: "Price-to-sales growth", type: "Growth-adj.",
      value: cagrRev > 0 ? cagrRev * s.psg * salesPS : null, why: "Revenue growth forecast is not positive",
      d: { growth: cagrRev, target: s.psg, fairPS: cagrRev * s.psg, salesPS: salesPS } });
    add({ id: "peg", short: "PEG", name: "Price-to-earnings growth (excluding one-offs)", type: "Growth-adj.",
      value: cagrEps > 0 && epsEx > 0 ? cagrEps * s.peg * epsEx : null, why: "Earnings growth forecast or earnings are not positive",
      d: { growth: cagrEps, target: s.peg, fairPE: cagrEps * s.peg, eps: epsEx } });

    /* ---- fair value and verdict ----
       The methods are grouped into families. Cash flow & earnings models (4) and valuation multiples (3) each give
       their middle value (median); the fair value is the average of those two, so the four similar discounting
       models cannot outvote the rest. Growth-adjusted checks (PSG, PEG) depend on arbitrary targets, so they are
       shown as side checks and not counted. */
    var FAM = [
      { id: "cf", name: "Cash flow & earnings models", ids: ["dcf20", "dfcf20", "dni20", "dfcft"], counted: true },
      { id: "mult", name: "Valuation multiples", ids: ["ps", "pe", "pb"], counted: true },
      { id: "growth", name: "Growth-adjusted checks", ids: ["psg", "peg"], counted: false }
    ];
    var fams = FAM.map(function (f) {
      var ms = out.methods.filter(function (x) { return f.ids.indexOf(x.id) >= 0; });
      ms.forEach(function (x) { x.family = f.id; x.counted = f.counted; });
      var v = ms.filter(function (x) { return fin(x.value); }).map(function (x) { return x.value; });
      return { id: f.id, name: f.name, counted: f.counted, n: v.length, total: ms.length, median: v.length ? median(v) : NaN };
    });
    var used = fams.filter(function (f) { return f.counted && fin(f.median); });
    var head = out.methods.filter(function (x) { return x.counted && fin(x.value); }).map(function (x) { return x.value; });
    var allV = out.methods.filter(function (x) { return fin(x.value); }).map(function (x) { return x.value; });
    var sorted = head.slice().sort(function (x, y) { return x - y; });
    var stats = { n: head.length, nCounted: out.methods.filter(function (x) { return x.counted; }).length, families: fams };
    if (used.length) {
      stats.median = avg(used.map(function (f) { return f.median; })); /* the headline fair value (name kept for compatibility) */
      stats.value = stats.median;
      stats.mean = avg(head);
      stats.medianAll = median(allV);
      stats.trimmed = head.length > 2 ? (sum(head) - sorted[0] - sorted[sorted.length - 1]) / (head.length - 2) : stats.mean;
      stats.min = sorted[0]; stats.max = sorted[sorted.length - 1];
      stats.maxAll = Math.max.apply(null, allV); stats.minAll = Math.min.apply(null, allV);
      stats.above = head.filter(function (x) { return x > inp.price; }).length;
      stats.upside = stats.median / inp.price - 1;
      stats.verdict = stats.upside >= s.buy ? "BUY" : stats.upside <= s.sell ? "SELL" : "HOLD";
      stats.oneFamily = used.length === 1 ? used[0].name : null;
    } else stats.n = 0;
    function sum(a) { return a.reduce(function (p, q) { return p + q; }, 0); }
    out.stats = stats;
    return out;
  }

  var api = { compute: compute, adjBeta: adjBeta, capexInfo: capexInfo, defaultSettings: defaultSettings, growthPath: growthPath, avg: avg, median: median, fin: fin };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.IV = api;
})(typeof window !== "undefined" ? window : globalThis);
