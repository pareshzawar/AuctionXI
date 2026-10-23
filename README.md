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
| 🎲 **Pools, random draw or chits** | Players are grouped by role (BAT / BOWL / AR / WK) and pool (Pool A = strongest, B, C…). Next player by a built-in random draw (pool by pool, or from one pool or role), or draw a chit in the hall and search by name, player number or both (e.g. `24 aadesh`). The stage profile picker and the phones' Players tab search the same way |
| 🎙️ **Live commentary** | In English, Hinglish or Marathi, written from the auction itself: player intros with pool, role and stats, opening bids, bidding wars, record prices, sales and squad progress. On the stage, phones and console; any device can read it aloud with the browser's own voice (free, no AI service). Keeps purses private |
| 🔐 **Private until you open it** | New auctions are private: only admins can see them while you set up. Then open them to anyone with the link, or list them on the home page so attendees tap to watch. Enforced by the database rules, not just hidden |
| 📊 **Offline Excel tracker** | One click downloads an Excel workbook laid out like the sheets organisers already use: Auction (player, winning team, sold price, status), Live Auction for the big screen, Find Player (type a name or a player number), Ranking Board, Teams Summary, Players and one sheet per team. It applies the tournament's rules as sales are typed (points left, still to buy, max bid) and flags wrong entries (below base, over max bid, not a valid bid step, squad full). Works with no app and no internet, in Excel or Google Sheets |
| 🗂️ **Past auctions as records** | *Add a past auction (record)* on the home page saves an earlier auction (an AuctionXI `auction.json`) as a finished, private auction with its squads, prices and photos, grouped under its tournament |
| 🎞️ **Offline slides** | One click downloads a PowerPoint of the auction: cover with your banner and logo, rules, bid steps, house rules, teams with captains, a clickable players list with player numbers and slide numbers (click a name, or type the slide number and press Enter in the slide show) and one slide per player with photo, stats and a small base-price tag. Squad slides are added once players are sold. Present it in manual mode with no app or internet |
| 🤖 **AI (optional, your own key)** | Free keys work: Google Gemini (AI Studio), Groq, OpenRouter's free models; also Claude or any OpenAI-compatible service. **AI commentary** for each player up, sold or unsold, shown on every screen and read aloud; **scouting notes** for every player from their stats (reviewed before saving); **Ask AI** in a captain's private workbook. The key stays only in that browser, never in the database or the repo |
| ⏳ **Waiting list and profiles** | Each player is in the auction, on the waiting list, or registration cancelled (CSV `list` column or the Players tab, also after locking, to bring in a replacement). From the control room the stage shows the players still up for auction, the waiting list, or one player's full profile, at any time; phones have both lists under Players |
| 🧪 **Mock auction** | One click in the control room makes a practice copy (same rules, teams, players, photos, its own codes). Run it end to end with the captains, reset it, run it again; the real auction is never touched |
| 🖼️ **Photos, logo and banner** | Upload each player's photo from a phone or laptop (one at a time, or many at once named `P001.jpg` / `Rohan Patil.jpg`), plus the league's logo and a banner or poster of any shape (never cropped). They appear on the stage, phones, player cards and results. Pictures are shrunk on the device (about 8 KB a photo) and kept in the free database, so no paid storage is needed. A `photo_url` column still works |
| 📓 **Captain's workbook** | Each captain and vice-captain gets a private **My workbook** tab. **My plan**: their targets in order with their max bid for each, what each buy leaves (points, still to buy, max bid after), what is left for the rest of the squad, a *what if I buy this player at this price* calculator, and, while a player is up, what winning at the next bid or at their max would leave and which targets would no longer fit. Also every player still available, a favourites list, *their own* max bid and note per player, a manual record of what other teams buy (with estimated purse left and max bid), and a scratch pad with a calculator. The BID button warns when the price passes their limit. Encrypted on the phone with their own PIN, so not even the admin can read it |
| 🎥 **Zoom / Google Meet** | Share the stage screen, with commentary and voice, in a video call for people who can't come. Step-by-step under *Access and sharing* |
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

**Guide for organisers and captains:** a slide deck covering every feature and how to use it, as [PDF](docs/guide/AuctionXI-Guide.pdf) and [PowerPoint](docs/guide/AuctionXI-Guide.pptx) ([docs/guide](docs/guide/README.md)).

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
| `teams_template.csv` | `id, name, short_name, color, captain, vice_captain, owner, logo_url`. Only `name` is required. Captain and vice-captain names are matched to the players list; anyone not in it is added and allotted to the team |
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
| `batting_hand` | no | `Right` or `Left` (also `R`, `L`, `RHB`, `LHB`) |
| `bowling_arm` | no | `Right` or `Left`; blank if the player doesn't bowl |
| `bowling_type` | no | `Fast`, `Medium-fast`, `Medium`, `Off-spin`, `Leg-spin` or `Spin` (shorthands like `RM`, `LS` work). Shown as e.g. *Right-arm medium* |
| `age`, `locality`, `matches`, `runs`, `wickets`, `notes` | no | Shown on the player card |
| `strike_rate`, `highest_score`, `economy` | no | Shown with matches, runs and wickets (e.g. from CricHeroes). `highest_score` may be `82*` |
| `cricheroes_url` | no | Link to the player's CricHeroes profile, shown on phones and the slides |
| `list` | no | `waiting` puts the player on the waiting list (not auctioned unless moved in); `cancelled` marks a registration as cancelled (kept on record, left out of the auction, the lists, the slides and the tracker). Blank = in the auction |
| `photo_url` | no | Direct image link. Google Drive share links are converted automatically (share as "Anyone with the link"). Easier: leave it blank and upload photos in *Players → Player photos* |
| `allotted_team`, `allotted_as` | no | Another way to set captains (the teams template is easier): the team ID and `C` or `VC`. They join that team when the auction starts, with the captain / vice-captain value (not taken from the purse), and are never auctioned |

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
js/commentary.js  live commentary (English, Hinglish, Marathi) and voice
js/workbook.js    the captain's private workbook; js/vault.js encrypts it; js/plan.js works out the budget plan
js/ai.js          optional AI with the user's own key (commentary, scouting notes, workbook advice)
js/tracker.js     the offline Excel tracker (vendor/exceljs.min.js builds it in the browser)
js/deck.js        the offline PowerPoint (vendor/pptxgen.bundle.js)
js/media.js       player photos, league logo and banner (shrunk on the device, stored at media/)
database.rules.json  Firebase security rules (who can write what)
css/tokens.css    design tokens (generated from design/tokens.json)
css/ds-components.css  design-system component styles
fonts/            Barlow, Barlow Condensed, Teko (SIL OFL)
design/           the design-system source: tokens.json and notes
templates/        setup questionnaire, player & team templates, sample data
archive/          permanently archived auctions
tournaments/      filled templates for real tournaments (e.g. tournaments/cpl)
docs/             setup, rules guide, auction-day checklist; docs/guide/ the organiser and captain guide (PDF, PowerPoint)
```

No build step and no npm. It's plain HTML, CSS and JavaScript modules, so anyone can fork it and change it.

## Use it for your own tournament

Anyone is welcome to use AuctionXI. Fork the repo, enable Pages, and add your own Firebase config. You don't need permission. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** if you'd like to send improvements back.

## License

[MIT](LICENSE). Free for personal, community and commercial use.
