/* Small hand-built SVG charts. No libraries, so the site works offline. */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var C = { buy: "#4cb782", hold: "#c9a75a", sell: "#d66b63", accent: "#8fb4e6", text: "#e8ecf5", muted: "#93a3ba" };
  function fin(x) { return typeof x === "number" && isFinite(x); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function niceStep(max, n) {
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function dotColor(up, s) { return up >= s.buy ? C.buy : up <= s.sell ? C.sell : C.hold; }
  function usd0(v) { return "$" + Math.round(v).toLocaleString("en-US"); }

  /* Strip plot: every method as a dot on a dollar line, with the price and the median marked. */
  function strip(el, r, opt) {
    opt = opt || {};
    var W = Math.max(300, el.clientWidth || 900), narrow = W < 560;
    var H = opt.stats ? (narrow ? 330 : 310) : (narrow ? 290 : 270);
    var L = 22, Rm = 22, axisY = H - 52, dotY = axisY - 16;
    var ms = r.methods.filter(function (m) { return fin(m.value); });
    var price = r.inputs.price, med = r.stats.median;
    var max = Math.max(price, r.stats.max) * 1.07;
    var step = niceStep(max, narrow ? 4 : 6);
    var top = Math.ceil(max / step) * step;
    var x = function (v) { return L + (v / top) * (W - L - Rm); };
    var s = [];
    s.push('<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">');
    for (var t = 0; t <= top + 1e-9; t += step) {
      s.push('<line class="grid" x1="' + x(t) + '" x2="' + x(t) + '" y1="26" y2="' + axisY + '"/>');
      s.push('<text x="' + x(t) + '" y="' + (axisY + 18) + '" text-anchor="middle">' + usd0(t) + "</text>");
    }
    s.push('<line class="axis" x1="' + L + '" x2="' + (W - Rm) + '" y1="' + axisY + '" y2="' + axisY + '"/>');
    /* range band */
    s.push('<rect x="' + x(r.stats.min) + '" y="' + (dotY - 5) + '" width="' + Math.max(2, x(r.stats.max) - x(r.stats.min)) + '" height="10" rx="5" fill="#8fb4e6" opacity=".10"/>');

    /* price line */
    s.push('<line x1="' + x(price) + '" x2="' + x(price) + '" y1="26" y2="' + (axisY + 2) + '" stroke="#e8ecf5" stroke-width="1.5" stroke-dasharray="4 4" opacity=".8"/>');
    s.push('<text x="' + x(price) + '" y="' + (axisY + 38) + '" text-anchor="middle" class="lbl">Price ' + usd0(price) + "</text>");

    var dotsAt = s.length; /* vertical marker lines are slotted in here, under the dots and their labels */
    /* dots, sorted so label lanes can alternate */
    var sorted = ms.slice().sort(function (a, b) { return a.value - b.value; });
    var lanes = narrow ? 6 : 4, laneH = narrow ? 21 : 26;
    /* each label goes in the lowest lane where it does not touch the label before it, so names never overlap */
    var fsz = narrow ? 11 : 12, laneEnd = [], tx = {};
    for (var q = 0; q < lanes; q++) laneEnd.push(-1e9);
    sorted.forEach(function (m, i) {
      var w = m.short.length * fsz * .66 + 12, c = Math.min(Math.max(x(m.value), w / 2 + 2), W - w / 2 - 2), pick = -1;
      for (var q = 0; q < lanes; q++) if (c - w / 2 > laneEnd[q]) { pick = q; break; }
      if (pick < 0) { pick = 0; for (q = 1; q < lanes; q++) if (laneEnd[q] < laneEnd[pick]) pick = q; c = Math.min(laneEnd[pick] + w / 2, W - w / 2 - 2); }
      laneEnd[pick] = c + w / 2; tx[i] = { lane: pick, c: c };
    });
    sorted.forEach(function (m, i) {
      var cx = x(m.value), lane = tx[i].lane, ly = dotY - 26 - lane * laneH;
      var col = opt.stats ? "#5e6f88" : dotColor(m.upside, r.settings);
      var tip = m.short + ": " + usd0(m.value) + " (" + (m.upside >= 0 ? "+" : "−") + Math.abs(m.upside * 100).toFixed(0) + "% vs price)";
      s.push('<g class="dotg" data-i="' + i + '"><title>' + esc(tip) + "</title>" +
        '<line x1="' + cx + '" x2="' + cx + '" y1="' + (ly + 4) + '" y2="' + (dotY - 7) + '" stroke="' + col + '" opacity=".45"/>' +
        '<circle cx="' + cx + '" cy="' + dotY + '" r="7" fill="' + col + '" stroke="#040a16" stroke-width="2"/>' +
        '<text x="' + tx[i].c + '" y="' + ly + '" text-anchor="middle" style="font-size:' + fsz + 'px">' + esc(m.short) + "</text></g>");
    });

    if (opt.stats) {
      var st = r.stats;
      var mk = [
        { v: st.mean, n: "Mean", y: 24, shape: "tri" },
        { v: st.trimmed, n: "Trimmed mean", y: 46, shape: "ring" },
        { v: st.median, n: "Median", y: 68, shape: "dia", main: true }
      ];
      mk.forEach(function (k) {
        var cx = x(k.v);
        s.splice(dotsAt++, 0, '<line x1="' + cx + '" x2="' + cx + '" y1="' + k.y + '" y2="' + (axisY) + '" stroke="' + (k.main ? C.accent : "#93a3ba") + '" stroke-width="' + (k.main ? 2 : 1) + '" opacity="' + (k.main ? 1 : .5) + '"/>');
        s.push('<rect x="' + (cx - 5) + '" y="' + (k.y - 5) + '" width="10" height="10" transform="rotate(45 ' + cx + " " + k.y + ')" fill="' + (k.main ? C.accent : "#040a16") + '" stroke="' + (k.main ? C.accent : "#93a3ba") + '" stroke-width="1.5"/>');
        var right = cx < W * .7;
        s.push('<text x="' + (cx + (right ? 12 : -12)) + '" y="' + (k.y + 4) + '" text-anchor="' + (right ? "start" : "end") + '" class="lbl" style="fill:' + (k.main ? C.accent : "#e8ecf5") + '">' + k.n + " " + usd0(k.v) + "</text>");
      });
    } else {
      var mx = x(med);
      s.splice(dotsAt, 0, '<line x1="' + mx + '" x2="' + mx + '" y1="14" y2="' + axisY + '" stroke="' + C.accent + '" stroke-width="2"/>');
      s.push('<rect x="' + (mx - 6) + '" y="8" width="12" height="12" transform="rotate(45 ' + mx + ' 14)" fill="' + C.accent + '"/>');
      var right = mx < W * .72;
      s.push('<text x="' + (mx + (right ? 14 : -14)) + '" y="18" text-anchor="' + (right ? "start" : "end") + '" class="lbl" style="fill:' + C.accent + '">Median ' + usd0(med) + "</text>");
    }
    s.push("</svg>");
    el.innerHTML = s.join("");
    return el;
  }

  /* Ranked dot plot for the home page example: one row per method, lowest to highest, so no label ever
     overlaps. The median (solid blue) and the share price (dashed) run through every row. */
  function dotplot(el, r) {
    var W = Math.max(300, el.clientWidth || 900), narrow = W < 560;
    var ms = r.methods.filter(function (m) { return fin(m.value); }).slice().sort(function (a, b) { return a.value - b.value; });
    var rowH = narrow ? 30 : 32, top = 40, bot = 56, H = top + ms.length * rowH + bot;
    var labW = narrow ? 92 : 132, valW = narrow ? 50 : 64, x0 = labW + 12, x1 = W - valW - 8;
    var price = r.inputs.price, med = r.stats.median, s = r.settings;
    var max = Math.max(price, r.stats.max) * 1.05, step = niceStep(max, narrow ? 3 : 5), topV = narrow ? max : Math.ceil(max / step) * step;
    var x = function (v) { return x0 + (v / topV) * (x1 - x0); }, axisY = top + ms.length * rowH + 6;
    var o = ['<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">'];
    for (var t = 0; t <= topV + 1e-9; t += step) {
      o.push('<line class="grid" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + (top - 8) + '" y2="' + axisY + '"/>');
      o.push('<text x="' + x(t) + '" y="' + (axisY + 18) + '" text-anchor="middle">' + usd0(t) + "</text>");
    }
    /* median and price lines first, so rows sit on top of them */
    o.push('<line x1="' + x(med) + '" x2="' + x(med) + '" y1="' + (top - 14) + '" y2="' + axisY + '" stroke="' + C.accent + '" stroke-width="2"/>');
    o.push('<rect x="' + (x(med) - 5) + '" y="' + (top - 19) + '" width="10" height="10" transform="rotate(45 ' + x(med) + " " + (top - 14) + ')" fill="' + C.accent + '"/>');
    var mr = x(med) < W * .7;
    o.push('<text class="lbl" x="' + (x(med) + (mr ? 12 : -12)) + '" y="' + (top - 10) + '" text-anchor="' + (mr ? "start" : "end") + '" style="fill:' + C.accent + '">Median ' + usd0(med) + "</text>");
    o.push('<line x1="' + x(price) + '" x2="' + x(price) + '" y1="' + (top - 8) + '" y2="' + axisY + '" stroke="#e8ecf5" stroke-width="1.4" stroke-dasharray="4 4" opacity=".75"/>');
    o.push('<text class="lbl" x="' + x(price) + '" y="' + (axisY + 38) + '" text-anchor="middle">Price ' + usd0(price) + "</text>");
    ms.forEach(function (m, i) {
      var cy = top + i * rowH + rowH / 2, col = dotColor(m.upside, s);
      o.push('<line x1="' + x0 + '" x2="' + x1 + '" y1="' + cy + '" y2="' + cy + '" stroke="#182841" stroke-width="1"/>');
      o.push('<text x="' + labW + '" y="' + (cy + 4) + '" text-anchor="end" class="dp__nm">' + esc(m.short) + "</text>");
      o.push('<g class="dotg" data-i="' + i + '"><title>' + esc(m.short + ": " + usd0(m.value)) + '</title><circle cx="' + x(m.value) + '" cy="' + cy + '" r="' + (narrow ? 6 : 6.5) + '" fill="' + col + '" stroke="#08111f" stroke-width="2"/></g>');
      o.push('<text x="' + (W - 4) + '" y="' + (cy + 4) + '" text-anchor="end" class="dp__v">' + usd0(m.value) + "</text>");
    });
    o.push("</svg>");
    el.innerHTML = o.join("");
    return el;
  }

  /* Share price over time with today's intrinsic value as a reference line, and the BUY / SELL zones behind it.
     Hover or drag a finger across the chart to read the price on any day. */
  function price(el, pts, iv, s, range) {
    var W = Math.max(300, el.clientWidth || 900), narrow = W < 560, H = narrow ? 230 : 300;
    var L = 8, R = narrow ? 58 : 72, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
    if (!pts || pts.length < 2) { el.innerHTML = '<p class="pxc__empty">Price history is not available right now.</p>'; return; }
    var buyMax = iv / (1 + s.buy), sellMin = iv / (1 + s.sell);
    var vals = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vals.concat([iv])), hi = Math.max.apply(null, vals.concat([iv]));
    var pad = (hi - lo) * .08 || hi * .05; lo = Math.max(0, lo - pad); hi = hi + pad;
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    var x = function (t) { return L + (t - t0) / Math.max(1, t1 - t0) * iw; }, y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * ih; };
    var clampY = function (v) { return Math.max(T, Math.min(T + ih, y(v))); };
    var o = ['<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" class="pxsvg">',
      '<defs><linearGradient id="pxFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e7edf6" stop-opacity=".14"/><stop offset="1" stop-color="#e7edf6" stop-opacity="0"/></linearGradient></defs>'];
    /* zones */
    if (buyMax > lo) o.push('<rect x="' + L + '" y="' + clampY(buyMax) + '" width="' + iw + '" height="' + (T + ih - clampY(buyMax)) + '" fill="' + C.buy + '" opacity=".07"/>');
    if (sellMin < hi) o.push('<rect x="' + L + '" y="' + T + '" width="' + iw + '" height="' + (clampY(sellMin) - T) + '" fill="' + C.sell + '" opacity=".07"/>');
    /* grid and price axis */
    var step = niceStep(hi - lo, narrow ? 3 : 4), g0 = Math.ceil(lo / step) * step;
    for (var g = g0; g <= hi; g += step) {
      o.push('<line class="grid" x1="' + L + '" x2="' + (L + iw) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>');
      o.push('<text x="' + (W - 4) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="ax">' + usd0(g) + "</text>");
    }
    /* date labels */
    var n = narrow ? 3 : 5, fmt = function (t) { var d = new Date(t); return range === "5y" ? String(d.getFullYear()) : range === "1y" ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
    for (var k = 0; k < n; k++) { var tt = t0 + (t1 - t0) * (k + .5) / n; o.push('<text x="' + x(tt) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' + fmt(tt) + "</text>"); }
    /* price line and area */
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join("");
    o.push('<path d="' + d + "L" + x(t1).toFixed(1) + " " + (T + ih) + "L" + x(t0).toFixed(1) + " " + (T + ih) + 'Z" fill="url(#pxFill)"/>');
    o.push('<path d="' + d + '" fill="none" stroke="#e7edf6" stroke-width="1.8" stroke-linejoin="round" class="pxline"/>');
    /* intrinsic value line */
    o.push('<line x1="' + L + '" x2="' + (L + iw) + '" y1="' + y(iv) + '" y2="' + y(iv) + '" stroke="' + C.accent + '" stroke-width="1.6" stroke-dasharray="6 5"/>');
    o.push('<rect x="' + (L + iw + 4) + '" y="' + (y(iv) - 10) + '" width="' + (R - 6) + '" height="20" rx="5" fill="' + C.accent + '"/>');
    o.push('<text x="' + (L + iw + 4 + (R - 6) / 2) + '" y="' + (y(iv) + 4) + '" text-anchor="middle" class="tag tag--iv">' + usd0(iv) + "</text>");
    /* last price */
    var last = pts[pts.length - 1];
    o.push('<circle cx="' + x(last[0]) + '" cy="' + y(last[1]) + '" r="4" fill="#e7edf6" stroke="#08111f" stroke-width="2"/>');
    if (Math.abs(y(last[1]) - y(iv)) > 22) {
      o.push('<rect x="' + (L + iw + 4) + '" y="' + (y(last[1]) - 10) + '" width="' + (R - 6) + '" height="20" rx="5" fill="#e7edf6"/>');
      o.push('<text x="' + (L + iw + 4 + (R - 6) / 2) + '" y="' + (y(last[1]) + 4) + '" text-anchor="middle" class="tag tag--px">' + usd0(last[1]) + "</text>");
    }
    /* hover read-out */
    o.push('<line class="pxhair" x1="0" x2="0" y1="' + T + '" y2="' + (T + ih) + '" visibility="hidden"/><circle class="pxdot" r="4.5" cx="0" cy="0" visibility="hidden"/>');
    o.push('<rect class="pxhit" x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg><div class="pxtip" hidden></div>');
    el.innerHTML = o.join("");
    var svg = el.querySelector("svg"), hair = el.querySelector(".pxhair"), dot = el.querySelector(".pxdot"), tip = el.querySelector(".pxtip");
    function at(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      var tt = t0 + (px - L) / iw * (t1 - t0), a = 0, b = pts.length - 1;
      while (b - a > 1) { var m = (a + b) >> 1; if (pts[m][0] < tt) a = m; else b = m; }
      var p = Math.abs(pts[a][0] - tt) < Math.abs(pts[b][0] - tt) ? pts[a] : pts[b], cx = x(p[0]), cy = y(p[1]);
      hair.setAttribute("x1", cx); hair.setAttribute("x2", cx); hair.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("visibility", "visible");
      var gap = (p[1] - iv) / iv, dd = new Date(p[0]);
      tip.innerHTML = "<span>" + dd.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) + "</span><b>$" + p[1].toFixed(2) + "</b><em>" + Math.abs(gap * 100).toFixed(0) + "% " + (gap < 0 ? "below" : "above") + " value</em>";
      tip.hidden = false;
      var tw = tip.offsetWidth, left = cx / W * r.width;
      tip.style.left = Math.max(0, Math.min(r.width - tw, left - tw / 2)) + "px";
      tip.style.top = "0px";
    }
    function off() { hair.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; }
    var hit = el.querySelector(".pxhit");
    hit.addEventListener("pointermove", at); hit.addEventListener("pointerdown", at); hit.addEventListener("pointerleave", off);
    hit.addEventListener("touchend", function () { setTimeout(off, 1400); });
  }

  /* Dots slide in from the left and settle. Used once, on the landing page. */
  function settle(el) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var gs = el.querySelectorAll(".dotg"), W = el.clientWidth;
    gs.forEach(function (g, i) {
      var c = g.querySelector("circle"), cx = parseFloat(c.getAttribute("cx"));
      g.style.transition = "none"; g.style.transform = "translateX(" + (24 - cx) + "px)"; g.style.opacity = "0";
    });
    void el.offsetWidth;
    gs.forEach(function (g, i) {
      g.style.transition = "transform 1.1s cubic-bezier(.2,.8,.2,1) " + (i * 70 + 150) + "ms, opacity .4s ease " + (i * 70 + 150) + "ms";
      g.style.transform = "translateX(0)"; g.style.opacity = "1";
    });
  }

  /* Line chart for the 20-year projection. values in $ millions. */
  function lines(el, series, o) {
    var W = Math.max(300, el.clientWidth || 600), H = o.h || 280, narrow = W < 460;
    var L = o.left || (narrow ? 50 : 62), Rm = narrow ? 50 : 86, T = 16, B = 34;
    var n = series[0].values.length - 1;
    var ymin = o.ymin != null ? o.ymin : 0, ymax = o.ymax;
    if (ymax == null) { ymax = 0; series.forEach(function (s) { s.values.forEach(function (v) { if (v > ymax) ymax = v; }); }); }
    var step = niceStep(ymax - ymin, 4); ymax = Math.ceil(ymax / step) * step;
    var x = function (i) { return L + i / n * (W - L - Rm); };
    var y = function (v) { return T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B); };
    var s = ['<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">'];
    if (o.band) s.push('<rect x="' + x(o.band[0]) + '" y="' + T + '" width="' + (x(o.band[1]) - x(o.band[0])) + '" height="' + (H - T - B) + '" fill="#8fb4e6" opacity=".08"/><text x="' + (x(o.band[0]) + 6) + '" y="' + (T + 14) + '" style="font-size:11px">' + esc(o.bandLabel || "") + "</text>");
    for (var v = ymin; v <= ymax + 1e-9; v += step) {
      s.push('<line class="grid" x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>');
      s.push('<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v === 0 && o.zero ? o.zero : o.fmt(v)) + "</text>");
    }
    for (var i = (o.xstart || 0); i <= n; i += (narrow ? 5 : 2)) {
      s.push('<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + (o.xlabel ? o.xlabel(i) : i) + "</text>");
    }
    var ends = series.map(function (se, k) { return { k: k, y: y(se.values[se.values.length - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < ends.length; q++) if (ends[q].y - ends[q - 1].y < 15) ends[q].y = ends[q - 1].y + 15;
    var endY = {}; ends.forEach(function (e) { endY[e.k] = e.y; });
    series.forEach(function (se, k) {
      var d = se.values.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
      s.push('<path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="2.4" stroke-linejoin="round"/>');
      if (se.dots) se.dots.forEach(function (i) { s.push('<circle cx="' + x(i) + '" cy="' + y(se.values[i]) + '" r="4" fill="' + se.color + '" stroke="#040a16" stroke-width="2"/>'); });
      var last = se.values.length - 1;
      if (!narrow || se.endLabel) s.push('<text x="' + (x(last) + 8) + '" y="' + (endY[k] + 4) + '" class="lbl" style="fill:' + se.color + '">' + esc(se.endText ? se.endText : o.fmt(se.values[last])) + "</text>");
    });
    s.push("</svg>");
    el.innerHTML = s.join("");
  }


  /* StockOracle-style valuation chart: one horizontal bar per method, a dashed line for the price and one for the median. */
  function bars(el, r) {
    var W = Math.max(300, el.clientWidth || 900), narrow = W < 600;
    var labW = narrow ? 70 : 236, rowH = narrow ? 30 : 38, top = 40, bot = 56;
    var ms = r.methods, n = ms.length + 1, H = top + n * rowH + bot;
    var price = r.inputs.price, med = r.stats.median, s = r.settings;
    var x0 = labW + 14, x1 = W - (narrow ? 58 : 76);
    var max = Math.max(price, r.stats.max) * 1.04, step = niceStep(max, narrow ? 3 : 5), topV = Math.ceil(max / step) * step;
    var x = function (v) { return x0 + v / topV * (x1 - x0); };
    var o = ['<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">'];
    for (var t = 0; t <= topV + 1e-9; t += step) {
      o.push('<line class="grid" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + (H - bot + 4) + '"/>');
      o.push('<text x="' + x(t) + '" y="' + (H - bot + 20) + '" text-anchor="middle">' + usd0(t) + "</text>");
    }
    o.push('<line class="axis" x1="' + x0 + '" x2="' + x0 + '" y1="' + top + '" y2="' + (H - bot + 4) + '"/>');
    function row(i, name, sub, v, col, main) {
      var cy = top + i * rowH + rowH / 2, bh = narrow ? 16 : 20;
      if (narrow) o.push('<text class="nm" x="' + labW + '" y="' + (cy + 4) + '" text-anchor="end">' + esc(main ? "Median" : sub.replace(/[()]/g, "")) + "</text>");
      else {
        o.push('<text class="nm" x="' + labW + '" y="' + (cy - 2) + '" text-anchor="end"' + (main ? ' style="fill:#8fb4e6;font-weight:700"' : "") + ">" + esc(name) + "</text>");
        if (sub) o.push('<text class="nm2" x="' + labW + '" y="' + (cy + 12) + '" text-anchor="end">' + esc(sub) + "</text>");
      }
      if (!fin(v)) { o.push('<text x="' + (x0 + 8) + '" y="' + (cy + 4) + '">Not available</text>'); return; }
      o.push('<rect class="barr" style="animation-delay:' + (i * 55) + 'ms" x="' + x0 + '" y="' + (cy - bh / 2) + '" width="' + Math.max(2, x(v) - x0) + '" height="' + bh + '" rx="3" fill="' + col + '" stroke="#e9eef5" stroke-opacity=".35"><title>' + esc(name) + ": " + usd0(v) + "</title></rect>");
      o.push('<text class="val" x="' + (x(v) + 8) + '" y="' + (cy + 4) + '">' + usd2(v) + "</text>");
    }
    ms.forEach(function (m, i) {
      var long = m.name.replace(/, 20 years/, " 20-year").replace(/, 10 years \+ terminal value/, " Terminal").replace(/^Discounted /, "Discounted ").replace(/ \(excluding one-offs\)/, " (ex-NRI)");
      row(i, long, "(" + m.short + ")", m.value, fin(m.value) ? dotColor(m.upside, s) : "#5e6f88");
    });
    row(ms.length, "Plumbline value (median)", "", med, "#8fb4e6", true);
    var yTop = top - 6, yBot = H - bot + 4;
    o.push('<line x1="' + x(med) + '" x2="' + x(med) + '" y1="' + yTop + '" y2="' + yBot + '" stroke="#e9eef5" stroke-width="1.6" stroke-dasharray="5 4"/>');
    o.push('<line x1="' + x(price) + '" x2="' + x(price) + '" y1="' + yTop + '" y2="' + yBot + '" stroke="#4cb782" stroke-width="1.6" stroke-dasharray="5 4"/>');
    var medRight = med >= price;
    /* keep both line labels inside the chart: switch sides if the preferred side would run off the edge */
    function edgeLabel(px, preferRight, y, text, style) {
      var w = text.length * 7, right = preferRight;
      if (right && px + 8 + w > W - 4) right = false; else if (!right && px - 8 - w < 4) right = true;
      return '<text class="lbl" x="' + (px + (right ? 8 : -8)) + '" y="' + y + '" text-anchor="' + (right ? "start" : "end") + '"' + (style ? ' style="' + style + '"' : "") + ">" + text + "</text>";
    }
    o.push(edgeLabel(x(med), medRight, top - 16, (narrow ? "Median: " : "Plumbline value: ") + usd2(med)));
    o.push(edgeLabel(x(price), !medRight, H - 12, (narrow ? "Price: " : "Stock price: ") + usd2(price), "fill:#4cb782"));
    o.push("</svg>");
    el.innerHTML = o.join("");
  }
  function usd2(v) { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* Quality scorecard: a ring that fills to the score, and small trend lines for yearly figures. */
  function ring(score, color) {
    var R = 54, c = 2 * Math.PI * R, k = Math.max(0, Math.min(100, score)) / 100;
    return '<svg viewBox="0 0 140 140" width="140" height="140" aria-hidden="true">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#13233d" stroke-width="10"/>' +
      '<circle class="ringarc" style="--off:' + c.toFixed(1) + '" cx="70" cy="70" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - k)).toFixed(1) + '" transform="rotate(-90 70 70)"/></svg>';
  }
  function spark(values, color) {
    var v = values.filter(fin);
    if (v.length < 2) return "";
    var W = 96, H = 30, P = 3, mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    if (mx === mn) { mx += 1; mn -= 1; }
    var pts = v.map(function (y, i) { return (P + i / (v.length - 1) * (W - 2 * P)).toFixed(1) + "," + (P + (1 - (y - mn) / (mx - mn)) * (H - 2 * P)).toFixed(1); });
    var last = pts[pts.length - 1].split(",");
    var zero = mn < 0 && mx > 0 ? '<line x1="0" x2="' + W + '" y1="' + (P + (1 - (0 - mn) / (mx - mn)) * (H - 2 * P)).toFixed(1) + '" y2="' + (P + (1 - (0 - mn) / (mx - mn)) * (H - 2 * P)).toFixed(1) + '" stroke="#5e6f88" stroke-dasharray="2 3"/>' : "";
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' + zero +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="' + color + '"/></svg>';
  }

  window.Charts = { strip: strip, dotplot: dotplot, price: price, bars: bars, settle: settle, lines: lines, ring: ring, spark: spark };
})();
