/* Business Quality scorecard. Pure functions, no DOM. Works in the browser (window.QS) and in Node.
   Three pillars, scored from the company's own financial statements:
     Earnings & Cash Flow Ability 45%  |  Balance Sheet Strength 30%  |  Growth Outlook 25%
   Each metric scores Strong (2), Good (1) or Weak (0). Core metrics count double inside their pillar.
   Input: the same stock object the valuation engine uses, plus `quality` ($ millions, yearly lists oldest first):
     { gp, opInc, da, interest, curAssets, curLiab, inventory, years[], rev[], eps[], fcf[], retained[] } */
(function (root) {
  "use strict";

  var PILLARS = [
    { id: "earn", name: "Earnings & Cash Flow Ability", weight: 0.45, q: "How profitable is the business, and does that profit turn into real cash?" },
    { id: "bal", name: "Balance Sheet Strength", weight: 0.30, q: "Can it pay off its debts and still fund future growth?" },
    { id: "grow", name: "Growth Outlook", weight: 0.25, q: "Is the business growing steadily?" }
  ];
  var LEVELS = ["Weak", "Good", "Strong"];
  var GRADES = [[80, "A", "Excellent business"], [65, "B", "Good business"], [50, "C", "Average business"], [35, "D", "Weak business"], [-1, "F", "Poor business"]];

  function fin(x) { return typeof x === "number" && isFinite(x); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function times(x, d) { return x >= 100 ? "100x+" : x.toFixed(d == null ? 1 : d) + "x"; }
  function cents(x) { return Math.round(x * 100) + " cents"; }
  function mm(x) {
    var a = Math.abs(x), s = x < 0 ? "−" : "";
    if (a >= 1e6) return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + (a / 1e6).toFixed(2) + " trillion";
    if (a >= 1e3) return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + (a / 1e3).toFixed(1) + " billion";
    return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + a.toFixed(0) + " million";
  }
  function usd(x) { return (x < 0 ? "−$" : ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$")) + Math.abs(x).toFixed(2); }

  /* Trend of a yearly list: how many years it rose, overall direction and yearly growth rate. */
  function trend(list, labels) {
    var pts = [];
    (list || []).forEach(function (v, i) { if (fin(v)) pts.push({ i: i, v: v }); });
    if (pts.length < 2) return null;
    var up = 0;
    for (var k = 1; k < pts.length; k++) if (pts[k].v > pts[k - 1].v) up++;
    var f = pts[0], l = pts[pts.length - 1], span = l.i - f.i;
    return {
      n: pts.length - 1, up: up, first: f.v, last: l.v, span: span,
      from: labels && labels[f.i] ? labels[f.i] : "the first year", to: labels && labels[l.i] ? labels[l.i] : "the latest year",
      cagr: f.v > 0 && l.v > 0 && span > 0 ? Math.pow(l.v / f.v, 1 / span) - 1 : null
    };
  }
  /* "Positive and consistently growing" = higher than at the start and up in at least 60% of years (3 of 5, or 3 of 4).
     "Strong growth" = also at least 15% a year and up in at least 75% of years (4 of 5, or 3 of 4). */
  function trendLevel(t) {
    if (!t || t.n < 2) return null;
    if (t.last <= 0) return 0;
    var rising = t.last > t.first, share = t.up / t.n;
    if (rising && t.cagr != null && t.cagr > 0.15 && share >= 0.75) return 2;
    if (rising && share >= 0.6) return 1;
    return 0;
  }
  function above(v, good, strong) { return v > strong ? 2 : v > good ? 1 : 0; }
  function below(v, good, strong) { return v < strong ? 2 : v < good ? 1 : 0; }

  function isFinancial(inp) {
    var s = String((inp.sector || "") + " " + (inp.industry || "")).toLowerCase();
    return /bank|insurance|reit|real estate investment|asset management|capital markets|mortgage|savings institution|credit institution|finance services|security brokers/.test(s);
  }

  function compute(inp) {
    var Q = inp.quality;
    if (!Q) return { ok: false, reason: "nodata" };
    if (isFinancial(inp)) return { ok: false, reason: "financial" };

    var T = inp.ttm, tax = fin(T.tax) ? T.tax : 0.21, gainAT = (T.gain || 0) * (1 - tax);
    var ni = T.ni - gainAT, rev = T.rev, fcf = T.ocf - T.capex;
    var eq = inp.equity, debt = inp.debt || 0, cash = inp.cash || 0;
    var Y = Q.years || [], M = [];
    function add(m) { M.push(m); return m; }

    /* ---------- Pillar 1: Earnings & Cash Flow Ability ---------- */
    /* invested capital uses borrowings only: rent on leases is already deducted from operating profit */
    var leases = fin(Q.leases) ? Q.leases : 0, borrow = Math.max(0, debt - leases);
    var icNow = eq + borrow - cash; if (!(icNow > 0)) icNow = eq + borrow;
    /* ROE and ROIC use the average of today's balance sheet and the one a year earlier (the standard method),
       so a deal or a debt raise near the end of the year does not distort them */
    var P = Q.prev, hasPrev = P && fin(P.equity), icPrev = null;
    if (hasPrev && fin(P.borrowings) && fin(P.cash)) { icPrev = P.equity + P.borrowings - P.cash; if (!(icPrev > 0)) icPrev = P.equity + P.borrowings; }
    var ic = icPrev > 0 && icNow > 0 ? (icNow + icPrev) / 2 : icNow;
    var eqAvg = hasPrev && P.equity > 0 && eq > 0 ? (eq + P.equity) / 2 : eq;
    var avgNote = "Uses the average of the latest balance sheet and the one a year earlier.";
    if (fin(Q.opInc) && ic > 0) {
      var roic = Q.opInc * (1 - tax) / ic;
      add({ p: "earn", id: "roic", name: "Return on invested capital (ROIC)", core: true, value: roic, show: pct(roic), level: above(roic, 0.10, 0.15), good: "> 10%", strong: "> 15%",
        says: "Earns " + cents(roic) + " of after-tax operating profit a year for every $1 invested in the business (shareholders' money plus borrowings, minus spare cash).",
        def: (icPrev > 0 ? avgNote + " " : "") + (leases > 0 ? "Lease obligations are left out of invested capital, because rent is already deducted from operating profit." : "") || null });
    } else add({ p: "earn", id: "roic", name: "Return on invested capital (ROIC)", core: true, level: null, show: "n/a", good: "> 10%", strong: "> 15%", says: "Operating profit or invested capital is missing, so ROIC cannot be measured." });

    if (eq > 0) {
      var roe = ni / eqAvg, de0 = debt / eq;
      add({ p: "earn", id: "roe", name: "Return on equity (ROE)", core: true, value: roe, show: pct(roe), level: above(roe, 0.12, 0.20), good: "> 12–15%", strong: "> 20%",
        says: "Makes " + cents(roe) + " of profit a year for every $1 of shareholders' money in the business.",
        def: eqAvg !== eq ? avgNote : null,
        note: roe > 0.20 && de0 > 1 ? "This ROE is boosted by high debt (" + de0.toFixed(2) + "x equity). Borrowing shrinks the equity base, so ROE looks better than the business really is. Check ROIC, which includes debt." : null });
    } else add({ p: "earn", id: "roe", name: "Return on equity (ROE)", core: true, level: null, show: "Not meaningful", good: "> 12–15%", strong: "> 20%",
      says: "Shareholders' equity is zero or negative (often after large share buybacks or past losses), so ROE cannot be measured. Use ROIC instead." });

    if (ni > 0) {
      var conv = fcf / ni;
      add({ p: "earn", id: "fcfni", name: "Free cash flow to net income", core: true, value: conv, show: times(conv, 2), level: above(conv, 1.0, 1.5), good: "> 1.0x", strong: "> 1.5x",
        says: "Every $1 of profit came with $" + Math.max(0, conv).toFixed(2) + " of free cash (" + mm(fcf) + " of free cash vs " + mm(ni) + " of profit)." +
          (conv <= 1 ? " Below $1 means some profit has not turned into cash yet, for example because customers have not paid or spending on equipment is high." : " Above $1 means profits are backed by real cash.") });
    } else add({ p: "earn", id: "fcfni", name: "Free cash flow to net income", core: true, level: null, show: "Not meaningful", good: "> 1.0x", strong: "> 1.5x",
      says: "Profit over the last 12 months was not positive, so this ratio cannot be read." });

    var tf = trend(Q.fcf, Y), lf = trendLevel(tf);
    add({ p: "earn", id: "fcfg", name: "Free cash flow growth trend", core: true, level: lf, series: Q.fcf, good: "Positive and consistently growing", strong: "15%+ a year over 5 years",
      show: tf ? (tf.cagr != null ? pct(tf.cagr, 0) + " a year" : "Up " + tf.up + " of " + tf.n + " yrs") : "n/a",
      says: tf ? "Free cash flow went from " + mm(tf.first) + " (" + tf.from + ") to " + mm(tf.last) + " (" + tf.to + "). It rose in " + tf.up + " of " + tf.n + " years" + (tf.cagr != null ? ", about " + pct(tf.cagr, 0) + " a year." : ".") : "Not enough yearly cash flow history." });

    var npm = ni / rev;
    add({ p: "earn", id: "npm", name: "Net profit margin", core: false, value: npm, show: pct(npm), level: above(npm, 0.10, 0.15), good: "> 10%", strong: "> 15%",
      says: "Keeps " + cents(npm) + " of profit from every $1 of sales, after all costs, interest and tax." });

    if (fin(Q.gp) && Q.gp !== 0) {
      var gpm = Q.gp / (Q.gpRev > 0 ? Q.gpRev : rev);
      add({ p: "earn", id: "gpm", name: "Gross profit margin", core: false, value: gpm, show: pct(gpm), level: above(gpm, 0.30, 0.40), good: "> 30%", strong: "> 40%",
        says: "Keeps " + cents(gpm) + " from every $1 of sales after the direct cost of making its products or services. A high gross margin points to pricing power." });
    } else add({ p: "earn", id: "gpm", name: "Gross profit margin", core: false, level: null, show: "n/a", good: "> 30%", strong: "> 40%", says: "The company does not report gross profit separately." });

    /* ---------- Pillar 2: Balance Sheet Strength ---------- */
    if (eq > 0) {
      var de = debt / eq;
      add({ p: "bal", id: "de", name: "Debt to equity", core: false, value: de, show: de.toFixed(2), level: below(de, 1.0, 0.5), good: "< 1.0", strong: "< 0.5",
        says: "Has $" + de.toFixed(2) + " of debt for every $1 of shareholders' money. " + (de < 1 ? "The business is funded mainly by its owners." : "Lenders fund more of the business than its owners do.") });
    } else add({ p: "bal", id: "de", name: "Debt to equity", core: false, value: null, show: "Negative equity", level: 0, good: "< 1.0", strong: "< 0.5",
      says: "Shareholders' equity is zero or negative, so the company's debts are larger than its book value. This scores as Weak." });

    var ebitda = fin(Q.opInc) ? Q.opInc + (fin(Q.da) ? Q.da : 0) : NaN;
    if (!(debt > 0)) add({ p: "bal", id: "debitda", name: "Debt to EBITDA", core: false, value: 0, show: "No debt", level: 2, good: "< 3.0x", strong: "< 2.0x", says: "The company has no borrowings." });
    else if (!fin(ebitda)) add({ p: "bal", id: "debitda", name: "Debt to EBITDA", core: false, level: null, show: "n/a", good: "< 3.0x", strong: "< 2.0x", says: "Operating profit is missing, so this cannot be measured." });
    else if (ebitda <= 0) add({ p: "bal", id: "debitda", name: "Debt to EBITDA", core: false, value: null, show: "EBITDA negative", level: 0, good: "< 3.0x", strong: "< 2.0x", says: "Operating earnings are negative, so the debt cannot be repaid from earnings at the moment." });
    else {
      var dE = debt / ebitda;
      add({ p: "bal", id: "debitda", name: "Debt to EBITDA", core: false, value: dE, show: times(dE, 2), level: below(dE, 3.0, 2.0), good: "< 3.0x", strong: "< 2.0x",
        says: "Could repay all " + mm(debt) + " of debt" + (leases > 0 ? " (including " + mm(leases) + " of lease obligations)" : "") + " with about " + dE.toFixed(1) + " years of operating earnings before interest, tax, depreciation and amortisation (EBITDA)." });
    }

    var intr = fin(Q.interest) ? Math.abs(Q.interest) : NaN;
    if (!(debt > 0) && !(intr > 0)) add({ p: "bal", id: "icr", name: "Interest coverage", core: false, value: null, show: "No debt", level: 2, good: "> 2.0x", strong: "> 3.0x", says: "The company has no borrowings, so there is no interest to cover." });
    else if (!(intr > 0) || !fin(Q.opInc)) add({ p: "bal", id: "icr", name: "Interest coverage", core: false, level: null, show: "n/a", good: "> 2.0x", strong: "> 3.0x", says: "Interest expense is not reported separately, so coverage cannot be measured." });
    else {
      var icr = Q.opInc / intr;
      add({ p: "bal", id: "icr", name: "Interest coverage", core: false, value: icr, show: times(icr), level: above(icr, 2.0, 3.0), good: "> 2.0x", strong: "> 3.0x",
        says: "Operating profit (" + mm(Q.opInc) + ") covers the yearly interest bill (" + mm(intr) + ") " + (icr >= 100 ? "more than 100" : icr.toFixed(1)) + " times over." });
    }


    var tr = trend(Q.retained, Y), lr = trendLevel(tr);
    add({ p: "bal", id: "re", name: "Retained earnings", core: false, level: lr, series: Q.retained, good: "Positive and consistently growing", strong: "15%+ a year over 5 years",
      show: tr ? (tr.last <= 0 ? "Negative" : tr.cagr != null ? pct(tr.cagr, 0) + " a year" : "Up " + tr.up + " of " + tr.n + " yrs") : "n/a",
      says: tr ? "Profits kept in the business went from " + mm(tr.first) + " (" + tr.from + ") to " + mm(tr.last) + " (" + tr.to + "), rising in " + tr.up + " of " + tr.n + " years. " + (tr.last > 0 ? "This is money the company can use to fund new projects or repay debt without borrowing." : "A negative balance means past losses or payouts are larger than all the profit ever kept.") : "Not enough yearly history.",
      note: tr && lr === 0 && tr.last > 0 ? "Large share buybacks or dividends can reduce retained earnings even when the business is healthy." : null });

    /* ---------- Pillar 3: Growth Outlook ---------- */
    var te = trend(Q.eps, Y);
    if (te && te.cagr != null) add({ p: "grow", id: "epsg", name: "EPS growth (" + te.span + "-year)", core: false, value: te.cagr, show: pct(te.cagr) + " a year", level: above(te.cagr, 0.08, 0.15), good: "> 8–10% a year", strong: "> 15% a year", series: Q.eps,
      says: "Earnings per share grew from " + usd(te.first) + " (" + te.from + ") to " + usd(te.last) + " (" + te.to + "), about " + pct(te.cagr, 0) + " a year." + (te.first < te.last / 8 ? " The starting year was unusually low, which makes this rate look higher." : "") });
    else add({ p: "grow", id: "epsg", name: "EPS growth", core: false, level: te && te.last <= 0 ? 0 : null, show: te && te.last <= 0 ? "Loss-making" : "n/a", good: "> 8–10% a year", strong: "> 15% a year", series: Q.eps,
      says: te ? "Earnings per share were zero or negative at the start or end of the period, so a yearly growth rate cannot be calculated." : "Not enough yearly history." });

    var tv = trend(Q.rev, Y);
    if (tv && tv.cagr != null) {
      add({ p: "grow", id: "revg", name: "Revenue growth (" + tv.span + "-year)", core: false, value: tv.cagr, show: pct(tv.cagr) + " a year", level: above(tv.cagr, 0.08, 0.15), good: "> 8% a year", strong: "> 15% a year", series: Q.rev,
        says: "Sales grew from " + mm(tv.first) + " (" + tv.from + ") to " + mm(tv.last) + " (" + tv.to + "), about " + pct(tv.cagr, 0) + " a year. Revenue shows whether the core business is expanding, not just becoming more efficient." });
      var share = tv.up / tv.n;
      add({ p: "grow", id: "revc", name: "Growth consistency", core: false, value: share, show: tv.up + " of " + tv.n + " years", level: tv.up === tv.n ? 2 : share >= 0.75 ? 1 : 0, good: "Grew in most years", strong: "Grew every year",
        says: "Revenue rose in " + tv.up + " of the last " + tv.n + " years. " + (tv.up === tv.n ? "Steady growth every year." : share >= 0.75 ? "Growth was steady with one flat or down year." : "Growth has been uneven, so past growth is a less reliable guide.") });
    } else {
      add({ p: "grow", id: "revg", name: "Revenue growth", core: false, level: null, show: "n/a", good: "> 8% a year", strong: "> 15% a year", says: "Not enough yearly revenue history." });
      add({ p: "grow", id: "revc", name: "Growth consistency", core: false, level: null, show: "n/a", good: "Grew in most years", strong: "Grew every year", says: "Not enough yearly revenue history." });
    }

    /* ---------- scores ---------- */
    var pillars = PILLARS.map(function (P) {
      var ms = M.filter(function (m) { return m.p === P.id; }), pts = 0, max = 0;
      ms.forEach(function (m) { m.levelName = m.level == null ? "n/a" : LEVELS[m.level]; if (m.level == null) return; var w = m.core ? 2 : 1; pts += w * m.level; max += w * 2; });
      return { id: P.id, name: P.name, weight: P.weight, q: P.q, metrics: ms, score: max ? pts / max * 100 : null, scored: ms.filter(function (m) { return m.level != null; }).length };
    });
    var sw = 0, ss = 0;
    pillars.forEach(function (p) { if (p.score != null) { sw += p.weight; ss += p.weight * p.score; } });
    if (!sw) return { ok: false, reason: "nodata" };
    var score = ss / sw, g = grade(score);
    var scored = M.filter(function (m) { return m.level != null; }).length;
    var notes = [];
    if (gainAT > 0) notes.push("Profit figures exclude " + mm(gainAT) + " of one-off investment gains (after tax), so they show what the business earns in a normal year.");
    if (scored < M.length) notes.push((M.length - scored) + " of " + M.length + " metrics could not be measured for this company and are left out of the score.");
    if (Y.length) notes.push("Trend metrics use fiscal years " + Y[0] + " to " + Y[Y.length - 1] + ". Ratios use the last 12 months and the latest balance sheet.");
    return { ok: true, score: score, grade: g.grade, label: g.label, pillars: pillars, metrics: M, scored: scored, total: M.length, limited: scored / M.length < 0.6, notes: notes };
  }

  function grade(score) {
    for (var i = 0; i < GRADES.length; i++) if (score >= GRADES[i][0]) return { grade: GRADES[i][1], label: GRADES[i][2] };
    return { grade: "F", label: "Poor business" };
  }

  /* One plain sentence that combines business quality with the valuation verdict. */
  function combo(g, verdict) {
    var high = g === "A" || g === "B", low = g === "D" || g === "F";
    if (high && verdict === "BUY") return { tone: "pos", title: "Quality business at an attractive price", text: "The business scores well and the stock trades below its estimated value. This is the strongest combination." };
    if (high && verdict === "HOLD") return { tone: "", title: "Quality business at a fair price", text: "The business scores well, and the price is close to its estimated value. There is no big discount, but no big premium either." };
    if (high && verdict === "SELL") return { tone: "", title: "Quality business, but expensive", text: "The business scores well, but the price is well above its estimated value. It may be worth waiting for a better price." };
    if (low && verdict === "BUY") return { tone: "neg", title: "Possible value trap", text: "The stock looks cheap, but the business scores poorly. Weak businesses are often cheap for a reason, so check the weak areas below before acting on the BUY." };
    if (low) return { tone: "neg", title: "Weak business that is not cheap", text: "The business scores poorly and the stock does not trade at a discount. This is the least attractive combination." };
    return { tone: "", title: "Average business", text: "The business is neither clearly strong nor clearly weak, so the valuation verdict carries more weight. Check the weak areas below." };
  }

  /* One short plain-language line per measure, for the "Key points" list on the summary.
     Returns null when a measure is only Good (not worth a headline) or cannot be read. */
  function headline(m) {
    if (m.level == null || m.level === 1) return null;
    var s = m.level === 2, v = m.value, c = fin(v) ? Math.round(v * 100) + " cents" : "", x2 = fin(v) ? ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + v.toFixed(2) : "";
    switch (m.id) {
      case "roic": return s ? "Very efficient: earns " + c + " a year for every $1 invested in the business" : "Low returns: earns only " + c + " a year for every $1 invested";
      case "roe": return s ? "Strong returns for shareholders: " + m.show + " a year on their money" : "Weak returns for shareholders: " + m.show + " a year on their money";
      case "fcfni": return s ? "Profits are backed by real cash: " + x2 + " of free cash for every $1 of profit" : "Only " + x2 + " of free cash for every $1 of profit, so some profit is not turning into cash";
      case "fcfg": return s ? "Free cash flow has grown about " + m.show : "Free cash flow growth has been weak or uneven";
      case "npm": return s ? "High profit margin: keeps " + c + " of every $1 of sales" : "Thin profit margin: keeps only " + c + " of every $1 of sales";
      case "gpm": return s ? "Strong pricing power: " + m.show + " gross margin" : "Low gross margin (" + m.show + "), so little pricing power";
      case "de": return s ? "Low debt: " + x2 + " of debt for every $1 of shareholders' money" : (fin(v) ? "High debt: " + x2 + " of debt for every $1 of shareholders' money" : "Debts are larger than the company's book value");
      case "debitda": return s ? (v === 0 ? "No debt at all" : "Could repay all its debt with " + v.toFixed(1) + " years of earnings") : (fin(v) ? "Heavy debt: would take " + v.toFixed(1) + " years of earnings to repay" : "Operating earnings are negative, so debt cannot be repaid from earnings");
      case "icr": return s ? (fin(v) ? "Interest bill is easily covered (" + m.show + " over)" : "No debt, so no interest to pay") : "Interest payments take a large share of profit";
      case "re": return s ? "Retained profits are growing fast, funding future growth" : "Retained profits are not growing";
      case "epsg": return s ? "Earnings per share grew " + m.show : "Earnings per share have grown slowly (" + m.show + ")";
      case "revg": return s ? "Sales grew " + m.show : "Slow sales growth (" + m.show + ")";
      case "revc": return s ? "Sales grew every year" : "Sales growth has been uneven";
    }
    return null;
  }

  var api = { compute: compute, grade: grade, combo: combo, headline: headline, LEVELS: LEVELS, PILLARS: PILLARS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QS = api;
})(typeof window !== "undefined" ? window : globalThis);
