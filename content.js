/* Plain-language explanations for each method. Each `steps` function uses the live numbers so the
   reasoning always matches what the model just calculated. */
(function () {
  var F = {};
  F.usd = function (x, d) { return fin(x) ? "$" + x.toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : "n/a"; };
  F.pct = function (x, d) { return fin(x) ? (x * 100).toFixed(d == null ? 1 : d) + "%" : "n/a"; };
  F.spct = function (x, d) { return fin(x) ? (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d == null ? 1 : d) + "%" : "n/a"; };
  F.x = function (x, d) { return fin(x) ? x.toFixed(d == null ? 1 : d) + "x" : "n/a"; };
  F.mm = function (x) {
    if (!fin(x)) return "n/a";
    var a = Math.abs(x), s = x < 0 ? "−" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + " trillion";
    if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + " billion";
    return s + "$" + a.toFixed(0) + " million";
  };
  F.num = function (x, d) { return fin(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }) : "n/a"; };
  function fin(x) { return typeof x === "number" && isFinite(x); }

  var dcfWhatCF = "Adds up all the cash the business is expected to produce over the next 20 years, then converts that total into today's money.";

  function dcfSteps(label, baseKey, r, m, disc, discName, netDebt, yrs) {
    var P = r.proj, base = r.base, d = m.d, i = r.inputs, g = baseKey === "ni" ? P.gEPS : P.gCF;
    var s = [
      [label + " over the last 12 months", F.mm(P[baseKey][0])],
      ["Growth in year 1 and year 2 (from past growth)", F.pct(g[0]) + " and " + F.pct(g[1])],
      ["Growth then fades to " + F.pct(r.settings.g5) + " (year 5), " + F.pct(r.settings.g10) + " (year 10) and " + F.pct(r.settings.gT) + " (year " + yrs + ")", ""],
      [label + " in year " + yrs, F.mm(P[baseKey][yrs])],
      ["Discount rate (" + discName + ")", F.pct(disc, 2)],
      ["Today's value of the " + yrs + " years of " + label.toLowerCase(), F.mm(d.pv)],
      ["Terminal value, in today's money (everything after year " + yrs + ")", F.mm(d.pvTv) + " (" + F.pct(d.tvShare, 0) + " of the total)"]
    ];
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
        what: "The same 20-year cash flow calculation, but using free cash flow. Free cash flow is operating cash flow minus capital spending (capex). Capex is normalised: Plumbline uses the company's average capex as a share of revenue over the last five years, so a one-off spending surge (for example a data-centre build-out) does not wipe out the value.",
        why: "Capex is money the company must spend to keep running and growing. Free cash flow is what is really left for shareholders, so it is a stricter and more honest measure than operating cash flow.",
        fit: "Better than DCF-20 for companies that spend a lot on equipment, data centres or stores.",
        watch: "Free cash flow can be lumpy from year to year, which is why capex is averaged. If a company's heavy spending is permanent rather than temporary, the average flatters it. It also does not subtract stock-based pay, which is a real cost to shareholders.",
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
            ["Fair value = average multiple × sales per share", F.usd(m.value)]
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
          out.push(["Earnings per share excluding one-off gains", F.usd(d.eps) + (fin(d.gaap) ? " (reported: " + F.usd(d.gaap) + ")" : "")]);
          out.push(["Fair value = average multiple × earnings per share", F.usd(m.value)]);
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
            ["Fair value = average multiple × book value per share", F.usd(m.value)]
          ];
        }
      },
      psg: {
        what: "Matches the price-to-sales ratio to the company's expected sales growth. Faster growth earns a higher fair multiple.",
        why: "A plain P/S ratio treats a fast grower and a slow grower the same. PSG fixes this by asking what multiple the growth rate can justify.",
        fit: "Gives a growth-based view that is separate from the company's own history.",
        watch: "There is no official target PSG. The 0.10 default is a judgement call, so this is the lowest-confidence method and the one most likely to be an outlier. That is why it is a side check and is not counted in the fair value.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Yearly revenue growth used (from the company's past growth)", d.growth.toFixed(1) + "% a year"],
            ["Target PSG (setting)", r.settings.psg.toFixed(2)],
            ["Fair price-to-sales = growth × target PSG", F.x(d.fairPS, 2)],
            ["Sales per share", F.usd(d.salesPS)],
            ["Fair value = fair multiple × sales per share", F.usd(m.value)]
          ];
        }
      },
      peg: {
        what: "Matches the price-to-earnings ratio to the company's expected earnings growth. A fair P/E equals the growth rate, so 15% growth supports a P/E of 15.",
        why: "This is Peter Lynch's well-known rule of thumb. It stops investors from calling a stock expensive just because its P/E is high when its profits are growing very fast.",
        fit: "Good for growth companies where a plain P/E looks too high.",
        watch: "It rewards high growth heavily. If the growth forecast is too optimistic, the value will be too high. Because the target PEG of 1.0 is a rule of thumb, it is a side check and is not counted in the fair value.",
        steps: function (r, m) {
          var d = m.d;
          return [
            ["Yearly earnings growth used (from the company's past growth)", d.growth.toFixed(1) + "% a year"],
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
