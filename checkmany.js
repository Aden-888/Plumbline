/* Try many tickers at once with the same loader the website uses, and report which fail and why.
   Run in the Plumbline folder (Node 18+):
       node checkmany.js                       the 300 largest Nasdaq companies
       node checkmany.js --exchange NYSE --top 200
       node checkmany.js --tickers NOW,SBUX,MCD
   Results: checkmany-output.txt (failures grouped by reason) and checkmany-output.json (every ticker). */
"use strict";
var fs = require("fs"), path = require("path");
try { fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach(function (l) { var m = l.match(/^\s*SEC_CONTACT\s*=\s*(.+?)\s*$/); if (m && !process.env.SEC_CONTACT) process.env.SEC_CONTACT = m[1].replace(/^["']|["']$/g, ""); }); } catch (e) {}
var Edgar = require("./edgar.js"), IV = require("./engine.js");

function arg(name, def) { var i = process.argv.indexOf("--" + name); return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf("--") !== 0 ? process.argv[i + 1] : def; }
var EXCHANGE = String(arg("exchange", "Nasdaq")), TOP = +arg("top", 300);
var UA = "Plumbline " + (process.env.SEC_CONTACT || "contact-not-set@example.com");
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* the SEC's list with exchanges, ordered by company size (largest first) */
function exchangeList() {
  return fetch("https://www.sec.gov/files/company_tickers_exchange.json", { headers: { "User-Agent": UA } }).then(function (r) {
    if (!r.ok) throw new Error("The SEC exchange list returned " + r.status + ". Check SEC_CONTACT in .env.");
    return r.json();
  }).then(function (j) {
    var f = j.fields, iT = f.indexOf("ticker"), iE = f.indexOf("exchange"), seen = {}, out = [];
    j.data.forEach(function (row) {
      var t = String(row[iT] || "").toUpperCase(), ex = String(row[iE] || "");
      if (!t || seen[t] || ex.toLowerCase() !== EXCHANGE.toLowerCase()) return;
      if (/[-.](P|W|U|R|WS)[A-Z]?$/.test(t) || /W$/.test(t) && t.length === 5) return; /* preferreds, warrants, units, rights */
      seen[t] = 1; out.push(t);
    });
    return out.slice(0, TOP);
  });
}
function group(msg) {
  return String(msg || "").replace(/\b(?!SEC\b|US\b|GAAP\b|IFRS\b|USD\b)[A-Z][A-Z0-9.\-]{0,6}\b(?=('s)? )/g, "X").replace(/\d{4}/g, "YYYY").replace(/[\d.]+(M|B)?\b/g, "N").slice(0, 110);
}

async function main() {
  var list = arg("tickers", null) ? arg("tickers").toUpperCase().split(/[,\s]+/).filter(Boolean) : await exchangeList();
  console.log("Checking " + list.length + " tickers" + (arg("tickers", null) ? "" : " (largest " + EXCHANGE + " companies)") + " with the website's loader ...\n");
  var rows = [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i], row = { ticker: t };
    try {
      var d = await Edgar.load(t), r = IV.compute(d, Object.assign(IV.defaultSettings(d), d.settings || {}));
      row.ok = !!r.stats.n; row.name = d.name; row.price = d.price; row.value = r.stats.median; row.verdict = r.stats.verdict;
      row.methods = r.stats.n + "/" + r.methods.length; row.type = r.type && r.type.id;
      if (!row.ok) row.error = "None of the methods could be calculated";
      else if (!(row.value / row.price > 0.02 && row.value / row.price < 50)) row.warn = "Value is " + (row.value / row.price).toFixed(1) + "x the price: check the share count";
    } catch (e) { row.ok = false; row.error = e.message; }
    rows.push(row);
    console.log(("[" + (i + 1) + "/" + list.length + "] " + t + "        ").slice(0, 18) + (row.ok ? "OK   " + (row.warn ? "WARNING " + row.warn : row.verdict + " (" + row.methods + " methods)") : "FAIL " + String(row.error).slice(0, 90)));
    await sleep(150);
  }
  var bad = rows.filter(function (r) { return !r.ok; }), warn = rows.filter(function (r) { return r.ok && r.warn; }), g = {};
  bad.forEach(function (r) { var k = group(r.error); (g[k] = g[k] || []).push(r.ticker); });
  var L = ["PLUMBLINE TICKER CHECK " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    (arg("tickers", null) ? "Your list" : "Largest " + list.length + " " + EXCHANGE + " companies") + ": " + (rows.length - bad.length) + " work, " + bad.length + " fail, " + warn.length + " look suspicious.", "", "FAILURES BY REASON"];
  Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).forEach(function (k) { L.push("  " + g[k].length + " x " + k); L.push("      " + g[k].join(" ")); });
  if (warn.length) { L.push("", "SUSPICIOUS VALUES"); warn.forEach(function (r) { L.push("  " + r.ticker + ": " + r.warn + " (price " + r.price.toFixed(2) + ", value " + r.value.toFixed(2) + ")"); }); }
  fs.writeFileSync(path.join(__dirname, "checkmany-output.txt"), L.join("\n"));
  fs.writeFileSync(path.join(__dirname, "checkmany-output.json"), JSON.stringify(rows, null, 1));
  console.log("\n" + L.join("\n") + "\n\nSaved: checkmany-output.txt and checkmany-output.json");
}
main().catch(function (e) { console.log("Stopped: " + e.message); });
