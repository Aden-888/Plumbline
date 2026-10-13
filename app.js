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
  var barCol = function (up, s) { return up >= s.buy ? "#3ccf7a" : up <= s.sell ? "#ef5b5b" : "#e2b84a"; };
  var scoreCol = function (v) { return v >= 65 ? "#3ccf7a" : v >= 50 ? "#e2b84a" : "#ef5b5b"; };

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
    var t = (raw || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!t) return;
    $("heroMsg").innerHTML = "";
    if (window.PRESETS[t]) return show(window.PRESETS[t]);
    /* a company name such as "salesforce" or "nvidia" opens the same checked data as its ticker */
    var byName = presetByName(raw);
    if (byName) return show(byName);
    setLoading(true, "Fetching data for " + t + "…");
    loadLive(t).then(function (inp) { setLoading(false); show(inp); })
      .catch(function (e) {
        setLoading(false);
        if (e.needKey) return needKey(t);
        var m = e.message || String(e);
        if (/failed to fetch|networkerror|load failed/i.test(m)) m = "Could not reach the data provider. Check your internet connection and try again.";
        fail(t, m, e.suggest);
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
    return '<p>Did you mean: ' + list.map(function (s) { return '<button class="chip" data-t="' + esc(s.symbol) + '" title="' + esc(s.name) + '">' + esc(s.symbol) + "</button>"; }).join(" ") + "</p>";
  }
  function bindMsg(t) {
    document.querySelectorAll("#heroMsg [data-t], #results [data-t]").forEach(function (b) { b.addEventListener("click", function () { search(b.dataset.t); }); });
    var m = document.querySelectorAll("[data-manual]"); m.forEach(function (b) { b.addEventListener("click", function () { showManual({ ticker: t }); }); });
    var k = $("resetKey"); if (k) k.addEventListener("click", function () { store(false, null); needKey(t); });
  }
  function fail(t, msg, suggest) {
    placeMsg('<div class="notice notice--error"><h3>Could not value ' + esc(t) + "</h3><p>" + esc(msg) + "</p>" + suggestHtml(suggest) +
      '<p>You can try another ticker' + (window.PLUMBLINE_STATIC ? ' or <button class="btn" data-manual="1">enter the numbers yourself</button>.' : ', <button class="btn" data-manual="1">enter the numbers yourself</button> or <button class="btn" id="resetKey">change the API key</button>') + '</p></div>');
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
    state.inputs = inp;
    state.defaults = Object.assign(IV.defaultSettings(inp), inp.settings || {});
    state.settings = Object.assign({}, state.defaults);
    state.open = {};
    try { state.quality = QS.compute(inp); } catch (e) { state.quality = { ok: false, reason: "error" }; }
    $("hero").classList.add("hidden"); $("loading").classList.add("hidden");
    $("barForm").classList.remove("hidden"); $("barInput").value = "";
    try { history.replaceState(null, "", "?t=" + inp.ticker); } catch (e) {}
    document.title = inp.ticker + " intrinsic value | Plumbline";
    buildShell(); update(true);
    window.scrollTo({ top: 0 });
  }
  function home() {
    $("results").classList.add("hidden"); $("loading").classList.add("hidden");
    $("hero").classList.remove("hidden"); $("barForm").classList.add("hidden");
    closeSheet();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    document.title = "Plumbline: what is a stock actually worth?";
    drawHero(true); window.scrollTo({ top: 0 });
  }

  /* ---------------- hero ---------------- */
  function drawHero(animate) {
    var p = window.PRESETS.NVDA, s = Object.assign(IV.defaultSettings(p), p.settings);
    var r = IV.compute(p, s), el = $("heroChart");
    Charts.strip(el, r);
    if (animate) Charts.settle(el);
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
    ["peCap", "Ignore P/E readings above", "Very high P/E readings usually mean profit was close to zero that year.", 30, 300, 10, function (v) { return v.toFixed(0) + "x"; }],
    ["buy", "BUY if upside is at least", "The margin of safety the median value needs over the price.", .05, .5, .05, pc],
    ["sell", "SELL if downside is at least", "The mirror image. Anything between the two lines is HOLD.", -.5, -.05, .05, pc]
  ];
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
      '<div class="wrap res">' +
      '<div class="head" id="overview"><h2>' + esc(inp.name) + ' <span class="head__tk">' + esc(inp.ticker) + '</span></h2><div class="head__meta">' + (inp.exchange ? esc(inp.exchange) + " · " : "") + "Price as of " + esc(inp.asOf) + " · Financials to " + esc(inp.ttmEnd) + " · Data: " + esc(inp.source || (inp.manual ? "entered by you" : inp.live ? "live data provider" : "checked built-in figures")) + "</div></div>" +
      '<p class="bridge" style="margin:18px 0 -10px">Step 1 · The answer: what Plumbline thinks the stock is worth</p><div id="rVerdict"></div>' +
      '<section class="sec" id="quality"><p class="bridge">Step 2 · Is the business behind the stock any good?</p><h2>Business quality scorecard</h2><p class="sec__lede">The valuation above says whether the stock is cheap. This scorecard says whether the business is good. It grades the company on 13 measures across three areas, using its own financial statements. Each measure scores Strong, Good or Weak, and core measures count double.</p><div id="rQuality"></div></section>' +
      '<section class="sec" id="chart"><p class="bridge">Step 3 · Now let\'s see how the estimated value was reached</p><h2>Valuation chart</h2><p class="sec__lede">Each bar is one method. The white dashed line is the Plumbline value (the median of the nine) and the green dashed line is the current share price. Bars that reach past the green line say the stock looks cheap on that method.</p><div class="card"><div class="chart" id="rBars"></div><div class="legend"><span><i style="background:#3ccf7a"></i>Undervalued</span><span><i style="background:#e2b84a"></i>Fair</span><span><i style="background:#ef5b5b"></i>Overvalued</span><span><i class="sq" style="background:#4fd1c5"></i>Plumbline value (median)</span></div></div></section>' +
      '<section class="sec" id="methods"><p class="bridge">Step 4 · Each of the nine methods in detail</p><h2>How each method got its number</h2><p class="sec__lede">Select a method to see why it is used, where it works best and how its number was built from this company\'s own figures.</p><p class="swipe-hint">Swipe to see all nine methods. Tap one for the full calculation.</p><div class="mlist" id="rMethods"></div></section>' +
      '<section class="sec" id="average"><p class="bridge">Step 5 · The methods disagree, so here\'s how one number is chosen</p><h2>How nine values become one</h2><div id="rAvgText"></div><div class="card"><div class="chart" id="rStats"></div></div><div class="avg" id="rAvg"></div></section>' +
      '<section class="sec" id="forecast"><p class="bridge">Step 6 · The cash flow methods depend on a forecast. Here\'s what it assumes</p><h2>What the forecast assumes</h2><p class="sec__lede" id="rProjText"></p>' +
      '<div class="card tscroll"><table class="tbl tbl--proj" id="rProjTbl"></table></div>' +
      '<p class="card__note">Free cash flow is the cash left after the company pays for its equipment and buildings. Profit excludes one-off gains. B = billion. Why does growth slow down? Very few companies can grow faster than the whole economy forever, so growth is assumed to settle at about the economy\'s long-run rate.</p>' +
      '<p class="jump"><a href="#settings">Think growth will be faster or slower? Try it in Assumptions →</a></p>' +
      '<details class="more" id="projMore"><summary><span>Show the full 20-year forecast</span><small>Charts of cash flow, profit and growth for every year</small></summary><div class="more__body"><div class="two"><div class="card"><div class="chart" id="rProj"></div><div class="legend" id="rProjLeg"></div></div><div class="card"><div class="chart" id="rGrow"></div><div class="legend" id="rGrowLeg"></div></div></div></div></details></section>' +
      '<section class="sec" id="settings"><p class="bridge">Step 7 · Don\'t agree with the forecast? Change it here</p><h2>Change the assumptions</h2><p class="sec__lede">The defaults follow the Excel models. Move any slider and every number on this page updates straight away. This shows how much the answer depends on each judgement call.</p><div class="card"><div class="set">' + ctl + '</div><p style="margin:16px 0 0"><button class="btn" id="reset">Reset to defaults</button></p></div></section>' +
      '<section class="sec" id="data"><p class="bridge">Step 8 · Before relying on the result, here\'s where the numbers come from</p><h2>Things to know</h2><div id="rCav"></div>' +
      '<details class="more" id="dataMore"><summary><span>Source data for analysts</span><small>Valuation ratios, the company figures used, and how the discount rate was built</small></summary><div class="more__body">' +
      '<p class="tlabel">How the market priced the stock at each year-end. The "mean multiple" methods use these averages.</p><div class="card tscroll" id="rRatios"></div>' +
      '<div class="two" style="margin-top:16px"><div><p class="tlabel">The company figures every calculation starts from.</p><div class="card" id="rIn"></div></div><div><p class="tlabel">How the discount rate (the yearly return investors expect) was built.</p><div class="card" id="rWacc"></div></div></div></div></details></section>' +
      "</div>" +
      '<button class="dock" id="dock" type="button" aria-label="Back to the verdict"></button>';
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
    sh.hidden = false; requestAnimationFrame(function () { sh.classList.add("open"); });
    document.documentElement.classList.add("noscroll");
    $("sheetClose").focus();
  }
  function closeSheet() {
    var sh = $("sheet"); if (!sh || sh.hidden) return;
    sh.classList.remove("open"); document.documentElement.classList.remove("noscroll");
    setTimeout(function () { if (!sh.classList.contains("open")) sh.hidden = true; }, 260);
  }
  var raf = null;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = null; update(false); }); }
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
    if (!r.stats.n) { $("rVerdict").innerHTML = '<div class="notice notice--error"><h3>Not enough data</h3><p>None of the nine methods could be calculated for this stock.</p></div>'; renderQuality(r); return; }
    renderVerdict(r, initial); renderQuality(r); renderMethods(r); renderAvg(r); renderProj(r); renderData(r);
    Charts.bars($("rBars"), r); Charts.strip($("rStats"), r, { stats: true });
    if ($("projMore") && $("projMore").open) drawProj(r);
    if (initial) { var rb = $("rBars"), rq = $("rQuality"); rb.classList.add("grow"); if (rq) rq.classList.add("grow"); setTimeout(function () { rb.classList.remove("grow"); if (rq) rq.classList.remove("grow"); }, 1600); }
  }

  function renderVerdict(r, initial) {
    var st = r.stats, inp = r.inputs, s = r.settings, v = st.verdict, q = state.quality;
    var line = v === "BUY" ? "That is above the " + F.spct(s.buy, 0) + " BUY line."
      : v === "SELL" ? "That is below the " + F.spct(s.sell, 0) + " SELL line."
      : "That sits between the SELL line (" + F.spct(s.sell, 0) + ") and the BUY line (" + F.spct(s.buy, 0) + ").";
    var spread = st.max / st.min;
    var qRow = q && q.ok ? '<dt>Business quality</dt><dd><a href="#quality" class="qlink" style="color:' + scoreCol(q.score) + '">' + q.grade + " · " + Math.round(q.score) + "/100</a></dd>" : "";
    var html =
      '<div class="verdict"><div class="verdict__main"><p class="verdict__label">Estimated intrinsic value per share (median of ' + st.n + ' methods)</p>' +
      '<p class="verdict__value" id="vNum">' + F.usd(st.median) + "</p>" +
      '<p class="verdict__sum">The share price is ' + F.usd(inp.price) + ". The median value is <strong class=\"" + cls(st.upside, s) + "\">" + F.spct(st.upside) + (st.upside >= 0 ? " above" : " below").replace("+", "") + "</strong> the price. " + line + " " + st.above + " of " + st.n + " methods value the stock above its price." +
      (st.n < r.methods.length ? " " + (r.methods.length - st.n) + " method(s) could not be calculated for this stock (" + r.methods.filter(function (m) { return !fin(m.value); }).map(function (m) { return m.short; }).join(", ") + "), so the median uses the other " + st.n + "." : "") + (spread > 3 ? " The methods are far apart (" + F.usd(st.min, 0) + " to " + F.usd(st.max, 0) + "), which is why the median is used instead of a plain average." : "") + "</p></div>" +
      '<div class="verdict__side"><span class="pill pill--' + v + '"><i></i>' + v + "</span>" +
      '<div><div class="zone"><span class="' + (v === "SELL" ? "on-SELL" : "") + '"></span><span class="' + (v === "HOLD" ? "on-HOLD" : "") + '"></span><span class="' + (v === "BUY" ? "on-BUY" : "") + '"></span></div>' +
      '<div class="zone__labels"><span>SELL ≤ ' + F.spct(s.sell, 0) + "</span><span>HOLD</span><span>BUY ≥ " + F.spct(s.buy, 0) + "</span></div></div>" +
      '<dl class="kv"><dt>Share price</dt><dd>' + F.usd(inp.price) + "</dd><dt>Median value</dt><dd>" + F.usd(st.median) + "</dd><dt>Upside / (downside)</dt><dd class=\"" + cls(st.upside, s) + "\">" + F.spct(st.upside) + "</dd><dt>Average of all nine</dt><dd>" + F.usd(st.mean) + "</dd>" +
      (inp.est.target ? "<dt>Analyst average target</dt><dd>" + F.usd(inp.est.target) + "</dd>" : "") + qRow + "</dl></div></div>";
    $("rVerdict").innerHTML = html;
    if (initial) countUp($("vNum"), st.median);
    var dk = $("dock");
    if (dk) dk.innerHTML = '<b>' + esc(inp.ticker) + '</b><span class="dock__v">' + F.usd(st.median, 0) + '</span><span class="dock__up ' + cls(st.upside, s) + '">' + F.spct(st.upside, 0) + '</span><span class="pill pill--sm pill--' + v + '">' + v + "</span>" + (q && q.ok ? '<span class="dock__q" style="color:' + scoreCol(q.score) + '">' + q.grade + "</span>" : "") + '<span class="dock__up-arrow" aria-hidden="true">↑</span>';
  }
  function countUp(el, to) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var t0 = performance.now(), d = 900;
    (function f(t) {
      var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = F.usd(to * e); if (k < 1) requestAnimationFrame(f); else el.textContent = F.usd(to);
    })(t0);
  }

  /* ---------------- business quality ---------------- */
  var LEVEL_CLS = { Strong: "lv--s", Good: "lv--g", Weak: "lv--w", "n/a": "lv--n" };
  var LEVEL_COL = { Strong: "#3ccf7a", Good: "#e2b84a", Weak: "#ef5b5b", "n/a": "#5d716f" };
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
        var ok = p.score != null, pc2 = ok ? scoreCol(p.score) : "#5d716f";
        return '<div class="qp"><span class="qp__name">' + esc(p.name) + ' <small>' + Math.round(p.weight * 100) + "% of score</small></span>" +
          '<span class="qp__bar"><b style="width:' + (ok ? Math.max(2, p.score) : 0) + "%;background:" + pc2 + '"></b></span><span class="qp__val" style="color:' + pc2 + '">' + (ok ? Math.round(p.score) : "n/a") + "</span></div>";
      }).join("") + "</div>" +
      '<p class="qs__scale">A 80+ Excellent · B 65–79 Good · C 50–64 Average · D 35–49 Weak · F below 35 Poor</p></div></div>';
    var comboHtml = combo ? '<div class="qs__combo qs__combo--' + (combo.tone || "mid") + '"><span class="pill pill--' + v + '"><i></i>' + v + '</span><span class="qs__plus">+</span><span class="qs__gradechip" style="color:' + col + ';border-color:' + col + '">Quality ' + q.grade + "</span><div><h3>" + esc(combo.title) + "</h3><p>" + esc(combo.text) + "</p></div></div>" : "";
    var cards = q.pillars.map(function (p) {
      var pc2 = p.score != null ? scoreCol(p.score) : "#5d716f";
      var scored = p.metrics.filter(function (m) { return m.level != null; });
      var best = scored.slice().sort(function (a, b) { return b.level - a.level || (b.core ? 1 : 0) - (a.core ? 1 : 0); })[0];
      var worst = scored.slice().sort(function (a, b) { return a.level - b.level || (b.core ? 1 : 0) - (a.core ? 1 : 0); })[0];
      var hl = function (label, m) { return m ? '<div class="hl2"><small>' + label + '</small><span>' + esc(m.name) + '</span><b>' + esc(m.show) + '</b><span class="lv ' + LEVEL_CLS[m.levelName] + '">' + esc(m.levelName) + "</span></div>" : ""; };
      var rows = p.metrics.map(function (m) {
        var lc = LEVEL_CLS[m.levelName] || "lv--n";
        var sp = m.series ? Charts.spark(m.series, LEVEL_COL[m.levelName] || "#8fa3a0") : "";
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
      return '<details class="m" data-id="' + m.id + '"' + (state.open[m.id] ? " open" : "") + '><summary><div class="m__name">' + esc(m.name) + "<small>" + esc(m.short) + '</small></div><span class="m__type">' + esc(m.type) + '</span><div class="m__barcell">' + bar + '</div><div class="m__valcell"><div class="m__val">' + (ok ? F.usd(m.value) : "n/a") + '</div><div class="m__up ' + (ok ? cls(m.upside, s) : "") + '">' + (ok ? F.spct(m.upside, 0) : "") + '</div></div><span class="m__chev" aria-hidden="true">›</span></summary>' +
        '<div class="m__body"><div><h4>What it is</h4><p>' + esc(c.what) + "</p><h4>Why it is used</h4><p>" + esc(c.why) + "</p><h4>Where it works best</h4><p>" + esc(c.fit) + "</p><h4>What to watch</h4><p>" + esc(c.watch) + "</p></div>" +
        "<div><h4>How this number was built</h4>" + (ok ? '<table class="calc">' + steps + "</table>" : '<p class="na">This method could not run: ' + esc(m.why || "missing data") + ".</p>") + "</div></div></details>";
    }).join("");
  }

  function renderAvg(r) {
    var st = r.stats, s = r.settings;
    $("rAvgText").innerHTML = '<p class="sec__lede">The nine methods rarely agree, so one number has to be chosen. Plumbline uses the <strong>median</strong>, which is the middle value when the nine are lined up from lowest to highest. It is the headline because a single extreme method, high or low, cannot pull it far. The mean and trimmed mean are shown so you can see how much the choice matters.</p>';
    function card(t, v, p, main) {
      return '<div class="avg__c' + (main ? " is-main" : "") + '"><h3>' + t + (main ? '<span class="tag">Headline</span>' : "") + '</h3><div class="avg__n">' + F.usd(v) + '</div><p class="' + cls(v / r.inputs.price - 1, s) + '" style="font-weight:700;margin-bottom:6px">' + F.spct(v / r.inputs.price - 1) + " vs price</p><p>" + p + "</p></div>";
    }
    $("rAvg").innerHTML =
      card("Median", st.median, "The middle of the " + st.n + " values. Not affected by how extreme the highest and lowest are.", true) +
      card("Mean (simple average)", st.mean, "Adds all " + st.n + " values and divides. Easy to understand, but one outlier can pull it a long way.") +
      card("Trimmed mean", st.trimmed, "Drops the single highest and lowest values, then averages the rest.");
  }

  function bn(v) { return v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "T" : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "B" : "$" + v.toFixed(0) + "M"; }
  function renderProj(r) {
    var P = r.proj, s = r.settings, g = r.growth, inp = r.inputs;
    var src = inp.live ? "the company's recent growth (the free data source has no analyst estimates)" : "analyst estimates";
    $("rProjText").innerHTML = "Plumbline assumes " + esc(inp.name) + "'s cash flow grows about <strong>" + F.pct(g.cf[0], 0) + "</strong> next year and <strong>" + F.pct(g.cf[1], 0) + "</strong> the year after. Growth then settles towards " + F.pct(s.g5, 0) + " a year by year 5, " + F.pct(s.g10, 0) + " by year 10 and " + F.pct(s.gT, 0) + " by year 20. " +
      "On that path, free cash flow would grow from " + F.mm(P.fcf[0]) + " today to about " + F.mm(P.fcf[10]) + " in year 10. The first two years come from " + src + ".";
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
  function bnx(v) { var a = Math.abs(v), sg = v < 0 ? "−" : ""; return sg + (a >= 1e6 ? "$" + (a / 1e6).toFixed(2) + "T" : a >= 1e3 ? "$" + (a / 1e3).toFixed(1) + "B" : "$" + a.toFixed(0) + "M"); }
  function drawProj(r) {
    var P = r.proj;
    Charts.lines($("rProj"), [
      { values: P.ocf, color: "#4fd1c5", endText: "Op. cash flow" }, { values: P.fcf, color: "#b39cf5", endText: "Free cash flow" }, { values: P.ni, color: "#7aa7ff", endText: "Net income" }
    ], { fmt: bn, h: 290, zero: "$0" });
    $("rProjLeg").innerHTML = '<span><i class="sq" style="background:#4fd1c5"></i>Operating cash flow</span><span><i class="sq" style="background:#b39cf5"></i>Free cash flow</span><span><i class="sq" style="background:#7aa7ff"></i>Net income (excl. one-offs)</span><span>Starts from the last 12 months. X axis is years from today.</span>';
    var gcv = P.gCF.slice(), gev = P.gEPS.slice();
    var ymax = Math.max(Math.max.apply(null, gcv), Math.max.apply(null, gev), .1);
    Charts.lines($("rGrow"), [
      { values: gcv, color: "#4fd1c5", dots: [0, 1], endText: "Cash flow" }, { values: gev, color: "#7aa7ff", dots: [0, 1], endText: "Earnings" }
    ], { fmt: function (v) { return (v * 100).toFixed(0) + "%"; }, h: 290, ymin: Math.min(0, Math.min.apply(null, gcv.concat(gev))), ymax: ymax * 1.05, band: [0, 1], bandLabel: "Years 1–2", xlabel: function (i) { return i + 1; } });
    $("rGrowLeg").innerHTML = '<span><i class="sq" style="background:#4fd1c5"></i>Cash flow growth</span><span><i class="sq" style="background:#7aa7ff"></i>Earnings growth</span><span>X axis is the forecast year (1 to 20).</span>';
  }

  function renderData(r) {
    var inp = r.inputs, T = inp.ttm, b = r.base, w = r.wacc;
    var all = inp.caveats || [], li = function (c) { return "<li>" + esc(c) + "</li>"; };
    var wasOpen = $("cavMore") && $("cavMore").open;
    $("rCav").innerHTML = '<p class="sec__lede">The most important notes about this result. Every model rests on data and assumptions that can be wrong.</p><ul class="cav">' + all.slice(0, 3).map(li).join("") + "</ul>" +
      (all.length > 3 ? '<details class="qmore" id="cavMore"' + (wasOpen ? " open" : "") + '><summary>Show ' + (all.length - 3) + " more note" + (all.length - 3 === 1 ? "" : "s") + '</summary><ul class="cav" style="margin-top:10px">' + all.slice(3).map(li).join("") + "</ul></details>" : "");
    renderRatios(r);
    var row = function (a, b2) { return "<tr><td>" + a + "</td><td>" + b2 + "</td></tr>"; };
    $("rIn").innerHTML = '<table class="tbl"><thead><tr><th>Inputs used (last 12 months)</th><th></th></tr></thead><tbody>' +
      row("Revenue", F.mm(T.rev)) + row("Net income (reported)", F.mm(T.ni)) + row("One-off investment gains (before tax)", F.mm(T.gain)) + row("Net income excluding one-offs", F.mm(b.niEx)) +
      row("Earnings per share excluding one-offs", F.usd(b.epsEx)) + row("Operating cash flow", F.mm(T.ocf)) + row("Capital spending", F.mm(T.capex)) + row("Free cash flow", F.mm(b.fcf)) +
      row("Cash and investments", F.mm(inp.cash)) + row("Total debt", F.mm(inp.debt)) + row("Shareholders' equity", F.mm(inp.equity)) + row("Shares outstanding", F.num(inp.shares) + " million") + "</tbody></table>";
    $("rWacc").innerHTML = '<table class="tbl"><thead><tr><th>Discount rate build</th><th></th></tr></thead><tbody>' +
      row("Risk-free rate", F.pct(w.rf, 2)) + row("Beta", w.beta.toFixed(2)) + row("Equity risk premium", F.pct(w.erp, 2)) + row("Cost of equity = risk-free + beta × premium", F.pct(w.coe, 2)) +
      row("Cost of debt (risk-free + spread)", F.pct(w.kd, 2)) + row("Share of equity in funding (market value)", F.pct(w.we, 1)) + row("Tax rate", F.pct(w.tax, 1)) + row("WACC", "<strong>" + F.pct(w.wacc, 2) + "</strong>") + "</tbody></table>" +
      '<p style="color:var(--muted);font-size:14px;margin:12px 0 0">WACC is used for the cash flow methods. The net income method uses the cost of equity.</p>';
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
    var q = new URLSearchParams(location.search).get("t");
    var hm = $("heroManual"); if (hm) hm.addEventListener("click", function () { showManual({}); });
    drawHero(true);
    if (q) search(q);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
