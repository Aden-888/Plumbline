/* Vercel serverless function: GET /api/profile?t=TICKER returns a short "what the company does" paragraph.
   Cached at Vercel's edge for a week, because a company's business rarely changes. */
"use strict";
var Profile = require("../profile.js");

module.exports = async function (req, res) {
  var q = req.query || {};
  if (!q.t && req.url) { try { q.t = new URL(req.url, "http://x").searchParams.get("t"); } catch (e) {} }
  var t = String(q.t || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  res.setHeader("Content-Type", "application/json");
  if (!t) { res.statusCode = 400; return res.end(JSON.stringify({ error: "Enter a ticker." })); }
  try {
    var d = await Profile.profile(t);
    res.setHeader("Cache-Control", d.none ? "public, s-maxage=3600" : "public, s-maxage=604800, stale-while-revalidate=86400");
    res.statusCode = 200; res.end(JSON.stringify(d));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200; res.end(JSON.stringify({ none: true }));
  }
};
