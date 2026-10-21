# 🏏 AuctionXI

**Free, open-source live player auctions for cricket tournaments run by housing societies, families and groups of friends.**

The admin uploads players from a CSV template, sets the rules (purse, squad size, base prices, bid increments, timer) and runs the auction from a control room. Captains bid from their phones, and everyone else watches live on their phone or on a projector. Results stay online permanently.

> **Live app:** `https://pareshzawar.github.io/AuctionXI/` (after you enable GitHub Pages, see below)
> **Try it with no setup:** open the app, create an auction, click **Players → Load sample data**, and open the captain view in a second tab.

---

## Features

| | |
|---|---|
| 🧑‍⚖️ **Roles** | Admin (creator), co-admin/auctioneer (admin code), captain/owner (secret team code), team member, audience, big screen |
| 📄 **CSV templates** | Download the player and team templates, fill them in Excel or Google Sheets, upload. Validates roles, categories, duplicate IDs |
| ✏️ **Edit everything** | Edit players and teams inline, add or delete them, bulk-edit by export → spreadsheet → re-upload |
| 🔒 **Lock per auction** | Lock the player list for an auction. Every new auction gets its own fresh upload |
| ⚙️ **Your rules** | Purse, min/max squad, categories with base prices, increment slabs, bid timer, pick order, unsold re-auction rounds |
| 🛡️ **Purse protection** | A team can't bid more than it needs to keep for a minimum squad. The database rules enforce this too |
| 📱 **Bid from phones** | Captains get one big **BID** button. Or switch it off and let the auctioneer enter paddle bids |
| 🎯 **Retained players** | Pre-assign captains/icons to teams at a fixed price (`retained_by` column) |
| 📺 **Big-screen mode** | Projector view with a SOLD! animation |
| 🔁 **Unsold rounds, undo** | Re-auction unsold players, undo the last sale, keyboard shortcuts (N / S / U) |
| 📦 **Permanent archive** | Export the results as JSON and commit them to `archive/`. GitHub Pages serves them for free, permanently |

## Where things live (all free)

| What | Where | Why |
|---|---|---|
| **App (website)** | **GitHub Pages** | Free hosting with no expiry, HTTPS, custom domain optional |
| **Live auction data** | **Firebase Realtime Database, Spark (free) plan** | Real-time sync to every phone, no credit card, no expiry, 1 GB storage, 100 simultaneous connections |
| **Logins** | **Firebase Auth** (Google sign-in + anonymous) | Free. Captains need no account, just a team code |
| **Finished auctions** | **This repo** (`archive/<name>/auction.json`) | Version-controlled, free forever, viewable at `results.html?archive=<name>` even if Firebase is deleted |
| **Player sheets** | Your own Google Sheet / Excel → CSV | You keep the master copy |

Without Firebase configured, the app runs in **demo mode**: data is stored only in the current browser. That's good for trying it out or for a single-laptop auction on a projector where the auctioneer enters every bid.

## Quick start

1. **Fork** this repo (or use it directly if you're the owner).
2. **Settings → Pages →** Source: **GitHub Actions**. The included workflow publishes the site on every push to `main`.
3. Open `https://<your-user>.github.io/AuctionXI/` to use it in demo mode immediately.
4. To let captains bid from their own phones: follow **[docs/SETUP.md](docs/SETUP.md)** (about 10 minutes: create a Firebase project, paste the config into `js/config.js`, publish `database.rules.json`).

Running locally: any static server works, e.g. `python3 -m http.server` → http://localhost:8000.

## Running an auction

1. **Create** an auction on the home page. Save the **admin code** shown under *Access & sharing*.
2. **Setup & rules:** purse, squad sizes, categories and base prices, increments, timer. See **[docs/RULES.md](docs/RULES.md)** for recommended rules by tournament size.
3. **Teams:** add them or upload `templates/teams_template.csv`.
4. **Players:** download the template, fill it in, upload, review, **Lock**.
5. **Access & sharing:** share the QR code or join link. Send each captain *only* their own code (there's a "Copy message" button for WhatsApp).
6. **Control room:** Start → Next player → bids come in → SOLD / Unsold. Open **Big screen** on the projector.
7. **Results:** download the CSV/JSON and archive it (see below).

The full day-of checklist is in **[docs/AUCTION_DAY.md](docs/AUCTION_DAY.md)**.

## CSV templates

`templates/players_template.csv`

| column | required | notes |
|---|---|---|
| `id` | no | e.g. `P001`. Auto-generated if empty or duplicate |
| `name` | **yes** | |
| `role` | no | `Batsman`, `Bowler`, `All-rounder`, `Wicket-keeper` (also accepts `bat`, `bowl`, `ar`, `wk`) |
| `category` | no | Category ID or label from your rules (`A`/`Icon`, ...). Defaults to the last category |
| `base_price` | no | Overrides the category base price |
| `batting_style`, `bowling_style`, `age`, `locality`, `matches`, `runs`, `wickets`, `notes` | no | Shown on the player card |
| `photo_url` | no | Direct image link. Google Drive share links are converted automatically (file must be shared "Anyone with the link") |
| `retained_by`, `retained_price` | no | Team ID and price. The player joins that team when the auction starts |

`templates/teams_template.csv`: `id, name, short_name, color, owner, captain, logo_url`

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
js/engine.js      auction rules (increments, max bid, pick order)
js/actions.js     database writes (bid, sell, undo, rounds…)
database.rules.json  Firebase security rules (who can write what)
templates/        CSV templates + sample data
archive/          permanently archived auctions
docs/             setup, rules guide, auction-day checklist
```

No build step and no npm. It's plain HTML, CSS and JavaScript modules, so anyone can fork it and change it.

## Use it for your own tournament

Anyone is welcome to use AuctionXI. Fork the repo, enable Pages, and add your own Firebase config. You don't need permission. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** if you'd like to send improvements back.

## License

[MIT](LICENSE). Free for personal, community and commercial use.
