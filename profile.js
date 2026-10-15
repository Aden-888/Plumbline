/* "What the company does": a short business description shown above the Business Quality scorecard (v3.3).
   Server-side only (Node 18+). Used by server.js (local) and api/profile.js (Vercel).

   1. Find the company's English Wikipedia article. First through Wikidata, which records each company's SEC
      registration number (CIK, property P5531), so the match cannot pick a different company with a similar name.
      If Wikidata has no entry, fall back to a Wikipedia search on the company name, and only accept an article that
      clearly describes a company.
   2. Take a one-line background (first sentence, founding history removed) and up to three sentences on the main
      operations from the article intro, skipping history, rankings and lawsuits.
   3. Optional AI rewrite: if ANTHROPIC_API_KEY is set, Claude rewrites the summary into 2-3 plain-English sentences
      on what the company sells and how it makes money. Without a key, the Wikipedia summary is shown as it is.
   Wikipedia text is CC BY-SA, so the page always credits Wikipedia and links to the article. */
"use strict";
var Edgar = require("./edgar.js");

var UA = "Plumbline " + (process.env.SEC_CONTACT || "contact-not-set@example.com");
var WD = process.env.WIKIDATA_BASE || "https://query.wikidata.org/";
var WP = process.env.WIKIPEDIA_BASE || "https://en.wikipedia.org/";
var AI = process.env.ANTHROPIC_BASE || "https://api.anthropic.com/";
var MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

function getJSON(url, headers, ms) {
  var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, ms || 8000);
  return fetch(url, { headers: Object.assign({ "User-Agent": UA, "Accept": "application/json" }, headers || {}), signal: ctl.signal })
    .then(function (r) { clearTimeout(tm); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); },
      function (e) { clearTimeout(tm); throw e; });
}

/* Wikidata: English Wikipedia title for an SEC CIK (stored with or without leading zeros, so both are tried) */
function titleByCik(cik) {
  var n = String(+cik), padded = n.padStart(10, "0");
  var q = 'SELECT ?article WHERE { VALUES ?cik { "' + padded + '" "' + n + '" } ?item wdt:P5531 ?cik . ' +
    '?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . } LIMIT 1';
  return getJSON(WD + "sparql?format=json&query=" + encodeURIComponent(q), { "Accept": "application/sparql-results+json" }).then(function (j) {
    var b = j && j.results && j.results.bindings && j.results.bindings[0];
    if (!b || !b.article) return null;
    return decodeURIComponent(String(b.article.value).split("/wiki/")[1] || "") || null;
  });
}

/* Fallback: Wikipedia search on the cleaned company name */
function titleBySearch(name) {
  var q = String(name || "").replace(/\b(inc|corp|corporation|co|ltd|plc|holdings?|group|company|the|class [a-c])\b\.?/gi, " ").replace(/[^A-Za-z0-9&' ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return Promise.resolve(null);
  return getJSON(WP + "w/api.php?action=query&list=search&srlimit=3&format=json&srsearch=" + encodeURIComponent(q + " company")).then(function (j) {
    var hits = (j && j.query && j.query.search) || [], first = q.split(" ")[0].toLowerCase();
    var hit = hits.filter(function (h) { return String(h.title).toLowerCase().indexOf(first) >= 0; })[0];
    return hit ? hit.title : null;
  });
}

/* Split text into sentences. Full stops inside abbreviations ("Apple Inc.", "U.S.") are not sentence ends. */
function sentencesOf(t) {
  var guarded = t.replace(/\b(Inc|Corp|Co|Ltd|Jr|Sr|St|Mt|No|plc|U\.S|U\.K|N\.V|S\.A|L\.P|approx|e\.g|i\.e)\./g, "$1§").replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1§");
  return (guarded.match(/[^.!?]+[.!?]+(\s|$)/g) || [guarded]).map(function (x) { return x.replace(/§/g, ".").trim(); }).filter(Boolean);
}
function tidy(t) {
  return String(t || "").replace(/\s+/g, " ").replace(/\s*\([^()]*(?:NYSE|NASDAQ|Nasdaq|listen|pronounced|\/|;|formerly|stylized|abbreviated)[^()]*\)/gi, "")
    .replace(/\s*\(\s*\)/g, "").replace(/\s+([,.])/g, "$1").replace(/\[\d+\]/g, "").trim();
}
/* sentences about history, rankings or trivia: not what the company does */
var TRIVIA = /\b(ranked|ranks|ranking|Fortune|largest|biggest|most valuable|market capitali[sz]ation|by revenue|by market|Dow Jones|S&P 500|Nasdaq-100|component of|founded|founder|history|in (18|19|20)\d\d|renamed|went public|initial public offering|IPO|acquired by|share of|market share|lawsuit|controvers|criticis|fined|settle)\b/i;
/* sentences that describe operations: what it sells, its segments, brands and customers */
var OPS = /\b(segments?|divisions?|business(es)?|units?|subsidiar|operates|operations|offers|provides|sells|makes|manufactur|designs|develops|produces|products|services|platforms?|brands?|customers|clients|consumers|retail|stores|restaurants|franchis|software|cloud|devices|network|portfolio|includes|consists|through|revenue from|earns|serves|menu|markets?|expanded into|applications|plans|insurance)\b/i;

/* v3.3.2: a one-line background, plus the main operations (up to three points), from the article's intro */
function summary(title) {
  var t = title.replace(/ /g, "_");
  return Promise.all([
    getJSON(WP + "api/rest_v1/page/summary/" + encodeURIComponent(t)),
    getJSON(WP + "w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(title)).catch(function () { return null; })
  ]).then(function (res) {
    var j = res[0];
    if (!j || j.type === "disambiguation" || !j.extract) return null;
    var pages = res[1] && res[1].query && res[1].query.pages, intro = "";
    if (pages) Object.keys(pages).forEach(function (k) { if (pages[k].extract) intro = pages[k].extract; });
    var full = tidy(intro || j.extract), lead = sentencesOf(tidy(j.extract)), all = sentencesOf(full);
    /* background: the first sentence, cut at a comma if it runs on */
    var bg = lead[0] || all[0] || "";
    bg = bg.replace(/,?\s+(?:that was |which was |originally )?(?:founded|established|formed|started)\b.*$/i, ".").replace(/\.\.$/, ".");
    if (bg.length > 220) { var cut = bg.slice(0, 220).lastIndexOf(","); bg = (cut > 80 ? bg.slice(0, cut) : bg.slice(0, 217)) + "."; }
    var ops = [], seen = bg.toLowerCase();
    for (var i = 0; i < all.length && ops.length < 3; i++) {
      var x = all[i];
      if (seen.indexOf(x.toLowerCase().slice(0, 40)) >= 0 || x.length < 40 || x.length > 320) continue;
      if (TRIVIA.test(x) || !OPS.test(x)) continue;
      ops.push(x); seen += " " + x.toLowerCase();
    }
    return { title: j.title || title, text: bg, ops: ops, full: full.slice(0, 4000), url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || WP + "wiki/" + encodeURIComponent(t) };
  });
}
/* only accept a search result that reads like a company description */
function looksLikeCompany(s) { return s && /\b(company|corporation|conglomerate|multinational|manufacturer|retailer|bank|insurer|firm|maker|provider|operator|developer|chain|holding|business|brand|producer|supplier|group)\b/i.test(s.text); }

/* optional plain-English rewrite by Claude, grounded only in the Wikipedia text and the SEC industry.
   Returns { text: one-line background, ops: [up to 3 short points on the main operations] } or null. */
function rewrite(name, industry, text) {
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Promise.resolve(null);
  var prompt = "Using only the text below about " + name + (industry ? " (SEC industry: " + industry + ")" : "") + ", write for a beginner investor:\n" +
    "1. \"background\": ONE short sentence on what kind of company it is and where it is based.\n" +
    "2. \"ops\": 2 or 3 short plain-English points on its main operations: its main businesses or segments, what each sells, and who the customers are.\n" +
    "Do not add facts, numbers, opinions, history, rankings or investment advice. Reply with JSON only: {\"background\": \"...\", \"ops\": [\"...\", \"...\"]}\n\n" + text;
  var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 12000);
  return fetch(AI + "v1/messages", {
    method: "POST", signal: ctl.signal,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] })
  }).then(function (r) { clearTimeout(tm); if (!r.ok) throw new Error("AI " + r.status); return r.json(); }).then(function (j) {
    var t = ((j && j.content) || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(" ");
    var m = t.match(/\{[\s\S]*\}/), o = m ? JSON.parse(m[0]) : null;
    if (!o || !o.background || !Array.isArray(o.ops) || !o.ops.length) return null;
    return { text: String(o.background).trim(), ops: o.ops.slice(0, 3).map(function (x) { return String(x).trim(); }).filter(Boolean) };
  }).catch(function () { clearTimeout(tm); return null; });
}

/* main: { name, text (one-line background), ops (main operations), ai (true when Claude rewrote it), source, url, industry } or { none: true } */
function profile(ticker) {
  return Edgar.resolve(ticker).then(function (co) {
    var name = co.title, industry = "";
    return titleByCik(co.cik).catch(function () { return null; }).then(function (t) {
      if (t) return summary(t).catch(function () { return null; });
      return titleBySearch(name).catch(function () { return null; }).then(function (t2) { return t2 ? summary(t2).then(function (s) { return looksLikeCompany(s) ? s : null; }).catch(function () { return null; }) : null; });
    }).then(function (s) {
      if (!s || !s.text) return { none: true, name: name, industry: industry };
      return rewrite(name, industry, s.full || s.text).then(function (ai) {
        return { name: name, industry: industry, text: ai ? ai.text : s.text, ops: ai ? ai.ops : s.ops, ai: !!ai, source: "Wikipedia", article: s.title, url: s.url };
      });
    });
  });
}

module.exports = { profile: profile, _titleByCik: titleByCik, _summary: summary, _titleBySearch: titleBySearch, _rewrite: rewrite };
