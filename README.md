# Plumbline v3.3: stock intrinsic value and business quality

## v3.8.1: sliders always recalculate

Fixed: in some browsers and in-app web views, moving an assumption slider did not change the intrinsic value. The page waited for an animation frame (requestAnimationFrame) before recalculating; where the browser paused frames, that wait never ended and every later slider move was ignored. Recalculation now also runs on a short timer, so it happens either way. The count-up animation of the headline number and the opening of the method sheet no longer depend on animation frames either.

## v3.8: life-cycle valuation (after Aswath Damodaran)

Plumbline already sorts every company into a type (cyclical, growth, mature, or bank/insurer). Until now the type was only reported. v3.8 makes it change the valuation, following Damodaran's advice for each stage.

| Type | Damodaran's point | What Plumbline now does |
|---|---|---|
| **Cyclical** (chips, energy, mining, chemicals, vehicles, airlines and similar) | Today's profit may be a peak or a trough. Value the company on normal, through-the-cycle profit: average margins applied to today's sales. | The cash-flow and earnings methods (DCFs, P/E, PEG) start from the company's average margin over up to six years (at least four) times today's sales. The result stays within half to one and a half times today's figure, and a loss-maker is not turned into a profit-maker. P/S and P/B are unchanged. |
| **Growth** (sales up more than 15% a year) | A fast grower becomes an average company once growth settles, so its risk should fall too. | The terminal value (everything after the forecast years) uses a beta of 1. The forecast years still use the company's own beta. High-beta growers gain, low-beta growers lose a little. |
| **Mature** | Stable growth no higher than the economy, through-cycle figures. | No change: this is already Plumbline's standard model (long-run growth capped at the risk-free rate, 8% minimum cost of equity). |
| **Bank or insurer** | Value equity directly (dividends, excess returns, book value). | No change (the v3.0 financial model). |

AI-era chip companies with a full profile (quality A or B) skip the cyclical averaging, because the profile treats today's AI demand as largely lasting; a partial profile (quality C) uses half of it; a weak chip company gets all of it. The forecast section says which rule applied, and the calculation steps show the normalised figures.

Effect on the built-in examples: NVIDIA (growth, beta 2.2) $282.13 to $293.83; Salesforce (mature) unchanged at $330.49. On Salesforce's numbers treated as a cyclical company, the median would fall from $327.40 to $229.19, because its margins have risen a lot over six years.

**Testing.** The backtest uses the new rules by default; add `--lifecycle 0` to switch them off and compare. Pass marks, set before any run: (1) on the fresh test (`--fresh-test 500`), the cyclical group's average rank link must be higher with the rules than without; (2) the growth group's must not be lower; (3) the overall rank link must not fall by more than 0.01. If (1) fails, cyclical averaging should be switched off again.

**Result (15 Oct 2026, 2,752 calls):** all three passed. Cyclical rank link +0.125 with the rules vs +0.106 without (better in 6 of 10 years); growth unchanged at -0.011; overall +0.065 vs +0.060. The gain came mainly from Mean P/E on cycle-average earnings (+0.03 to +0.09 for cyclicals). Modest evidence on a list already used once today, so the rules stay on and the forward track record remains the real test.

## v3.7: AI-era profile for hyperscalers

Hyperscalers (Microsoft, Amazon, Alphabet, Meta, Oracle and CoreWeave) sell the computing power behind AI. They get two tweaks, both earned by business quality like the chip profile:

| What | How it works |
|---|---|
| Growth tailwind | A or B quality: year-5 growth lifted towards 14% (at most 4 points above the near-term rate), year 10 keeps 70% of it. C quality: towards 10% (at most 2 points), year 10 keeps 60%. Cap stays 25%. |
| Capital spending | They are building data centres at a record pace, so today's capex squeezes free cash flow. For the free-cash-flow methods only, capex is set halfway between today's level and the company's own six-year average capex-to-sales ratio, never below depreciation and never above today's capex. |
| Weak or cash-burning hyperscalers | Quality D or F, or negative free cash flow even after the capex adjustment: no tweaks at all. |

Operating-cash-flow, net-income and multiple-based methods are untouched, as are the discount rate and long-run growth. The loader now records each year's capex so the six-year average can be worked out. Example (test data, capex jumping from about 8% to 30% of sales, C-grade business): the fair-value median moves from $152.27 to $173.22. Not used in the backtest.

## v3.6: the chip-sector tailwind is now earned by business quality

v3.5 moved values only a little, because the growth lift touched just the cash-flow methods and the median of nine diluted it. v3.6 makes the AI-era profile stronger for good chip companies and switches it off completely for weak ones.

| Business quality | What a semiconductor company gets |
|---|---|
| A or B (score 65+), positive free cash flow, growth expected | **Full profile.** Year-5 growth keeps 95% of the near-term rate, lifted towards 15% (at most 5 points above the near-term rate, cap 25%). Year-10 growth keeps 70% of the year-5 rate. Mean P/B and PSG are left out of the median: book value says little about an asset-light chip company, and PSG's target has no accepted standard. |
| C (score 50-65), positive free cash flow, growth expected | **Partial profile.** Lift towards 10% (at most 2 points), year 10 keeps 60%. All nine methods count. |
| D or F, negative free cash flow, shrinking sales, or no quality score | **No tailwind.** The normal rules, exactly like any other weak company. |

The discount rate and long-run growth never change, so the headline still comes from cash flow. On the NVIDIA example data (quality A, 91/100) the fair-value median moves from $301.72 (normal rules) to $361.68, which is the 20-year free-cash-flow DCF itself. A C-grade chip company with the same numbers would get $329.82, and a D-grade one $301.72. The Methods list shows left-out methods struck through with the reason, and the forecast section says which tier applied and why.

## v3.5: AI-era growth profile for semiconductor companies

Chip companies (SEC industry "semiconductors", plus the main chip-equipment makers such as Lam Research, KLA and ASML) now get a more favourable growth path in the cash-flow methods. AI data-centre demand has lifted the industry's outlook: McKinsey (October 2026) expects chip revenue to grow about 19% a year to 2030, against a 9% average in 2014-2024. Plumbline takes a middle path rather than the boom-time number.

| Setting | Other companies | Semiconductors (v3.5) |
|---|---|---|
| Growth by year 5 | 85% of next year's growth rate | 95% of it, lifted towards 12% for slower growers (never more than 4 points above the near-term rate) |
| Growth by year 10 | Half the year-5 rate | 65% of the year-5 rate (a slower fade) |
| Cap on year-5 growth | 25% | 25% (unchanged) |
| Long-run growth, discount rate, multiples | Unchanged | Unchanged |

Because only the growth path changes, the value still comes from the cash the business is expected to generate. Example (NVIDIA example data, default rule): year-10 growth rises from 12.5% to 16.3%, and the fair-value median moves from $301.72 to $334.34. A company whose growth is expected to fall gets no lift.

This is a forward-looking judgement, so it is not used in the backtest (applying AI-era growth to 2015 would be hindsight). The forecast section and the notes say when it is in use, and the growth sliders in Assumptions can still be moved to test a weaker cycle.

## v3.4.1: overview tweaks

- v3.4.3 clean-up: the price line shows only today's change (no clock time), the figures line up with the chart title, the verdict sits level with the chart legend on laptops, the chart's shading is lighter, and price labels no longer sit under the value or price tags.

- The intrinsic value label now reads "Fair-value median from 9 valuation methods".
- A "See why" button under the two numbers jumps to the valuation chart, so people can see how the value was built.
- Business quality now sits in the verdict block, on its own line under the upside, in the same font as the upside line.
- v3.4.2: the "See why" button is smaller and sits directly under the intrinsic value. The two big figures line up, and on small phones the verdict pill sits above its text.

## v3.4: one clean overview card

- **Step 1 is now a single card.** The left side keeps only what most people read: the share price, the intrinsic value, the BUY/HOLD/SELL verdict with the upside (e.g. "27.5% upside to fair value · Clears the +20% BUY threshold"), and the business-quality grade, which links to the scorecard.
- **The price chart moved into the card**, on the right, so the price history sits next to the value it is compared with. It redraws when you change the assumptions. On phones the chart sits under the summary.
- **Removed from the overview** (all still shown further down the page): the gauge, the methods-above-the-price count, the range of estimates, the average of all methods, the analyst target and the long explanatory notes.
- Fixed a stray empty tooltip box showing under the price chart.

## v3.3.2: a cleaner summary card and a fold-out business description

- **Summary card, split in two.** The left side shows the share price, the intrinsic value and the gauge. The right side now carries the verdict: the BUY/HOLD/SELL pill, one line on how far the value is from the price, why that gives this verdict, and the key figures (methods above the price, range of estimates, average, analyst target, business quality). On phones the two halves stack.
- **One colour rule.** Only the verdict uses the BUY/HOLD/SELL colours (the pill and the upside figure). The coloured "undervalued" box is gone, and the gauge zones are softer.
- **Clearer label.** "Median of 9 valuation methods" now reads "Fair value · middle of 9 methods".
- **Business description.** A one-line background is always shown. The company's main operations (up to three points: its businesses, what they sell and to whom) fold out under "Main operations". History, rankings and lawsuits are filtered out. With an Anthropic key, the AI writes the one-liner and the points from the Wikipedia text.

## v3.3.1: tidier pages and a clearer Assumptions tab

- **Assumptions read-out.** A small panel above the sliders now shows the intrinsic value, the share price and the verdict, and updates as you move a slider. It shows how far the value has moved from the default.
- **Why the price never moves.** The share price is the market price, so assumptions cannot change it. The panel says this, and explains when a slider has no effect (for example, when the middle method is a multiple, or when the cost of equity is held at the 8% minimum).
- **Business description.** Shorter (one or two sentences), with exchange codes and trivia removed, and the label uses the company's proper name.
- **Business-quality cards.** The best and weakest measures sit in a light outlined panel with a divider, so each card reads more cleanly.

## v3.3: "What the company does"
- A short paragraph about the business now sits at the top of Step 2, above the Business Quality scorecard (`profile.js`, `/api/profile?t=TICKER`, cached for a week on Vercel).
- Source: the company's English Wikipedia summary (first 3 sentences). The article is found through Wikidata using the company's SEC registration number (CIK), so it cannot pick a different company with a similar name. If Wikidata has no entry, a Wikipedia search on the name is used, and the result is only accepted if it reads like a company description. If nothing is found, the box stays hidden.
- Optional AI summary: add the environment variable `ANTHROPIC_API_KEY` (on Vercel: Project > Settings > Environment Variables, then redeploy; locally: a line in `.env`) and Claude (`claude-haiku-5-5` by default, change with `ANTHROPIC_MODEL`) rewrites the Wikipedia text into 2-3 plain-English sentences: what the company sells, who its customers are and how it makes money, using only facts in the text. The page then says "Summarised by AI from Wikipedia" and warns that AI summaries can contain mistakes. Without a key, the Wikipedia text is shown as it is, free.
- Wikipedia text is CC BY-SA, so the page always credits Wikipedia and links to the article.

## v3.2: banks and insurers get their own methods (following Aswath Damodaran)
- Each company is now sorted into a group from its SEC industry label (`IV.classify` in `engine.js`). Most companies stay in the **general** group and use the same nine methods as before (NVDA $282.13 and CRM $330.49 are unchanged).
- **Financial group:** banks, savings institutions, insurance carriers, brokers and investment banks, and non-bank lenders. Insurance agents and brokers, asset managers and REITs stay in the general group, because their cash flow is meaningful.
- Why: for a bank, deposits and loans are its products, so debt, WACC and free cash flow (operating cash flow minus capex) are not meaningful. Following Damodaran, the financial group values the **shareholders' equity directly** at the **cost of equity**.
- The seven financial methods (median of the seven, same BUY/HOLD/SELL bands):

| Method | What it uses |
|---|---|
| Dividend discount model (DDM) | Normal earnings per share (average ROE × book value per share), today's dividend payout, growth = ROE × share of profit kept + buyback effect |
| Free cash flow to equity (FCFE) | Profit minus the equity the company must keep to grow (covers buybacks). The only method that starts from the last 12 months, drifting back to normal over 10 years |
| Excess return model | Book value + present value of (ROE − cost of equity) × book value |
| Justified P/B | Fair P/B = (ROE − growth) ÷ (cost of equity − growth), × book value per share |
| Mean P/E, Mean P/B | Same as the general group |
| PEGY | Lynch's PEG with dividends: fair P/E = (growth + dividend yield) × target PEG |

- The 10-year path: years 1–5 grow at the rate the company's own retained profit supports (capped at 12%); years 6–10 fade to long-run growth (3%) while ROE fades to its long-run level. Long-run ROE = halfway between the normalised ROE and the cost of equity. A company earning below its cost of equity is not assumed to improve.
- **Normalised ROE** = average ROE on common equity over up to 5 years (capped at 30%), so one very good or bad year (for example a hurricane year for an insurer) does not drive the value.
- **Common shareholders only:** preferred stock is taken out of book value and preferred dividends out of profit.
- **Cost of equity:** Damodaran's US industry betas (January 2026), adjusted towards 1.0 (0.67 × beta + 0.33) because bank betas measured from past prices run very low: large bank (market value $100B+) 0.76, bank 0.40, property and casualty insurer 0.48, life and health insurer 0.64, other insurer 0.67, broker 1.17, lender 0.97. The beta slider still overrides it.
- New data from SEC filings (`edgar.js`): dividends paid (common only; if only total dividends are tagged, preferred dividends are subtracted), buybacks, preferred dividends and preferred stock, for the last 5 fiscal years and the last 12 months. Banks without a single revenue line now get revenue = net interest income + non-interest income.
- A company with buybacks but no dividend tags (for example Berkshire Hathaway) is treated as paying no dividend: DDM is skipped and the other six methods run.
- Page: the method count, forecast table (growth, ROE, payout, profit and book value), Data section (cost of equity build, bank figures, ROE and payouts year by year) all switch for the financial group. The growth-in-year-5/10 and PSG sliders are hidden for it.
- `node check.js JPM` prints the group, beta, dividends, buybacks, preferred figures and ROE history so you can compare with stockanalysis.com.
- To test the change on history: `node backtest.js --banks --fresh` (32 US banks, brokers and insurers).
- **Backtest price fix (v3.2):** asking Yahoo for full ("max") history with monthly bars returns 3-month bars. Every v2.7 backtest therefore used the price about two months after each test date, measured returns about two months late, missed many stocks entirely and never found the Treasury yield (5% was used). The backtest now downloads daily prices from 2009 and builds true month-end prices from them. Its saved price files are named `yahooM_*.json`; the old `yahoo_*.json` files are ignored and can be deleted. Rerun both backtests: v2.7 backtest results should not be relied on.
- **Minimum cost of equity for banks and insurers (default 8%, slider in Assumptions):** with very low bond yields (0.6% in April 2020), risk-free + beta × premium gave banks a 4–5% cost of equity, barely above long-run growth, so every equity model gave huge values (the clean bank backtest said BUY for 60% of calls and all 30 banks in 2020). Example: a bank priced at $300 was valued at $659 with no minimum and $279 with the 8% minimum. At normal yields the minimum does not bind. Backtest option `--floor 0.08` (`--floor 0` turns it off).
- **Two Damodaran fixes for low interest rates (all companies):** (1) long-run growth is capped at the risk-free rate, because no company can outgrow the economy forever (only bites when yields are below the 3% default); (2) the 8% minimum cost of equity now applies to every company, standing in for Damodaran's implied risk premium, which rises when yields fall. Example at a 0.6% yield: CRM's DCF-20 value was $1,030 with neither fix, $759 with the minimum and $548 with both. At today's yields neither fix changes NVDA ($282.13) or CRM ($330.49). Backtest switches: `--floor 0` and `--gcap 0`.
- **Company type (detection only, the value is not changed yet):** each company is labelled bank/insurer, cyclical (by SEC industry: semiconductors, energy, mining and metals, chemicals, machinery, vehicles, aircraft, construction, transport; utilities excluded), growth (revenue up more than 15% a year over the last 5 fiscal years) or mature (the rest). Rules fixed before testing. An exploratory split of the 104 general backtest companies suggested the verdict misleads for growth companies (rank link -0.19 on both lists), that DCFs beat single-year P/E and P/S for cyclicals, and that mature companies show a small edge.
- **Fresh test:** `node backtest.js --fresh-test 500` takes the 500 largest US companies in the SEC list, skips every company in the four earlier lists (172), and saves to `backtest-output-fresh`. Section 8 reports results by company type and prints four PASS/FAIL checks written before the run: growth rank link below zero; cyclical DCFs beat P/E and P/S; mature rank link zero or above; banks and insurers +0.05 or higher and positive in 6+ of 10 years.
- **More tickers load (v3.2):** in the 500-company test, 40 large companies failed on the latest date. Fixed: (1) negative shareholders' equity (McDonald's, Starbucks, Hilton, AutoZone, O'Reilly, HCA, McKesson, Otis, TransDigm, Dell, HP, VeriSign, MSCI, SBA): price-to-book is now optional and left out, with a note; (2) share counts tagged in millions or thousands by mistake (McDonald's since 2024, Nutanix) are rescaled against the cover-page count; (3) partnerships (Energy Transfer, Enterprise Products, MPLX, Cheniere Partners) use partners' capital and per-unit figures; (4) companies with no diluted share figures (KKR) use the cover-page count and profit ÷ shares; (5) a later SEC label now fills years an earlier label left empty (VeriSign and LyondellBasell tag yearly profit as ProfitLoss); (6) share and EPS series that stopped years ago are ignored. Clear messages instead of wrong values: foreign companies that moved to IFRS (Petrobras, Vale, Alcon, Agnico Eagle) and companies whose share count is only reported by share class (Visa, Constellation Brands, Ares, Brookfield, Baidu, Formula One) – use the manual entry form for these. Search allows one more typo in longer names ("starbux" finds Starbucks).
- **Separate result folders:** the default list saves to `backtest-output`, `--banks` to `backtest-output-banks`, a `--tickers` list to `backtest-output-custom`, and `--out NAME` to `backtest-output-NAME`, so runs no longer overwrite each other. The results also record each call's cost of equity.
- **Clean backtest findings (v2.8, daily prices):** the four ways of combining the methods gave almost the same rank link in both groups (banks +0.03 to +0.05, general −0.06 to −0.08), so the median stays. General stocks: the median BUY call beat SPY by 1.6% and the median SELL call lagged by 1.9%, but SELL calls averaged +13.5% vs SPY because they included the decade's biggest winners (Nvidia, AMD, Micron).
- **Which way of combining the methods works best?** Every backtest call is now valued four ways: the median of all methods (the site's headline), the simple average, the trimmed mean, and the median of the intrinsic methods only (the four DCFs, or for banks DDM, FCFE, excess return and justified P/B). Section 6 of `summary.txt` compares them on the same calls: BUY and SELL counts, their returns vs SPY, the BUY − SELL gap, and the "rank link" (Spearman correlation between upside and later return vs SPY, worked out within each year and averaged). `results.csv` has a column for each way's upside. Run `node backtest.js` for the 54 general stocks and `node backtest.js --banks` for the financial group, then compare section 6.
- To force a stock into a group, add `group: "general"` or `group: "financial"` to its inputs.

## v2.7 and earlier

A static website (no build step). Open `index.html` in a browser, or upload the folder to any static host
(Netlify, Vercel, GitHub Pages, Cloudflare Pages).

## Quick start (almost any US ticker works, no paid key)
1. Install Node 18 or newer (nodejs.org).
2. Create a file called `.env` in this folder with one line: `SEC_CONTACT=your_email@example.com`
   (the SEC asks apps to identify themselves).
3. In this folder run `node server.js`, then open http://localhost:3000 and type a ticker.
4. To test one ticker without the website: `node check.js NOW` (prints the valuation and the quality scorecard).

Data sources (all free, no key): company financials from SEC EDGAR filings, prices and splits from Yahoo Finance.
Analyst estimates are not available there, so growth for the first years comes from the company's own past growth (labelled on the page).
Optional: add `FMP_API_KEY=...` to `.env` to use Financial Modeling Prep as a backup (foreign companies), or set `DATA_SOURCE=fmp` if you pay for FMP and want its analyst estimates.
Limits: US companies that file 10-K/10-Q in dollars. Foreign filers (for example ASML) and very recent listings need the manual entry form.

## v3.1: original valuation model restored

The valuation model and verdict rules are back to v2.7, the version before any backtest changes:
- Nine methods, headline fair value = median of all nine.
- Company's own beta, latest capex, past growth capped at -5% to 35% (analyst forecasts used where the data source provides them).
- BUY at +20% upside or more, SELL at -20% or worse. No value test and no quality gate on the verdict; the quality grade is shown alongside.

The v2.8 to v3.0 changes below are kept for reference but are no longer active. The backtest script, search, price panel and design are unchanged.

## v3.0 (replaced by v3.1): built for value investors (only the company's own record counts)
- The user chose a strict value-investing philosophy: valuations rest only on past figures; future prospects, turnarounds and hype do not count until they show up in the accounts. The backtest showed this approach lags in boom years (2016-2025 rewarded companies whose figures did not yet justify their prices); that trade-off is accepted, and Plumbline must not claim to beat the market.
- Growth comes only from past results (IV.pastGrowth / IV.pastEst in engine.js): revenue growth blends the last 3 years with the longest period available (up to 5), earnings growth is half anchored to revenue growth (no more than 10 points above it), both kept between -5% and +25% a year, then the v2.10 fade. Analyst forecasts are no longer used anywhere: not from the paid data source, not for the built-in stocks (their analyst figures are kept as estAnalyst for reference only), and the manual form now asks for 3-5 years of past revenue, EPS and free cash flow instead of forecasts. The built-in stocks' hand-set growth settings were removed.
- The value test (IV.valueTest / applyValueTest): at least 3 years of results; profitable over the last 12 months (net income excluding one-offs); positive operating cash flow; positive equity; profitable in at least 60% of recent years; positive free cash flow in at least 60% of recent years (cash flow checks skipped for banks and insurers). A company that fails gets the verdict "FAILS VALUE TEST" whatever its price, with the failed checks listed. The checklist is shown on every result.
- Verdict order: value test, then fair value vs price (+/-20%), then the quality check (BUY needs grade C or better).
- Analyst price target removed from the result page.
- Effect: CRM fair value $382 (BUY); NVDA $220 (HOLD) because its 68% past growth is capped at 25% and analyst forecasts are no longer used. A loss-making microcap with fast sales growth fails the value test.

## v2.11: model fixes, step 4 - quality check on the verdict
- A BUY now also needs a Business Quality grade of C or better (IV.applyQuality in engine.js, used by the site and the backtest). A stock that is 20%+ undervalued but graded D or F is held at HOLD and flagged "Undervalued, but weak business" (a likely value trap). Companies the scorecard cannot grade (banks, insurers, missing data) are judged on value alone. SELL is unchanged.
- The backtest records the value-only verdict and a value-trap flag, and summary section 6 reports how the held-back value traps performed.
- Remaining "intrinsic value" / "median" labels on the result page now say "fair value".

## v2.10: model fixes, step 3 - growth inputs
- When analyst forecasts are missing (always on the free SEC + Yahoo source, and in the backtest), revenue growth now blends the last 3 and 5 years; earnings growth is half anchored to revenue growth and may not run more than 10 points ahead of it; both are kept between -5% and +25% a year (was 35%).
- Faster fade for every stock: by year 5 growth keeps 60% of its lead over long-run growth (3%), by year 10 30% (g5 = 3% + 0.6 x (g2 - 3%), max 20%; g10 = 3% + 0.3 x (g2 - 3%)). Was g5 = 0.85 x g2 (max 25%), g10 = 0.5 x g5. Reason: research on company growth rates finds fast growth rarely persists.
- Example: a company that grew 34% a year for 3 years (25% over 5) was projected to multiply revenue 16.9x over 20 years; now 8.4x. A steady 10% grower is unchanged (3.0x).
- The built-in NVDA and CRM keep their checked growth settings from the Excel models, so their values do not change.

## v2.9: model fixes, step 2 - method families
- The fair value is no longer the median of all nine methods. Methods are grouped: cash flow & earnings models (DCF-20, DFCF-20, DNI-20, DFCF-Terminal) and valuation multiples (Mean P/S, P/E, P/B). Each group gives its median, and the fair value is the average of the two group medians, so the four similar discounting models cannot outvote the three multiples.
- PSG and PEG depend on rule-of-thumb targets, so they are side checks: shown (faded, labelled) but not counted.
- Effect (with step 1): NVDA $306.97 -> $302.28 (BUY, +32%), CRM $351.08 -> $365.95 (BUY, +60%; its PSG and PEG were far below the rest).
- Step 5 on the result page now shows the two group values, the fair value and the side checks. "Median" wording replaced by "fair value" across the site; engine keeps stats.median as the headline for compatibility and adds stats.families, stats.medianAll, stats.maxAll.

## v2.8: model fixes, step 1 (after the backtest)
- Adjusted beta: the discount rate now uses 0.67 x measured beta + 0.33 (the Blume adjustment used by Bloomberg), so extreme betas are pulled towards 1. NVDA 2.22 -> 1.82 (WACC 16.0% -> 14.0%), CRM 1.26 -> 1.17.
- Normalised capex: free cash flow uses latest revenue x the average capex-to-revenue ratio of the last five fiscal years plus the latest twelve months, so a temporary spending surge (data centres) no longer wipes out free cash flow. Needs at least 3 years of capex history (SEC and FMP data); the built-in NVDA and CRM figures have no capex history, so they use the latest twelve months as before.
- Effect on the built-in stocks: NVDA median $282.13 -> $306.97 (BUY), CRM $330.49 -> $351.08 (BUY).
- The quality scorecard still uses actual (not normalised) free cash flow, because it measures what the business really produced.
- The backtest uses the same engine, so it picks these changes up automatically.

## v2.7: backtest (how would past calls have done?)
- `node backtest.js` values a fixed list of 54 large US companies on 1 April of each year from 2016 to 2025, using only SEC filings submitted before each date, the share price on that date (later stock splits undone), 5-year beta before the date and the 10-year Treasury yield of that date. It then measures each stock's 12-month total return against SPY.
- Options: `--from 2016 --to 2025 --month 4 --hold 12 --tickers AAPL,MSFT --fresh`.
- Output in `backtest-output/`: `results.csv` (every call, opens in Excel), `summary.txt` (results by verdict, year by year, growth of $10,000, upside groups, other BUY/SELL lines, limits) and `results.json`. Downloads are saved in `backtest-cache/` so reruns are quick. Both folders are ignored by git.
- Run it on your own computer: the SEC and Yahoo cannot be reached from Claude's workspace.
- v2.7.2: `--top 500` tests the 500 largest US-listed companies (SEC list order, one ticker per company) and `--freq quarterly` tests on 1 Jan, Apr, Jul and Oct. Saved SEC downloads keep only the figures the model reads (about 30 KB per company). Cross-sections are grouped by test date; growth of $10,000 uses one non-overlapping date per year.
- v2.7.1: prices now come from daily Yahoo data turned into clean month-end bars (monthly bars over the "max" range had irregular dates, which left about 40% of 12-month returns blank in the first run). New summary sections: 6) results by Business Quality grade, 7) each of the nine methods tested on its own (rank correlation with next-year returns), 8) why any stock-dates have no result. results.csv also lists the grade and each method's upside.

## v2.6 changes: live price vs intrinsic value, and a price chart
- The top of every result now puts the latest share price (marked Live, with today's change and the update time) next to the intrinsic value, with a clear "X% undervalued" or "X% overvalued" badge. The figure is (price - value) / value, the same way most research sites quote it. The upside figure is still shown beside it.
- A gauge shows where the price sits against the BUY, HOLD and SELL ranges around the intrinsic value.
- New "Share price vs intrinsic value" chart (1M, 6M, 1Y, 5Y), drawn by Plumbline in the site's own style: the price line, today's intrinsic value as a dashed line, and faint BUY and SELL zones. Hover or touch to read the price and how far it was from the value on any day.
- `/api/quote?t=TICKER&range=1y` (`api/quote.js`) returns the latest price, the previous close and the price history from Yahoo Finance, cached for one minute. The page refreshes the price every minute while a result is open, and the verdict updates with it. Built-in stocks keep their checked figures; only the price is refreshed.
- Chose a built-in chart over an embedded TradingView widget: it matches the theme, has no third-party branding, and can draw the intrinsic value and BUY/SELL zones on the chart.

## v2.5 changes: instant search
- Suggestions now appear on every keystroke with no wait. The matching engine (`search-core.js`) runs in the browser and is shared with the server, so both give the same answers.
- It starts with a built-in list of about 150 well-known US-listed companies, then quietly loads the full SEC list of US-listed companies from `/api/tickers` (`api/tickers.js`, cached at Vercel's edge for a day) and keeps it in the browser for a week.
- Pressing Enter on a company name opens it straight away ("apple" -> AAPL, "walt disney" -> DIS). A typo ("microsfot") shows "Did you mean" choices at once, without waiting for the server.
- Matching letters are highlighted in the suggestions; arrow keys, Enter and tapping all work. Short text such as "nv" or "co" is no longer mistaken for a company suffix.
- The Plumbline logo and icon are slightly larger on phones.

## v2.4.1 changes
- Sharper home intro: "Plumbline cross-checks a company across multiple valuation models and distils them into one fair-value estimate. Then it grades the business behind the share price, so you know both what you would pay and what you would own."
- The home example chart is now a ranked dot plot (`Charts.dotplot`): one row per method from lowest to highest, with the name on the left and the value on the right, and the median and price lines running through every row. Nothing overlaps on any screen size.

## v2.4 changes: smarter search, clearer home page
- Search understands company names and typos. "apple" opens Apple (AAPL), "google" opens Alphabet, "jp morgan" opens JPMorgan. A near miss such as "nvdia" or "microsfot" shows "Did you mean" choices with company names. The SEC list is ordered by company size, so the biggest matching company comes first.
- Suggestions appear under both search boxes as you type (new `/api/search` endpoint, `api/search.js` on Vercel). Arrow keys and Enter work.
- Home page: the Plumbline name shows next to the icon on phones; new eyebrow "Intrinsic value, calculated"; shorter intro that no longer says "nine"; a separate line inviting a search; the "Try one" and "Enter the numbers yourself" rows are gone (manual entry is still offered when a search fails).
- The home chart is framed as an example (share price, median value and verdict above it, a colour key below, and a general caption).
- "Why not trust just one method?" and "How the quality score works" are now cards: three method blind spots, three takeaways, the points scale, the three areas with weight bars and the A-F grade scale.
- Result pages: the header shows only the exchange and price date; the data source and financials date moved to "Things to know". "The answer:" was removed from Step 1 and the value label is shorter.
- More Matrix, kept subtle: the headline value "decodes" digit by digit when a stock loads, a faint signal light pulses next to the eyebrow, and a light rain falls behind "How Plumbline works".
- Chart labels have a dark outline and sit above the median line, so they stay readable where they cross it.

## v2.3.1 changes: the same rain on every result, and phone fixes
- The digital rain now also falls behind the company name at the top of each result (for example Salesforce), so the result page opens with the same look as the home page. It fades out before the verdict card and stops when you scroll past it or search another stock.
- Phones: the home search button reads "Value" so the hint text fits; the rain shows softly on both sides of narrow screens.
- Chart labels never overlap: each method name goes in the lowest free row and shifts sideways if a cluster is crowded. The median and price labels on the valuation chart switch sides instead of running off the edge.

## v2.3 changes: midnight blue, elegant type, quiet "digital rain"
- The v2.2 terminal look felt too much like code. The theme is now a darker midnight blue (#040a16) with a soft blue accent (#8fb4e6) used sparingly.
- Colour is kept for meaning only: green BUY, amber HOLD, red SELL, and the matching good/weak marks. Everything else is white, grey or blue.
- One typeface throughout: Instrument Sans (clean, professional, not monospaced). Numbers use tabular figures so columns line up.
- A faint, slow "digital rain" of figures (0-9, $, %, ., +, -) falls behind the home headline. It pauses when off screen or in a background tab, and stays still when the device asks for reduced motion.
- Pill-shaped search box and buttons, quieter step labels, solid sticky header and phone verdict bar for readability.

## v2.2 changes: research terminal look
- The user felt the gold and the v2.1 fonts looked too much like Claude's own style. The accent is now a cool terminal teal (#4fd1c5) on near-black, with a faint grid in the background.
- Fonts: IBM Plex Sans for reading, IBM Plex Mono for numbers, tabs, buttons and labels.
- Light "Matrix" touches: a command-line line above the home headline, a blinking block cursor, "//" step labels and ">" field labels.
- Verdict colours stay meaningful: green BUY, amber HOLD, red SELL. Chart lines for profit and free cash flow use blue and violet so they never look like a verdict.

## v2.1 changes: refined dark finance look and a smoother phone flow
- New type: Schibsted Grotesk for headings, Hanken Grotesk for text, IBM Plex Mono for numbers (digits line up). Deeper navy, gold kept for what matters, thin rules and softer cards.
- Section tabs use a gold underline and, on phones, scroll themselves to keep the current section in view.
- Loading shows a skeleton of the page instead of a spinner.
- Chart bars grow in and the quality ring fills on first load; sections ease in as you scroll. All motion is off when the device asks for reduced motion.
- Phones: a verdict bar (ticker, value, upside, BUY/HOLD/SELL, grade) appears at the bottom once the verdict scrolls away; tap it to go back up. The nine methods are swipeable cards, and tapping one opens its full calculation in a panel that slides up from the bottom (drag down or tap outside to close).

## v1.10 changes: runs on Vercel (free, does not sleep)
- `loader.js` holds the live-data logic, shared by `server.js` (on your computer) and `api/stock.js` (on Vercel).
- `api/stock.js` and `api/health.js` are Vercel serverless functions. Vercel serves the other files as a normal website, so the page works unchanged.
- Each ticker is cached at Vercel's edge for 10 minutes.
- Setup: put these files in a GitHub repository (never `.env`), import it at vercel.com (Framework Preset: Other, no build command), add the environment variable `SEC_CONTACT` = your email, and deploy.
- Vercel Hobby (free) is for personal, non-commercial use. Functions stop after 60 seconds.
- `vercel.json` lists exactly what to build: the files in `api/` run as functions, and every other file is served as-is. Without it, Vercel mistakes `server.js` / `app.js` for a Node server and the home page fails with FUNCTION_INVOCATION_FAILED.
- `SITE_PASSWORD` only applies to `server.js`, not to Vercel.

## v1.9.3 changes (hosting)
- Optional password: set `SITE_PASSWORD` (in `.env`, or as an environment variable on the host) and the browser asks for it once. Any user name works. Leave it unset for no password.
- `/health` always answers "ok" without a password, so an uptime monitor can ping it to keep a free host awake.

## Keeping it online 24/7
- Render free web services sleep after 15 minutes without visits and take about a minute to wake. The account gets 750 free hours a month, enough for one service running all month.
- Free option: an uptime monitor (for example UptimeRobot) pings `https://<your-site>.onrender.com/health` every 5 minutes so the site never sleeps. Not guaranteed by Render.
- Paid option: switch the service's instance type to Starter (about US$7 a month) in Render's settings. It never sleeps.

## v1.9.2 changes (easier to follow)
- Each section starts with a short "Step 1" to "Step 8" line that links it to the one before, so a beginner can follow the whole page in order.
- Forecast: one plain sentence (growth next year, the year after, and where it settles), a five-row table (today, year 1, 5, 10 and 20: growth, free cash flow, profit and where the growth figure comes from), a note on why growth slows, and a link to Assumptions. The two 20-year charts moved behind "Show the full 20-year forecast".
- Data is now "Things to know": the three most important notes, with the rest behind "Show more notes". The ratio, input and discount-rate tables moved behind "Source data for analysts", each with a one-line label.
- Fixed: the section tabs stacked vertically on phones in v1.9.1.

## v1.9.1 changes
- The user chose to keep the v1.9 single-page layout (a v2.0 tabbed layout was tried; its app.js is kept in the Project as archive/app_v2.0.js).
- Each Business quality area (Earnings & Cash Flow, Balance Sheet, Growth) is now collapsed: it shows its score, its best and weakest measure, and "See all N measures" opens the full list.

## v1.9 changes
- Quick ratio removed from the scorecard (user's choice). Balance Sheet Strength now has four measures: debt to equity, debt to EBITDA, interest coverage and retained earnings.
- Typing a company name (for example "salesforce" or "nvidia") now opens the same checked built-in data as typing its ticker. Before, the name went to the live SEC source and gave a different result.
- The page header now says where the data came from (checked built-in figures, SEC filings + Yahoo Finance, or entered by you).

## v1.8 changes
- Last year's debt is found more reliably: more debt labels are checked (for example senior notes and convertible notes), and if the filing from exactly a year earlier has no debt figure, the nearest filing within about six months is used. This lets ROIC use the year-average, as intended.
- Known remaining difference: stockanalysis.com (S&P Global data) moves one-off items such as acquisition costs out of operating income. Plumbline uses the official SEC figure, so its ROIC, interest coverage and debt to EBITDA can be slightly more cautious.

## v1.7 changes (second ServiceNow check)
- Short-term borrowings (for example commercial paper or a term loan due within a year) are now counted in debt. NOW's $2.1 billion of short-term debt was missing before.
- ROE and ROIC use the average of the latest balance sheet and the one a year earlier, the standard method (stockanalysis.com does the same). This stops a large deal or debt raise near the period end from distorting them.
- `node check.js TICKER` also prints the scorecard inputs (tax rate, operating income, interest, borrowings, leases, prior-year balance sheet) so they can be checked.

## v1.6 changes (checked against stockanalysis.com with ServiceNow)
- Total debt now includes lease obligations, the same as stockanalysis.com. This feeds the valuation (net debt) and the debt ratios.
- Tax rate = tax expense ÷ (net income + tax expense). The old route could pick up only part of pre-tax profit and overstate the rate.
- Quick ratio uses the standard formula, with a note for subscription businesses.

## New in v1.5: Business Quality scorecard
A "Business quality" tab grades the company on 13 measures in three areas. Each measure scores Strong (2), Good (1) or Weak (0).
Core measures count double inside their area. The areas combine into a score out of 100 and a grade (A 80+, B 65+, C 50+, D 35+, F below 35).

| Area (weight) | Measures | Good | Strong |
|---|---|---|---|
| Earnings & Cash Flow (45%) | ROIC (core) | > 10% | > 15% |
| | ROE (core) | > 12% | > 20% |
| | Free cash flow to net income (core) | > 1.0x | > 1.5x |
| | Free cash flow growth trend (core) | rising, up in 60%+ of years | 15%+ a year, up in 75%+ of years |
| | Net profit margin | > 10% | > 15% |
| | Gross profit margin | > 30% | > 40% |
| Balance Sheet (30%) | Debt to equity | < 1.0 | < 0.5 |
| | Debt to EBITDA | < 3.0x | < 2.0x |
| | Interest coverage | > 2.0x | > 3.0x |
| | Retained earnings trend | rising, up in 60%+ of years | 15%+ a year, up in 75%+ of years |
| Growth Outlook (25%) | EPS growth (yearly, over up to 5 years) | > 8% | > 15% |
| | Revenue growth (yearly, over up to 5 years) | > 8% | > 15% |
| | Growth consistency (years revenue rose) | 75%+ of years | every year |

Notes:
- Profit-based ratios use net income excluding one-off investment gains (the same figure the valuation uses).
- ROIC = operating income × (1 − tax rate) ÷ average invested capital, where invested capital = equity + borrowings − cash (latest and one year earlier). ROE = net income ÷ average equity. Lease obligations are left out of ROIC, because rent is already deducted from operating profit.
- A measure that cannot be calculated (for example ROE with negative equity) is left out of the score and shown as n/a.
- Banks, insurers and REITs are not scored, because these measures do not fit their business.
- The grade is shown next to the BUY/HOLD/SELL verdict with a one-line reading (for example "Possible value trap" for a weak business that looks cheap).
- Stocks entered by hand or loaded from FMP have no scorecard yet.

## What happens for a ticker that is not pre-loaded
1. The server loads data from SEC filings and Yahoo prices (or Financial Modeling Prep if you chose it).
2. If the free plan blocks trailing 12-month figures, the last fiscal year is used. If it blocks analyst estimates, past growth is used. Both are labelled on the page.
3. Companies that report in another currency (for example ASML in euros) are converted at the live exchange rate.
4. If the ticker cannot be loaded, the site suggests similar tickers and offers **Enter the numbers yourself**. That form takes the same figures as the Excel Inputs tab, so any stock can be valued.

## Files
- `engine.js`: the valuation methods (nine for most companies, seven for banks and insurers) and the industry groups. Same formulas as the Excel models (tested: NVDA median $282.13, CRM median $330.49).
- `quality.js`: the Business Quality scorecard (tested: NVDA A 91/100, CRM B 67/100).
- `data.js`: pre-loaded NVDA and CRM inputs, taken from the Excel Inputs tabs, plus the scorecard figures.
- `content.js`: the plain-language "what / why / how / watch" text for each method.
- `api.js`: live data for other tickers (Financial Modeling Prep API). Used by both the browser and `server.js`.
- `edgar.js`: free data source (SEC EDGAR + Yahoo). Server only. Also collects the scorecard figures.
- `check.js`: command-line test for one ticker.
- `backtest.js`: historical test of Plumbline's calls (see v2.7).
- `search-core.js`: the search engine (names, tickers, typos), used by the browser and the server.
- `api/quote.js`: Vercel function for the live price and price history (`/api/quote`).
- `api/tickers.js`: Vercel function that returns the full company list for instant suggestions (`/api/tickers`).
- `api/search.js`: Vercel function for search suggestions (`/api/search?q=`), used until the full list has loaded.
- `server.js`: tiny server (no dependencies) that serves the site and keeps your API key private.
- `manual.js`: the manual entry form.
- `charts.js`, `app.js`, `style.css`, `index.html`: charts, page logic and the dark theme.

## Adding more stocks
Copy an entry in `data.js` and fill in the numbers from stockanalysis.com, exactly as in the Excel Inputs tab.
For the scorecard, also fill `quality` from the income statement, balance sheet and cash flow pages (TTM column and fiscal years).

## Known differences from the Excel files
- The P/E method now ignores readings above 100x for every stock (the Excel did this only for CRM). NVDA's P/E value moves
  from $424.76 to $334.34. Its median ($282.13) and verdict do not change.
- Live tickers assume no one-off investment gains, and use default growth settings (editable with the sliders).
