# 🏏 AuctionXI

**Free, open-source live player auctions for cricket tournaments run by housing societies, families and groups of friends.**

The admin uploads players from a CSV template, sets the rules (purse, squad size, base prices, bid increments, timer) and runs the auction from a control room. Captains bid from their phones, and everyone else watches live on their phone or on a projector. Results stay online permanently.

> **Live app:** `https://pareshzawar.github.io/AuctionXI/` (after you enable GitHub Pages, see below)
> **Try it with no setup:** open the app, create an auction, click **Players → Load sample data**, and open the captain view in a second tab.

---

## Features

| | |
|---|---|
| 🧑‍⚖️ **Roles** | Admin (creator), co-admin/auctioneer (admin code), captain and vice-captain (each with a secret code), team member, audience, stage screen |
| 📋 **Setup questionnaire** | One CSV covers each tournament's format, squad size, purse, captain/VC values, who bids, who sees purses, base price, increments, bid mode **and house rules**. Fill it in, upload it, and reuse it next season |
| 📄 **Player & team templates** | Fill them in Excel or Google Sheets, upload. Amounts can be written `5L`, `1Cr`, `5,00,000` |
| ✏️ **Edit everything** | Inline editing, add/delete, or bulk-edit by export → spreadsheet → re-upload |
| 🔒 **Lock per auction** | Lock the player list for an auction. Every new auction gets its own fresh upload |
| 🧢 **Captain & vice-captain** | Allotted to their team before the auction with a value (e.g. ₹200 / ₹150) that is *not* taken from the purse. It's their budget for next season's mini auction if they're unavailable. Captain-only tournaments too. Choose whether only the captain or both can bid |
| 🪑 **Squad size with reserves** | E.g. 8-a-side with squads of 10: every team must buy exactly 10. Max bid = purse left − (players still to buy − 1) × base price |
| 🎲 **Pools, random draw or chits** | Players are grouped by role (BAT / BOWL / AR / WK) and pool (Pool A = strongest, B, C…). Next player by a built-in random draw (pool by pool, or from one pool or role), or draw a chit in the hall and search the name |
| 🎙️ **Live commentary** | In English, Hinglish or Marathi, written from the auction itself: player intros with pool, role and stats, opening bids, bidding wars, record prices, sales and squad progress. On the stage, phones and console; any device can read it aloud with the browser's own voice (free, no AI service). Keeps purses private |
| 🔁 **Mini auction next season** | Tick who each team keeps; budget = remaining purse + value of released players (C/VC value or price paid). Kept players start in their team; released and new players go into the pool |
| 🙈 **Private purses** | Remaining purse and max bid are shown only to each team's captain/VC and the admins (or all bidders, or everyone, as you choose) |
| 🛡️ **House rules** | Shown to everyone on a Rules tab. Number rules are enforced: role minimums (e.g. 1 WK), category min/max, per-player price cap. The database rules check them too |
| 📱 **Phones, paddles or both** | Captains get one big **BID** button. If they struggle, switch to *Room only*: the auctioneer records paddle bids, or just enters the winning team and final amount |
| 💰 **Virtual ₹** | ₹50, ₹1,000, or IPL-style ₹10 L / ₹1.25 Cr (or points) |
| 📺 **Stage screen** | Fixed 1920×1080 projector layout with lot counter, purses, ticker and SOLD stamp |
| 🔁 **Rounds, undo** | Re-auction unsold players, undo last bid, reverse last sale, keyboard shortcuts |
| 📦 **Permanent archive** | Export results as JSON into `archive/`. GitHub Pages serves them permanently |
| 🎨 **Design system** | Built on the AuctionXI design system from Claude Design: tokens, Barlow fonts, components (see `design/`) |

## Where things live (all free)

| What | Where | Why |
|---|---|---|
| **App (website)** | **GitHub Pages** | Free hosting with no expiry, HTTPS, custom domain optional |
| **Live auction data** | **Firebase Realtime Database, Spark (free) plan** | Real-time sync to every phone, no credit card, no expiry, 1 GB storage, 100 simultaneous connections |
| **Logins** | **Firebase Auth** (Google sign-in + anonymous) | Free. Captains need no account, just a team code |
| **Finished auctions** | **This repo** (`archive/<name>/auction.json`) | Version-controlled, free forever, viewable at `results.html?archive=<name>` even if Firebase is deleted |
| **Player sheets** | Your own Google Sheet / Excel → CSV | You keep the master copy |

**The Firebase config, in one sentence:** it's the "address" of your free database that you paste into `js/config.js`, so every phone talks to the same auction. It isn't a password, and the database rules keep the data safe. Step-by-step: [docs/SETUP.md](docs/SETUP.md#5-connect-the-app-the-firebase-config).

Without Firebase configured, the app runs in **demo mode**: data is stored only in the current browser. That's good for trying it out or for a single-laptop auction on a projector where the auctioneer enters every bid.

## Quick start

1. **Fork** this repo (or use it directly if you're the owner).
2. **Settings → Pages →** Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. Every push to `main` republishes the site.
3. Open `https://<your-user>.github.io/AuctionXI/` to use it in demo mode immediately.
4. To let captains bid from their own phones: follow **[docs/SETUP.md](docs/SETUP.md)** (about 10 minutes: create a Firebase project, paste the config into `js/config.js`, publish `database.rules.json`).

Running locally: any static server works, e.g. `python3 -m http.server` → http://localhost:8000.

## Running an auction

1. **Create** an auction on the home page. Save the **admin code** shown under *Access & sharing*.
2. **Setup and rules:** upload your filled **setup questionnaire** (or use the form). See **[docs/RULES.md](docs/RULES.md)** for house rules and presets.
3. **Teams:** add them or upload `templates/teams_template.csv`.
4. **Players:** download the template, fill it in (mark each team's captain and vice-captain with `allotted_team` + `allotted_as`), upload, review, **Lock**.
5. **Access and sharing:** share the QR code or join link. Send each captain (and vice-captain) *only* their own code; there are "Copy message" buttons for WhatsApp.
6. **Control room:** Start → Next player → bids come in → Mark sold / Unsold. Open the **stage screen** on the projector. If phones don't work out, switch to *Room only* and enter paddle results.
7. **Results:** download the CSV/JSON and archive it (see below). Next season, create the **mini auction** from here.

The full day-of checklist is in **[docs/AUCTION_DAY.md](docs/AUCTION_DAY.md)**.

## Tournaments, seasons, major and mini auctions

One site and one Firebase project serve all your tournaments, e.g. a society league and a friends' tournament.

- **Tournament**: type the same name every season (the home page suggests the names you've used). Auctions are grouped by tournament under *My tournaments and auctions*, newest season first.
- **Season**: e.g. `2026`. Shown on the stage, phones and results.
- **Major auction**: a fresh player list. Optionally **copy rules, house rules and teams** from an earlier auction (usually last season's), then upload this season's players. New captain / vice-captain codes are made.
- **Mini auction**: choose **which auction it is based on** (any earlier major or mini auction of that tournament). You're taken to that auction's keep/release list: tick who each team keeps; each team's budget = remaining purse + value of the players it releases. Released, unsold and new players go into the pool.

A typical year: *Society Premier League 2026* (major) → *2027* (mini, based on 2026) → *2028* (major, rules copied from 2027); and separately *Friends Cup 2026* (major) → *2027* (major, rules copied). Keep each tournament's filled setup questionnaire too, so you can re-upload it any time.

## Templates

All in [`templates/`](templates), also downloadable from the home page and admin console. CSVs open in Excel or Google Sheets. Amounts can be `500000`, `5,00,000`, `5L` or `1Cr`.

| File | What it's for |
|---|---|
| `tournament_setup_template.csv` | **The setup questionnaire**: tournament details, players per side and squad size, purse, captain/VC values, who bids, who sees purses, base price, role minimums, bid increments, bid mode, timer, and house-rule questions. Fill in the `answer` column. Guide: **[docs/RULES.md](docs/RULES.md)** |
| `sample_tournament_setup.csv` | A filled example: 8-a-side, squads of 10, purse ₹1,000, C value ₹200, VC value ₹150, base ₹50, house rules |
| `teams_template.csv` | `id, name, short_name, color, owner, logo_url` |
| `players_template.csv` | One row per player (columns below) |
| `sample_*.csv` | Demo data used by *Load sample data* |

Players columns:

| column | required | notes |
|---|---|---|
| `id` | no | e.g. `P001`. Auto-generated if empty or duplicate |
| `name` | **yes** | |
| `role` | no | `Batter`, `Bowler`, `All-rounder`, `Wicket-keeper` (also accepts `bat`, `bowl`, `ar`, `wk`) |
| `pool` | no | The player's pool: `A`, `B`, `C`… or `Pool A`. Pool A = the strongest players; the admin decides. Defaults to the last pool (older files with a `category` column still work) |
| `base_price` | no | Overrides the category base price |
| `batting_style`, `bowling_style`, `age`, `locality`, `matches`, `runs`, `wickets`, `notes` | no | Shown on the player card |
| `photo_url` | no | Direct image link. Google Drive share links are converted automatically (share as "Anyone with the link") |
| `allotted_team`, `allotted_as` | no | For each team's captain and vice-captain: the team ID and `C` or `VC`. They join that team when the auction starts, with the captain / vice-captain value (not taken from the purse), and are never auctioned |

> ⚠️ Auction data is publicly readable by anyone with the auction code. **Do not put phone numbers or other private data in the CSV.**

## Archiving results permanently

1. Admin → **Results → Full auction JSON**.
2. Add the file to the repo as `archive/<slug>/auction.json` (GitHub web UI: *Add file → Upload files*).
3. Add `{ "slug": "<slug>", "name": "...", "date": "2026-11-15" }` to `archive/index.json`.
4. It appears under **Past auctions** on the home page and at `results.html?archive=<slug>`.

## Project layout

```
index.html        home: join / create / my auctions / archive
admin.html        admin console (setup, teams, players, access, control room, results)
live.html         live view for audience, team members, captains (?screen=1 for projector)
results.html      squads & results (live or ?archive=slug)
js/config.js      ← paste your Firebase config here
js/db.js          Firebase / local-demo storage backend
js/engine.js      auction rules (increments, max bid, house-rule limits, reserves, pick order)
js/ds.js          design-system components as HTML (same markup as the Claude Design bundle)
js/views.js       screen sections built from those components
js/actions.js     database writes (bid, sell, undo, rounds…)
database.rules.json  Firebase security rules (who can write what)
css/tokens.css    design tokens (generated from design/tokens.json)
css/ds-components.css  design-system component styles
fonts/            Barlow, Barlow Condensed, Teko (SIL OFL)
design/           the design-system source: tokens.json and notes
templates/        setup questionnaire, player & team templates, sample data
archive/          permanently archived auctions
docs/             setup, rules guide, auction-day checklist
```

No build step and no npm. It's plain HTML, CSS and JavaScript modules, so anyone can fork it and change it.

## Use it for your own tournament

Anyone is welcome to use AuctionXI. Fork the repo, enable Pages, and add your own Firebase config. You don't need permission. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** if you'd like to send improvements back.

## License

[MIT](LICENSE). Free for personal, community and commercial use.
