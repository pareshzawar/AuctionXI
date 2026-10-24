# Archived auctions

Finished auctions live here permanently and are served by GitHub Pages, even after the live
database is cleaned up. There is no limit: keep every season, major and mini, side by side.

1. Admin → Results → **Download the 2 archive files** (`auction.json` and `index.json`).
2. Save `auction.json` as `archive/<slug>/auction.json` (the Results tab shows the slug, e.g. `spl-2026`).
3. Replace `index.json` with the downloaded one. It already lists the auctions archived before plus
   the new one, newest first. Archiving the same auction again updates its entry.

```json
{ "auctions": [
  { "slug": "spl-2027", "name": "SPL 2027 player auction", "tournament": "SPL", "season": "2027", "date": "2027-11-14" },
  { "slug": "spl-2026", "name": "SPL 2026 player auction", "tournament": "SPL", "season": "2026", "date": "2026-11-15" }
] }
```

View one at `results.html?archive=<slug>`; the home page lists them all under *Past auctions*.

The archive is public. Player photos are left out. Don't archive a tournament whose details must stay
private: add it as a private past auction instead (home page → *Add a past auction (record)*).
