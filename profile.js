/* "What the company does": a short business description shown above the Business Quality scorecard (v3.3).
   Server-side only (Node 18+). Used by server.js (local) and api/profile.js (Vercel).

   1. Find the company's English Wikipedia article. First through Wikidata, which records each company's SEC
      registration number (CIK, property P5531), so the match cannot pick a different company with a similar name.
      If Wikidata has no entry, fall back to a Wikipedia search on the company name, and only accept an article that
      clearly describes a company.
   2. Take the article's short summary (first 3 sentences, at most about 600 characters).
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

/* first few sentences of the article summary */
function summary(title) {
  return getJSON(WP + "api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_"))).then(function (j) {
    if (!j || j.type === "disambiguation" || !j.extract) return null;
    var sentences = String(j.extract).replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(\s|$)/g) || [j.extract], text = "";
    for (var i = 0; i < sentences.length && i < 3; i++) { if (text && (text + sentences[i]).length > 600) break; text += sentences[i]; }
    return { title: j.title || title, text: text.trim(), url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || WP + "wiki/" + encodeURIComponent(title) };
  });
}
/* only accept a search result that reads like a company description */
function looksLikeCompany(s) { return s && /\b(company|corporation|conglomerate|multinational|manufacturer|retailer|bank|insurer|firm|maker|provider|operator|developer|chain|holding|business|brand|producer|supplier|group)\b/i.test(s.text); }

/* optional plain-English rewrite by Claude, grounded only in the Wikipedia text and the SEC industry */
function rewrite(name, industry, text) {
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Promise.resolve(null);
  var prompt = "Rewrite this description of " + name + (industry ? " (SEC industry: " + industry + ")" : "") + " for a beginner investor, in 2 or 3 short, plain-English sentences. " +
    "Say what the company sells or does, who its customers are, and how it mainly makes money. Use only facts in the text below; do not add numbers, opinions, forecasts or investment advice. " +
    "Reply with the sentences only.\n\n" + text;
  var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 12000);
  return fetch(AI + "v1/messages", {
    method: "POST", signal: ctl.signal,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 220, messages: [{ role: "user", content: prompt }] })
  }).then(function (r) { clearTimeout(tm); if (!r.ok) throw new Error("AI " + r.status); return r.json(); }).then(function (j) {
    var t = ((j && j.content) || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(" ").trim();
    return t && t.length > 40 ? t : null;
  }).catch(function () { clearTimeout(tm); return null; });
}

/* main: { name, text, ai (true when Claude rewrote it), source, url, industry } or { none: true } */
function profile(ticker) {
  return Edgar.resolve(ticker).then(function (co) {
    var name = co.title, industry = "";
    return titleByCik(co.cik).catch(function () { return null; }).then(function (t) {
      if (t) return summary(t).catch(function () { return null; });
      return titleBySearch(name).catch(function () { return null; }).then(function (t2) { return t2 ? summary(t2).then(function (s) { return looksLikeCompany(s) ? s : null; }).catch(function () { return null; }) : null; });
    }).then(function (s) {
      if (!s || !s.text) return { none: true, name: name, industry: industry };
      return rewrite(name, industry, s.text).then(function (ai) {
        return { name: name, industry: industry, text: ai || s.text, ai: !!ai, source: "Wikipedia", article: s.title, url: s.url };
      });
    });
  });
}

module.exports = { profile: profile, _titleByCik: titleByCik, _summary: summary, _titleBySearch: titleBySearch, _rewrite: rewrite };
