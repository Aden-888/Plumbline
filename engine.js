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

  /* ---------- industry groups (v2.8) ----------
     Each company is sorted into a group from its SEC industry label. The group decides which methods are used.
     "financial" = banks, insurers, brokers and other lenders, valued the way Aswath Damodaran values financial
     firms: on equity (dividends, cash returned, return on equity, book value) at the cost of equity, never on
     cash flow and WACC. Betas: Damodaran's US industry averages (January 2026), adjusted towards 1.0 the usual
     way (0.67 x beta + 0.33), because bank betas measured from past prices run very low. */
  var FIN_BETAS = {
    bankLarge: { beta: 0.76, label: "Large bank", source: "Bank (Money Center)" },
    bank: { beta: 0.40, label: "Bank", source: "Banks (Regional)" },
    pc: { beta: 0.48, label: "Property and casualty insurer", source: "Insurance (Prop/Cas.)" },
    life: { beta: 0.64, label: "Life and health insurer", source: "Insurance (Life)" },
    ins: { beta: 0.67, label: "Insurer", source: "Insurance (General)" },
    broker: { beta: 1.17, label: "Broker or investment bank", source: "Brokerage & Investment Banking" },
    lender: { beta: 0.97, label: "Lender or credit company", source: "Financial Svcs. (Non-bank & Insurance)" }
  };
  var GROUPS = { general: { id: "general", label: "General company" } };
  function adjBeta(b) { return 0.67 * b + 0.33; }
  function classify(inp) {
    var forced = inp.group || (inp.settings && inp.settings.group);
    var t = String((inp.industry || "") + " " + (inp.sector || "")).toLowerCase(), k = null;
    if (/insurance agents|insurance brokers|insurance - brokers|real estate|reit/.test(t)) k = null;
    else if (/insurance/.test(t)) k = /life|health/.test(t) ? "life" : /fire|marine|casualty|property|surety|title/.test(t) ? "pc" : "ins";
    else if (/mortgage bankers|credit institution|credit agencies|finance services|finance lessors|loan brokers/.test(t)) k = "lender";
    else if (/security brokers|dealers & flotation|investment bank|capital markets/.test(t)) k = "broker";
    else if (/commercial bank|savings institution|\bbanks?\b/.test(t)) k = fin(inp.price) && fin(inp.shares) && inp.price * inp.shares >= 100000 ? "bankLarge" : "bank";
    if (forced === "general") k = null;
    if (forced === "financial" && !k) k = "ins";
    if (!k) return GROUPS.general;
    var b = FIN_BETAS[k];
    return { id: "financial", sub: k, label: b.label, rawBeta: b.beta, beta: adjBeta(b.beta), betaSource: b.source };
  }

  /* ---------- company type (v2.8, detection only: it does not change the value yet) ----------
     Rules fixed before testing, following Damodaran's life-cycle and cyclical groups:
     1. financial: the bank and insurer group above.
     2. cyclical: by SEC industry (semiconductors, energy, mining and metals, chemicals, machinery, vehicles,
        aircraft, construction, transport). Industry comes first, so a fast-growing chipmaker is still cyclical.
     3. growth: revenue grew more than 15% a year over the last (up to) 5 fiscal years.
     4. mature: everything else. */
  var CYCLICAL_RE = /semiconductor|crude petroleum|\boil\b|\bgas\b|petroleum|drilling|mining|\bmetals?\b|\bsteel|\biron\b|copper|\bgold\b|chemical|machinery|\bengines\b|turbines|construction|motor vehicle|\btrucks?\b|trucking|auto(mobile)? parts|aircraft|railroad|air (transportation|courier)|airline|shipping|deep sea|\bpaper|lumber|operative builders|building materials|cement|\bglass\b|\btires\b|electronic components|printed circuit/;
  var NOT_CYCLICAL_RE = /natural gas distribution|electric|water supply|cogeneration/; /* utilities are steady, not cyclical */
  var GROWTH_RATE = 0.15;
  function companyType(inp) {
    var g = classify(inp);
    if (g.id === "financial") return { id: "financial", label: "Bank or insurer", why: g.label };
    var ind = String((inp.industry || "") + " " + (inp.sector || "")).toLowerCase();
    if (CYCLICAL_RE.test(ind) && !NOT_CYCLICAL_RE.test(ind)) return { id: "cyclical", label: "Cyclical", why: "industry: " + (inp.industry || inp.sector) };
    var rev = inp.quality && inp.quality.rev ? inp.quality.rev.filter(function (v) { return fin(v) && v > 0; }) : [];
    var cagr = null;
    if (rev.length >= 4) { var n = Math.min(rev.length, 6), a = rev[rev.length - n], z = rev[rev.length - 1]; cagr = Math.pow(z / a, 1 / (n - 1)) - 1; }
    else if (inp.est && fin(inp.est.cagrRev)) cagr = inp.est.cagrRev;
    if (cagr != null && cagr > GROWTH_RATE) return { id: "growth", label: "Growth", why: "revenue grew " + (cagr * 100).toFixed(0) + "% a year", cagr: cagr };
    return { id: "mature", label: "Mature", why: cagr != null ? "revenue grew " + (cagr * 100).toFixed(0) + "% a year" : "steady business", cagr: cagr };
  }

  /* Default settings. Anything the user can change on the site lives here. */
  function defaultSettings(inp) {
    var g2 = inp.est ? growthPath(inp).cf[1] : 0.05;
    var gT = 0.03;
    var g5 = Math.min(0.25, Math.max(gT, 0.85 * g2));
    var g10 = Math.max(gT, 0.5 * g5);
    var grp = classify(inp);
    return {
      rf: 0.05, erp: 0.05, spread: 0.006, beta: grp.id === "financial" ? grp.beta : fin(inp.beta) ? inp.beta : 1,
      g5: g5, g10: g10, gT: gT,
      peg: 1, psg: 0.1, peCap: 100,
      coeFloor: 0.08, gCap: true,
      buy: 0.2, sell: -0.2
    };
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
    /* v2.8 (Damodaran): long-run growth can never be higher than the risk-free rate, because no company can
       outgrow the whole economy forever and the risk-free rate is the market's own estimate of that growth.
       Only bites when bond yields are below the 3% default (for example 2020-2021). Turn off with gCap: false. */
    var gCapped = false;
    if (s.gCap !== false && fin(s.rf) && s.rf < s.gT) { s = Object.assign({}, s, { gT: Math.max(0, s.rf) }); gCapped = true; }
    var out = { inputs: inp, settings: s, methods: [], notes: [], gCapped: gCapped };

    /* ---- per-share building blocks ---- */
    var niEx = T.ni - T.gain * (1 - T.tax);
    var epsEx = niEx / inp.dilShares;
    var salesPS = T.rev / inp.shares;
    var bookPS = inp.equity / inp.shares;
    var fcf = T.ocf - T.capex;
    var mcap = inp.price * inp.shares;

    /* ---- discount rate (CAPM + after-tax cost of debt) ---- */
    /* v2.8: minimum cost of equity for every company. Damodaran's implied risk premium rises when bond yields
       fall, so the return investors expect from shares stays fairly steady. With a fixed 5% premium, very low
       yields (0.6% in April 2020) would make the cost of equity collapse and every value balloon. */
    var coeRaw = s.rf + s.beta * s.erp, floor = fin(s.coeFloor) ? s.coeFloor : 0;
    var coe = Math.max(coeRaw, floor);
    var kd = s.rf + s.spread;
    var we = mcap / (mcap + inp.debt);
    var wacc = we * coe + (1 - we) * kd * (1 - T.tax);
    out.wacc = { rf: s.rf, beta: s.beta, erp: s.erp, coe: coe, coeRaw: coeRaw, coeFloor: floor, kd: kd, we: we, tax: T.tax, wacc: wacc, mcap: mcap };
    out.base = { niEx: niEx, epsEx: epsEx, salesPS: salesPS, bookPS: bookPS, fcf: fcf, ocf: T.ocf, mcap: mcap };

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

    var grp = out.group = classify(inp);
    out.type = companyType(inp);
    var H = inp.hist;
    var pb = avg(H.pb);
    var peKeep = H.pe.filter(function (x) { return fin(x) && x > 0 && x <= s.peCap; });
    var peDropped = H.pe.filter(function (x) { return !(fin(x) && x > 0 && x <= s.peCap); });
    var pe = peKeep.length ? avg(peKeep) : NaN;
    function addPE() {
      add({ id: "pe", short: "Mean P/E", name: "Mean price-to-earnings (excluding one-offs)", type: "Multiple",
        value: epsEx > 0 && fin(pe) ? pe * epsEx : null, why: epsEx > 0 ? "No usable historical P/E readings" : "Earnings excluding one-offs are not positive",
        d: { mult: pe, eps: epsEx, current: inp.cur ? inp.cur.pe : null, list: H.pe, kept: peKeep, dropped: peDropped, gaap: inp.ttm.epsGaap } });
    }
    function addPB() {
      add({ id: "pb", short: "Mean P/B", name: "Mean price-to-book", type: "Multiple",
        value: bookPS > 0 && fin(pb) ? pb * bookPS : null, why: bookPS > 0 ? "No usable price-to-book history" : "Book value (shareholders' equity) is negative",
        d: { mult: pb, bookPS: bookPS, current: inp.cur ? inp.cur.pb : null, list: H.pb } });
    }
    if (grp.id === "financial") {
      financial(inp, s, out, add, { niEx: niEx, epsEx: epsEx, coe: coeRaw });
      addPE(); addPB();
      var F0 = out.fin;
      add({ id: "pegy", short: "PEGY", name: "Price-to-earnings growth, dividend-adjusted", type: "Growth-adj.",
        value: F0.epsC > 0 && F0.g1div != null ? (F0.g1div + F0.yield) * 100 * s.peg * F0.epsC : null,
        why: !(F0.epsC > 0) ? "Earnings are not positive" : F0.divPay == null ? "Dividend figures were not found, so growth from profit kept cannot be measured" : "Return on equity is not positive",
        d: { growth: F0.g1div, yield: F0.yield, target: s.peg, fairPE: F0.g1div != null ? (F0.g1div + F0.yield) * 100 * s.peg : null, eps: F0.epsC } });
      return finish();
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
    var ps = avg(H.ps);
    add({ id: "ps", short: "Mean P/S", name: "Mean price-to-sales", type: "Multiple",
      value: salesPS * ps, d: { mult: ps, salesPS: salesPS, current: inp.cur ? inp.cur.ps : null, list: H.ps } });
    addPE(); addPB();

    /* ---- growth-adjusted methods ---- */
    var cagrRev = est.cagrRev * 100, cagrEps = est.cagrEps * 100;
    add({ id: "psg", short: "PSG", name: "Price-to-sales growth", type: "Growth-adj.",
      value: cagrRev > 0 ? cagrRev * s.psg * salesPS : null, why: "Revenue growth forecast is not positive",
      d: { growth: cagrRev, target: s.psg, fairPS: cagrRev * s.psg, salesPS: salesPS } });
    add({ id: "peg", short: "PEG", name: "Price-to-earnings growth (excluding one-offs)", type: "Growth-adj.",
      value: cagrEps > 0 && epsEx > 0 ? cagrEps * s.peg * epsEx : null, why: "Earnings growth forecast or earnings are not positive",
      d: { growth: cagrEps, target: s.peg, fairPE: cagrEps * s.peg, eps: epsEx } });

    return finish();

    /* ---- averages and verdict ---- */
    function finish() {
      var vals = out.methods.filter(function (x) { return fin(x.value); }).map(function (x) { return x.value; });
      var sorted = vals.slice().sort(function (x, y) { return x - y; });
      var stats = { n: vals.length };
      if (vals.length) {
        stats.mean = avg(vals);
        stats.median = median(vals);
        stats.trimmed = vals.length > 2 ? (sum(vals) - sorted[0] - sorted[sorted.length - 1]) / (vals.length - 2) : stats.mean;
        stats.min = sorted[0]; stats.max = sorted[sorted.length - 1];
        stats.above = vals.filter(function (x) { return x > inp.price; }).length;
        stats.upside = stats.median / inp.price - 1;
        stats.verdict = stats.upside >= s.buy ? "BUY" : stats.upside <= s.sell ? "SELL" : "HOLD";
      }
      out.stats = stats;
      return out;
    }
    function sum(a) { return a.reduce(function (p, q) { return p + q; }, 0); }
  }

  /* ---------- banks, insurers and other lenders (Damodaran's approach) ----------
     Debt is a bank's raw material, not its funding, and its "capital spending" is the equity regulators make it
     hold. So every method here values the shareholders' equity directly and discounts at the cost of equity.
     Common shareholders only: preferred stock and preferred dividends are taken out.
     Returns are "normalised": the average return on equity over up to five years, so one very good or very bad
     year (for example a hurricane year for an insurer) does not drive the value.
     Ten-year path: years 1-5 grow at the rate the company's own reinvestment supports (ROE x share of profit kept),
     years 6-10 fade to long-run growth while ROE fades to its long-run level; after year 10 everything grows at
     the long-run rate. Long-run ROE = halfway between today's normalised ROE and the cost of equity (competition
     wears excess returns down); a company earning less than its cost of equity is not assumed to improve. */
  var FIN_GMAX = 0.12, FIN_ROE_MAX = 0.30;
  function financial(inp, s, out, add, b) {
    /* minimum cost of equity (v2.8): when government bond yields are very low (0.6% in April 2020), risk-free +
       beta x premium gives banks a 4-5% cost of equity, barely above long-run growth, and every equity model then
       gives a huge value. Investors never accepted returns that low on bank shares, so a floor is applied. */
    var coeRaw = b.coe, floor = fin(s.coeFloor) ? s.coeFloor : 0;
    var F = inp.fin || null, T = inp.ttm, gT = s.gT, coe = Math.max(coeRaw, floor), notes = [];
    if (coe > coeRaw) notes.push("The cost of equity from the formula (" + (coeRaw * 100).toFixed(1) + "%) was below the " + (floor * 100).toFixed(1) + "% minimum, so the minimum is used.");
    var prefTTM = F && fin(F.ttm.prefDivs) ? F.ttm.prefDivs : 0;
    var niC = b.niEx - prefTTM, epsC = niC / inp.dilShares;
    var commonEq = inp.equity - (F && fin(F.prefEqNow) ? F.prefEqNow : 0), bvps = commonEq / inp.shares;

    /* return on common equity, year by year (average of start and end equity) */
    var hist = [];
    /* a company that buys back shares but never tags a dividend (for example Berkshire Hathaway) pays no dividend */
    var noDiv = F && !F.divFound && F.buybackFound;
    if (noDiv) { F.divs = F.divs.map(function () { return 0; }); F.ttm.divs = 0; }
    if (F) F.years.forEach(function (y, i) {
      var e1 = fin(F.eqEnd[i]) ? F.eqEnd[i] - (F.prefEqEnd[i] || 0) : null, e0 = fin(F.eqStart[i]) ? F.eqStart[i] - (F.prefEqStart[i] || 0) : null;
      var eqA = e1 > 0 && e0 > 0 ? (e1 + e0) / 2 : e1 > 0 ? e1 : null, nic = F.ni[i] - (F.prefDivs[i] || 0);
      hist.push({ year: y, ni: nic, eq: eqA, roe: eqA ? nic / eqA : null, divs: F.divs[i], buybacks: F.buybacks[i] });
    });
    var roes = hist.filter(function (h) { return fin(h.roe); }).map(function (h) { return h.roe; });
    var roeTTM = commonEq > 0 ? niC / commonEq : null;
    var roeN = roes.length >= 2 ? avg(roes) : roeTTM, roeSrc = roes.length >= 2 ? roes.length + "-year average" : "last 12 months only";
    if (roes.length < 2) notes.push("Fewer than two years of history were available, so return on equity uses the last 12 months only.");
    if (fin(roeN) && roeN > FIN_ROE_MAX) { notes.push("Return on equity was capped at " + FIN_ROE_MAX * 100 + "%."); roeN = FIN_ROE_MAX; }

    /* share of profit paid out: dividends only, and dividends + buybacks (totals over the years, not an average of ratios) */
    var withDiv = hist.filter(function (h) { return fin(h.divs) && h.ni > 0; });
    var niSum = sum(withDiv.map(function (h) { return h.ni; }));
    var divPay = withDiv.length && niSum > 0 ? sum(withDiv.map(function (h) { return h.divs; })) / niSum : null;
    var totPay = withDiv.length && niSum > 0 ? sum(withDiv.map(function (h) { return h.divs + (h.buybacks || 0); })) / niSum : null;
    if (divPay == null && F && fin(F.ttm.divs) && niC > 0) { divPay = F.ttm.divs / niC; totPay = (F.ttm.divs + (F.ttm.buybacks || 0)) / niC; }
    if (divPay != null) divPay = Math.max(0, Math.min(1, divPay));
    if (totPay != null) totPay = Math.max(0, Math.min(1, totPay));
    var dpsTTM = F && fin(F.ttm.divs) ? F.ttm.divs / inp.shares : null;
    var yld = dpsTTM ? dpsTTM / inp.price : 0;
    var returned = F && fin(F.ttm.divs) ? F.ttm.divs + (F.ttm.buybacks || 0) : null;

    var roeL = fin(roeN) ? (roeN > coe ? (roeN + coe) / 2 : roeN) : null;
    function clampG(g) { return Math.max(0, Math.min(FIN_GMAX, g)); }
    /* growth the company can fund itself: whole-company profit grows by ROE x share of profit kept.
       Per share it also gains from buybacks shrinking the share count (buyback spending / market value). */
    var okR = fin(roeN) && roeN > 0, mcap = inp.price * inp.shares;
    var g1tot = okR && totPay != null ? clampG(roeN * (1 - totPay)) : null;
    var bbYield = totPay != null && divPay != null && niC > 0 ? Math.min(0.05, Math.max(0, (totPay - divPay) * niC / mcap)) : 0;
    var g1div = okR && divPay != null ? clampG((g1tot != null ? roeN * (1 - totPay) : roeN * (1 - divPay)) + bbYield) : null;

    /* the 10-year path: growth, ROE and the share of profit left to pay out (payout = 1 - growth / ROE) */
    function path(g1) {
      var p = { g: [], roe: [], pay: [] };
      for (var t = 1; t <= 10; t++) {
        var g = t <= 5 ? g1 : g1 + (gT - g1) * (t - 5) / 5, r = t <= 5 ? roeN : roeN + (roeL - roeN) * (t - 5) / 5;
        p.g.push(g); p.roe.push(r); p.pay.push(1 - g / r);
      }
      return p;
    }
    function bad() {
      if (!fin(roeN) || roeN <= 0) return "Return on equity is not positive";
      if (!(coe > gT + 0.005)) return "The cost of equity is too close to the long-run growth rate";
      if (!(roeL > gT + 0.005)) return "Return on equity is too low to support even long-run growth";
      return null;
    }
    function disc(t) { return Math.pow(1 + coe, t); }
    var why0 = bad();

    /* 1. Dividend discount model (per share) */
    var ddm = { ok: false, why: why0 };
    if (!why0) {
      if (divPay == null) ddm.why = "Dividend figures were not found in the filings";
      else if (!(divPay > 0)) ddm.why = "The company pays no dividend, so a dividend model does not fit";
      else if (!(epsC > 0)) ddm.why = "Earnings are not positive";
      else {
        /* dividend path: today's payout for 5 years, then it rises to the long-run payout (1 - growth / ROE) */
        /* starts from normal earnings per share (average ROE x book value per share), not one year's figure */
        var epsN = commonEq > 0 ? roeN * bvps : epsC, pd = path(g1div), eps = epsN, pv = 0, dps = [], payL = 1 - gT / roeL;
        pd.pay = pd.pay.map(function (x, i) { return i < 5 ? divPay : divPay + (payL - divPay) * (i - 4) / 5; });
        for (var t = 1; t <= 10; t++) { eps *= 1 + pd.g[t - 1]; var dv = eps * pd.pay[t - 1]; dps.push(dv); pv += dv / disc(t); }
        var tvD = eps * (1 + gT) * payL / (coe - gT), pvTv = tvD / disc(10);
        ddm = { ok: true, eps0: epsN, pv: pv, pvTv: pvTv, value: pv + pvTv, tvShare: pvTv / (pv + pvTv), dps1: dps[0], dps10: dps[9], eps10: eps, path: pd };
      }
    }
    add({ id: "ddm", short: "DDM", name: "Dividend discount model", type: "Dividends", value: ddm.ok ? ddm.value : null, why: ddm.why, d: ddm });

    /* 2. Free cash flow to equity: profit minus the equity the company must keep to grow (whole company, then per share) */
    var fe = { ok: false, why: why0 };
    if (!why0) {
      if (!(niC > 0)) fe.why = "Earnings are not positive";
      else if (g1tot == null) fe.why = "Dividend and buyback figures were not found in the filings";
      else {
        /* profit follows book value and ROE (so when ROE fades, profit does too). It starts from today's actual
           profit and drifts back to the normal level over 10 years: this is what separates it from the excess
           return model, which uses the normal level from the start */
        var pf = path(g1tot), lvl = niC / (roeN * commonEq), bvF = commonEq, ni = niC, pv2 = 0, cf1 = null;
        if (!(commonEq > 0)) { lvl = 1; bvF = niC / roeN; }
        for (var u = 1; u <= 10; u++) {
          ni = bvF * pf.roe[u - 1] * (lvl + (1 - lvl) * u / 10); var c = ni - bvF * pf.g[u - 1]; bvF *= 1 + pf.g[u - 1];
          if (u === 1) cf1 = c; pv2 += c / disc(u);
        }
        ni = bvF * roeL;
        var tvF = (ni - bvF * gT) / (coe - gT), pvTvF = tvF / disc(10);
        fe = { ok: true, pv: pv2, pvTv: pvTvF, equity: pv2 + pvTvF, value: (pv2 + pvTvF) / inp.shares, tvShare: pvTvF / (pv2 + pvTvF), fcfe1: cf1, ni10: ni, path: pf };
      }
    }
    add({ id: "fcfe", short: "FCFE", name: "Free cash flow to equity (cash returned to shareholders)", type: "Cash to owners", value: fe.ok ? fe.value : null, why: fe.why, d: fe });

    /* 3. Excess return model: book value today + the value of earning more (or less) than the cost of equity */
    var ex = { ok: false, why: why0 };
    if (!why0 && !(commonEq > 0)) ex.why = "Book value is not positive";
    else if (!why0) {
      var px = path(g1tot != null ? g1tot : g1div != null ? g1div : clampG(roeN * 0.5)), bv = commonEq, pv3 = 0, ex1 = null;
      for (var v = 1; v <= 10; v++) { var e = (px.roe[v - 1] - coe) * bv; if (v === 1) ex1 = e; pv3 += e / disc(v); bv *= 1 + px.g[v - 1]; }
      var tvX = (roeL - coe) * bv / (coe - gT), pvTvX = tvX / disc(10);
      ex = { ok: true, bv0: commonEq, pv: pv3, pvTv: pvTvX, equity: commonEq + pv3 + pvTvX, value: (commonEq + pv3 + pvTvX) / inp.shares, ex1: ex1, bv10: bv, path: px };
    }
    add({ id: "excess", short: "Excess return", name: "Excess return model (book value + value created)", type: "Book value", value: ex.ok ? ex.value : null, why: ex.why, d: ex });

    /* 4. Justified price-to-book: the P/B that this ROE earns at this cost of equity */
    var jpb = null, jwhy = why0;
    if (!jwhy && !(bvps > 0)) jwhy = "Book value is not positive";
    if (!jwhy) jpb = (roeN - gT) / (coe - gT);
    add({ id: "jpb", short: "Justified P/B", name: "Justified price-to-book (from return on equity)", type: "Book value", value: jpb != null ? jpb * bvps : null, why: jwhy,
      d: { mult: jpb, bvps: bvps, current: inp.cur ? inp.cur.pb : null } });

    out.fin = { roeN: roeN, roeSrc: roeSrc, roeTTM: roeTTM, roeL: roeL, hist: hist, coe: coe, coeRaw: coeRaw, coeFloor: floor, divPay: divPay, totPay: totPay, g1div: g1div, g1tot: g1tot,
      bbYield: bbYield, yield: yld, dpsTTM: dpsTTM, returned: returned, niC: niC, epsC: epsC, commonEq: commonEq, bvps: bvps, prefTTM: prefTTM,
      prefEq: F && fin(F.prefEqNow) ? F.prefEqNow : 0, gT: gT, gMax: FIN_GMAX, notes: notes, path: g1tot != null ? path(g1tot) : null };
    function sum(a) { return a.reduce(function (p, q) { return p + q; }, 0); }
  }

  var api = { compute: compute, defaultSettings: defaultSettings, classify: classify, companyType: companyType, growthPath: growthPath, avg: avg, median: median, fin: fin, FIN_BETAS: FIN_BETAS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.IV = api;
})(typeof window !== "undefined" ? window : globalThis);
