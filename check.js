/* Quick test from the command line:  node check.js NOW      (no website needed) */
"use strict";
var fs = require("fs"), path = require("path");
try { fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach(function (l) { var m = l.match(/^\s*SEC_CONTACT\s*=\s*(.+?)\s*$/); if (m && !process.env.SEC_CONTACT) process.env.SEC_CONTACT = m[1].replace(/^["']|["']$/g, ""); }); } catch (e) {}
var Edgar = require("./edgar.js"), IV = require("./engine.js"), QS = require("./quality.js");
var t = process.argv[2] || "NOW";
function f0(v) { return typeof v === "number" && isFinite(v) ? v.toFixed(0) : "n/a"; }
console.log("Loading " + t + " from SEC filings + Yahoo prices ...");
Edgar.load(t).then(function (d) {
  var r = IV.compute(d, Object.assign(IV.defaultSettings(d), d.settings || {}));
  console.log("\nOK: " + d.name + " (" + d.ticker + ")  price $" + d.price.toFixed(2) + "  shares " + d.shares.toFixed(0) + "M");
  console.log("Latest 12 months to " + d.ttmEnd + ": revenue $" + d.ttm.rev.toFixed(0) + "M, net income $" + d.ttm.ni.toFixed(0) + "M, operating cash flow $" + d.ttm.ocf.toFixed(0) + "M, capex $" + d.ttm.capex.toFixed(0) + "M");
  console.log("Cash $" + d.cash.toFixed(0) + "M, debt $" + d.debt.toFixed(0) + "M, equity $" + d.equity.toFixed(0) + "M, beta " + d.beta.toFixed(2));
  console.log("History P/E " + d.hist.pe.map(function (v) { return v.toFixed(1); }).join(", ") + " | P/S " + d.hist.ps.map(function (v) { return v.toFixed(1); }).join(", ") + " | P/B " + d.hist.pb.map(function (v) { return v.toFixed(1); }).join(", "));
  console.log("Result: median $" + r.stats.median.toFixed(2) + " vs price $" + d.price.toFixed(2) + " -> " + r.stats.verdict);
  var s = r.settings, g = r.growth, pc = function (v) { return (v * 100).toFixed(1) + "%"; };
  console.log("\nAssumptions: WACC " + pc(r.wacc.wacc) + ", cost of equity " + pc(r.wacc.coe) + " | cash flow growth yr1 " + pc(g.cf[0]) + ", yr2 " + pc(g.cf[1]) + ", yr5 " + pc(s.g5) + ", yr10 " + pc(s.g10) + ", yr20 " + pc(s.gT) +
    " | 3-yr growth used: revenue " + pc(d.est.cagrRev) + ", EPS " + pc(d.est.cagrEps) + " | free cash flow $" + r.base.fcf.toFixed(0) + "M");
  console.log("\nThe nine methods:");
  r.methods.forEach(function (m) {
    var v = typeof m.value === "number" && isFinite(m.value);
    console.log("  " + (m.short + "                ").slice(0, 16) + (v ? ("$" + m.value.toFixed(2) + "            ").slice(0, 12) + (m.upside >= 0 ? "+" : "") + (m.upside * 100).toFixed(0) + "% vs price" : "not available (" + (m.why || "missing data") + ")"));
  });
  var q = QS.compute(d);
  if (!q.ok) console.log("\nBusiness quality: not scored (" + (q.reason === "financial" ? "bank, insurer or property trust" : "statements not available") + ")");
  else {
    var Q = d.quality, P = Q.prev || {};
    console.log("\nScorecard inputs ($M): tax rate " + (d.ttm.tax * 100).toFixed(1) + "%, operating income " + f0(Q.opInc) + ", D&A " + f0(Q.da) + ", interest " + f0(Q.interest) +
      ", borrowings " + f0(d.debt - (Q.leases || 0)) + ", leases " + f0(Q.leases) +
      " | year earlier (" + (P.date || "n/a") + "): equity " + f0(P.equity) + ", borrowings " + f0(P.borrowings) + (P.borrowNote ? " (" + P.borrowNote + ")" : "") + ", cash " + f0(P.cash));
    console.log("\nBusiness quality: " + q.grade + " (" + Math.round(q.score) + "/100) " + q.label);
    q.pillars.forEach(function (p) {
      console.log("  " + p.name + ": " + (p.score == null ? "n/a" : Math.round(p.score) + "/100"));
      p.metrics.forEach(function (m) { console.log("    " + (m.name + "                                        ").slice(0, 40) + (String(m.show) + "                    ").slice(0, 20) + m.levelName); });
    });
  }
  console.log("\nCompare these numbers with stockanalysis.com. Send me this whole output if anything looks off.");
}).catch(function (e) { console.log("\nFAILED: " + e.message); if (e.suggest && e.suggest.length) console.log("Did you mean: " + e.suggest.map(function (s) { return s.symbol + " (" + s.name + ")"; }).join(", ")); });
