# Setup: going live with Firebase (free)

Demo mode works without any setup, but only inside one browser. To let captains and the audience join from their own phones, connect a free Firebase project. It takes about 10 minutes and needs no credit card.

## 1. Host the site on GitHub Pages

The site is plain files, so GitHub Pages serves it directly. No build is needed.

1. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Branch **`main`**, folder **`/ (root)`** → **Save**.
3. After a minute the site is live at `https://<github-user>.github.io/<repo-name>/` (shown at the top of the Pages settings). Every push to `main` republishes it.

The repo must be **public** for free GitHub Pages (private repos need a paid plan).

### Your own domain (optional)

AuctionXI has no address built in: every link, QR code, poster and captain message is made from the address the page is open on, the QR codes are drawn in the browser, and the Firebase SDK is kept in `vendor/firebase`. So any address works, with nothing to change in the code: GitHub Pages with a custom domain, Netlify, Cloudflare Pages, Firebase Hosting, a school or office web server, or `python3 -m http.server` on a laptop.

For **GitHub Pages with your own domain** (e.g. `auction.myclub.in`):

1. At your domain registrar, add a DNS record: for a sub-domain a **CNAME** `auction` → `<github-user>.github.io`; for the bare domain four **A** records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
2. Repo **Settings → Pages → Custom domain**: type `auction.myclub.in` → **Save** (GitHub adds a `CNAME` file to the repo). When the check passes, tick **Enforce HTTPS**.
3. Firebase console → **Authentication → Settings → Authorized domains → Add domain**: `auction.myclub.in`, so *Sign in with Google* works there (step 4 below).

Optional settings in [`js/config.js`](../js/config.js):

- `siteUrl`: leave `''` (recommended). Set it, e.g. `'https://auction.myclub.in/'`, only if organisers open the console from one address (a laptop, a preview link) but join links and QR codes must always send people to another.
- `projectUrl`: where the *guide* and *source code* links on the home page go. Point it at your fork, or set `''` to hide them.

## 2. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics not needed).
2. You start on the **Spark (free)** plan. Don't upgrade; nothing here needs it.

## 3. Realtime Database

1. **Build → Realtime Database → Create database**. Pick the location closest to you (e.g. `asia-southeast1` for India) and start in **locked mode**.
2. Open the **Rules** tab, replace everything with the contents of [`database.rules.json`](../database.rules.json), and click **Publish**.

## 4. Authentication

1. **Build → Authentication → Get started**.
2. **Sign-in method:** enable **Anonymous** (captains, audience) and **Google** (admins, optional but recommended).
3. **Settings → Authorized domains → Add domain:** `<github-user>.github.io` (and your own domain, if you use one).

## 5. Connect the app (the "Firebase config")

**What it is.** When you register a web app, Firebase gives you a small block of settings called the *Firebase config*. It's the address of your project, like a postal address that tells the AuctionXI website which database to talk to. It is **not a password**. Google designs it to be visible in every visitor's browser, which is why it's safe to commit to a public repo. What keeps your data safe is the **database rules** you published in step 3: they decide who may write what (only admins change the auction, only a captain with the right code bids for their team, and so on).

**Without it** the app runs in demo mode: everything stays inside one browser, so captains' phones can't join.
**With it** every phone, laptop and the projector share the same live auction.

1. **Project settings (⚙) → General → Your apps → Web (`</>`)**, give it a nickname such as `auctionxi` and register it (leave "Firebase Hosting" unticked; GitHub Pages hosts the site).
2. Firebase shows a `firebaseConfig = { … }` block. Copy it into [`js/config.js`](../js/config.js). The easiest way is on github.com: open `js/config.js` → pencil icon (Edit) → replace `export const firebaseConfig = null;` with the block → **Commit changes**:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "my-auction.firebaseapp.com",
  databaseURL: "https://my-auction-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "my-auction",
  appId: "1:...:web:...",
};
```

Make sure `databaseURL` is included. If it is missing, copy it from the Realtime Database page.

3. Wait a minute for the *Deploy to GitHub Pages* action to finish, then reload the site. The badge in the header changes from **Demo mode** to **Connected**.

Each person who forks AuctionXI puts their **own** Firebase config in their fork, so every organiser's data lives in their own free Firebase project.

> The web config is not a password. It is designed to be public. Your data is protected by the database rules from step 3.

## Free-plan limits (Spark)

| Limit | Value | What it means for an auction |
|---|---|---|
| Simultaneous connections | 100 | Admin + captains + ~80 phones. For a bigger crowd, put the **Big screen** view on a projector or screen-share it on YouTube/Meet |
| Storage | 1 GB | Thousands of auctions |
| Download | 10 GB / month | Plenty for a few auctions per month |

## Several auctions at once: Draft and Ready

An organiser can create as many auctions as they like (home page → *Create a new auction*, or **New auction** at the top of any admin console). Each has its own code, admin console, captains' codes and status, so a men's, ladies' and juniors' auction can be set up side by side, or run on the same evening on different screens.

Each auction moves through four stages, shown on the home page and in the admin console:

| Stage | Meaning |
|---|---|
| **Draft** | Every new auction. Change the setup, teams and players freely; *Save as draft* keeps each change. |
| **Ready** | *Save and lock details* (Setup tab): the setup, teams and player list are final and can't be changed by accident. Photos, banners, past seasons and small player fixes (*Edit* in Players) still work. **Unlock (back to draft)** reopens everything until the auction starts. |
| **Live** | After *Start auction*. |
| **Completed** | After *End auction*. |

## 6. Who can create auctions (approved organisers)

Only Google accounts on the organisers list can create auctions (new, mock, mini, or a past record). Everyone else can still watch, join with a code and bid. The database rules enforce this.

1. Publish `database.rules.json` (Realtime Database → Rules → paste → Publish).
2. Open the site, **Sign in with Google** in *Create a new auction* and press **Become the site owner**. Do this straight away: the first person to claim the site owns it. After that nobody else can claim it.
3. An **Organisers** card appears on the home page: add each committee member's Gmail. Tick *Also a site owner* for anyone who should be able to add others.
4. They sign in with that Gmail on the home page and can create auctions. Removing someone stops new auctions but leaves the ones they made.

Auctions made before the list existed keep working for their owners. If you ever lose the owner account, add yourself in the Firebase console: Realtime Database → Data → `siteOwners` → key = your email in lower case with every `.` as `,` (e.g. `name,surname@gmail,com`), value `true`.

## Who can do what (enforced by `database.rules.json`)

| Role | How they prove it | Can |
|---|---|---|
| Site owner | Google account in `siteOwners/` | Adds and removes organisers (home page) |
| Organiser | Google account in `organisers/` | Creates auctions (and becomes their owner) |
| Owner | Device/Google account that created the auction | Everything in that auction |
| Co-admin | Admin code | Everything except removing other co-admins |
| Captain / vice-captain | Their own code (6 characters; vice-captains only when the tournament lets them bid) | See their team's remaining purse and max bid, and place bids for their own team only, within purse, only while bidding is open and the bid mode is not "Room only"; never above their max bid or the per-player cap. Read and write their own encrypted workbook (`notes/`); nobody else can, admins included |
| Team member / audience / big screen | Nothing | Read only: the auction, squads and rules, but not remaining purses (unless the tournament shows them to everyone). Nothing at all while the auction is **Private** |

Secret codes are stored in a separate `secrets/` area that only admins can read.

**Private auctions.** New auctions start private: the database refuses to send anything but the auction's name to anyone except its admins. Open it in *Access and sharing* when you're ready (anyone with the link or code), or list it on the home page (`directory/` holds just the name, date and status of listed auctions). The Firebase config in this public repo gives no access by itself; these rules decide what anyone can read. Player photos and the league logo and banner live in `media/`: everyone can see them, only admins can change them. They take about 8 KB a photo, well inside the free plan.

## Housekeeping

- Old auctions can be deleted in the Firebase console (Realtime Database → Data → `auctions/<code>`, `secrets/<code>`, `captains/<code>`, `coadmins/<code>`, `media/<code>`, `notes/<code>`). Archive the JSON in the repo first.
- To start completely fresh, create a new auction. Each auction is independent and has its own locked player list.
