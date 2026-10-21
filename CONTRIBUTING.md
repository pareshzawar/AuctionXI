# Contributing to AuctionXI

Thanks for helping! AuctionXI is meant to stay **simple enough for anyone to fork and run**.

## Principles

- **No build step.** Plain HTML, CSS and ES modules. Open `index.html` through any static server and it works.
- **Free forever.** Only use services with a permanent free tier (GitHub Pages, Firebase Spark).
- **Demo mode must keep working** with no configuration.
- **Security lives in `database.rules.json`.** If you add a write path, add a rule for it.

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000 - demo mode, data stays in your browser
```

Open the admin console and a captain/live view in two tabs of the same browser to test bidding.

Dev helpers (Node 20+, no install needed):

```bash
node tools/check.mjs               # rules engine, money format, questionnaire round-trip
node tools/generate-templates.mjs  # rebuild templates/ after changing js/csv.js
node tools/build-tokens.mjs        # rebuild css/tokens.css after updating design/tokens.json
```

## Code map

- `js/engine.js`: pure auction logic (increments, max bid, house-rule limits, reserves, pick order). Start here for rule changes.
- `js/csv.js`: CSV templates and the tournament setup questionnaire.
- `js/ds.js`: design-system components (see `design/README.md`). Follow the design system's content rules: no emoji, gold only for "now", words carry status.
- `js/actions.js`: every database write.
- `js/views.js`: shared HTML fragments.
- `js/admin.js`, `js/live.js`, `js/home.js`, `js/results.js`: one per page.

## Ideas welcome

Hammer sound (design system: off by default), RTM (right to match), per-role squad limits, multi-language UI, printable squad sheets, Google Sheets import. Open an issue first for big changes.
