/* Vercel serverless function: GET /api/quote?t=TICKER&range=1y returns the latest price, the previous close and
   the price history for the chart (range 1mo, 6mo, 1y or 5y). Cached for one minute, so the price stays fresh. */
"use strict";
var Loader = require("../loader.js");

module.exports = async function (req, res) {
  var q = req.query || {};
  if ((!q.t || !q.range) && req.url) { try { var u = new URL(req.url, "http://x"); q.t = q.t || u.searchParams.get("t"); q.range = q.range || u.searchParams.get("range"); } catch (e) {} }
  var t = String(q.t || "").toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 12);
  res.setHeader("Content-Type", "application/json");
  if (!t) { res.statusCode = 400; return res.end(JSON.stringify({ error: "Enter a ticker." })); }
  try {
    var d = await Loader.quote(t, q.range);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.statusCode = 200; res.end(JSON.stringify(d));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 502; res.end(JSON.stringify({ error: (e && e.message) || "Could not load the price." }));
  }
};
