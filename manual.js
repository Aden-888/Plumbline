/* Manual entry: lets anyone value any stock by typing in the same figures the Excel models use.
   Figures come from stockanalysis.com (financials, ratios, forecast and statistics pages). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };

  /* key, label, hint (where to find it), kind: n = number, l = list of numbers, t = text, opt = optional */
  var GROUPS = [
    ["The stock", [
      ["ticker", "Ticker", "For example MSFT", "t"],
      ["name", "Company name", "", "t", true],
      ["price", "Share price ($)", "Current price. Overview page.", "n"],
      ["shares", "Shares outstanding (millions)", "Balance sheet or statistics page.", "n"],
      ["dil", "Diluted shares (millions)", "Income statement, 'Shares Outstanding (Diluted)'. Leave blank to use shares outstanding.", "n", true],
      ["beta", "Beta (5-year)", "Statistics page. Leave blank for 1.0.", "n", true]
    ]],
    ["Balance sheet ($ millions)", [
      ["cash", "Cash and investments", "Balance sheet, 'Cash & Short-Term Investments'.", "n"],
      ["debt", "Total debt", "Balance sheet, 'Total Debt'.", "n"],
      ["equity", "Shareholders' equity", "Balance sheet, 'Shareholders' Equity'.", "n"]
    ]],
    ["Last 12 months ($ millions)", [
      ["rev", "Revenue", "Income statement, TTM column.", "n"],
      ["ni", "Net income", "Income statement, TTM column.", "n"],
      ["gain", "One-off investment gains (before tax)", "Income statement, 'Gain on Sale of Investments' or similar. Enter 0 if none.", "n", true],
      ["tax", "Tax rate (%)", "Statistics page, 'Effective Tax Rate'. Leave blank for 21.", "n", true],
      ["ocf", "Operating cash flow", "Cash flow statement, TTM column.", "n"],
      ["capex", "Capital spending", "Cash flow statement, 'Capital Expenditures'. Enter as a positive number.", "n"]
    ]],
    ["Valuation history (last 5 fiscal years, oldest first)", [
      ["pe", "P/E ratios", "Ratios page. Separate with commas, for example 25, 28, 30, 26, 24.", "l"],
      ["ps", "P/S ratios", "Ratios page. Five numbers separated by commas.", "l"],
      ["pb", "P/B ratios", "Ratios page. Five numbers separated by commas.", "l"]
    ]],
    ["Analyst forecasts", [
      ["r0", "Last fiscal year revenue ($ millions)", "Forecast page, revenue table, last actual year.", "n"],
      ["r1", "Next fiscal year revenue estimate ($ millions)", "Forecast page, first estimate.", "n"],
      ["rg2", "Revenue growth the year after (%)", "Forecast page, 'Revenue Next Year' growth.", "n"],
      ["rc", "Revenue growth per year over 3 years (%)", "Statistics page, 'Revenue Growth Forecast (3Y)'. It is a yearly rate.", "n"],
      ["e0", "Last fiscal year EPS ($)", "Forecast page, EPS table, last actual year.", "n"],
      ["e1", "Next fiscal year EPS estimate ($)", "Forecast page. Remove one-off gains if you know them.", "n"],
      ["e2", "EPS estimate the year after ($)", "Forecast page, 'EPS Next Year'.", "n"],
      ["ec", "EPS growth per year over 3 years (%)", "Statistics page, 'EPS Growth Forecast (3Y)'. It is a yearly rate.", "n"],
      ["target", "Average analyst price target ($)", "For reference only.", "n", true],
      ["cf1", "Cash flow growth next 12 months (%)", "Only if the company has given guidance. Leave blank to use revenue growth.", "n", true]
    ]]
  ];

  function render(prefill) {
    var p = prefill || {};
    var html = '<div class="wrap res"><div class="head"><h2>Enter the numbers yourself</h2></div>' +
      '<p class="sec__lede">Use this for any stock the automatic data cannot load. Copy the figures from stockanalysis.com. All money amounts are in $ millions unless the label says otherwise. Fields marked optional can be left blank.</p>' +
      '<form id="manualForm" novalidate>';
    GROUPS.forEach(function (g) {
      html += '<section class="card" style="margin-bottom:14px"><h3 class="card__title">' + esc(g[0]) + '</h3><div class="form">';
      g[1].forEach(function (f) {
        html += '<div class="fld"><label for="m_' + f[0] + '">' + esc(f[1]) + (f[4] ? ' <span class="opt">optional</span>' : "") + '</label>' +
          '<input id="m_' + f[0] + '" name="' + f[0] + '" ' + (f[3] === "t" ? 'type="text"' : 'type="text" inputmode="decimal"') + ' value="' + esc(p[f[0]] == null ? "" : p[f[0]]) + '" autocomplete="off"><p>' + esc(f[2]) + "</p></div>";
      });
      html += "</div></section>";
    });
    html += '<div id="manualErr" class="notice notice--error hidden" role="alert"></div>' +
      '<p style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0"><button class="btnmain" type="submit" style="border:0;font:inherit;font-weight:700">Value this stock</button><button type="button" class="btn" id="manualEx">Fill with the NVDA example</button></p></form></div>';
    return html;
  }

  var num = function (s) { var v = parseFloat(String(s).replace(/[$,%\s]/g, "")); return isFinite(v) ? v : NaN; };
  function list(s) { return String(s).split(/[,\s;]+/).filter(Boolean).map(num); }

  /* Turn the form values into the same input object the engine and the live adapter use. */
  function build(v) {
    var err = [], need = function (k, label, positive) { var x = num(v[k]); if (!isFinite(x) || (positive && x <= 0)) err.push(label); return x; };
    var t = String(v.ticker || "").trim().toUpperCase();
    if (!t) err.push("Ticker");
    var price = need("price", "Share price", true), shares = need("shares", "Shares outstanding", true);
    var dil = String(v.dil).trim() === "" ? shares : need("dil", "Diluted shares", true);
    var beta = String(v.beta).trim() === "" ? 1 : need("beta", "Beta");
    var cash = need("cash", "Cash and investments"), debt = need("debt", "Total debt"), equity = need("equity", "Shareholders' equity");
    var rev = need("rev", "Revenue", true), ni = need("ni", "Net income"), ocf = need("ocf", "Operating cash flow"), capex = Math.abs(need("capex", "Capital spending"));
    var gain = String(v.gain).trim() === "" ? 0 : need("gain", "One-off gains");
    var tax = String(v.tax).trim() === "" ? 21 : need("tax", "Tax rate");
    var pe = list(v.pe), ps = list(v.ps), pb = list(v.pb);
    if (pe.length < 2 || pe.some(isNaN)) err.push("P/E ratios (at least 2 numbers)");
    if (ps.length < 2 || ps.some(function (x) { return !(x > 0); })) err.push("P/S ratios (at least 2 positive numbers)");
    if (pb.length < 2 || pb.some(function (x) { return !(x > 0); })) err.push("P/B ratios (at least 2 positive numbers)");
    var r0 = need("r0", "Last fiscal year revenue", true), r1 = need("r1", "Next fiscal year revenue", true), rg2 = need("rg2", "Revenue growth the year after"), rc = need("rc", "3-year revenue growth");
    var e0 = need("e0", "Last fiscal year EPS"), e1 = need("e1", "Next fiscal year EPS"), e2 = need("e2", "EPS the year after"), ec = need("ec", "3-year EPS growth");
    if (err.length) return { error: err };
    var tgt = String(v.target).trim() === "" ? null : num(v.target);
    var cf1 = String(v.cf1).trim() === "" ? null : num(v.cf1) / 100;
    var today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    var epsTTM = (ni / dil);
    return { inputs: {
      ticker: t, name: String(v.name || "").trim() || t, exchange: "", asOf: today, ttmEnd: "entered by you", fyEnd: "", manual: true,
      price: price, shares: shares, dilShares: dil, cash: cash, debt: debt, equity: equity, beta: beta,
      ttm: { rev: rev, ni: ni, gain: gain, tax: tax / 100, ocf: ocf, capex: capex, epsGaap: epsTTM },
      hist: { labels: ps.map(function (x, i) { return "Year " + (i + 1); }), pe: pe, ps: ps, pb: pb },
      cur: { pe: epsTTM > 0 ? price / epsTTM : null, ps: price * shares / rev, pb: equity > 0 ? price * shares / equity : null },
      est: { rev: [r0, r1, r1 * (1 + rg2 / 100), r0 * Math.pow(1 + rc / 100, 3)], eps: [e0, e1, e2, e0 * Math.pow(1 + ec / 100, 3)],
        cagrRev: rc / 100, cagrEps: ec / 100, cfG1: cf1, calWeight: 0.5, target: tgt },
      settings: {},
      caveats: ["All figures on this page were typed in by you. The result is only as good as those inputs, so double-check them against the company's filings."]
    } };
  }

  window.Manual = { render: render, build: build, example: function () {
    var p = window.PRESETS.NVDA, e = p.est;
    return { ticker: "NVDA", name: p.name, price: p.price, shares: p.shares, dil: p.dilShares, beta: p.beta, cash: p.cash, debt: p.debt, equity: p.equity,
      rev: p.ttm.rev, ni: p.ttm.ni, gain: p.ttm.gain, tax: (p.ttm.tax * 100).toFixed(2), ocf: p.ttm.ocf, capex: p.ttm.capex,
      pe: p.hist.pe.join(", "), ps: p.hist.ps.join(", "), pb: p.hist.pb.join(", "),
      r0: e.rev[0], r1: e.rev[1], rg2: 68.15, rc: (e.cagrRev * 100).toFixed(2), e0: e.eps[0], e1: e.eps[1], e2: e.eps[2], ec: (e.cagrEps * 100).toFixed(2), target: e.target, cf1: "" };
  } };
})();
