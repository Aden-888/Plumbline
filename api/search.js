/* Vercel serverless function: GET /api/search?q=TEXT returns up to 6 matching companies for the search box.
   Matches tickers, company names (biggest companies first) and near misses such as "nvdia". */
"use strict";
var Loader = require("../loader.js");

module.exports = async function (req, res) {
  var q = req.query || {};
  if (!q.q && req.url) { try { q.q = new URL(req.url, "http://x").searchParams.get("q"); } catch (e) {} }
  var text = Loader.cleanTicker(q.q);
  res.setHeader("Content-Type", "application/json");
  if (!text) { res.statusCode = 200; return res.end("[]"); }
  try {
    var list = await Loader.searchAny(text, 6);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.statusCode = 200; res.end(JSON.stringify(list));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200; res.end("[]");
  }
};
