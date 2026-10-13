/* Plumbline search engine, shared by the browser (window.SearchCore) and the server (require).
   It ranks what someone typed against a list of US-listed companies:
   1) an exact ticker, 2) a well-known alias (google -> GOOGL), 3) company names that start with or contain the words,
   4) tickers that start with the text, 5) near misses one or two letters off (nvdia -> NVDA).
   The SEC list is ordered roughly by company size, so list position is used as a popularity rank:
   "apple" finds Apple Inc. before smaller companies whose names also start with "apple". */
(function (root) {
  "use strict";

  var ALIAS = { google: "GOOGL", alphabet: "GOOGL", facebook: "META", instagram: "META", whatsapp: "META", meta: "META",
    berkshire: "BRK-B", "berkshire hathaway": "BRK-B", jpmorgan: "JPM", "jp morgan": "JPM", chase: "JPM", "coca cola": "KO", cocacola: "KO", coke: "KO",
    pepsi: "PEP", pepsico: "PEP", walmart: "WMT", mcdonalds: "MCD", "home depot": "HD", disney: "DIS", amazon: "AMZN", aws: "AMZN", netflix: "NFLX",
    tesla: "TSLA", nvidia: "NVDA", microsoft: "MSFT", apple: "AAPL", iphone: "AAPL", salesforce: "CRM", paypal: "PYPL", visa: "V", mastercard: "MA",
    costco: "COST", starbucks: "SBUX", nike: "NKE", intel: "INTC", amd: "AMD", broadcom: "AVGO", oracle: "ORCL", adobe: "ADBE", uber: "UBER",
    airbnb: "ABNB", palantir: "PLTR", servicenow: "NOW", snowflake: "SNOW", "goldman sachs": "GS", goldman: "GS", "morgan stanley": "MS",
    "bank of america": "BAC", bofa: "BAC", "wells fargo": "WFC", citi: "C", citigroup: "C", "american express": "AXP", amex: "AXP",
    boeing: "BA", "exxon": "XOM", exxonmobil: "XOM", chevron: "CVX", "johnson and johnson": "JNJ", "j and j": "JNJ", pfizer: "PFE",
    "eli lilly": "LLY", lilly: "LLY", "unitedhealth": "UNH", "united health": "UNH", "procter and gamble": "PG", "p and g": "PG",
    "general electric": "GE", ge: "GE", "general motors": "GM", ford: "F", "at and t": "T", att: "T", verizon: "VZ", "t mobile": "TMUS", tmobile: "TMUS",
    spotify: "SPOT", shopify: "SHOP", "taiwan semiconductor": "TSM", tsmc: "TSM", asml: "ASML", alibaba: "BABA", "micron": "MU",
    qualcomm: "QCOM", "texas instruments": "TXN", ibm: "IBM", cisco: "CSCO", "dell": "DELL", "hp": "HPQ", target: "TGT", "lowes": "LOW",
    "chipotle": "CMG", "booking": "BKNG", "caterpillar": "CAT", "lockheed": "LMT", "lockheed martin": "LMT", "rtx": "RTX", raytheon: "RTX",
    coinbase: "COIN", robinhood: "HOOD", "block": "XYZ", square: "XYZ", "crowdstrike": "CRWD", "palo alto": "PANW", "arm": "ARM", "dell technologies": "DELL" };

  /* Built-in list of well-known US-listed companies, roughly largest first. Used for instant suggestions
     while the full SEC list loads (and as a fallback if it cannot be loaded). */
  var POPULAR = ("NVDA|NVIDIA Corp;MSFT|Microsoft Corp;AAPL|Apple Inc.;GOOGL|Alphabet Inc. (Google);AMZN|Amazon.com Inc.;META|Meta Platforms Inc.;" +
    "AVGO|Broadcom Inc.;TSM|Taiwan Semiconductor (ADR);TSLA|Tesla Inc.;BRK-B|Berkshire Hathaway Inc.;JPM|JPMorgan Chase & Co.;WMT|Walmart Inc.;" +
    "LLY|Eli Lilly & Co.;ORCL|Oracle Corp;V|Visa Inc.;MA|Mastercard Inc.;NFLX|Netflix Inc.;XOM|Exxon Mobil Corp;COST|Costco Wholesale Corp;" +
    "JNJ|Johnson & Johnson;HD|Home Depot Inc.;PLTR|Palantir Technologies Inc.;PG|Procter & Gamble Co.;BAC|Bank of America Corp;ABBV|AbbVie Inc.;" +
    "UNH|UnitedHealth Group Inc.;AMD|Advanced Micro Devices Inc.;KO|Coca-Cola Co.;ASML|ASML Holding NV (ADR);CSCO|Cisco Systems Inc.;" +
    "GE|GE Aerospace;CVX|Chevron Corp;TMUS|T-Mobile US Inc.;WFC|Wells Fargo & Co.;IBM|IBM Corp;MU|Micron Technology Inc.;CRM|Salesforce Inc.;" +
    "PM|Philip Morris International;MS|Morgan Stanley;GS|Goldman Sachs Group Inc.;ABT|Abbott Laboratories;AXP|American Express Co.;" +
    "MCD|McDonald's Corp;LIN|Linde plc;INTU|Intuit Inc.;DIS|Walt Disney Co.;MRK|Merck & Co.;NOW|ServiceNow Inc.;RTX|RTX Corp;T|AT&T Inc.;" +
    "CAT|Caterpillar Inc.;PEP|PepsiCo Inc.;UBER|Uber Technologies Inc.;C|Citigroup Inc.;ISRG|Intuitive Surgical Inc.;BKNG|Booking Holdings Inc.;" +
    "VZ|Verizon Communications Inc.;QCOM|Qualcomm Inc.;TMO|Thermo Fisher Scientific Inc.;SCHW|Charles Schwab Corp;BA|Boeing Co.;" +
    "AMAT|Applied Materials Inc.;TXN|Texas Instruments Inc.;ADBE|Adobe Inc.;LRCX|Lam Research Corp;BLK|BlackRock Inc.;SPGI|S&P Global Inc.;" +
    "NEE|NextEra Energy Inc.;ANET|Arista Networks Inc.;AMGN|Amgen Inc.;KLAC|KLA Corp;PGR|Progressive Corp;BSX|Boston Scientific Corp;" +
    "HON|Honeywell International Inc.;APP|AppLovin Corp;SHOP|Shopify Inc.;GILD|Gilead Sciences Inc.;DHR|Danaher Corp;PFE|Pfizer Inc.;" +
    "ADP|Automatic Data Processing Inc.;UNP|Union Pacific Corp;LOW|Lowe's Companies Inc.;PANW|Palo Alto Networks Inc.;CRWD|CrowdStrike Holdings Inc.;" +
    "DE|Deere & Co.;SYK|Stryker Corp;COF|Capital One Financial Corp;ETN|Eaton Corp plc;INTC|Intel Corp;ADI|Analog Devices Inc.;" +
    "SPOT|Spotify Technology SA;MELI|MercadoLibre Inc.;ARM|Arm Holdings plc (ADR);LMT|Lockheed Martin Corp;CMCSA|Comcast Corp;" +
    "SBUX|Starbucks Corp;NKE|Nike Inc.;COIN|Coinbase Global Inc.;HOOD|Robinhood Markets Inc.;DELL|Dell Technologies Inc.;" +
    "CMG|Chipotle Mexican Grill Inc.;MO|Altria Group Inc.;SNOW|Snowflake Inc.;ABNB|Airbnb Inc.;PYPL|PayPal Holdings Inc.;" +
    "MMM|3M Co.;GM|General Motors Co.;F|Ford Motor Co.;TGT|Target Corp;DASH|DoorDash Inc.;NET|Cloudflare Inc.;DDOG|Datadog Inc.;" +
    "ZS|Zscaler Inc.;MRVL|Marvell Technology Inc.;SMCI|Super Micro Computer Inc.;HPQ|HP Inc.;HPE|Hewlett Packard Enterprise Co.;" +
    "XYZ|Block Inc.;RIVN|Rivian Automotive Inc.;LCID|Lucid Group Inc.;SOFI|SoFi Technologies Inc.;RBLX|Roblox Corp;EA|Electronic Arts Inc.;" +
    "TTWO|Take-Two Interactive Software Inc.;BABA|Alibaba Group Holding Ltd (ADR);PDD|PDD Holdings Inc. (ADR);NU|Nu Holdings Ltd;" +
    "CVS|CVS Health Corp;WBA|Walgreens Boots Alliance Inc.;KHC|Kraft Heinz Co.;MDLZ|Mondelez International Inc.;CL|Colgate-Palmolive Co.;" +
    "EL|Estee Lauder Companies Inc.;LULU|Lululemon Athletica Inc.;ROST|Ross Stores Inc.;TJX|TJX Companies Inc.;ORLY|O'Reilly Automotive Inc.;" +
    "AZO|AutoZone Inc.;MAR|Marriott International Inc.;HLT|Hilton Worldwide Holdings Inc.;DAL|Delta Air Lines Inc.;UAL|United Airlines Holdings Inc.;" +
    "AAL|American Airlines Group Inc.;LUV|Southwest Airlines Co.;CCL|Carnival Corp;RCL|Royal Caribbean Cruises Ltd;FDX|FedEx Corp;UPS|United Parcel Service Inc.;" +
    "ZM|Zoom Communications Inc.;DOCU|DocuSign Inc.;TEAM|Atlassian Corp;WDAY|Workday Inc.;MDB|MongoDB Inc.;OKTA|Okta Inc.;TWLO|Twilio Inc.;" +
    "PINS|Pinterest Inc.;SNAP|Snap Inc.;RDDT|Reddit Inc.;U|Unity Software Inc.;ROKU|Roku Inc.;WBD|Warner Bros. Discovery Inc.;PARA|Paramount Global;" +
    "NOC|Northrop Grumman Corp;GD|General Dynamics Corp;OXY|Occidental Petroleum Corp;COP|ConocoPhillips;SLB|SLB (Schlumberger);" +
    "MCK|McKesson Corp;CI|Cigna Group;ELV|Elevance Health Inc.;HCA|HCA Healthcare Inc.;VRTX|Vertex Pharmaceuticals Inc.;REGN|Regeneron Pharmaceuticals Inc.;" +
    "MRNA|Moderna Inc.;BMY|Bristol-Myers Squibb Co.;ZTS|Zoetis Inc.;O|Realty Income Corp;PLD|Prologis Inc.;AMT|American Tower Corp;EQIX|Equinix Inc.")
    .split(";").map(function (r) { var p = r.split("|"); return { ticker: p[0], title: p[1] }; });

  var SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|companies|limited|ltd|plc|holdings?|group|the|class [a-c]|sa|nv|ag|se|lp|llc|adr|de|md|new)\b/g;
  function normName(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\.com\b/g, "").replace(/'/g, "")
      .replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
  }
  /* What was typed: suffixes such as "inc" are only dropped from multi-word text, so "nv" or "co" still search normally. */
  function normQuery(s) {
    var basic = String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\.com\b/g, "").replace(/'/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    var stripped = normName(s);
    return basic.indexOf(" ") > 0 && stripped ? stripped : basic;
  }
  function editDist(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var lo = i;
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1, v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v); if (v < lo) lo = v;
      }
      if (lo > cap) return cap + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  /* Builds a searchable index from [{ticker, title}] (largest companies first). */
  function makeIndex(list) {
    var by = {}, idx = list.map(function (o, rank) {
      var t = String(o.ticker).toUpperCase(); o.ticker = t; if (!by[t]) by[t] = o;
      var n = normName(o.title);
      return { o: o, rank: rank, n: n, sq: n.replace(/ /g, ""), first: n.split(" ")[0] };
    });
    return { by: by, idx: idx, size: list.length };
  }

  /* Ranked matches. Each result: { symbol, name, how } where how is "ticker", "name" or "close". */
  function rank(I, q, n) {
    n = n || 6;
    var raw = String(q || "").trim(); if (!raw || !I) return [];
    var up = raw.toUpperCase().replace(/\./g, "-").replace(/\s+/g, ""), nq = normQuery(raw), sq = nq.replace(/ /g, ""), idx = I.idx;
    var seen = {}, out = [];
    function add(o, how) { if (!o || seen[o.ticker] || out.length >= n) return; seen[o.ticker] = 1; out.push({ symbol: o.ticker, name: o.title, how: how }); }
    if (I.by[up]) add(I.by[up], "ticker");
    var al = ALIAS[nq] || ALIAS[sq] || ALIAS[raw.toLowerCase()]; if (al && I.by[al]) add(I.by[al], "name");
    if (sq.length >= 1) {
      /* names that start with what was typed (biggest companies first) */
      idx.forEach(function (e) { if (out.length < n && (e.n.indexOf(nq) === 0 || (sq.length >= 2 && e.sq.indexOf(sq) === 0))) add(e.o, "name"); });
      /* tickers that start with what was typed */
      if (up.length <= 5) idx.forEach(function (e) { if (out.length < n && e.o.ticker.indexOf(up) === 0) add(e.o, "ticker"); });
      /* names with a later word that starts with what was typed ("chase" -> JPMorgan Chase) */
      if (nq.length >= 3) idx.forEach(function (e) { if (out.length < n && (" " + e.n).indexOf(" " + nq) > 0) add(e.o, "name"); });
    }
    if (out.length < n && sq.length >= 3) {
      /* near misses, searched among the larger companies so the guesses stay sensible */
      var top = idx.length > 4000 ? idx.slice(0, 4000) : idx, cand = [], capN = sq.length <= 4 ? 1 : 2;
      top.forEach(function (e) {
        var d1 = up.length <= 6 ? editDist(up, e.o.ticker, 1) : 9;
        var d2 = Math.min(editDist(sq, e.first, capN), editDist(sq, e.sq.slice(0, Math.max(sq.length, e.first.length)), capN));
        var d = Math.min(d1 <= 1 ? d1 : 9, d2 <= capN ? d2 : 9);
        if (d < 9) cand.push({ e: e, d: d });
      });
      cand.sort(function (a, b) { return a.d - b.d || a.e.rank - b.e.rank; });
      cand.forEach(function (c) { add(c.e.o, "close"); });
    }
    return out;
  }

  /* What pressing Enter should open: an exact ticker or a clear name match. Otherwise null (show suggestions). */
  function pick(I, q) {
    var hits = rank(I, q, 6);
    if (!hits.length) return null;
    var h = hits[0], exact = h.symbol === String(q).trim().toUpperCase().replace(/\./g, "-").replace(/\s+/g, "");
    return exact || (h.how === "name" && normQuery(q).length >= 3) ? h : null;
  }

  var api = { ALIAS: ALIAS, POPULAR: POPULAR, normName: normName, editDist: editDist, makeIndex: makeIndex, rank: rank, pick: pick };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SearchCore = api;
})(typeof window !== "undefined" ? window : this);
