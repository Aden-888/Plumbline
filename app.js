(function () {
  "use strict";
  var IV = window.IV, QS = window.QS, F = window.CONTENT.fmt, Charts = window.Charts;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var fin = IV.fin;
  var KEY = "plumbline_fmp_key";
  var state = { inputs: null, defaults: null, settings: null, open: {}, result: null, quality: null };

  function store(get, v) {
    try { return get ? localStorage.getItem(KEY) : (v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY)); } catch (e) { return null; }
  }
  var cls = function (up, s) { return up >= s.buy ? "pos" : up <= s.sell ? "neg" : ""; };
  var barCol = function (up, s) { return up >= s.buy ? "#4cb782" : up <= s.sell ? "#d66b63" : "#c9a75a"; };
  var scoreCol = function (v) { return v >= 65 ? "#4cb782" : v >= 50 ? "#c9a75a" : "#d66b63"; };

  /* ---------------- flow ---------------- */
  function loadLive(t) {
    /* the hosted copy (a static page) has no server, so live tickers are not available there */
    if (window.PLUMBLINE_STATIC) {
      var se = new Error(t + " is not built in. This hosted copy of Plumbline cannot fetch live data, so it can value NVDA and CRM, or any stock whose figures you enter yourself. Live tickers work when Plumbline runs with server.js.");
      return Promise.reject(se);
    }
    /* 1) the site's own server (works when served by server.js), 2) the visitor's own API key */
    var viaServer = location.protocol.indexOf("http") === 0
      ? fetch("/api/stock?t=" + encodeURIComponent(t)).then(function (r) {
          if (r.ok) return r.json();
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.status === 502 || r.status === 400) { var er = new Error(j.error || "Could not load data."); er.suggest = j.suggest; throw er; }
            if (r.status >= 500) throw new Error("The live data service is not responding right now (error " + r.status + "). Try again in a minute, or enter the numbers yourself.");
            return null; /* 404 (static host) or 503 (server has no key): use the visitor's key */
          });
        }, function () { return null; })
      : Promise.resolve(null);
    return viaServer.then(function (d) {
      if (d) return d;
      var key = store(true);
      if (!key) { var e = new Error("needkey"); e.needKey = true; throw e; }
      return window.LiveData.load(t, key);
    });
  }
  function search(raw) {
    sugSeq++; clearTimeout(sugT); closeSug();
    var q = String(raw || "").replace(/[^A-Za-z0-9.\-&' ]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    var t = q.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!t) return;
    $("heroMsg").innerHTML = "";
    if (window.PRESETS[t]) return show(window.PRESETS[t]);
    /* a company name such as "salesforce" or "nvidia" opens the same checked data as its ticker */
    var byName = presetByName(raw);
    if (byName) return show(byName);
    /* the search engine in the browser turns a name into its ticker straight away ("apple" -> AAPL) */
    var I = sIndex(), hit = window.SearchCore && SearchCore.pick(I, q);
    if (hit) { t = hit.symbol; if (window.PRESETS[t]) return show(window.PRESETS[t]); q = t; }
    else if (S.full && window.SearchCore) {
      /* the full company list is loaded and nothing matches exactly: show the closest companies at once */
      var near = SearchCore.rank(I, q, 5);
      if (near.length) return fail(q, "Did you mean one of these?", near);
    }
    var ask = q.indexOf(" ") >= 0 || q.length > 6 ? q : t;
    setLoading(true, "Fetching data for " + ask + "…");
    loadLive(ask).then(function (inp) { setLoading(false); show(inp); })
      .catch(function (e) {
        setLoading(false);
        if (e.needKey) return needKey(t);
        var m = e.message || String(e);
        if (/failed to fetch|networkerror|load failed/i.test(m)) m = "Could not reach the data provider. Check your internet connection and try again.";
        fail(q, m, e.suggest);
      });
  }
  function presetByName(raw) {
    var q = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (q.length < 3) return null;
    var hit = null;
    Object.keys(window.PRESETS).forEach(function (k) {
      var n = String(window.PRESETS[k].name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
      if (n.indexOf(q) === 0 || n.split(" ")[0] === q) hit = window.PRESETS[k];
    });
    return hit;
  }
  function setLoading(on, msg) {
    $("loading").classList.toggle("hidden", !on);
    if (msg) $("loadingText").textContent = msg;
    if (on) $("results").classList.add("hidden");
  }
  function placeMsg(html) {
    var inHero = !$("hero").classList.contains("hidden");
    if (inHero) { $("heroMsg").innerHTML = html; return; }
    $("results").classList.remove("hidden");
    $("barForm").classList.remove("hidden");
    $("results").innerHTML = '<div class="wrap res">' + html + "</div>";
  }
  function needKey(t) {
    placeMsg('<div class="notice"><h3>' + esc(t) + ' needs a live data connection</h3>' +
      '<p>Plumbline has full data for NVDA and CRM built in. To value any other stock, connect a data provider. (If you run the site with server.js and a key, this step is skipped.) Paste a free API key from <a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noopener">Financial Modeling Prep</a>. The key is saved only in this browser.</p>' +
      '<form class="search" id="keyForm" autocomplete="off"><input id="keyInput" aria-label="API key" placeholder="Paste API key" type="password"><button type="submit">Save and value ' + esc(t) + '</button></form><p style="margin-top:12px">Or <button class="btn" data-manual="1">enter the numbers yourself</button></p></div>');
    document.querySelectorAll("[data-manual]").forEach(function (b) { b.addEventListener("click", function () { showManual({ ticker: t }); }); });
    $("keyForm").addEventListener("submit", function (e) { e.preventDefault(); var v = $("keyInput").value.trim(); if (v) { store(false, v); search(t); } });
  }
  function suggestHtml(list) {
    if (!list || !list.length) return "";
    return '<div class="didmean">' + list.map(function (s) { return '<button class="dm" data-t="' + esc(s.symbol) + '"><b>' + esc(s.symbol) + "</b><span>" + esc(titleCase(s.name || "")) + "</span></button>"; }).join("") + "</div>";
  }
  function bindMsg(t) {
    document.querySelectorAll("#heroMsg [data-t], #results [data-t]").forEach(function (b) { b.addEventListener("click", function () { search(b.dataset.t); }); });
    var m = document.querySelectorAll("[data-manual]"); m.forEach(function (b) { b.addEventListener("click", function () { showManual({ ticker: t }); }); });
    var k = $("resetKey"); if (k) k.addEventListener("click", function () { store(false, null); needKey(t); });
  }
  function titleCase(n) { return /[a-z]/.test(n) ? n : n.toLowerCase().replace(/(^|[\s\-&\/(.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\b(Inc|Corp|Co|Ltd|Plc)\b\.?/g, "$1."); }

  /* ---------------- search engine and live suggestions ----------------
     Matching runs in the browser (search-core.js), so suggestions appear on every keystroke with no wait.
     It starts with a built-in list of well-known companies, then quietly loads the full SEC list of US-listed
     companies (/api/tickers) and keeps it in this browser for a week. */
  var S = { I: null, full: false, loading: null }, sugT = null, sugSeq = 0, sugBox = null, TK_KEY = "plumbline_tickers_v1";
  function niceNames() { var m = {}; (window.SearchCore ? SearchCore.POPULAR : []).forEach(function (o) { m[o.ticker] = o.title; }); Object.keys(window.PRESETS).forEach(function (k) { m[k] = m[k] || window.PRESETS[k].name; }); return m; }
  function sIndex() {
    if (S.I || !window.SearchCore) return S.I;
    var list = SearchCore.POPULAR.map(function (o) { return { ticker: o.ticker, title: o.title }; });
    Object.keys(window.PRESETS).forEach(function (k) { if (!list.some(function (o) { return o.ticker === k; })) list.push({ ticker: k, title: window.PRESETS[k].name }); });
    S.I = SearchCore.makeIndex(list);
    try { var c = JSON.parse(localStorage.getItem(TK_KEY) || "null"); if (c && c.list && c.list.length > 1000 && Date.now() - c.at < 7 * 864e5) useFull(c.list); } catch (e) {}
    return S.I;
  }
  function useFull(rows) {
    var nice = niceNames();
    S.I = SearchCore.makeIndex(rows.map(function (r) { return { ticker: r[0], title: nice[String(r[0]).toUpperCase()] || r[1] }; }));
    S.full = true;
  }
  function loadFull() {
    if (S.full || S.loading || window.PLUMBLINE_STATIC || location.protocol.indexOf("http") !== 0) return S.loading;
    S.loading = fetch("/api/tickers").then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (rows) {
      S.loading = null;
      if (!Array.isArray(rows) || rows.length < 1000) return;
      useFull(rows);
      try { localStorage.setItem(TK_KEY, JSON.stringify({ at: Date.now(), list: rows })); } catch (e) {}
      if (sugBox && sugBox.input.value.trim()) refreshSug(sugBox.input);
    });
    return S.loading;
  }
  function closeSug() {
    ["heroSug", "barSug"].forEach(function (id) { var u = $(id); if (u) { u.hidden = true; u.innerHTML = ""; } });
    ["heroInput", "barInput"].forEach(function (id) { var i = $(id); if (i) { i.setAttribute("aria-expanded", "false"); i.removeAttribute("aria-activedescendant"); } });
    sugBox = null;
  }
  function hl(text, q, mode) {
    var t = String(text), low = t.toLowerCase(), k = String(q).trim().toLowerCase(), i = -1;
    if (k) { i = mode === "start" ? (low.indexOf(k) === 0 ? 0 : -1) : low.search(new RegExp("(^|[^a-z0-9])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); if (i > 0 && !/[a-z0-9]/.test(low[i])) i++; }
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + k.length)) + "</mark>" + esc(t.slice(i + k.length));
  }
  function drawSug(input, list, listId, q) {
    var u = $(listId); if (!u) return;
    if (!list.length || document.activeElement !== input) { u.hidden = true; u.innerHTML = ""; input.setAttribute("aria-expanded", "false"); sugBox = null; return; }
    u.innerHTML = list.map(function (s, i) {
      return '<li role="option" aria-selected="false" id="' + listId + '_' + i + '" data-t="' + esc(s.symbol) + '"><b>' + hl(s.symbol, q, "start") + '</b><span>' + hl(titleCase(s.name || ""), q) + "</span>" + (s.how === "close" ? '<em>close match</em>' : "") + "</li>";
    }).join("") + (S.full ? "" : '<li class="sug__note" aria-hidden="true">Loading all US-listed companies…</li>');
    u.hidden = false; input.setAttribute("aria-expanded", "true"); sugBox = { input: input, u: u, i: -1 };
  }
  function refreshSug(input) {
    var listId = input.id === "heroInput" ? "heroSug" : "barSug", q = input.value.trim();
    clearTimeout(sugT);
    if (!q) return closeSug();
    var I = sIndex(); if (!I) return;
    var hits = SearchCore.rank(I, q, 6);
    drawSug(input, hits, listId, q);
    /* before the full list has arrived, ask the server too when the built-in list has few answers */
    if (!S.full && hits.length < 4 && q.length >= 2 && !window.PLUMBLINE_STATIC && location.protocol.indexOf("http") === 0) {
      var my = ++sugSeq;
      sugT = setTimeout(function () {
        fetch("/api/search?q=" + encodeURIComponent(q)).then(function (r) { return r.ok ? r.json() : []; }, function () { return []; }).then(function (l) {
          if (my !== sugSeq || S.full || !Array.isArray(l) || input.value.trim() !== q) return;
          var seen = {}, merged = hits.concat(l).filter(function (x) { if (seen[x.symbol]) return false; seen[x.symbol] = 1; return true; }).slice(0, 6);
          drawSug(input, merged, listId, q);
        });
      }, 150);
    }
  }
  function wireSug(inputId, listId) {
    var input = $(inputId), u = $(listId); if (!input || !u) return;
    input.addEventListener("input", function () { loadFull(); refreshSug(input); });
    input.addEventListener("focus", function () { loadFull(); if (input.value.trim()) refreshSug(input); });
    input.addEventListener("keydown", function (e) {
      if (!sugBox || sugBox.input !== input) { if (e.key === "Escape") closeSug(); return; }
      var items = u.querySelectorAll("li[data-t]"); if (!items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        sugBox.i = (sugBox.i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (li, k) { li.classList.toggle("on", k === sugBox.i); li.setAttribute("aria-selected", k === sugBox.i ? "true" : "false"); });
        input.setAttribute("aria-activedescendant", items[sugBox.i].id);
        items[sugBox.i].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && sugBox.i >= 0) {
        e.preventDefault(); var t = items[sugBox.i].dataset.t; input.value = t; search(t);
      } else if (e.key === "Escape") closeSug();
    });
    u.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    u.addEventListener("mousedown", function (e) { e.preventDefault(); });
    u.addEventListener("click", function (e) { var li = e.target.closest("li[data-t]"); if (li) { input.value = li.dataset.t; search(li.dataset.t); } });
    input.addEventListener("blur", function () { setTimeout(function () { if (sugBox && sugBox.input === input && document.activeElement !== input) closeSug(); }, 150); });
  }

  function fail(t, msg, suggest) {
    placeMsg('<div class="notice notice--error"><h3>' + ((suggest && suggest.length) || /couldn't find/i.test(msg) ? "No match for “" + esc(t) + "”" : "Could not value " + esc(t)) + "</h3><p>" + esc(msg) + "</p>" + suggestHtml(suggest) +
      '<p class="fail__alt">Not listed in the US, or still not finding it? <button class="btn" data-manual="1">Enter the numbers yourself</button>' + (store(true) ? ' <button class="btn" id="resetKey">Change the API key</button>' : "") + '</p></div>');
    bindMsg(t);
  }
  function showManual(prefill) {
    $("hero").classList.add("hidden"); $("loading").classList.add("hidden");
    $("barForm").classList.remove("hidden");
    var res = $("results"); res.classList.remove("hidden");
    res.innerHTML = window.Manual.render(prefill);
    var form = $("manualForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = {}; new FormData(form).forEach(function (val, k) { v[k] = val; });
      var out = window.Manual.build(v), box = $("manualErr");
      if (out.error) { box.classList.remove("hidden"); box.innerHTML = "<h3>Check these fields</h3><p>" + out.error.map(esc).join("<br>") + "</p>"; box.scrollIntoView({ block: "center" }); return; }
      show(out.inputs);
    });
    $("manualEx").addEventListener("click", function () { showManual(window.Manual.example()); });
    window.scrollTo({ top: 0 });
  }

  function show(inp) {
    inp = Object.assign({}, inp); /* own copy, so a live price never changes the built-in figures */
    state.inputs = inp; state.quote = null; state.qcache = {}; state.range = "1y"; state.seq = (state.seq || 0) + 1;
    try { state.quality = QS.compute(inp); } catch (e) { state.quality = { ok: false, reason: "error" }; }
    state.defaults = Object.assign(IV.defaultSettings(inp, { quality: state.quality }), inp.settings || {});
    if (inp.settings && inp.settings.g5 != null) { state.defaults.profile = null; state.defaults.profileTier = null; } /* hand-set growth (built-in examples) */
    state.settings = Object.assign({}, state.defaults);
    state.open = {};
    $("hero").classList.add("hidden"); $("loading").classList.add("hidden");
    $("barForm").classList.remove("hidden"); $("barInput").value = "";
    try { history.replaceState(null, "", "?t=" + inp.ticker); } catch (e) {}
    document.title = inp.ticker + " intrinsic value | Plumbline";
    buildShell(); update(true);
    window.scrollTo({ top: 0 });
    wirePx(); loadQuote(state.range, true); loadProfile();
  }
  function home() {
    $("results").classList.add("hidden"); $("loading").classList.add("hidden");
    $("hero").classList.remove("hidden"); $("barForm").classList.add("hidden");
    closeSheet();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    document.title = "Plumbline: what is this stock fundamentally worth?";
    drawHero(true); window.scrollTo({ top: 0 });
  }

  /* ---------------- hero ---------------- */
  function drawHero(animate) {
    var p = window.PRESETS.NVDA, s = Object.assign(IV.defaultSettings(p), p.settings);
    var r = IV.compute(p, s), el = $("heroChart");
    Charts.dotplot(el, r);
    if (animate) Charts.settle(el);
    var hs = $("heroStats"), st = r.stats;
    if (hs) hs.innerHTML = "<div><dt>Share price</dt><dd>" + F.usd(p.price, 0) + "</dd></div><div><dt>Median value</dt><dd>" + F.usd(st.median, 0) + '</dd></div><div><dt>Verdict</dt><dd><span class="pill pill--sm pill--' + st.verdict + '">' + st.verdict + "</span></dd></div>";
  }

  /* ---------------- results shell (built once per stock) ---------------- */
  var SETTINGS = [
    ["beta", "Beta", "How jumpy the stock is compared with the market. Higher beta means a higher discount rate and a lower value.", .3, 3, .01, function (v) { return v.toFixed(2); }],
    ["rf", "Risk-free rate", "What safe government bonds pay. Part of the discount rate.", .01, .08, .0025, pc],
    ["erp", "Equity risk premium", "The extra return investors expect for owning stocks instead of bonds.", .03, .08, .0025, pc],
    ["g5", "Growth in year 5", "After two years of analyst estimates, growth fades to this rate by year 5.", 0, .4, .005, pc],
    ["g10", "Growth in year 10", "Growth keeps fading to this rate by year 10.", 0, .25, .005, pc],
    ["gT", "Long-run growth (year 20 and after)", "Close to the long-run growth of the economy. Keep it below the discount rate.", 0, .05, .0025, pc],
    ["peg", "Target PEG", "Fair P/E divided by growth. 1.0 is Peter Lynch's rule of thumb.", .5, 2, .05, function (v) { return v.toFixed(2); }],
    ["psg", "Target PSG", "Fair P/S divided by growth. No official standard exists, so this is a judgement call.", .02, .3, .01, function (v) { return v.toFixed(2); }],
    ["coeFloor", "Minimum cost of equity", "The lowest return shareholders are assumed to require. Stops very low bond yields from inflating values.", .04, .12, .0025, pc],
    ["peCap", "Ignore P/E readings above", "Very high P/E readings usually mean profit was close to zero that year.", 30, 300, 10, function (v) { return v.toFixed(0) + "x"; }],
    ["buy", "BUY if upside is at least", "The margin of safety the median value needs over the price.", .05, .5, .05, pc],
    ["sell", "SELL if downside is at least", "The mirror image. Anything between the two lines is HOLD.", -.5, -.05, .05, pc]
  ];
  var WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function numWord(n) { return WORDS[n] || String(n); }
  /* sliders that only move the cash flow and sales methods, hidden for banks and insurers */
  var NOT_FIN = { g5: 1, g10: 1, psg: 1 };
  /* sliders that only matter for banks and insurers, hidden for other companies */
  var ONLY_FIN = {};
  function pc(v) { return (v * 100).toFixed(v * 100 % 1 ? 2 : 1).replace(/\.?0+$/, "") + "%"; }
  var SECTIONS = ["overview", "quality", "chart", "methods", "average", "forecast", "settings", "data"];

  function buildShell() {
    var inp = state.inputs;
    var ctl = SETTINGS.map(function (c) {
      return '<div class="ctl"><div class="ctl__top"><label for="s_' + c[0] + '">' + c[1] + '</label><output id="o_' + c[0] + '"></output></div><p>' + c[2] +
        '</p><input type="range" id="s_' + c[0] + '" data-k="' + c[0] + '" min="' + c[3] + '" max="' + c[4] + '" step="' + c[5] + '"></div>';
    }).join("");
    var tabs = [["overview", "Overview"], ["quality", "Business quality"], ["chart", "Valuation chart"], ["methods", "Methods"], ["average", "Averages"], ["forecast", "Forecast"], ["settings", "Assumptions"], ["data", "Data"]];
    $("results").classList.remove("hidden");
    $("results").innerHTML =
      '<nav class="tabs" aria-label="Sections"><div class="wrap tabs__in">' + tabs.map(function (t, i) { return '<a class="tab' + (i ? "" : " on") + '" href="#' + t[0] + '" data-s="' + t[0] + '">' + t[1] + "</a>"; }).join("") + "</div></nav>" +
      '<canvas class="rain rain--res" id="rainRes" aria-hidden="true"></canvas>' +
      '<div class="wrap res">' +
      '<div class="head" id="overview"><h2>' + esc(inp.name) + ' <span class="head__tk">' + esc(inp.ticker) + '</span></h2><div class="head__meta">' + (inp.exchange ? '<span>' + esc(inp.exchange) + "</span>" : "") + '<span id="hdPrice">Price as of ' + esc(inp.asOf) + "</span></div></div>" +
      '<p class="bridge" style="margin:18px 0 -10px">Step 1 · Calculated intrinsic value</p>' +
      '<div class="ov"><div class="ov__l" id="rVerdict"></div>' +
      '<div class="ov__r" id="pxCard"><div class="pxc__head"><div><h3>Share price vs intrinsic value</h3><p class="pxc__sub" id="pxSub">Loading price history…</p></div>' +
      '<div class="seg" id="pxRange" role="group" aria-label="Time range"><button type="button" data-r="1mo">1M</button><button type="button" data-r="6mo">6M</button><button type="button" data-r="1y" class="on">1Y</button><button type="button" data-r="5y">5Y</button></div></div>' +
      '<div class="pxc__chart" id="pxChart"><div class="pxc__skel"></div></div>' +
      '<div class="pxc__legend" aria-hidden="true"><span><i class="lk lk--px"></i>Price</span><span><i class="lk lk--iv"></i>Intrinsic value</span><span><i class="lk lk--buy"></i>BUY zone</span><span><i class="lk lk--sell"></i>SELL zone</span></div></div></div>' +
      '<section class="sec" id="quality"><p class="bridge">Step 2 · Is the business behind the stock any good?</p><div class="about" id="rAbout" hidden></div><h2>Business quality scorecard</h2><p class="sec__lede">The valuation above says whether the stock is cheap. This scorecard says whether the business is good. It grades the company on 13 measures across three areas, using its own financial statements. Each measure scores Strong, Good or Weak, and core measures count double.</p><div id="rQuality"></div></section>' +
      '<section class="sec" id="chart"><p class="bridge">Step 3 · Now let\'s see how the estimated value was reached</p><h2>Valuation chart</h2><p class="sec__lede">Each bar is one method. The white dashed line is the Plumbline value (the median of the <span class="nMeth">nine</span>) and the green dashed line is the current share price. Bars that reach past the green line say the stock looks cheap on that method.</p><div class="card"><div class="chart" id="rBars"></div><div class="legend"><span><i style="background:#4cb782"></i>Undervalued</span><span><i style="background:#c9a75a"></i>Fair</span><span><i style="background:#d66b63"></i>Overvalued</span><span><i class="sq" style="background:#8fb4e6"></i>Plumbline value (median)</span></div></div></section>' +
      '<section class="sec" id="methods"><p class="bridge">Step 4 · Each of the <span class="nMeth">nine</span> methods in detail</p><h2>How each method got its number</h2><p class="sec__lede">Select a method to see why it is used, where it works best and how its number was built from this company\'s own figures.</p><p class="swipe-hint">Swipe to see all <span class="nMeth">nine</span> methods. Tap one for the full calculation.</p><div class="mlist" id="rMethods"></div></section>' +
      '<section class="sec" id="average"><p class="bridge">Step 5 · The methods disagree, so here\'s how one number is chosen</p><h2>How <span class="nMeth">nine</span> values become one</h2><div id="rAvgText"></div><div class="card"><div class="chart" id="rStats"></div></div><div class="avg" id="rAvg"></div></section>' +
      '<section class="sec" id="forecast"><p class="bridge" id="projBridge">Step 6 · The cash flow methods depend on a forecast. Here\'s what it assumes</p><h2>What the forecast assumes</h2><p class="sec__lede" id="rProjText"></p>' +
      '<div class="card tscroll"><table class="tbl tbl--proj" id="rProjTbl"></table></div>' +
      '<p class="card__note" id="projNote">Free cash flow is the cash left after the company pays for its equipment and buildings. Profit excludes one-off gains. B = billion. Why does growth slow down? Very few companies can grow faster than the whole economy forever, so growth is assumed to settle at about the economy\'s long-run rate.</p>' +
      '<p class="jump"><a href="#settings">Think growth will be faster or slower? Try it in Assumptions →</a></p>' +
      '<details class="more" id="projMore"><summary><span>Show the full 20-year forecast</span><small>Charts of cash flow, profit and growth for every year</small></summary><div class="more__body"><div class="two"><div class="card"><div class="chart" id="rProj"></div><div class="legend" id="rProjLeg"></div></div><div class="card"><div class="chart" id="rGrow"></div><div class="legend" id="rGrowLeg"></div></div></div></div></details></section>' +
      '<section class="sec" id="settings"><p class="bridge">Step 7 · Don\'t agree with the forecast? Change it here</p><h2>Change the assumptions</h2><p class="sec__lede">The defaults follow the Excel models. Move any slider and every number on this page updates straight away. This shows how much the answer depends on each judgement call.</p><div class="card"><div class="setsum" id="setSum"></div><div class="set">' + ctl + '</div><p style="margin:16px 0 0"><button class="btn" id="reset">Reset to defaults</button></p></div></section>' +
      '<section class="sec" id="data"><p class="bridge">Step 8 · Before relying on the result, here\'s where the numbers come from</p><h2>Things to know</h2><div id="rCav"></div>' +
      '<details class="more" id="dataMore"><summary><span>Source data for analysts</span><small>Valuation ratios, the company figures used, and how the discount rate was built</small></summary><div class="more__body">' +
      '<p class="tlabel">How the market priced the stock at each year-end. The "mean multiple" methods use these averages.</p><div class="card tscroll" id="rRatios"></div>' +
      '<div class="two" style="margin-top:16px"><div><p class="tlabel">The company figures every calculation starts from.</p><div class="card" id="rIn"></div></div><div><p class="tlabel">How the discount rate (the yearly return investors expect) was built.</p><div class="card" id="rWacc"></div></div></div></div></details></section>' +
      "</div>" +
      '<button class="dock" id="dock" type="button" aria-label="Back to the verdict"></button>';
    startResultRain();
    $("results").querySelectorAll("input[type=range]").forEach(function (el) {
      el.addEventListener("input", function () { state.settings[el.dataset.k] = parseFloat(el.value); sync(); schedule(); });
    });
    $("reset").addEventListener("click", function () { state.settings = Object.assign({}, state.defaults); sync(); update(false); });
    $("projMore").addEventListener("toggle", function () { if ($("projMore").open && state.result) drawProj(state.result); });
    $("rMethods").addEventListener("toggle", function (e) { var d = e.target; if (d.dataset && d.dataset.id) state.open[d.dataset.id] = d.open; }, true);
    /* highlight the tab for the section on screen */
    var links = $("results").querySelectorAll(".tab");
    links.forEach(function (l) { l.addEventListener("click", function () { links.forEach(function (x) { x.classList.toggle("on", x === l); }); }); });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (l) { var on = l.dataset.s === e.target.id; l.classList.toggle("on", on); if (on) followTab(l); }); });
      }, { rootMargin: "-130px 0px -65% 0px" });
      SECTIONS.forEach(function (id) { var el = $(id); if (el) io.observe(el); });
      /* sections ease in as they reach the screen (skipped when the device asks for reduced motion) */
      var rv = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); rv.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -8% 0px" });
      $("results").querySelectorAll(".sec").forEach(function (el) { el.classList.add("rv"); rv.observe(el); });
      /* on phones, a slim verdict bar appears once the verdict card has scrolled away */
      var dv = new IntersectionObserver(function (es) {
        es.forEach(function (e) { $("dock").classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0); });
      });
      dv.observe($("rVerdict"));
    }
    $("dock").addEventListener("click", function () { window.scrollTo({ top: 0, behavior: smooth() }); });
    $("rMethods").addEventListener("click", function (e) {
      var sm = e.target.closest && e.target.closest("details.m > summary");
      if (!sm || !phone()) return;
      e.preventDefault();
      var d = sm.parentNode, body = d.querySelector(".m__body"), nm = d.querySelector(".m__name");
      openSheet(nm ? nm.innerHTML : "", '<div class="sheet__val">' + d.querySelector(".m__valcell").innerHTML + "</div>" + (body ? body.innerHTML : ""));
    });
  }
  function phone() { return window.matchMedia && window.matchMedia("(max-width: 860px)").matches; }
  function smooth() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
  function followTab(l) {
    var box = l.parentNode; if (!box || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: Math.max(0, l.offsetLeft - box.clientWidth / 2 + l.clientWidth / 2), behavior: smooth() });
  }
  /* bottom sheet: method details slide up from the bottom on phones */
  function openSheet(title, html) {
    var sh = $("sheet"); if (!sh) return;
    $("sheetTitle").innerHTML = title; $("sheetBody").innerHTML = html; $("sheetBody").scrollTop = 0;
    sh.hidden = false; setTimeout(function () { sh.classList.add("open"); }, 16);
    document.documentElement.classList.add("noscroll");
    $("sheetClose").focus();
  }
  function closeSheet() {
    var sh = $("sheet"); if (!sh || sh.hidden) return;
    sh.classList.remove("open"); document.documentElement.classList.remove("noscroll");
    setTimeout(function () { if (!sh.classList.contains("open")) sh.hidden = true; }, 260);
  }
  var raf = null;
  /* v3.8.1: recalculate after a slider moves. Some browsers and in-app web views pause requestAnimationFrame;
     when that happened the old code waited for a frame that never came and every later slider move was ignored.
     A short timer now runs the update whether or not a frame arrives, and whichever comes first wins. */
  function schedule() {
    if (raf) return;
    var done = false, run = function () { if (done) return; done = true; raf = null; update(false); };
    raf = true;
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    setTimeout(run, 60);
  }
  function sync() {
    SETTINGS.forEach(function (c) {
      var el = $("s_" + c[0]), v = state.settings[c[0]];
      if (el) { el.value = v; $("o_" + c[0]).textContent = c[6](v); }
    });
  }

  /* ---------------- render ---------------- */
  function update(initial) {
    var inp = state.inputs, s = state.settings;
    var r = state.result = IV.compute(inp, s);
    sync();
    var isFin = r.group && r.group.id === "financial";
    document.querySelectorAll(".nMeth").forEach(function (el) { el.textContent = numWord(r.methods.length); });
    Object.keys(NOT_FIN).forEach(function (k) { var el = $("s_" + k); if (el) el.closest(".ctl").style.display = isFin ? "none" : ""; });
    Object.keys(ONLY_FIN).forEach(function (k) { var el = $("s_" + k); if (el) el.closest(".ctl").style.display = isFin ? "" : "none"; });
    var pm = $("projMore"); if (pm) pm.style.display = isFin ? "none" : "";
    if (!r.stats.n) { $("rVerdict").innerHTML = '<div class="notice notice--error"><h3>Not enough data</h3><p>None of the ' + numWord(r.methods.length) + ' methods could be calculated for this stock.</p></div>'; renderQuality(r); return; }
    renderVerdict(r, initial); if (!initial) drawPx(); renderQuality(r); renderMethods(r); renderAvg(r); renderProj(r); renderData(r); renderSetSum(r);
    Charts.bars($("rBars"), r); Charts.strip($("rStats"), r, { stats: true });
    if ($("projMore") && $("projMore").open) drawProj(r);
    if (initial) { var rb = $("rBars"), rq = $("rQuality"); rb.classList.add("grow"); if (rq) rq.classList.add("grow"); setTimeout(function () { rb.classList.remove("grow"); if (rq) rq.classList.remove("grow"); }, 1600); }
  }

  function renderVerdict(r, initial) {
    var st = r.stats, inp = r.inputs, s = r.settings, v = st.verdict, q = state.quality, up = st.upside;
    var head = '<b class="vc--' + v + '">' + Math.abs(up * 100).toFixed(1) + "%</b> " + (up >= 0 ? "upside" : "downside") + " to fair value";
    var why = v === "BUY" ? "Clears the " + F.spct(s.buy, 0) + " BUY threshold"
      : v === "SELL" ? "Beyond the " + F.spct(s.sell, 0) + " SELL threshold"
      : "Within the HOLD band (" + F.spct(s.sell, 0) + " to " + F.spct(s.buy, 0) + ")";
    var html = pvHtml(r) +
      '<div class="vrow"><span class="pill pill--' + v + '"><i></i>' + v + '</span><div class="vrow__t"><p>' + head + "</p><small>" + why + "</small>" +
      (q && q.ok ? '<a class="qline" href="#quality">Business quality <b>' + q.grade + "</b> <em>" + Math.round(q.score) + "/100</em></a>" : "") + "</div></div>";
    $("rVerdict").innerHTML = html;
    if (initial) countUp($("vNum"), st.median);
    var dk = $("dock");
    if (dk) dk.innerHTML = '<b>' + esc(inp.ticker) + '</b><span class="dock__v">' + F.usd(st.median, 0) + '</span><span class="dock__up ' + cls(st.upside, s) + '">' + F.spct(st.upside, 0) + '</span><span class="pill pill--sm pill--' + v + '">' + v + "</span>" + (q && q.ok ? '<span class="dock__q" style="color:' + scoreCol(q.score) + '">' + q.grade + "</span>" : "") + '<span class="dock__up-arrow" aria-hidden="true">↑</span>';
  }
  /* The headline value "decodes": each digit flickers through random figures and locks in from left to right. */
  /* ---------------- price vs intrinsic value ---------------- */
  function pvHtml(r) {
    var st = r.stats, inp = r.inputs, s = r.settings, v = st.verdict, iv = st.median, px = inp.price, q = state.quote;
    var gap = (px - iv) / iv, under = gap < 0, pct = Math.abs(gap * 100);
    var chg = q && q.prevClose ? q.price - q.prevClose : null;
    var qd = q && q.time ? new Date(q.time) : null, today = qd && qd.toDateString() === new Date().toDateString();
    var when = qd ? (today ? "" : qd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", ") + qd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "As of " + esc(inp.asOf || "");
    var sub = chg != null ? '<span class="' + (chg >= 0 ? "pos" : "neg") + '">' + (chg >= 0 ? "+" : "−") + Math.abs(chg).toFixed(2) + " (" + (chg >= 0 ? "+" : "−") + Math.abs(chg / q.prevClose * 100).toFixed(2) + "%)</span> today" : when;
    return '<div class="pv"><div class="pv__c"><p class="pv__k"><span><span class="hide-sm">Share </span>price</span>' + (q ? ' <span class="live"><i></i>Live</span>' : "") + '</p><p class="pv__v" id="pvPrice">' + F.usd(px) + '</p><p class="pv__s">' + sub + "</p></div>" +
      '<div class="pv__c"><p class="pv__k">Intrinsic value</p><p class="pv__v pv__v--iv" id="vNum">' + F.usd(iv) + '</p><p class="pv__s">Fair-value median from ' + st.n + ' valuation methods</p><a class="seewhy" href="#chart">See why <span aria-hidden="true">→</span></a></div></div>';
  }
  /* "What the company does": a short description from Wikipedia (rewritten by AI when the server has a key) */
  function loadProfile() {
    var inp = state.inputs, my = state.seq, el = $("rAbout");
    if (!el || !inp || inp.manual || window.PLUMBLINE_STATIC || location.protocol.indexOf("http") !== 0) return;
    fetch("/api/profile?t=" + encodeURIComponent(inp.ticker)).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (d) {
      if (my !== state.seq || !d || d.none || !d.text) return;
      var raw = String(inp.name || inp.ticker), nice = d.article ? String(d.article).replace(/\s*\([^)]*\)\s*$/, "") :
        raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) : raw;
      var ops = (d.ops || []).filter(Boolean), src = '<p class="about__src">' + (d.ai ? "Summarised by AI from " : "From ") + '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA)' + (d.ai ? ". AI summaries can contain mistakes." : ".") + "</p>";
      /* v3.3.2: one-line background always visible; the main operations fold out */
      el.innerHTML = '<p class="about__k">What ' + esc(nice) + ' does</p><p class="about__t">' + esc(d.text) + "</p>" +
        (ops.length ? '<details class="about__ops"><summary>Main operations <span class="about__n">' + ops.length + " point" + (ops.length > 1 ? "s" : "") + '</span></summary><ul>' +
          ops.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>" + src + "</details>" : src);
      el.hidden = false;
    });
  }
  function loadQuote(range, first) {
    var inp = state.inputs, my = state.seq;
    if (!inp || inp.manual || window.PLUMBLINE_STATIC || location.protocol.indexOf("http") !== 0) { pxFallback(); return; }
    if (state.qcache[range] && !first) { useQuote(state.qcache[range]); return; }
    fetch("/api/quote?t=" + encodeURIComponent(inp.ticker) + "&range=" + range).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (q) {
      if (my !== state.seq) return;
      if (!q || !q.points || !q.price) { pxFallback(); return; }
      state.qcache[range] = q; useQuote(q);
    });
  }
  function useQuote(q) {
    var inp = state.inputs;
    if (q.range === state.range) {
      var priceMoved = !state.quote || Math.abs(inp.price - q.price) > 1e-6;
      if (q.prevClose || !state.quote) state.quote = q;
      var hd = $("hdPrice"); if (hd) hd.textContent = "Live price";
      if (priceMoved) { inp.price = q.price; update(false); }
      else renderVerdict(state.result, false);
      drawPx();
    }
  }
  function pxFallback() {
    var sub = $("pxSub"); if (sub) sub.textContent = "Live prices are not available here. Showing the price the valuation used.";
    var el = $("pxChart"); if (el) el.innerHTML = '<p class="pxc__empty">Price history is not available right now.</p>';
  }
  function drawPx() {
    var q = state.qcache[state.range], el = $("pxChart"), r = state.result; if (!q || !el || !r) return;
    Charts.price(el, q.points, r.stats.median, r.settings, state.range);
    var p0 = q.points[0][1], p1 = q.points[q.points.length - 1][1], ch = (p1 - p0) / p0;
    var names = { "1mo": "past month", "6mo": "past 6 months", "1y": "past year", "5y": "past 5 years" };
    $("pxSub").innerHTML = 'Price <span class="' + (ch >= 0 ? "pos" : "neg") + '">' + (ch >= 0 ? "+" : "−") + Math.abs(ch * 100).toFixed(1) + "%</span> over the " + names[state.range];
  }
  function wirePx() {
    var seg = $("pxRange"); if (!seg) return;
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || b.dataset.r === state.range) return;
      seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      state.range = b.dataset.r; loadQuote(state.range);
    });
  }
  /* keep the price fresh while a result is open (every minute, only when the tab is visible) */
  setInterval(function () {
    if (document.hidden || !state.inputs || $("results").classList.contains("hidden") || !state.quote) return;
    delete state.qcache[state.range]; loadQuote(state.range);
  }, 60000);
  window.addEventListener("resize", function () { clearTimeout(state.pxT); state.pxT = setTimeout(drawPx, 200); });

  function countUp(el, to) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var final = F.usd(to), t0 = performance.now(), d = 950, last = 0;
    (function f(t) {
      var k = Math.min(1, (t - t0) / d);
      if (t - last > 45 || k >= 1) {
        last = t; var out = "", n = final.length;
        for (var i = 0; i < n; i++) { var ch = final[i]; out += /\d/.test(ch) && k < (i + 1) / (n + 1) + .1 ? String((Math.random() * 10) | 0) : ch; }
        el.textContent = k >= 1 ? final : out;
      }
      if (k < 1 && el.isConnected) setTimeout(function () { f(performance.now()); }, 30);
    })(t0);
  }


  /* ---------------- business quality ---------------- */
  var LEVEL_CLS = { Strong: "lv--s", Good: "lv--g", Weak: "lv--w", "n/a": "lv--n" };
  var LEVEL_COL = { Strong: "#4cb782", Good: "#c9a75a", Weak: "#d66b63", "n/a": "#5e6f88" };
  function renderQuality(r) {
    var el = $("rQuality"), q = state.quality;
    if (!el) return;
    if (!q || !q.ok) {
      var msg = q && q.reason === "financial"
        ? "<h3>Not used for banks, insurers and property trusts</h3><p>These businesses are judged on different measures, such as capital ratios, net interest margin and bad-loan levels. Measures like gross margin and debt to EBITDA would give a misleading score, so Plumbline does not grade them.</p>"
        : "<h3>Scorecard not available for this stock</h3><p>The scorecard needs full financial statements. These come with the pre-loaded stocks and with stocks loaded from SEC filings. Stocks entered by hand, or loaded from Financial Modeling Prep, do not include them yet.</p>";
      el.innerHTML = '<div class="notice">' + msg + "</div>";
      return;
    }
    var v = r.stats && r.stats.verdict, combo = v ? QS.combo(q.grade, v) : null, col = scoreCol(q.score);
    var top = '<div class="card qs__top"><div class="qs__ring">' + Charts.ring(q.score, col) +
      '<div class="qs__ringtxt"><b style="color:' + col + '">' + q.grade + "</b><span>" + Math.round(q.score) + "/100</span></div></div>" +
      '<div class="qs__sum"><p class="qs__label" style="color:' + col + '">' + esc(q.label) + "</p>" +
      '<div class="qs__pillars">' + q.pillars.map(function (p) {
        var ok = p.score != null, pc2 = ok ? scoreCol(p.score) : "#5e6f88";
        return '<div class="qp"><span class="qp__name">' + esc(p.name) + ' <small>' + Math.round(p.weight * 100) + "% of score</small></span>" +
          '<span class="qp__bar"><b style="width:' + (ok ? Math.max(2, p.score) : 0) + "%;background:" + pc2 + '"></b></span><span class="qp__val" style="color:' + pc2 + '">' + (ok ? Math.round(p.score) : "n/a") + "</span></div>";
      }).join("") + "</div>" +
      '<p class="qs__scale">A 80+ Excellent · B 65–79 Good · C 50–64 Average · D 35–49 Weak · F below 35 Poor</p></div></div>';
    var comboHtml = combo ? '<div class="qs__combo qs__combo--' + (combo.tone || "mid") + '"><span class="pill pill--' + v + '"><i></i>' + v + '</span><span class="qs__plus">+</span><span class="qs__gradechip" style="color:' + col + ';border-color:' + col + '">Quality ' + q.grade + "</span><div><h3>" + esc(combo.title) + "</h3><p>" + esc(combo.text) + "</p></div></div>" : "";
    var cards = q.pillars.map(function (p) {
      var pc2 = p.score != null ? scoreCol(p.score) : "#5e6f88";
      var scored = p.metrics.filter(function (m) { return m.level != null; });
      var best = scored.slice().sort(function (a, b) { return b.level - a.level || (b.core ? 1 : 0) - (a.core ? 1 : 0); })[0];
      var worst = scored.slice().sort(function (a, b) { return a.level - b.level || (b.core ? 1 : 0) - (a.core ? 1 : 0); })[0];
      var hl = function (label, m) { return m ? '<div class="hl2"><small>' + label + '</small><span>' + esc(m.name) + '</span><b>' + esc(m.show) + '</b><span class="lv ' + LEVEL_CLS[m.levelName] + '">' + esc(m.levelName) + "</span></div>" : ""; };
      var rows = p.metrics.map(function (m) {
        var lc = LEVEL_CLS[m.levelName] || "lv--n";
        var sp = m.series ? Charts.spark(m.series, LEVEL_COL[m.levelName] || "#93a3ba") : "";
        return '<div class="qm"><div class="qm__head"><span class="qm__name">' + esc(m.name) + (m.core ? '<span class="qm__core" title="Counts double in this area">Core ×2</span>' : "") + "</span>" +
          '<span class="qm__spark">' + sp + '</span><span class="qm__val">' + esc(m.show) + '</span><span class="lv ' + lc + '">' + esc(m.levelName) + "</span></div>" +
          '<p class="qm__says">' + esc(m.says) + "</p>" +
          '<p class="qm__thr"><span>Good: ' + esc(m.good) + "</span><span>Strong: " + esc(m.strong) + "</span>" + (m.def ? "<span>" + esc(m.def) + "</span>" : "") + "</p>" +
          (m.note ? '<p class="qm__note">' + esc(m.note) + "</p>" : "") + "</div>";
      }).join("");
      var open = state.open["q_" + p.id] ? " open" : "";
      return '<div class="card qcard"><div class="qcard__head"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.q) + " " + Math.round(p.weight * 100) + "% of the overall score.</p></div>" +
        '<div class="qcard__score" style="color:' + pc2 + '">' + (p.score != null ? Math.round(p.score) : "n/a") + "<small>/100</small></div></div>" +
        '<div class="qcard__hl">' + hl("Best", best) + (worst && worst !== best && worst.level < best.level ? hl("Weakest", worst) : "") + "</div>" +
        '<details class="qmore" data-q="' + p.id + '"' + open + '><summary>See all ' + p.metrics.length + " measures and what they mean</summary>" + rows + "</details></div>";
    }).join("");
    var notes = q.notes.length ? '<ul class="qs__notes">' + q.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "";
    var limited = q.limited ? '<div class="notice" style="max-width:none;margin:0 0 14px"><p style="margin:0">Fewer than 60% of the measures could be calculated for this company, so treat this score with extra caution.</p></div>' : "";
    el.innerHTML = limited + top + comboHtml + '<div class="qcards">' + cards + "</div>" + notes;
    el.querySelectorAll("details.qmore").forEach(function (d) { d.addEventListener("toggle", function () { state.open["q_" + d.dataset.q] = d.open; }); });
  }

  function renderMethods(r) {
    document.querySelectorAll("#rMethods details.m").forEach(function (d) { state.open[d.dataset.id] = d.open; });
    var s = r.settings, price = r.inputs.price, axis = Math.max(price, r.stats.max) * 1.05;
    $("rMethods").innerHTML = r.methods.map(function (m) {
      var c = window.CONTENT.methods[m.id], ok = fin(m.value);
      var bar = ok ? '<div class="m__bar"><b style="width:' + Math.max(1, m.value / axis * 100).toFixed(1) + "%;background:" + barCol(m.upside, s) + '"></b><u style="left:' + (price / axis * 100).toFixed(1) + '%" title="Current price"></u></div>' : '<span class="na">Not available</span>';
      var steps = ok ? c.steps(r, m).map(function (x) { return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>"; }).join("") : "";
      return '<details class="m" data-id="' + m.id + '"' + (state.open[m.id] ? " open" : "") + '><summary><div class="m__name">' + esc(m.name) + "<small>" + esc(m.short) + '</small></div><span class="m__type">' + esc(m.type) + '</span><div class="m__barcell">' + bar + '</div><div class="m__valcell"><div class="m__val' + (m.excluded ? " m__val--out" : "") + '">' + (ok ? F.usd(m.value) : m.excluded ? F.usd(m.left) : "n/a") + '</div><div class="m__up ' + (ok ? cls(m.upside, s) : "") + '">' + (ok ? F.spct(m.upside, 0) : m.excluded ? "Left out" : "") + '</div></div><span class="m__chev" aria-hidden="true">›</span></summary>' +
        '<div class="m__body"><div><h4>What it is</h4><p>' + esc(c.what) + "</p><h4>Why it is used</h4><p>" + esc(c.why) + "</p><h4>Where it works best</h4><p>" + esc(c.fit) + "</p><h4>What to watch</h4><p>" + esc(c.watch) + "</p></div>" +
        "<div><h4>How this number was built</h4>" + (ok ? '<table class="calc">' + steps + "</table>" : m.excluded ? '<p class="na">Left out of the median (it would have given ' + F.usd(m.left) + "). " + esc(m.why) + "</p>" : '<p class="na">This method could not run: ' + esc(m.why || "missing data") + ".</p>") + "</div></div></details>";
    }).join("");
  }

  /* v3.3.1: live read-out above the sliders, and why the headline may not move */
  function renderSetSum(r) {
    var el = $("setSum"); if (!el) return;
    var inp = r.inputs, st = r.stats, s = r.settings, base = IV.compute(inp, state.defaults);
    var b0 = base.stats && base.stats.median, ch = fin(b0) && b0 ? st.median / b0 - 1 : 0, moved = Math.abs(ch) > 0.0005;
    /* which method sits in the middle (the headline) */
    var vals = r.methods.filter(function (m) { return fin(m.value); }).sort(function (a, b) { return a.value - b.value; }), n = vals.length;
    var mid = n ? (n % 2 ? [vals[(n - 1) >> 1]] : [vals[n / 2 - 1], vals[n / 2]]) : [];
    var notes = [];
    if (mid.length && mid.every(function (m) { return m.type === "Multiple"; }))
      notes.push("The headline is the middle of the " + n + " values, which is now " + mid.map(function (m) { return m.short; }).join(" and ") + ". That method uses past market multiples, so the discount-rate and growth sliders move the other methods but not the headline until one of them crosses it.");
    var coeRaw = r.fin ? r.fin.coeRaw : r.wacc.coeRaw, coeUsed = r.fin ? r.fin.coe : r.wacc.coe;
    if (fin(coeRaw) && coeUsed > coeRaw + 1e-9) notes.push("The cost of equity is at its " + F.pct(coeUsed, 1) + " minimum, so lowering beta, the risk-free rate or the risk premium has no effect until the formula rises above it.");
    el.innerHTML = '<div class="setsum__row"><div><span>Intrinsic value</span><b>' + F.usd(st.median) + '</b><small class="' + (moved ? cls(ch, { buy: 0, sell: 0 }) : "") + '">' + (moved ? F.spct(ch) + " vs the default " + F.usd(b0) : "Default assumptions") + '</small></div>' +
      cfTile(r, base) +
      '<div><span>Share price</span><b>' + F.usd(inp.price) + '</b><small>Market price: assumptions do not change it</small></div>' +
      '<div><span>Verdict</span><b><span class="pill pill--sm pill--' + st.verdict + '">' + st.verdict + '</span></b><small>' + F.spct(st.upside) + ' upside</small></div></div>' +
      (notes.length ? '<p class="setsum__note">' + notes.map(esc).join(" ") + '</p>' : "");
  }
  /* v3.8.2: the cash-flow methods always respond to the discount-rate and growth sliders, even when the headline
     median sits on a market multiple, so show their middle value too */
  var CF_IDS = { dcf20: 1, dfcf20: 1, dni20: 1, dfcft: 1, ddm: 1, fcfe: 1, excess: 1 };
  function cfMid(res) {
    var v = res.methods.filter(function (m) { return CF_IDS[m.id] && fin(m.value); }).map(function (m) { return m.value; });
    return v.length ? IV.median(v) : null;
  }
  function cfTile(r, base) {
    var now = cfMid(r), was = cfMid(base); if (!fin(now)) return "";
    var ch = fin(was) && was ? now / was - 1 : 0, moved = Math.abs(ch) > 0.0005;
    return '<div><span>Cash-flow value</span><b>' + F.usd(now) + '</b><small class="' + (moved ? cls(ch, { buy: 0, sell: 0 }) : "") + '">' + (moved ? F.spct(ch) + " vs the default " + F.usd(was) : "Middle of the cash-flow methods") + "</small></div>";
  }
  function renderAvg(r) {
    var st = r.stats, s = r.settings;
    $("rAvgText").innerHTML = '<p class="sec__lede">The ' + numWord(r.methods.length) + ' methods rarely agree, so one number has to be chosen. Plumbline uses the <strong>median</strong>, which is the middle value when the ' + numWord(st.n) + ' values are lined up from lowest to highest. It is the headline because a single extreme method, high or low, cannot pull it far. The mean and trimmed mean are shown so you can see how much the choice matters.</p>';
    function card(t, v, p, main) {
      return '<div class="avg__c' + (main ? " is-main" : "") + '"><h3>' + t + (main ? '<span class="tag">Headline</span>' : "") + '</h3><div class="avg__n">' + F.usd(v) + '</div><p class="' + cls(v / r.inputs.price - 1, s) + '" style="font-weight:700;margin-bottom:6px">' + F.spct(v / r.inputs.price - 1) + " vs price</p><p>" + p + "</p></div>";
    }
    $("rAvg").innerHTML =
      card("Median", st.median, "The middle of the " + st.n + " values. Not affected by how extreme the highest and lowest are.", true) +
      card("Mean (simple average)", st.mean, "Adds all " + st.n + " values and divides. Easy to understand, but one outlier can pull it a long way.") +
      card("Trimmed mean", st.trimmed, "Drops the single highest and lowest values, then averages the rest.");
  }

  function bn(v) { return v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "T" : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "B" : "$" + v.toFixed(0) + "M"; }
  /* v3.6/v3.7: plain sentences on how an AI-era profile (chips or hyperscalers) was applied, or why not */
  function semiLine(sp, r) {
    var noun = sp.noun || "semiconductor company";
    if (!sp.tier) return "This is a " + esc(noun) + ", but it does not get Plumbline's AI-era growth tailwind because " + esc(sp.why) + ". A weak business is valued like any other weak business.";
    var full = sp.tier === "full", cn = r && r.capexNorm, drops = Object.keys(sp.drop || {});
    return "As a " + esc(noun) + " where " + esc(sp.why) + ", it gets Plumbline's <strong>" + (full ? "full" : "partial") + " AI-era growth profile</strong>: growth by year 5 is lifted towards " + F.pct(sp.g5Min, 0) + " (at most " + Math.round(sp.lift * 100) + " percentage points above the near-term rate) and fades more slowly to year 10." +
      (drops.length ? " Mean P/B and PSG are left out of the median, because book value and sales-growth targets say little about a high-quality chip company." : "") +
      (cn ? " It is also in the middle of a data-centre building boom: capital spending is " + F.pct(cn.ratioNow, 0) + " of sales against a " + cn.years + "-year average of " + F.pct(cn.ratio, 0) + ". Part of that is growth investment that should pay back later, so the free-cash-flow methods use a level halfway between the two (" + F.mm(cn.used) + " instead of " + F.mm(cn.ttm) + " a year), never less than depreciation." : "") +
      " This profile does not change the discount rate or long-run growth, so the value still comes from the cash the business generates.";
  }
  /* v3.8: how the company's life-cycle stage changed the valuation (Damodaran) */
  function lifeLine(r) {
    var t = r.type && r.type.id, c = r.cycle, w = r.wacc;
    if (t === "cyclical" && c) return " <span class=\"projai\"><strong>Cyclical company</strong>: profits swing with the economic cycle, so today's figures may be a peak or a trough. Following Aswath Damodaran, the cash-flow and earnings methods start from the company's " + c.years + "-year average margin applied to today's sales" + (c.weight < 1 ? " (blended half and half with today's figures, because the AI-era profile treats part of today's demand as lasting)" : "") + ": free cash flow of " + F.mm(c.fcf) + " instead of " + F.mm(c.fcfNow) + " (an average margin of " + F.pct(c.fcfMargin, 0) + " against " + F.pct(c.fcfMarginNow, 0) + " today).</span>";
    if (t === "cyclical") return " <span class=\"projai\"><strong>Cyclical company</strong>: there is not enough history to work out a cycle-average margin, so today's figures are used. Treat the result with extra care if this is a boom or a slump year.</span>";
    if (t === "growth" && w.waccT != null) return " <span class=\"projai\"><strong>Growth company</strong> (" + esc(r.type.why) + "): following Aswath Damodaran, a fast grower is not assumed to stay high-risk for ever. Once it settles into stable growth it is treated like an average company, so the terminal value uses a beta of 1 (a discount rate of " + F.pct(w.waccT, 1) + " instead of " + F.pct(w.wacc, 1) + ").</span>";
    if (t === "mature") return " <span class=\"projai\"><strong>Mature company</strong>: valued with the standard stable-growth approach (growth fades to the economy's long-run rate, which can never be above the risk-free rate).</span>";
    return "";
  }
  function renderProj(r) {
    if (r.group && r.group.id === "financial") return renderProjFin(r);
    $("projBridge").textContent = "Step 6 · The cash flow methods depend on a forecast. Here's what it assumes";
    $("projNote").textContent = "Free cash flow is the cash left after the company pays for its equipment and buildings. Profit excludes one-off gains. B = billion. Why does growth slow down? Very few companies can grow faster than the whole economy forever, so growth is assumed to settle at about the economy's long-run rate.";
    var P = r.proj, s = r.settings, g = r.growth, inp = r.inputs;
    var src = inp.live ? "the company's recent growth (the free data source has no analyst estimates)" : "analyst estimates";
    $("rProjText").innerHTML = "Plumbline assumes " + esc(inp.name) + "'s cash flow grows about <strong>" + F.pct(g.cf[0], 0) + "</strong> next year and <strong>" + F.pct(g.cf[1], 0) + "</strong> the year after. Growth then settles towards " + F.pct(s.g5, 0) + " a year by year 5, " + F.pct(s.g10, 0) + " by year 10 and " + F.pct(s.gT, 0) + " by year 20. " +
      "On that path, free cash flow would grow from " + F.mm(P.fcf[0]) + " today to about " + F.mm(P.fcf[10]) + " in year 10. The first two years come from " + src + "." +
      (r.sector ? " <span class=\"projai\">" + semiLine(r.sector, r) + "</span>" : "") + lifeLine(r);
    var row = function (label, t, why) {
      return "<tr><td>" + label + "</td><td>" + (t ? F.pct(P.gCF[t - 1], 1) : "–") + "</td><td>" + bnx(P.fcf[t]) + "</td><td>" + bnx(P.ni[t]) + "</td><td>" + why + "</td></tr>";
    };
    $("rProjTbl").innerHTML = "<thead><tr><th>Year</th><th>Growth that year</th><th>Free cash flow</th><th>Profit</th><th>Where the growth figure comes from</th></tr></thead><tbody>" +
      row("Today (last 12 months)", 0, "Actual figures") +
      row("Year 1", 1, inp.live ? "Recent growth" : "Analyst estimates") +
      row("Year 5", 5, "Fades step by step") +
      row("Year 10", 10, "Keeps fading") +
      row("Year 20", 20, "Long-run economy growth") + "</tbody>";
  }
  /* banks and insurers: growth comes from the profit the company keeps, not from a cash flow forecast */
  function renderProjFin(r) {
    var Fd = r.fin, inp = r.inputs, p = Fd.path;
    $("projBridge").textContent = "Step 6 · The bank and insurer methods depend on a forecast. Here's what it assumes";
    $("projNote").textContent = "Return on equity (ROE) is profit divided by the shareholders' money in the business. A bank can only grow its lending if it keeps enough of its profit as capital, so growth = ROE × share of profit kept. Whatever is not needed for growth can be paid out. B = billion.";
    if (!p) { $("rProjText").innerHTML = "Return on equity or the payout history could not be measured for " + esc(inp.name) + ", so only the methods that use today's figures could run."; $("rProjTbl").innerHTML = ""; return; }
    var ni = [Fd.niC], bv = [Fd.commonEq];
    /* profit each year = ROE that year × book value at the start of the year (the same logic as the methods) */
    for (var t = 1; t <= 10; t++) { ni.push(p.roe[t - 1] * bv[t - 1]); bv.push(bv[t - 1] * (1 + p.g[t - 1])); }
    $("rProjText").innerHTML = esc(inp.name) + " earned an average return on equity of <strong>" + F.pct(Fd.roeN, 1) + "</strong> (" + esc(Fd.roeSrc) + ") and paid out about <strong>" + F.pct(Fd.totPay, 0) + "</strong> of its profit as dividends and buybacks. Keeping the rest lets it grow about <strong>" + F.pct(Fd.g1tot, 1) + "</strong> a year for five years. " +
      "After that, growth fades to " + F.pct(Fd.gT, 0) + " by year 10, and ROE settles at " + F.pct(Fd.roeL, 1) + (Fd.roeN > Fd.coe ? ", halfway between today's level and the " + F.pct(Fd.coe, 1) + " cost of equity, because competition usually wears extra returns down." : ". It is not assumed to improve, because it is below the " + F.pct(Fd.coe, 1) + " cost of equity.");
    var row = function (label, t, why) {
      return "<tr><td>" + label + "</td><td>" + (t ? F.pct(p.g[t - 1], 1) : "–") + "</td><td>" + (t ? F.pct(p.roe[t - 1], 1) : F.pct(Fd.roeN, 1)) + "</td><td>" + (t ? F.pct(p.pay[t - 1], 0) : F.pct(Fd.totPay, 0)) + "</td><td>" + bnx(ni[t]) + "</td><td>" + bnx(bv[t]) + "</td><td>" + why + "</td></tr>";
    };
    $("rProjTbl").innerHTML = "<thead><tr><th>Year</th><th>Growth that year</th><th>Return on equity</th><th>Share of profit paid out</th><th>Profit</th><th>Book value</th><th>Where it comes from</th></tr></thead><tbody>" +
      row("Today (last 12 months)", 0, "Actual figures") + row("Year 1", 1, "ROE × share kept") + row("Year 5", 5, "Same as year 1") + row("Year 10", 10, "Faded to the long run") + "</tbody>";
  }
  function bnx(v) { var a = Math.abs(v), sg = v < 0 ? "−" : ""; return sg + (a >= 1e6 ? "$" + (a / 1e6).toFixed(2) + "T" : a >= 1e3 ? "$" + (a / 1e3).toFixed(1) + "B" : "$" + a.toFixed(0) + "M"); }
  function drawProj(r) {
    var P = r.proj;
    Charts.lines($("rProj"), [
      { values: P.ocf, color: "#8fb4e6", endText: "Op. cash flow" }, { values: P.fcf, color: "#7f8fd0", endText: "Free cash flow" }, { values: P.ni, color: "#a9bfdf", endText: "Net income" }
    ], { fmt: bn, h: 290, zero: "$0" });
    $("rProjLeg").innerHTML = '<span><i class="sq" style="background:#8fb4e6"></i>Operating cash flow</span><span><i class="sq" style="background:#7f8fd0"></i>Free cash flow</span><span><i class="sq" style="background:#a9bfdf"></i>Net income (excl. one-offs)</span><span>Starts from the last 12 months. X axis is years from today.</span>';
    var gcv = P.gCF.slice(), gev = P.gEPS.slice();
    var ymax = Math.max(Math.max.apply(null, gcv), Math.max.apply(null, gev), .1);
    Charts.lines($("rGrow"), [
      { values: gcv, color: "#8fb4e6", dots: [0, 1], endText: "Cash flow" }, { values: gev, color: "#a9bfdf", dots: [0, 1], endText: "Earnings" }
    ], { fmt: function (v) { return (v * 100).toFixed(0) + "%"; }, h: 290, ymin: Math.min(0, Math.min.apply(null, gcv.concat(gev))), ymax: ymax * 1.05, band: [0, 1], bandLabel: "Years 1–2", xlabel: function (i) { return i + 1; } });
    $("rGrowLeg").innerHTML = '<span><i class="sq" style="background:#8fb4e6"></i>Cash flow growth</span><span><i class="sq" style="background:#a9bfdf"></i>Earnings growth</span><span>X axis is the forecast year (1 to 20).</span>';
  }

  function renderData(r) {
    var inp = r.inputs, T = inp.ttm, b = r.base, w = r.wacc;
    var all = (inp.caveats || []).slice(), li;
    if (r.sector) all.splice(1, 0, r.sector.tier ? (r.sector.id === "hyperscaler" ? "Hyperscaler" : "Semiconductor company") + " with a " + (r.sector.tier === "full" ? "strong" : "fair") + " business: the growth assumptions use Plumbline's AI-era profile" + (r.capexNorm ? ", and the free-cash-flow methods use capital spending halfway between today's building-boom level and the company's six-year average" : "") + ". This is a forward-looking judgement about AI demand that the backtest could not test. If AI spending slows or the investment does not pay off, the cash-flow values will be too high." : "This is a " + r.sector.noun + ", but the AI-era tailwind is not applied because " + r.sector.why + ". It is valued with the normal rules.");
    li = function (c) { return "<li>" + esc(c) + "</li>"; };
    var wasOpen = $("cavMore") && $("cavMore").open;
    $("rCav").innerHTML = '<p class="sec__lede">The most important notes about this result. Every model rests on data and assumptions that can be wrong.</p><p class="srcline">Data: ' + esc(inp.source || (inp.manual ? "entered by you" : inp.live ? "live data provider" : "checked built-in figures")) + (inp.ttmEnd ? " · Financials to " + esc(inp.ttmEnd) : "") + (inp.asOf ? " · Price as of " + esc(inp.asOf) : "") + '</p><ul class="cav">' + all.slice(0, 3).map(li).join("") + "</ul>" +
      (all.length > 3 ? '<details class="qmore" id="cavMore"' + (wasOpen ? " open" : "") + '><summary>Show ' + (all.length - 3) + " more note" + (all.length - 3 === 1 ? "" : "s") + '</summary><ul class="cav" style="margin-top:10px">' + all.slice(3).map(li).join("") + "</ul></details>" : "");
    renderRatios(r);
    var row = function (a, b2) { return "<tr><td>" + a + "</td><td>" + b2 + "</td></tr>"; };
    $("rIn").innerHTML = '<table class="tbl"><thead><tr><th>Inputs used (last 12 months)</th><th></th></tr></thead><tbody>' +
      row("Revenue", F.mm(T.rev)) + row("Net income (reported)", F.mm(T.ni)) + row("One-off investment gains (before tax)", F.mm(T.gain)) + row(r.cycle ? "Net income at the cycle-average margin" : "Net income excluding one-offs", F.mm(b.niEx)) +
      row(r.cycle ? "Earnings per share at the cycle-average margin" : "Earnings per share excluding one-offs", F.usd(b.epsEx)) + row("Operating cash flow", F.mm(T.ocf)) + row("Capital spending", F.mm(T.capex)) + row(r.cycle ? "Free cash flow at the cycle-average margin" : "Free cash flow", F.mm(b.fcf)) +
      row("Cash and investments", F.mm(inp.cash)) + row("Total debt", F.mm(inp.debt)) + row("Shareholders' equity", F.mm(inp.equity)) + row("Shares outstanding", F.num(inp.shares) + " million") + "</tbody></table>";
    $("rWacc").innerHTML = '<table class="tbl"><thead><tr><th>Discount rate build</th><th></th></tr></thead><tbody>' +
      row("Risk-free rate", F.pct(w.rf, 2)) + row("Beta", w.beta.toFixed(2)) + row("Equity risk premium", F.pct(w.erp, 2)) + row("Cost of equity = risk-free + beta × premium", F.pct(w.coeRaw, 2)) + row("Minimum cost of equity (setting)", F.pct(w.coeFloor, 2)) + row("Cost of equity used", F.pct(w.coe, 2) + (w.coe > w.coeRaw ? " (minimum applied)" : "")) +
      row("Cost of debt (risk-free + spread)", F.pct(w.kd, 2)) + row("Share of equity in funding (market value)", F.pct(w.we, 1)) + row("Tax rate", F.pct(w.tax, 1)) + row("WACC", "<strong>" + F.pct(w.wacc, 2) + "</strong>") + "</tbody></table>" +
      '<p style="color:var(--muted);font-size:14px;margin:12px 0 0">WACC is used for the cash flow methods. The net income method uses the cost of equity.' + (r.gCapped ? " Long-run growth is capped at the risk-free rate (" + F.pct(r.settings.gT, 2) + "), because no company can outgrow the economy forever." : "") + '</p>';
    if (r.group && r.group.id === "financial") renderDataFin(r, row);
  }
  /* banks and insurers: the figures behind the equity methods, and where the beta comes from */
  function renderDataFin(r, row) {
    var Fd = r.fin, g = r.group, w = r.wacc, inp = r.inputs;
    $("rWacc").innerHTML = '<table class="tbl"><thead><tr><th>Cost of equity build</th><th></th></tr></thead><tbody>' +
      row("Risk-free rate", F.pct(w.rf, 2)) + row("Industry beta (" + esc(g.betaSource) + ", Damodaran, Jan 2026)", g.rawBeta.toFixed(2)) +
      row("Beta used (adjusted towards 1.0: 0.67 × beta + 0.33)", w.beta.toFixed(2)) + row("Equity risk premium", F.pct(w.erp, 2)) +
      row("Cost of equity = risk-free + beta × premium", F.pct(Fd.coeRaw, 2)) + row("Minimum cost of equity (setting)", F.pct(Fd.coeFloor, 2)) +
      row("Cost of equity used", "<strong>" + F.pct(Fd.coe, 2) + "</strong>" + (Fd.coe > Fd.coeRaw ? " (minimum applied)" : "")) + "</tbody></table>" +
      '<p style="color:var(--muted);font-size:14px;margin:12px 0 0">Banks and insurers are valued on their equity only, so WACC is not used. A bank\'s own beta measured from its share price is often unreliable, so the average for its industry is used instead' + (fin(inp.beta) ? " (this stock's own 5-year beta: " + inp.beta.toFixed(2) + ")" : "") + '. Moving the beta slider overrides it.</p>';
    var yrs = Fd.hist.map(function (h) { return "<th>" + esc(h.year) + "</th>"; }).join("");
    function line(name, f) { return "<tr><td>" + name + "</td>" + Fd.hist.map(function (h) { return "<td>" + f(h) + "</td>"; }).join("") + "</tr>"; }
    var histT = Fd.hist.length ? '<table class="tbl" style="margin-top:14px"><thead><tr><th>Year by year</th>' + yrs + "</tr></thead><tbody>" +
      line("Profit to common shareholders", function (h) { return bnx(h.ni); }) +
      line("Return on equity", function (h) { return F.pct(h.roe, 1); }) +
      line("Dividends paid", function (h) { return fin(h.divs) ? bnx(h.divs) : "–"; }) +
      line("Buybacks", function (h) { return fin(h.buybacks) ? bnx(h.buybacks) : "–"; }) + "</tbody></table>" : "";
    $("rIn").innerHTML += '<table class="tbl" style="margin-top:14px"><thead><tr><th>Bank and insurer figures</th><th></th></tr></thead><tbody>' +
      row("Preferred stock (taken out of book value)", F.mm(Fd.prefEq)) + row("Preferred dividends, last 12 months (taken out of profit)", F.mm(Fd.prefTTM)) +
      row("Book value for common shareholders", F.mm(Fd.commonEq)) + row("Profit for common shareholders", F.mm(Fd.niC)) +
      row("Return on equity, last 12 months", F.pct(Fd.roeTTM, 1)) + row("Return on equity used (" + esc(Fd.roeSrc) + ")", F.pct(Fd.roeN, 1)) +
      row("Share of profit paid as dividends", F.pct(Fd.divPay, 0)) + row("Share paid as dividends + buybacks", F.pct(Fd.totPay, 0)) +
      row("Cash returned, last 12 months", F.mm(Fd.returned)) + "</tbody></table>" + histT +
      (Fd.notes.length ? '<p style="color:var(--muted);font-size:14px;margin:12px 0 0">' + Fd.notes.map(esc).join(" ") + "</p>" : "");
  }

  function renderRatios(r) {
    var H = r.inputs.hist, cur = r.inputs.cur || {}, cap = r.settings.peCap, nY = H.labels && H.labels.length ? H.labels.length : Math.max(H.pe.length, H.ps.length, H.pb.length);
    var labels = [];
    for (var i = 0; i < nY; i++) labels.push((H.labels && H.labels[i]) || "Year " + (i + 1));
    function line(name, arr, now, isPE) {
      var cells = "";
      for (var i = 0; i < nY; i++) { var v = arr[i - (nY - arr.length)]; cells += '<td' + (isPE && fin(v) && v > cap ? ' class="cut" title="Ignored (above ' + cap + 'x)"' : "") + ">" + (fin(v) ? v.toFixed(2) : "–") + "</td>"; }
      var kept = isPE ? arr.filter(function (v) { return fin(v) && v > 0 && v <= cap; }) : arr;
      var av = kept.length ? kept.reduce(function (p, q) { return p + q; }, 0) / kept.length : NaN;
      return "<tr><td>" + name + "</td>" + cells + "<td>" + (fin(now) ? now.toFixed(2) : "–") + '</td><td class="hl">' + (fin(av) ? av.toFixed(2) : "–") + "</td></tr>";
    }
    $("rRatios").innerHTML = '<h3 class="card__title">Valuation ratios</h3><p class="na" style="margin:0 0 10px">The "mean multiple" methods use the 5-year average in the last column. Crossed-out readings are ignored (above ' + cap + "x).</p>" +
      '<table class="tbl tbl--ratios"><thead><tr><th></th>' + labels.map(function (l) { return "<th>" + esc(l) + "</th>"; }).join("") + "<th>Current</th><th>Average used</th></tr></thead><tbody>" +
      line("Price to earnings (P/E)", H.pe, cur.pe, true) + line("Price to sales (P/S)", H.ps, cur.ps) + line("Price to book (P/B)", H.pb, cur.pb) + "</tbody></table>";
  }

  /* ---------------- wiring ---------------- */
  /* Faint "digital rain" of figures. Used behind the home headline and behind the company name at the top of
     each result. Each one runs only while it is on screen, about 16 frames a second; one still frame when the
     device asks for reduced motion. Returns a handle so a replaced result page can stop its old rain. */
  function makeRain(c, active) {
    if (!c || !c.getContext) return { stop: function () {} };
    var ctx = c.getContext("2d"), GLYPHS = "0123456789$%.+-0123456789", fs = 15, cols = 0, drops = [], speed = [], W = 0, H = 0, stopped = false, seen = true;
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function size() {
      var r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      fs = W < 600 ? 13 : 15;
      c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / (fs * 1.15)); drops = []; speed = [];
      for (var i = 0; i < cols; i++) { drops.push(Math.random() * -H / fs); speed.push(.35 + Math.random() * .55); }
      ctx.fillStyle = "#040a16"; ctx.fillRect(0, 0, W, H);
      ctx.font = "500 " + fs + "px 'Instrument Sans', 'Helvetica Neue', sans-serif";
    }
    function frame(full) {
      ctx.fillStyle = "rgba(4, 10, 22, .16)"; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < cols; i++) {
        var y = drops[i] * fs, x = i * fs * 1.15;
        if (y > 0) {
          ctx.fillStyle = "rgba(170, 225, 205, .85)"; ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y);
          ctx.fillStyle = "rgba(70, 150, 130, .55)"; ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y - fs);
        }
        drops[i] += full ? 1 : speed[i];
        if (y > H && Math.random() > .97) drops[i] = Math.random() * -12;
      }
    }
    function warm() { for (var k = 0; k < 40; k++) frame(true); }
    size();
    var rt, onResize = function () { clearTimeout(rt); rt = setTimeout(function () { size(); if (still) warm(); }, 200); };
    window.addEventListener("resize", onResize);
    var io = window.IntersectionObserver ? new IntersectionObserver(function (e) { seen = e[0].isIntersecting; }) : null;
    if (io) io.observe(c);
    var handle = { stop: function () { stopped = true; window.removeEventListener("resize", onResize); if (io) io.disconnect(); } };
    if (still) { warm(); return handle; }
    var last = 0;
    (function loop(t) {
      if (stopped || !c.isConnected) { handle.stop(); return; }
      requestAnimationFrame(loop);
      if (document.hidden || !seen || !active() || t - last < 60) return;
      last = t; frame(false);
    })(0);
    return handle;
  }
  function startRain() { makeRain($("rain"), function () { return !$("hero").classList.contains("hidden"); }); }
  var resRain = null;
  function startResultRain() {
    if (resRain) resRain.stop();
    resRain = makeRain($("rainRes"), function () { return !$("results").classList.contains("hidden"); });
  }

  function wire() {
    $("heroForm").addEventListener("submit", function (e) { e.preventDefault(); search($("heroInput").value); });
    $("barForm").addEventListener("submit", function (e) { e.preventDefault(); search($("barInput").value, "bar"); });
    $("home").addEventListener("click", home);
    document.querySelectorAll(".chip").forEach(function (b) { b.addEventListener("click", function () { $("heroInput").value = b.dataset.t; search(b.dataset.t); }); });
    var tmr; window.addEventListener("resize", function () {
      clearTimeout(tmr); tmr = setTimeout(function () {
        if (!$("hero").classList.contains("hidden")) drawHero(false);
        else if (state.result) update(false);
      }, 150);
    });
    /* the bottom sheet used on phones */
    var sh = document.createElement("div");
    sh.className = "sheet"; sh.id = "sheet"; sh.hidden = true;
    sh.innerHTML = '<div class="sheet__scrim" data-close="1"></div><div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">' +
      '<div class="sheet__grip" data-close="1" aria-hidden="true"></div><div class="sheet__head"><h3 id="sheetTitle"></h3><button type="button" class="sheet__x" id="sheetClose" aria-label="Close">×</button></div><div class="sheet__body" id="sheetBody"></div></div>';
    document.body.appendChild(sh);
    sh.addEventListener("click", function (e) { if (e.target.dataset && e.target.dataset.close) closeSheet(); });
    $("sheetClose").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    /* drag the panel down to close it */
    var y0 = null, panel = sh.querySelector(".sheet__panel");
    panel.addEventListener("touchstart", function (e) { if ($("sheetBody").scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener("touchmove", function (e) { if (y0 == null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) panel.style.transform = "translateY(" + dy + "px)"; }, { passive: true });
    panel.addEventListener("touchend", function (e) {
      if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; panel.style.transform = "";
      if (dy > 90) closeSheet();
    });
    startRain();
    makeRain($("rainHow"), function () { return true; });
    wireSug("heroInput", "heroSug"); wireSug("barInput", "barSug");
    sIndex(); setTimeout(loadFull, 1200);
    document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".search")) closeSug(); });
    var q = new URLSearchParams(location.search).get("t");
    var hm = $("heroManual"); if (hm) hm.addEventListener("click", function () { showManual({}); });
    drawHero(true);
    if (q) search(q);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
