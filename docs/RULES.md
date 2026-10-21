# Setting your auction rules

Every auction has its own rules (Admin → **1. Setup & rules**). Agree on them with the captains **before** auction day and share this page or a screenshot.

## The settings

| Setting | What it does | Typical value |
|---|---|---|
| **Currency / unit** | `₹`, `$`, `pts`, `credits`. Most society auctions use virtual points | `pts` |
| **Purse per team** | Total budget each team starts with | 10,000 |
| **Minimum squad** | Players each team must end with | 11 (or the team size you play) |
| **Maximum squad** | No more bids once a team is full | 13–15 |
| **Categories & base prices** | Groups of players with a starting price. Category order is the order they come up | Icon 1000 / Gold 500 / Silver 300 / Bronze 100 |
| **Bid increments** | How much each bid raises the price, by slab | +100 below 1000, +250 below 5000, +500 above |
| **Bid timer** | Countdown that resets on every bid. When it hits 0 the auctioneer says SOLD | 20–30 s (0 = off) |
| **Pick order** | Category-by-category random (most common), in ID order, fully random, or manual | Category random |
| **Re-auction rounds** | How many times unsold players come back | 1–2 |
| **Captains can bid from phones** | Off = captains raise paddles and the auctioneer clicks the team's button | On |

## How the max bid works

A team must always be able to complete its minimum squad, so:

```
max bid = purse left − (players still needed after this one × lowest base price)
```

Example: purse 10,000, min squad 11, lowest base 100, team has 4 players and 6,000 left.
They need 6 more after this one → 6 × 100 = 600 reserved → **max bid 5,400**.

The app greys out bid buttons above this amount, and the Firebase rules reject such bids.

## Recommended presets

**Small (friends / family, 4 teams, 8-a-side, ~40 players)**
purse 5,000 · min 8 · max 10 · Icon 500 / Regular 100 · +50 below 500, +100 above · timer 20 s

**Society league (6–8 teams, 11-a-side, 80–120 players)**
purse 10,000 · min 11 · max 15 · Icon 1000 / Gold 500 / Silver 300 / Bronze 100 · default increments · timer 30 s · 2 unsold rounds

**Box cricket (6-a-side)**
purse 3,000 · min 6 · max 8 · two categories · timer 15 s

## Common house rules (handled outside the app)

These vary by group. Write the ones you use into your WhatsApp announcement:

- **Captains / owners retained**: put the team ID in `retained_by` (price `0`, or a fixed amount deducted from the purse).
- **Unsold at the end**: distributed by lottery to teams below minimum squad, at base price.
- **Gender / age categories** (e.g. at least 2 juniors, 1 women player): create a category for them, and agree that captains must buy at least N from it.
- **Max players per wing / tower**: agreed verbally, checked by the auctioneer.
- **Bid only when it's your turn / no bids after "SOLD"**: the auctioneer's decision is final. Admins can undo the last sale.
- **Ties** (two captains tap at the same moment): the app accepts the first bid to reach the server, and the other captain sees "Bid was beaten".

## Auctioneer controls

| Key | Action |
|---|---|
| `N` | Next player |
| `S` | SOLD to the highest bidder |
| `U` | Unsold |

Also available: pick a specific player, bid on behalf of a team, reset bid to base, undo last sale, start the next round, finish the auction.
