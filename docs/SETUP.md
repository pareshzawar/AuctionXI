# Setup: going live with Firebase (free)

Demo mode works without any setup, but only inside one browser. To let captains and the audience join from their own phones, connect a free Firebase project. It takes about 10 minutes and needs no credit card.

## 1. Host the site on GitHub Pages

1. Fork this repo (or use your own copy).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push any commit to `main` (or run the *Deploy to GitHub Pages* workflow manually).
4. Your site: `https://<github-user>.github.io/<repo-name>/`

## 2. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics not needed).
2. You start on the **Spark (free)** plan. Don't upgrade; nothing here needs it.

## 3. Realtime Database

1. **Build → Realtime Database → Create database**. Pick the location closest to you (e.g. `asia-southeast1` for India) and start in **locked mode**.
2. Open the **Rules** tab, replace everything with the contents of [`database.rules.json`](../database.rules.json), and click **Publish**.

## 4. Authentication

1. **Build → Authentication → Get started**.
2. **Sign-in method:** enable **Anonymous** (captains, audience) and **Google** (admins, optional but recommended).
3. **Settings → Authorized domains → Add domain:** `<github-user>.github.io`.

## 5. Connect the app

1. **Project settings (⚙) → General → Your apps → Web (`</>`)**, register an app (no Hosting needed).
2. Copy the `firebaseConfig` object into [`js/config.js`](../js/config.js):

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

3. Commit and push. The header badge should now say **Live · Firebase**.

> The web config is not a password. It is designed to be public. Your data is protected by the database rules from step 3.

## Free-plan limits (Spark)

| Limit | Value | What it means for an auction |
|---|---|---|
| Simultaneous connections | 100 | Admin + captains + ~80 phones. For a bigger crowd, put the **Big screen** view on a projector or screen-share it on YouTube/Meet |
| Storage | 1 GB | Thousands of auctions |
| Download | 10 GB / month | Plenty for a few auctions per month |

## Who can do what (enforced by `database.rules.json`)

| Role | How they prove it | Can |
|---|---|---|
| Owner | Device/Google account that created the auction | Everything |
| Co-admin | Admin code | Everything except removing other co-admins |
| Captain | Team code (6 characters) | Place bids for their own team only, within purse, only while bidding is open and "captains can bid" is on |
| Team member / audience / big screen | Nothing | Read only |

Secret codes are stored in a separate `secrets/` area that only admins can read.

## Housekeeping

- Old auctions can be deleted in the Firebase console (Realtime Database → Data → `auctions/<code>`, `secrets/<code>`, `captains/<code>`, `coadmins/<code>`). Archive the JSON in the repo first.
- To start completely fresh, create a new auction. Each auction is independent and has its own locked player list.
