/* Plain-language explanations for each method. Each `steps` function uses the live numbers so the
   reasoning always matches what the model just calculated. */
(function () {
  var F = {};
  F.usd = function (x, d) { return fin(x) ? ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + x.toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : "n/a"; };
  F.pct = function (x, d) { return fin(x) ? (x * 100).toFixed(d == null ? 1 : d) + "%" : "n/a"; };
  F.spct = function (x, d) { return fin(x) ? (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d == null ? 1 : d) + "%" : "n/a"; };
  F.x = function (x, d) { return fin(x) ? x.toFixed(d == null ? 1 : d) + "x" : "n/a"; };
  F.mm = function (x) {
    if (!fin(x)) return "n/a";
    var a = Math.abs(x), s = x < 0 ? "−" : "";
    if (a >= 1e6) return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + (a / 1e6).toFixed(2) + " trillion";
    if (a >= 1e3) return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + (a / 1e3).toFixed(1) + " billion";
    return s + ((typeof globalThis !== "undefined" && globalThis.PL_CUR) || "$") + a.toFixed(0) + " million";
  };
  F.num = function (x, d) { return fin(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }) : "n/a"; };
  function fin(x) { return typeof x === "number" && isFinite(x); }
  /* v3.9: note the "Valuation multiples vs history" setting when it is not 100% */
  function adjTxt(d) { return d && fin(d.adj) && Math.abs(d.adj - 1) > 1e-9 ? " × " + Math.round(d.adj * 100) + "% (your multiples setting)" : ""; }

  var dcfWhatCF = "Adds up all the cash the business is expected to produce over the next 20 years, then converts that total into today's money.";

  function dcfSteps(label, baseKey, r, m, disc, discName, netDebt, yrs) {
    var P = r.proj, base = r.base, d = m.d, i = r.inputs, g = baseKey === "ni" ? P.gEPS : P.gCF;
    var s = [
      [label + (r.cycle ? " at a cycle-average margin (cyclical company)" : " over the last 12 months"), F.mm(P[baseKey][0])],
      ["Growth in year 1 and year 2 (analyst estimates)", F.pct(g[0]) + " and " + F.pct(g[1])],
      ["Growth then fades to " + F.pct(r.settings.g5) + " (year 5), " + F.pct(r.settings.g10) + " (year 10) and " + F.pct(r.settings.gT) + " (year " + yrs + ")", ""],
      [label + " in year " + yrs, F.mm(P[baseKey][yrs])],
      ["Discount rate (" + discName + ")", F.pct(disc, 2)],
    ].concat(d.rateT && Math.abs(d.rateT - disc) > 1e-6 ? [["Discount rate for the terminal value (growth company, beta of 1 once mature)", F.pct(d.rateT, 2)]] : []).concat([

      ["Today's value of the " + yrs + " years of " + label.toLowerCase(), F.mm(d.pv)],
      ["Terminal value, in today's money (everything after year " + yrs + ")", F.mm(d.pvTv) + " (" + F.pct(d.tvShare, 0) + " of the total)"]
    ]);
    if (netDebt) {
      s.push(["Add cash", F.mm(i.cash)]);
      s.push(["Subtract debt", F.mm(-i.debt)]);
    }
    s.push(["Value to shareholders", F.mm(d.equity)]);
    s.push(["Divided by shares outstanding (" + F.num(i.shares) + " million)", F.usd(d.perShare)]);
    return s;
  }

  window.CONTENT = {
    fmt: F,
    methods: {
      dcf20: {
        what: dcfWhatCF + " It starts from operating cash flow, the cash the business generates from its normal operations.",
        why: "Cash is what owners can eventually take out of a business, so it is the most direct way to measure what a company is worth. Looking 20 years ahead gives fast-growing companies credit for the years when their growth slows down.",
        fit: "Works well for companies that make steady cash. It is the first method most analysts reach for.",
        watch: "Small changes in growth or the discount rate move the answer a lot. Operating cash flow also ignores the money spent on equipment and buildings.",
        steps: function (r, m) { return dcfSteps("Operating cash flow", "ocf", r, m, r.wacc.wacc, "WACC", true, 20); }
      },
      dfcf20: {
        what: "The same 20-year cash flow calculation, but using free cash flow. Free cash flow is operating cash flow minus capital spending (capex).",
        why: "Capex is money the company must spend to keep running and growing. Free cash flow is what is really left for shareholders, so it is a stricter and more honest measure than operating cash flow.",
        fit: "Better than DCF-20 for companies that spend a lot on equipment, data centres or stores.",
        watch: "Free cash flow can be lumpy from year to year. It also does not subtract stock-based pay, which is a real cost to shareholders.",
        steps: function (r, m) { return dcfSteps("Free cash flow", "fcf", r, m, r.wacc.wacc, "WACC", true, 20); }
      },
      dni20: {
        what: "The same 20-year approach, applied to net income (profit after interest and tax). One-off gains are removed first.",
        why: "Net income shows what the business earns for its owners after every cost. It is discounted at the cost of equity (the return shareholders expect) instead of WACC, because interest has already been paid out of these profits.",
        fit: "Useful as a cross-check on the cash flow methods. If profit and cash tell a very different story, that is worth investigating.",
        watch: "Profit includes accounting items that are not cash. No debt or cash is added or removed, because the earnings are already after interest.",
        steps: function (r, m) {
          var s = dcfSteps("Net income (excluding one-offs)", "ni", r, m, r.wacc.coe, "cost of equity", false, 20);
          return s;
        }
      },
      dfcft: {
        what: "A shorter version of the free cash flow model. It projects only 10 years, then adds a terminal value for everything after that.",
        why: "Long forecasts are uncertain. This version trusts less of the distant future, so it acts as a more cautious check on DFCF-20.",
        fit: "A useful lower reference point. If this value is close to the 20-year version, the result does not depend heavily on distant growth.",
        watch: "The terminal value still makes up a large share of the answer. It assumes growth drops to the long-run rate straight after year 10.",
        steps: function (r, m) { return dcfSteps("Free cash flow", "fcf", r, m, r.wacc.wacc, "WACC", true, 10); }
      },
      ps: {
        what: "Takes the company's average price-to-sales ratio over the past five years and applies it to today's sales per share.",
        why: "Sales are harder to distort than profit and swing less from year to year. This method asks one simple question: if the stock traded at its normal multiple, what would it cost?",
        fit: "Helpful when profits are low, unusual or hard to compare, as long as the business is stable.",
        watch: "It ignores how profitable the sales are. A company with falling margins can look cheap on this method when it is not.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Price-to-sales at each of the last 5 fiscal year-ends", r.inputs.hist.ps.map(function (x) { return x.toFixed(2); }).join(", ")],
            ["Average of the five", F.x(d.mult, 2)],
            ["Today's price-to-sales (for comparison)", F.x(d.current, 2)],
            ["Sales per share (12-month revenue ÷ shares)", F.usd(d.salesPS)],
            ["Fair value = average multiple" + adjTxt(m.d) + " × sales per share", F.usd(m.value)]
          ];
        }
      },
      pe: {
        what: "Takes the average price-to-earnings ratio over the past five years and applies it to today's earnings per share, with one-off gains removed.",
        why: "The P/E ratio is the most widely used price check. It shows how much investors normally pay for each dollar of profit. We remove one-off gains so a lucky year does not inflate the answer.",
        fit: "Best for profitable companies with a long history. Readings above the cap in the settings (default 100x) are ignored, because they usually mean profit was close to zero that year.",
        watch: "If the past five years were unusual, such as a boom or a slump, the average is a poor guide to the future.",
        steps: function (r, m) {
          var d = m.d, out = [
            ["Price-to-earnings at each of the last 5 fiscal year-ends", r.inputs.hist.pe.map(function (x) { return x.toFixed(1); }).join(", ")]
          ];
          if (d.dropped.length) out.push(["Readings ignored (above " + r.settings.peCap + "x or not meaningful)", d.dropped.map(function (x) { return x.toFixed(1); }).join(", ")]);
          out.push(["Average of the remaining " + d.kept.length, F.x(d.mult, 1)]);
          out.push(["Today's price-to-earnings (for comparison)", F.x(d.current, 1)]);
          if (r.cycle) out.push(["Earnings per share at a cycle-average margin (cyclical company; last 12 months: " + F.usd(r.cycle.epsNow) + ")", F.usd(d.eps)]);
          else out.push(["Earnings per share excluding one-off gains", F.usd(d.eps) + (fin(d.gaap) ? " (reported: " + F.usd(d.gaap) + ")" : "")]);
          out.push(["Fair value = average multiple" + adjTxt(m.d) + " × earnings per share", F.usd(m.value)]);
          return out;
        }
      },
      pb: {
        what: "Takes the average price-to-book ratio over the past five years and applies it to today's book value per share. Book value is what the company owns minus what it owes.",
        why: "Book value is an accounting anchor that does not depend on forecasts. It shows what investors usually pay for each dollar of net assets.",
        fit: "Most useful for banks, insurers and asset-heavy companies.",
        watch: "Software and chip companies hold their value in brands, code and people, which do not appear on the balance sheet. Large share buybacks also shrink book value.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Price-to-book at each of the last 5 fiscal year-ends", r.inputs.hist.pb.map(function (x) { return x.toFixed(2); }).join(", ")],
            ["Average of the five", F.x(d.mult, 2)],
            ["Today's price-to-book (for comparison)", F.x(d.current, 2)],
            ["Book value per share (equity ÷ shares)", F.usd(d.bookPS)],
            ["Fair value = average multiple" + adjTxt(m.d) + " × book value per share", F.usd(m.value)]
          ];
        }
      },
      psg: {
        what: "Matches the price-to-sales ratio to the company's expected sales growth. Faster growth earns a higher fair multiple.",
        why: "A plain P/S ratio treats a fast grower and a slow grower the same. PSG fixes this by asking what multiple the growth rate can justify.",
        fit: "Gives a growth-based view that is separate from the company's own history.",
        watch: "There is no official target PSG. The 0.10 default is a judgement call, so this is the lowest-confidence method. It is also the one most likely to be an outlier.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Expected yearly revenue growth over the next 3 years (analyst consensus)", d.growth.toFixed(1) + "% a year"],
            ["Target PSG (setting)", r.settings.psg.toFixed(2)],
            ["Fair price-to-sales = growth × target PSG", F.x(d.fairPS, 2)],
            ["Sales per share", F.usd(d.salesPS)],
            ["Fair value = fair multiple × sales per share", F.usd(m.value)]
          ];
        }
      },
      /* ---- banks, insurers and other lenders (v2.8, following Aswath Damodaran) ---- */
      ddm: {
        what: "Adds up the dividends the company is expected to pay each year, then converts them into today's money. After year 10, dividends are assumed to grow at the long-run rate forever.",
        why: "For a bank, deposits and loans are its products, so normal cash flow and debt figures are not meaningful. Dividends are one of the few cash flows to shareholders that can be measured cleanly. Growth is not a guess: it comes from the bank's own return on equity and the share of profit it keeps, plus the boost to each share from buybacks.",
        fit: "Best for mature banks and insurers with a steady dividend history.",
        watch: "It undervalues companies that return most of their cash through buybacks instead of dividends. The free cash flow to equity method covers that case.",
        steps: function (r, m) {
          var d = m.d, f = r.fin;
          return [
            ["Return on equity used (" + f.roeSrc + ")", F.pct(f.roeN)],
            ["Normal earnings per share = ROE × book value per share (" + F.usd(f.bvps) + ")", F.usd(d.eps0) + " (last 12 months: " + F.usd(f.epsC) + ")"],
            ["Share of profit paid as dividends (" + f.hist.length + "-year total)", F.pct(f.divPay, 0)],
            ["Growth per share, years 1–5 = ROE × share kept + buyback effect (" + F.pct(f.bbYield) + ")", F.pct(f.g1div) + " a year (capped at " + F.pct(f.gMax, 0) + ")"],
            ["Dividend per share in year 1", F.usd(d.dps1)],
            ["Years 6–10: growth fades to " + F.pct(f.gT, 0) + ", ROE settles at " + F.pct(f.roeL), "Payout rises to " + F.pct(1 - f.gT / f.roeL, 0)],
            ["Discount rate (cost of equity)", F.pct(f.coe, 2)],
            ["Today's value of 10 years of dividends", F.usd(d.pv)],
            ["Terminal value, in today's money", F.usd(d.pvTv) + " (" + F.pct(d.tvShare, 0) + " of the total)"],
            ["Fair value per share", F.usd(m.value)]
          ];
        }
      },
      fcfe: {
        what: "Values all the cash the company could return to shareholders each year, through dividends and buybacks, after keeping enough capital to grow.",
        why: "Regulators make banks and insurers hold extra equity when they grow. That retained capital is their real reinvestment, in place of spending on equipment. Free cash flow to equity is profit minus that reinvestment, so it captures buybacks as well as dividends.",
        fit: "Works well for banks and insurers that return a lot of cash through buybacks.",
        watch: "Buybacks are lumpy from year to year, so the payout uses a multi-year total. This is the only bank method that starts from the last 12 months of profit (drifting back to the normal level over 10 years), so an unusually good or bad year moves it more than the others.",
        steps: function (r, m) {
          var d = m.d, f = r.fin;
          return [
            ["Profit for common shareholders (last 12 months)", F.mm(f.niC)],
            ["Cash actually returned in the last 12 months (dividends + buybacks)", F.mm(f.returned)],
            ["Share of profit returned (" + f.hist.length + "-year total)", F.pct(f.totPay, 0)],
            ["Growth, years 1–5 = ROE " + F.pct(f.roeN) + " × share kept", F.pct(f.g1tot) + " a year"],
            ["Cash available to shareholders in year 1 = profit × (1 − growth ÷ ROE)", F.mm(d.fcfe1)],
            ["Years 6–10: growth fades to " + F.pct(f.gT, 0) + ", ROE settles at " + F.pct(f.roeL), ""],
            ["Discount rate (cost of equity)", F.pct(f.coe, 2)],
            ["Today's value of 10 years of cash to shareholders", F.mm(d.pv)],
            ["Terminal value, in today's money", F.mm(d.pvTv) + " (" + F.pct(d.tvShare, 0) + " of the total)"],
            ["Divided by shares outstanding (" + F.num(r.inputs.shares) + " million)", F.usd(m.value)]
          ];
        }
      },
      excess: {
        what: "Starts with the company's book value (what it owns minus what it owes), then adds the value of earning more than shareholders require. If the company earns less, value is subtracted.",
        why: "This is the clearest test of whether a bank or insurer creates value. A company earning a return on equity above its cost of equity deserves to trade above book value. One earning below it deserves to trade below book value.",
        fit: "Works for every bank and insurer, including those that pay no dividend. It leans on book value, which is reliable for financial firms because most of their assets are loans and securities.",
        watch: "Book value is only as good as the company's accounting. Large unrecognised loan losses or overvalued securities would make it too high.",
        steps: function (r, m) {
          var d = m.d, f = r.fin;
          return [
            ["Book value for common shareholders today", F.mm(d.bv0)],
            ["Return on equity used (" + f.roeSrc + ")", F.pct(f.roeN)],
            ["Cost of equity (the return shareholders require)", F.pct(f.coe, 2)],
            ["Value created in year 1 = (ROE − cost of equity) × book value", F.mm(d.ex1)],
            ["Book value grows " + F.pct(f.g1tot != null ? f.g1tot : f.g1div) + " a year from retained profit; ROE settles at " + F.pct(f.roeL) + " by year 10", ""],
            ["Today's value of 10 years of value created", F.mm(d.pv)],
            ["Value created after year 10, in today's money", F.mm(d.pvTv)],
            ["Equity value = book value + value created", F.mm(d.equity)],
            ["Divided by shares outstanding (" + F.num(r.inputs.shares) + " million)", F.usd(m.value)]
          ];
        }
      },
      jpb: {
        what: "Works out the price-to-book ratio the company deserves from its return on equity, then applies it to book value per share.",
        why: "A plain historical P/B ignores whether profitability has changed. This version links the multiple directly to how much the company earns on its equity compared with what shareholders require: fair P/B = (ROE − growth) ÷ (cost of equity − growth).",
        fit: "A quick, transparent check for banks and insurers. It needs only three numbers.",
        watch: "It assumes today's average return on equity lasts forever. That is more generous than the excess return model, which lets high returns fade.",
        steps: function (r, m) {
          var d = m.d, f = r.fin;
          return [
            ["Return on equity used (" + f.roeSrc + ")", F.pct(f.roeN)],
            ["Cost of equity", F.pct(f.coe, 2)],
            ["Long-run growth", F.pct(f.gT, 1)],
            ["Fair P/B = (ROE − growth) ÷ (cost of equity − growth)", F.x(d.mult, 2)],
            ["Today's price-to-book (for comparison)", F.x(d.current, 2)],
            ["Book value per common share", F.usd(d.bvps)],
            ["Fair value = fair P/B × book value per share", F.usd(m.value)]
          ];
        }
      },
      pegy: {
        what: "Peter Lynch's PEG rule with dividends added. A fair P/E equals the growth rate plus the dividend yield, so 8% growth and a 3% yield support a P/E of 11.",
        why: "Banks and insurers grow slowly but pay generous dividends. A plain PEG ignores dividends and would call almost every bank overvalued. Growth here comes from the company's own return on equity and payout, not from forecasts.",
        fit: "A simple cross-check for dividend-paying financial companies.",
        watch: "The dividend yield uses today's share price, so this value moves slightly when the price moves.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Growth per share (ROE × share kept + buyback effect)", F.pct(d.growth)],
            ["Dividend yield (last 12 months of dividends ÷ price)", F.pct(d.yield)],
            ["Target PEG (setting)", r.settings.peg.toFixed(2)],
            ["Fair P/E = (growth + yield) × target", F.x(d.fairPE, 1)],
            ["Earnings per share for common shareholders", F.usd(d.eps)],
            ["Fair value = fair P/E × earnings per share", F.usd(m.value)]
          ];
        }
      },
      peg: {
        what: "Matches the price-to-earnings ratio to the company's expected earnings growth. A fair P/E equals the growth rate, so 15% growth supports a P/E of 15.",
        why: "This is Peter Lynch's well-known rule of thumb. It stops investors from calling a stock expensive just because its P/E is high when its profits are growing very fast.",
        fit: "Good for growth companies where a plain P/E looks too high.",
        watch: "It rewards high growth heavily. If the growth forecast is too optimistic, the value will be too high.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Expected yearly earnings growth over the next 3 years (analyst consensus)", d.growth.toFixed(1) + "% a year"],
            ["Target PEG (setting)", r.settings.peg.toFixed(2)],
            ["Fair price-to-earnings = growth × target PEG", F.x(d.fairPE, 1)],
            ["Earnings per share excluding one-off gains", F.usd(d.eps)],
            ["Fair value = fair multiple × earnings per share", F.usd(m.value)]
          ];
        }
      }
    }
  };
})();
