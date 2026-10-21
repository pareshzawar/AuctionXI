# Archived auctions

Finished auctions live here permanently and are served by GitHub Pages.

1. Admin → Results → **Full auction JSON**.
2. Save it as `archive/<slug>/auction.json` (slug = lowercase-name-with-dashes).
3. Add an entry to `index.json`:

```json
{ "auctions": [ { "slug": "spl-2026", "name": "Society Premier League 2026", "date": "2026-11-15" } ] }
```

View it at `results.html?archive=<slug>`.
