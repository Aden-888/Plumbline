/* Loads live data for one ticker. Shared by server.js (local) and api/stock.js (Vercel).
   Order: free SEC filings + Yahoo prices first (almost any US company). If that fails and an FMP key
   exists, Financial Modeling Prep is tried. DATA_SOURCE=fmp forces FMP, DATA_SOURCE=edgar forces SEC + Yahoo. */
"use strict";
var LiveData = require("./api.js"), Edgar = require("./edgar.js"), SGX = require("./sgx.js");

function loadAny(t) {
  /* v3.11: Singapore stocks (D05.SI, or a listed code such as C38U) come from Yahoo Finance */
  if (SGX.normalize(t)) return SGX.load(t);
  return loadUS(t).catch(function (err) {
    /* a company name that is not a US company may be an SGX one ("dbs group", "singtel") */
    if (SGX.normalize(t, { names: true })) return SGX.load(SGX.normalize(t, { names: true }));
    throw err;
  });
}
function loadUS(t) {
  var KEY = process.env.FMP_API_KEY || "", SOURCE = (process.env.DATA_SOURCE || "auto").toLowerCase();
  if (SOURCE === "fmp") return KEY ? LiveData.load(t, KEY) : Promise.reject(new Error("DATA_SOURCE is fmp but FMP_API_KEY is not set."));
  if (SOURCE === "edgar" || !KEY) return Edgar.load(t);
  return Edgar.load(t).catch(function (edErr) {
    console.log("[" + t + "] SEC + Yahoo failed (" + edErr.message + "). Trying FMP.");
    return LiveData.load(t, KEY).catch(function (fmpErr) { fmpErr.suggest = edErr.suggest || fmpErr.suggest; fmpErr.message = edErr.message; throw fmpErr; });
  });
}
/* Keeps what someone typed as a ticker or a company name (letters, digits, spaces, . - & '), at most 60 characters. */
function cleanTicker(s) { return String(s || "").replace(/[^A-Za-z0-9.\-&' ]/g, "").replace(/\s+/g, " ").trim().slice(0, 60); }
function searchAny(q, n) { return Edgar.search(q, n); }
function tickerList() { return Edgar.tickerList(); }
function quote(t, range) { return Edgar.quote(t, range); }

module.exports = { loadAny: loadAny, cleanTicker: cleanTicker, searchAny: searchAny, tickerList: tickerList, quote: quote };
