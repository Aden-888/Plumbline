/* Loads live data for one ticker. Shared by server.js (local) and api/stock.js (Vercel).
   Order: free SEC filings + Yahoo prices first (almost any US company). If that fails and an FMP key
   exists, Financial Modeling Prep is tried. DATA_SOURCE=fmp forces FMP, DATA_SOURCE=edgar forces SEC + Yahoo. */
"use strict";
var LiveData = require("./api.js"), Edgar = require("./edgar.js");

function loadAny(t) {
  var KEY = process.env.FMP_API_KEY || "", SOURCE = (process.env.DATA_SOURCE || "auto").toLowerCase();
  if (SOURCE === "fmp") return KEY ? LiveData.load(t, KEY) : Promise.reject(new Error("DATA_SOURCE is fmp but FMP_API_KEY is not set."));
  if (SOURCE === "edgar" || !KEY) return Edgar.load(t);
  return Edgar.load(t).catch(function (edErr) {
    console.log("[" + t + "] SEC + Yahoo failed (" + edErr.message + "). Trying FMP.");
    return LiveData.load(t, KEY).catch(function (fmpErr) { fmpErr.suggest = edErr.suggest || fmpErr.suggest; fmpErr.message = edErr.message; throw fmpErr; });
  });
}
function cleanTicker(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12); }

module.exports = { loadAny: loadAny, cleanTicker: cleanTicker };
