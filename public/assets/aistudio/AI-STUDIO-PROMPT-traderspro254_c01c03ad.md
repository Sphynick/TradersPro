# TRADERSPRO254: full rebuild brief for Google AI Studio

> **How to use this:** In AI Studio, attach `chartlord-site-final46.zip` and `worker-v38.js` as reference files. Paste everything below the line into the chat. If AI Studio stops halfway, reply "continue with the next build step" (the steps are in section 14). Do not ask it to do everything in one answer.

---

## 0. What you are building

Rebuild **TRADERSPRO254**, a trading-tools website for Kenyan and international traders, as a modern, **simple and friendly** web app.

The two attached files are the **source of truth for behaviour**:
- `chartlord-site-final46.zip` is the current website (static JS app).
- `worker-v38.js` is the current Cloudflare Worker back end (all server rules, prices, payments, licences, signals, engine).

Do not invent new business rules. Where this brief and the attached files differ, follow the attached files and tell me about the difference. **Every feature in the current site must exist in the rebuild**, plus a proper **Admin Dashboard**.

### Hard requirements
1. **Firebase instead of Cloudflare.** Firebase Authentication for logins, Cloud Firestore for all data. No Cloudflare, no KV, no Workers.
2. **Hosted on Vercel from a GitHub repo.** Vite + React + TypeScript + Tailwind front end in the project root. Server code as **Vercel Serverless Functions in `/api`** using `firebase-admin`. No long-running Express server (Vercel cannot run one). If you need `server.ts` for local dev only, keep it out of the production path.
3. **Light and dark theme with a toggle** in the header (sun/moon button). Default: follow the device setting. Remember the choice. Both themes must be fully readable (contrast AA), including charts, tables, dialogs and the admin area.
4. **Friendly and simple UI.** Details in section 2.
5. Works well on phones first (most users are on Android, many on slow data), then desktop. Installable as a PWA.
6. Final output must be a project I can download as a ZIP, push to GitHub and import into Vercel with only environment variables to fill in. Include a `README.md` with click-by-click setup (Firebase, Vercel, env vars, first admin, going live).

---

## 1. Architecture

```
/ (Vite React app)
  src/            pages, components, hooks, lib
  public/         icons, manifest, service worker, vault/*.json (encrypted bot files)
/api              Vercel functions (one file per route group, or one catch-all router)
/server (or lib)  shared server code: firebase-admin init, auth check, pricing, payments, signals
firestore.rules   deny all client access except what is listed in section 11
vercel.json       function timeouts, headers, cron
.env.example
README.md
```

- **Client** talks to Firebase **Auth only** directly. Everything else goes through `/api/*` with `Authorization: Bearer <Firebase ID token>`.
- **Server** verifies the ID token with `firebase-admin`, then reads/writes Firestore with the Admin SDK. Client-side Firestore access is **denied by rules** (the server is the only door). This keeps prices, licences, bot keys and payments safe.
- **Admin** = a Firebase user whose email is in an `ADMIN_EMAILS` env var (comma separated) **and** has a `admins/{uid}` document. Also support the old owner-key flow (`ADMIN_KEY` header) only if easy; email-based admin is preferred.
- Cache hot config (prices, catalog, settings) in memory for ~20 seconds inside functions to save Firestore reads.
- Vercel Hobby cron runs once a day. For the Market Engine (section 8) use a lazy tick (any request that needs fresh data starts a run if the last one is older than 55 seconds, using a Firestore lease document) plus `/api/cron/engine` protected by `CRON_SECRET` so an outside scheduler can call it every minute.

### Environment variables (list all in `.env.example`)
`FIREBASE_SERVICE_ACCOUNT` (full JSON), `ADMIN_EMAILS`, `BOT_KEYS` (JSON `{ "bot-id": "bot-key" }`), `DARAJA_KEY`, `DARAJA_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_TILL`, `DARAJA_ENV` (`sandbox|live`), `PAYSTACK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `BREVO_KEY`, `MAIL_FROM`, `ANTHROPIC_KEY` (or `GEMINI_API_KEY`) for AI features, `CRON_SECRET`. Firebase **web** config goes in `VITE_FIREBASE_*` variables (public by design).

---

## 2. Design and usability rules (this is the main change from the old site)

The old site felt heavy: long fake loading screens, many menus, dark-only. Fix that.

- **No splash or boot animation.** The app opens straight to content. Use skeleton placeholders only while real data loads.
- **One accent colour** (calm blue). Green and red only for profit/loss and BUY/SELL.
- **Big, plain language.** Short sentences. Buttons say what they do ("Buy this bot", "Start trading", "Send payment code").
- **Header:** logo, theme toggle, account button (shows first name), wallet/balance chip when a Deriv account is connected. Back button on inner screens.
- **Navigation:** left sidebar on desktop; on phones a bottom bar with 4 to 5 items plus a menu sheet for the rest. Group the menu: *Bots*, *Trading tools*, *Forex*, *Account*. Highlight the current page.
- **Home** (after login): greeting, two big cards: **Binary / Deriv** and **Forex**. Under them "Continue where you left off" and "Your bots" (what the user owns, with an Open button).
- **Empty states** explain what to do next. **Errors** are human ("The payment code looks wrong. Copy the full M-Pesa message.").
- Locked items show a clear price, what is included, and one **Buy** button. Owned items show **Open**.
- Prices are shown in **KSh for Kenya** and in USD (with the local-currency estimate) for everyone else, decided by the visitor's country (Vercel `x-vercel-ip-country` header) and an admin-set USD rate.
- Accessibility: visible focus rings, 44px touch targets, labels on every input, `prefers-reduced-motion` respected.
- Email verification: after sign-up show a polite banner "Confirm your email" with **Resend** and **I've confirmed** buttons. Free trials require a verified email.

---

## 3. Accounts and login

- Firebase Auth: **email + password** and **Google sign-in**. Forgot-password link. Show Firebase errors in plain words.
- On the first API call create `users/{emailKey}` where `emailKey` is the normalised email (lower-case; for Gmail remove dots and `+tag`). **One person = one account per normalised email**: if another Firebase UID already owns that key, refuse with a clear message. This also stops repeat free trials.
- A blocked user gets a "This account is blocked, contact support on WhatsApp" message. Admin can block, unblock, force logout (store a `revokedAt` time and reject tokens issued before it) and delete (also delete the Firebase Auth user).

---

## 4. Customer features (match the old site, simplified UI)

### 4.1 Store and catalog
- Sections: **Deriv bots** (browser bots run inside the site on the user's own Deriv account), **Automated trading** (cloud-assisted runner), **Forex** (MT5 Expert Advisors and signals).
- Each bot: id, name, description, category tags, price (KES), status (live / soon), section, optional screenshots, "how to use" steps.
- Built-in catalog comes from `catalog.generated.js` in the zip. Admin can add, edit, hide and delete bots (section 9). Admin-added bots are stored in Firestore.
- **Bot files are encrypted** (see 5). The catalog is public; the **key** is only released to buyers.

### 4.2 Deriv connection
- Connect a Deriv account with Deriv's OAuth (App ID in config, redirect back to the site), read + trade scopes only. Show account type (demo/real), balance, and a clear **Switch to demo** prompt before first real use. Reuse `deriv-client.js` behaviour: public WebSocket for market data, authorised WebSocket for trading.
- Never store Deriv tokens on the server. Keep them in the browser session only.

### 4.3 Running bots in the browser (Automated / Auto-trade screen)
- Strategy runner with the **rules engine** from `rules-core.js` (triggers, contracts, stake, take-profit, stop-loss, martingale limits, max trades, cooldown). Keep the **same rule schema and validation** so existing bot files keep working.
- Live log panel, trade table (open and closed), profit/loss summary, **big Stop button**, and a "Stop all" safety on page close or disconnect.
- Presets from `PRESETS`; user can tweak stake and limits. Show a plain-language **summary of the rules** (`describeRules`) before starting.
- XML/JSON bot import where the old app supports it.

### 4.4 Market tools
- **Digit scanner** (`scanner-core.js`): live digit frequency bars per market, over/under, even/odd, matches/differs hints, ticks stream.
- **Charts** (TradingView embed or lightweight chart) and **Markets** list with live prices.
- **Trades**: the user's Deriv trade history and open positions.
- **Pocket Option** helper (`po-core.js`) if present in the zip: keep it.
- **News**: economic calendar with impact filter and today's events; tap an event for an **AI explanation** (what it is, which pairs it moves, how to be careful). Cache AI answers 6 hours in Firestore (`newsai/{eventId}`).

### 4.5 Forex: signals (paid, with one free trial)
- SMC/ICT scanner port from the worker (`analyze`, `scanAll`, pairs, timeframes, market-open check, news blackout): entry, stop loss, take profit, risk-to-reward, reason text, status (pending / active / hit TP / hit SL / expired).
- **One free signal per account** (state machine `none → pending → active → closed`) requiring verified email. After that a subscription is needed: signals price per period (`SUB_MS` in the worker).
- Signals screen: current signal card, history, win-rate stats, a "Scan now" button with a cooldown.

### 4.6 AI scanner (paid packs)
- Port `aiScan` and `AI_PACK`: scans markets and returns ranked ideas. Free first scan, then pack credits.
- Show the credits left and a **Buy pack** button.

### 4.7 MT5 robots (Expert Advisors) and the Broker page
- Forex robots are `.ex5` files sold as encrypted vault entries. After buying, the user gets a **robot key** (`EA-...`) from `POST /api/ea/control`.
- The robot (running in MetaTrader 5 on the user's PC/VPS) calls **`POST /api/ea/sync`** with `{key, login, server, balance, equity, open, today, mode, state, ver, symbol, pos[]}` and receives its settings: `{ok, run, mode, lot, ...}`. **Keep this request/response contract exactly as in `worker-v38.js`** because compiled robots depend on it. Add a note in the README that the robot's WebRequest URL must be changed to the new site URL and allowed in MT5 (Tools → Options → Expert Advisors → Allow WebRequest).
- **Broker / robot control page** (`GET /api/broker`, `POST /api/ea/control`): shows online/offline (online if last sync under ~3 minutes), account login, balance, equity, open positions, today's result, and lets the user change settings (run/pause, lot size, mode, risk limits, AI mode off/assist/auto). Settings reach the robot on its next poll. A status write must never overwrite settings changed a moment ago (re-read before write).
- Show step-by-step install help with screenshots from the zip.

### 4.8 Market Engine (AI analyser)
- Server-side engine ticking about every minute using Deriv's public WebSocket (try the four endpoints in `ENG_WS` in order). It produces signals for gold and selected markets, tracks wins/losses, keeps a heartbeat (`eng/hb`), and writes an hourly AI brief.
- Customer page: status (online/offline), live signals, track record, and the brief. Needs the **engine licence** (`engine` price). Owner can switch the engine on/off.
- Robots in AI mode read the latest engine decision through `ea/sync`.

### 4.9 Settings
- Theme (System / Light / Dark), account info, log out, "Clear this device", install-app button.

---

## 5. Buying, licences and encrypted bot files

- Bot files live in `public/vault/<bot-id>.json` as **encrypted entries**, produced by `vault-core.mjs` (PBKDF2 → AES-GCM, with a per-bot key and an owner-wrap). Keep that scheme and file format so existing vault files work.
- `GET /api/license/key?bot=<id>` returns the bot key **only** if the account owns the licence (or is admin). The browser then decrypts and runs the bot. Never ship keys in the front end.
- Admin-added bots (not in `public/vault`) are stored in Firestore `botentry/{id}` (limit ~900 KB per file because of Firestore's 1 MB document limit; show a clear error above that) and served by `GET /api/botfile?id=`.
- Licences: `licenses/{emailKey}` map of `botId → { at, via, ref }`, plus `subEnd` for signals, `engine`, and AI credits on the account document.

---

## 6. Payments (all must work)

Create an order first, then settle it. Orders are idempotent; the same payment reference can never unlock two orders.

1. **M-Pesa STK push (Daraja)** for Kenya: `POST /api/charge` sends the prompt to the user's phone (normalise `07…/01…/+254…` to `2547…`). `POST /api/daraja/cb` is the callback; `GET /api/status?ref=` lets the browser poll until paid. Sandbox/live switch by `DARAJA_ENV`. Verify amount and account reference before granting.
2. **Pochi la Biashara (manual)**: user sends money to the Pochi number, pastes the **full M-Pesa confirmation message**; the server parses the transaction code, amount and receiver (`parseMpesa` in the worker), rejects duplicates, and creates a **pending order** for the admin to approve (or auto-approves if the parsed amount and receiver match and auto-approve is switched on in settings).
3. **Paystack** (cards and mobile money) as in the worker.
4. **PayPal** (Orders API: create + capture, server side) for international users, and **USDT** (manual, with address/network from settings and the user's transaction id as proof).
5. Payment mode setting: `manual` (Pochi only), `both` (prompt or Pochi), `stk` (prompt only), controlled from the admin dashboard.
6. After a successful payment: grant the licence, mark the order approved, send an optional receipt email (Brevo), and let the buyer's open screen unlock instantly (poll or Firestore listener on a safe public order-status document).
7. Support contact: WhatsApp link and number from settings, shown on every payment dialog and error.

---

## 7. Server routes (keep these paths under `/api`)

Public: `GET config`, `prices`, `catalog`, `botfile`, `health`, `order/status`, `status`, `news/events`, `engine/public`.
Customer (need login): `GET me`, `GET license/key`, `POST order`, `POST charge`, `GET/POST signals`, `POST signals/scan`, `GET ai/status`, `POST ai/scan`, `POST news/analyze`, `GET broker`, `POST ea/control`, `GET engine/status`, `GET engine/signals`, `POST engine/mode`.
Robot (key based): `POST ea/sync`.
Callbacks: `POST daraja/cb`, PayPal capture, Paystack webhook (verify signature).
Admin only: `admin/orders`, `admin/approve`, `admin/clients`, `admin/client` (block, unblock, logout, delete), `admin/license` (grant, revoke), `admin/prices`, `admin/config`, `admin/bot` (add, edit, hide, delete), `admin/rules-ai`, `admin/stats`, `admin/export`, `engine/switch`, `cron/engine`.

Port the logic from `worker-v38.js` function by function. When you port a function, keep its name and comments so I can compare.

---

## 8. Data model (Firestore collections)

`users`, `accounts` (subscription, free-trial state, AI credits, revokedAt), `licenses`, `orders` (newest first via reversed-time id), `orderRefs` (duplicate guard for payment codes), `settings` (config, prices, catalog edits, hidden bots, payment mode, USD rate, rates), `botentry`, `eakeys` (robot key → email, bot, config, last status, login history), `signals`, `ai` (scan results and credits), `engine` (cfg, hb, sigs, brief, lease), `newsai`, `audit` (admin actions with who/when/what).
Document ids that contain `/` must be encoded. Never store secrets in documents. Use transactions where two requests could double-spend (grant licence, use free trial, consume AI credit).

---

## 9. ADMIN DASHBOARD (complete)

Route `/admin`, visible only to admins, with its own simple layout (sidebar on desktop, tabs on phone), light and dark themes, and big readable tables that turn into cards on phones. Every action asks for confirmation and writes an `audit` entry.

1. **Overview**: today / 7 days / 30 days revenue (KES and USD), new users, pending orders count, active subscriptions, engine status (online/offline, last tick), MT5 robots online, system health (Firebase, M-Pesa, PayPal, email, AI key, cron: green/red with what to fix). A simple revenue chart.
2. **Orders**: filter (pending / approved / rejected / all), search by name, phone, M-Pesa code, email. Each row: bot, amount, method, parsed M-Pesa message, status, time. Actions: **Approve**, **Reject (with reason)**, **Refund note**, **Open client**. Highlight mismatches (amount differs, receiver differs, duplicate code).
3. **Clients**: search, list, open a client page: details, bots owned, subscription end, AI credits, robot keys and last status, orders history, devices/last login. Actions: **Grant / revoke a bot**, **extend or end signals**, **add AI credits**, **Block / Unblock**, **Force logout**, **Delete**, **Add admin note**, **Reset free trial**.
4. **Bots and catalog**: list built-in and custom bots. Add or edit a bot (name, description, section, category, price, status, screenshots, how-to text, tags), **upload the encrypted bot file** (and set or rotate its key), hide/show, delete. Show file size and the 650 KB limit.
5. **Prices and currency**: edit every bot price, signals price per period, engine price, AI pack price, USD→KES rate, show-USD-for-foreign-visitors switch.
6. **Payments settings**: payment mode, Pochi number, WhatsApp number, PayPal email, USDT address and network, auto-approve rules, Daraja/Paystack status checks, a **test STK push** button.
7. **Robots (MT5)**: all robot keys, online/offline, account, balance, last sync, open positions; remote **pause/resume**, change lot cap, revoke a key.
8. **Signals and engine**: switch engine on/off, force a tick, view last heartbeat and errors, track record, free-trial usage, publish a **manual signal** that appears for subscribers, and the hourly AI brief with a regenerate button.
9. **Bot Studio (rules-AI)**: write rules in plain words, the AI (`admin/rules-ai`) returns validated rules JSON using `cleanRules`/`describeRules`, preview the summary, then save as a new bot or preset.
10. **Announcements**: a banner message shown to all users (info/warning), with start and end time.
11. **Audit log and export**: filterable list of admin actions; export clients and orders to CSV.
12. **Settings**: admin list (add/remove admin emails stored in `admins`), maintenance mode switch (shows a friendly page to customers, admin still works), and a "Logout everyone" button.

---

## 10. AI features

Use a server-side key only. Needed for: news explanation, hourly engine brief, Bot Studio rules-AI. Always validate AI output (JSON schema / `cleanRules`) before saving or showing. Cache results, rate-limit per user, and show a friendly message if the AI is unavailable. Never claim certainty; add a short risk note.

---

## 11. Security rules and safety

- `firestore.rules`: deny everything for clients (`allow read, write: if false;`). If some public live data is needed (for example the order-status document), expose only that document with read-only rules.
- Verify every ID token server-side; check `email_verified` for free trials.
- Validate and sanitise every input; limit body sizes; rate-limit order, charge and AI routes.
- Verify payment callbacks (Daraja callback shape, Paystack signature, PayPal capture status) and amounts server-side.
- Constant-time compare for robot and admin keys. Never log secrets or full tokens.
- Security headers in `vercel.json`. Service worker must **not** cache `/api/*`.
- Visible risk notice on every trading screen: trading is risky, bots do not guarantee profit, test on demo first.

---

## 12. PWA and performance

Web app manifest, icons, offline shell, install button. Lazy-load heavy screens (charts, scanner, admin). Keep the first load small. Use the existing images from the zip.

---

## 13. Acceptance checklist (I will test these)

- [ ] Sign up with email, confirm email, log in, log out, Google login, forgot password.
- [ ] Theme toggle works everywhere, persists, defaults to device setting, no unreadable text in either theme.
- [ ] Home shows Binary and Forex cards; every old feature is reachable in two taps from the menu.
- [ ] Buy a bot with Pochi message → pending → admin approves → bot unlocks and runs on a Deriv **demo** account.
- [ ] M-Pesa STK push (sandbox) unlocks the bot automatically; duplicate payment code is refused.
- [ ] PayPal sandbox purchase works for a non-Kenya visitor and prices show in USD.
- [ ] Free forex signal works once, then asks for a subscription.
- [ ] A test MT5 robot key can call `/api/ea/sync` and receives settings; changing settings on the Broker page reaches it; a robot status write does not undo them.
- [ ] Engine shows online and produces signals; admin can switch it off.
- [ ] Admin dashboard: every section in 9 works, non-admins get 403 and no admin link, every action appears in the audit log.
- [ ] `npm run build` succeeds, ZIP imports into Vercel, README setup works from scratch.

---

## 14. Build in these steps (finish and show me each before the next)

1. Project skeleton, Firebase client, Auth screens, theme system, layout (header, sidebar, bottom bar), PWA basics.
2. `/api` foundation: token check, Firestore helpers, config/prices/catalog/me routes, admin-email check, `firestore.rules`.
3. Catalog and store UI, vault decrypt (`vault-core`), licence key route, bot runner and rules engine, Deriv connection.
4. Payments: orders, Pochi parse and approval, STK push + callback, PayPal, Paystack, USDT.
5. Market tools: scanner, charts, markets, trades, news and AI explanation.
6. Forex: signals, AI scanner, MT5 robot control and `ea/sync`, Broker page.
7. Market Engine, lazy tick, cron route, hourly brief.
8. **Admin Dashboard** (all 12 sections).
9. Polish: empty states, error messages, accessibility, performance, README, `.env.example`, final checklist run-through.

After each step, list what is done, what is missing, and anything in the old code you could not port, so nothing is silently dropped.
