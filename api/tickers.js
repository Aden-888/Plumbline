/* Vercel serverless function: GET /api/tickers returns every US-listed company in the SEC list as
   [[ticker, name], ...], largest first. The browser loads it once so search suggestions appear instantly as you type.
   Cached at Vercel's edge for a day, so the SEC is asked rarely. */
"use strict";
var Loader = require("../loader.js");

module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    var list = await Loader.tickerList();
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.statusCode = 200; res.end(JSON.stringify(list));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 502; res.end(JSON.stringify({ error: (e && e.message) || "Could not load the company list." }));
  }
};
