/* Tiny web server for Plumbline. No dependencies (needs Node 18 or newer).
   Usage:  FMP_API_KEY=your_key node server.js     then open http://localhost:3000
   It serves the site and a /api/stock?t=TICKER endpoint, so visitors never see your key. */
"use strict";
var http = require("http"), fs = require("fs"), path = require("path");

var PORT = process.env.PORT || 3000, ROOT = __dirname;
var KEY = process.env.FMP_API_KEY || "";
if (!KEY) {
  try {
    fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).forEach(function (l) {
      var m = l.match(/^\s*FMP_API_KEY\s*=\s*(.+?)\s*$/); if (m) KEY = m[1].replace(/^["']|["']$/g, "");
      var c = l.match(/^\s*SEC_CONTACT\s*=\s*(.+?)\s*$/); if (c && !process.env.SEC_CONTACT) process.env.SEC_CONTACT = c[1].replace(/^["']|["']$/g, "");
      var d = l.match(/^\s*DATA_SOURCE\s*=\s*(.+?)\s*$/); if (d && !process.env.DATA_SOURCE) process.env.DATA_SOURCE = d[1].replace(/^["']|["']$/g, "");
      var w = l.match(/^\s*SITE_PASSWORD\s*=\s*(.+?)\s*$/); if (w && !process.env.SITE_PASSWORD) process.env.SITE_PASSWORD = w[1].replace(/^["']|["']$/g, "");
    });
  } catch (e) {}
}
if (KEY && !process.env.FMP_API_KEY) process.env.FMP_API_KEY = KEY;
var SOURCE = (process.env.DATA_SOURCE || "auto").toLowerCase(); /* auto | edgar | fmp */
var TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
var ALLOW = { "index.html": 1, "engine.js": 1, "quality.js": 1, "data.js": 1, "content.js": 1, "api.js": 1, "charts.js": 1, "manual.js": 1, "app.js": 1, "style.css": 1 };
var cache = {}, TTL = 10 * 60 * 1000;
/* Optional password. Set SITE_PASSWORD (in .env or on the host) and the browser asks for it once.
   Any user name works; only the password is checked. /health stays open so an uptime monitor can keep the site awake. */
var PASS = process.env.SITE_PASSWORD || "";
function authorised(req) {
  if (!PASS) return true;
  var h = req.headers.authorization || "", m = h.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  var dec = Buffer.from(m[1], "base64").toString("utf8"), pw = dec.slice(dec.indexOf(":") + 1);
  var a = Buffer.from(pw), b = Buffer.from(PASS);
  return a.length === b.length && require("crypto").timingSafeEqual(a, b);
}

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

var Loader = require("./loader.js");
function loadAny(t) { return Loader.loadAny(t); }

http.createServer(function (req, res) {
  var u = new URL(req.url, "http://localhost");
  if (u.pathname === "/health") return send(res, 200, "ok", "text/plain");
  if (!authorised(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Plumbline", charset="UTF-8"', "Content-Type": "text/plain" });
    return res.end("Password required.");
  }
  if (u.pathname === "/api/search") {
    var sq = Loader.cleanTicker(u.searchParams.get("q"));
    if (!sq) return send(res, 200, []);
    Loader.searchAny(sq, 6).then(function (l) { send(res, 200, l); }, function () { send(res, 200, []); });
    return;
  }
  if (u.pathname === "/api/stock") {
    var t = Loader.cleanTicker(u.searchParams.get("t")).toUpperCase();
    if (!t) return send(res, 400, { error: "Enter a ticker." });
    var hit = cache[t];
    if (hit && Date.now() - hit.at < TTL) return send(res, 200, hit.data);
    loadAny(t).then(function (d) { cache[t] = { at: Date.now(), data: d }; send(res, 200, d); })
      .catch(function (e) { send(res, 502, { error: e.message || "Could not load data.", suggest: e.suggest || [] }); });
    return;
  }
  var file = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
  if (!ALLOW[file]) return send(res, 404, "Not found", "text/plain");
  fs.readFile(path.join(ROOT, file), function (err, buf) {
    if (err) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(buf);
  });
}).listen(PORT, function () {
  console.log("Plumbline v2.4 is running at http://localhost:" + PORT + "\nData source: " + (SOURCE === "fmp" ? "FMP only" : "SEC filings + Yahoo prices (free), " + (KEY ? "FMP as backup" : "no key needed")) + (process.env.SEC_CONTACT ? "" : "\nTip: add SEC_CONTACT=your@email to a .env file. The SEC asks apps to identify themselves.") + (PASS ? "\nPassword protection is on." : ""));
});
