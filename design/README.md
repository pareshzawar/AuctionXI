# Design system

AuctionXI's look comes from the **AuctionXI design system** made in Claude Design. It covers the colour tokens (night/day), the type scale (Barlow Condensed for names and numbers, Barlow for text, Teko for ₹ and Devanagari), spacing, radii, the content rules, and 17 components (PlayerCard, BidPanel, BidButton, TeamPurse, SoldStamp, SalesTicker, …).

How the repo uses it, without React or a build step:

| Repo file | From the design system |
|---|---|
| `design/tokens.json` | `tokens.json`, copied as is (source of truth) |
| `css/tokens.css` | Generated from `design/tokens.json`: CSS variables, night theme by default, day theme when the device is in light mode; the stage always forces night |
| `css/ds-components.css` | `components/bundle.css`, copied as is (`ax-*` classes) |
| `js/ds.js` | The bundle's components re-written as functions that return HTML with the same markup and classes |
| `fonts/` | The design system's font files (SIL Open Font License, see `fonts/LICENSE-OFL.txt`) |

To update after the design system changes: copy the new `tokens.json` here and the new `bundle.css` to `css/ds-components.css`, run `node tools/build-tokens.mjs` to regenerate `css/tokens.css`, and port any markup change into `js/ds.js`.

Content rules the code follows (from the design system's brand book):

- **Gold means "now"**: current bid, leading team, primary action, focus. Nothing else.
- **Words carry status, colour confirms**: SOLD, UNSOLD, LIVE, RETAINED, LEADING are always written.
- **Terse, like a scoreboard**: no emoji or exclamation marks in the app. Buttons are verbs ("Mark sold", "Next player").
- **Money**: ₹4.2 L, ₹1.25 Cr, ₹50,000 (two decimals at most); points as "2,400 pts".
- **Errors say what happened and what to do**: "Over your max bid of ₹30 L. Keep ₹10 L for 5 more players."
