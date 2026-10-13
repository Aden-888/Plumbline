# Plumbline v2.2: stock intrinsic value and business quality

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
- `engine.js`: the nine valuation methods. Same formulas as the Excel models (tested: NVDA median $282.13, CRM median $330.49).
- `quality.js`: the Business Quality scorecard (tested: NVDA A 91/100, CRM B 67/100).
- `data.js`: pre-loaded NVDA and CRM inputs, taken from the Excel Inputs tabs, plus the scorecard figures.
- `content.js`: the plain-language "what / why / how / watch" text for each method.
- `api.js`: live data for other tickers (Financial Modeling Prep API). Used by both the browser and `server.js`.
- `edgar.js`: free data source (SEC EDGAR + Yahoo). Server only. Also collects the scorecard figures.
- `check.js`: command-line test for one ticker.
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
