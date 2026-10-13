/* Vercel serverless function: GET /api/stock?t=TICKER returns the same data as server.js does locally.
   Set SEC_CONTACT (your email) in the Vercel project's Environment Variables. */
"use strict";
var Loader = require("../loader.js");

module.exports = async function (req, res) {
  var q = req.query || {};
  if (!q.t && req.url) { try { q.t = new URL(req.url, "http://x").searchParams.get("t"); } catch (e) {} }
  var t = Loader.cleanTicker(q.t).toUpperCase();
  res.setHeader("Content-Type", "application/json");
  if (!t) { res.statusCode = 400; return res.end(JSON.stringify({ error: "Enter a ticker." })); }
  try {
    var d = await Loader.loadAny(t);
    /* Vercel's edge cache keeps each ticker for 10 minutes, so repeat visits are instant and the SEC is not asked again */
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.statusCode = 200;
    res.end(JSON.stringify(d));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: (e && e.message) || "Could not load data.", suggest: (e && e.suggest) || [] }));
  }
};
