# Setting your auction rules

Every tournament runs differently, so every auction carries its own rules. You set them in one of two ways:

1. **The setup questionnaire (recommended).** Download `templates/tournament_setup_template.csv` (or, from Admin → Setup, a copy pre-filled with that auction's current answers). Fill in the **answer** column with your committee in Excel or Google Sheets, then upload it under Admin → Setup → *Upload filled questionnaire*. [`templates/sample_tournament_setup.csv`](../templates/sample_tournament_setup.csv) is a fully filled example.
2. **The Setup form** in the admin console, which has the same fields.

Keep the filled questionnaire. Next season, upload it again and change only what's different.

Amounts can be written however people type them: `500000`, `5,00,000`, `5L`, `5 lakh`, `1Cr`, `1.5Cr`, `50k`.

## What the questionnaire asks

| Section | Keys | Notes |
|---|---|---|
| Tournament | `auction_name`, `tournament_name`, `venue`, `date`, `organiser`, `players_per_side`, `overs` | Shown on every screen |
| Money | `currency`, `purse_per_team`, `max_price_per_player` | `₹` shows virtual rupees as ₹5 L / ₹1.2 Cr; `pts` for points. Leave the cap blank for no cap |
| Squad | `min_squad`, `max_squad`, `reserves_per_team`, `reserve_base_price`, `retained_price_default` | Squad sizes do **not** count reserves |
| Categories (up to 6) | `category_N_id`, `_name`, `_base_price`, `_min_per_team`, `_max_per_team` | Category order = the order players come up |
| Roles | `min_batters`, `min_bowlers`, `min_allrounders`, `min_wicketkeepers` | Blank = no rule |
| Bid increments (up to 4) | `increment_N_below`, `increment_N_raise_by` | Leave `below` blank on the last slab for "and above" |
| Bidding | `bid_mode` (`phones` / `room`), `bid_timer_seconds`, `pick_order`, `unsold_rounds` | See bidding modes below |
| House rules | `hr_eligibility`, `hr_captains`, `hr_special_players`, `hr_locality`, `hr_reserves`, `hr_unsold_end`, `hr_absent`, `hr_trades`, `hr_conduct`, `hr_disputes`, `hr_other_1..3` | Free text, shown to everyone under **Rules** on the live page |

## House rules: what the app enforces and what people check

Each group has its own house rules. The questionnaire asks the common questions; your answers appear on every phone under **Rules** and on the results page. Where a rule can be expressed as a number, the app **enforces** it:

| House rule | How to make the app enforce it |
|---|---|
| "At least 1 junior / woman / senior per team" | Make a category for them (e.g. `J`, Junior) with `min_per_team` = 1 |
| "At most 2 icon players per team" | Icon category `max_per_team` = 2 |
| "Every team needs a wicket-keeper" | `min_wicketkeepers` = 1 |
| "Nobody goes for more than ₹40 L" | `max_price_per_player` = 40L |
| "Captains are retained by their team" | `retained_by` (team ID) in the players CSV; price from `retained_price` or `retained_price_default` |
| "2 reserve players per team" | `reserves_per_team` = 2, and `pool` = `reserve` for those players in the players CSV |

Rules like "max 4 players from the same wing", "no trades" or "unsold players go by lottery" are written in the house-rule answers and checked by the auctioneer.

When a rule blocks a bid, the captain's button says why, for example *"Over your max bid of ₹30 L. Keep ₹10 L for 5 more players."* or *"Keep your last slots for 1 WK."*

## How the max bid works

A team must always be able to complete its squad, so:

```
max bid = purse left − money needed for the players it must still buy
```

"Players it must still buy" uses the minimum squad, category minimums (at their base price) and role minimums. With a price cap, the max bid is never above the cap.

Example: purse ₹1 Cr, min squad 11, lowest base ₹1 L. A team has 6 players and ₹30 L left. It needs 4 more after this one, so ₹4 L is kept back and its **max bid is ₹26 L**.

## Reserve players

- Mark them `pool` = `reserve` in the players CSV (or in the Players tab).
- They are auctioned **after all main players**, at `reserve_base_price` (or their category base).
- Each team can buy up to `reserves_per_team`. Reserves don't count towards min/max squad, but their price comes out of the same purse.
- Squads show them separately, marked *Reserve*.

## Bidding modes

| Mode | What happens |
|---|---|
| **Phones + room** (`phones`) | Captains tap **BID** on their phones. The auctioneer can also record a room bid for any team (keys 1–8), or skip the bidding and enter just the final amount |
| **Room only** (`room`) | Captains raise paddles. Their phones show the auction but can't bid. The auctioneer either records each bid (keys 1–8) or enters the **winning team and final amount** in *Paddle auction* and presses *Record sale* |

You can switch modes at any moment from the control room. A common plan: start with phones, and if captains struggle, switch to **Room only** and enter final amounts.

## Recommended presets (virtual ₹)

**Friends or family (4 teams, 8-a-side, about 40 players)**
purse ₹50 L · squad 8 to 10 · reserves 0 · Icon ₹5 L (max 1) / Regular ₹1 L · +₹25,000 below ₹10 L, +₹50,000 above · timer 20 s

**Society league (6 to 8 teams, 11-a-side, 80 to 120 players)**
purse ₹1 Cr · squad 11 to 13 · 2 reserves at ₹50,000 · Icon ₹10 L (max 2) / Gold ₹5 L / Silver ₹2 L / Junior ₹1 L (min 1) · at least 1 WK · cap ₹40 L · +₹50,000 below ₹20 L, +₹1 L below ₹50 L, +₹2 L above · timer 30 s · 1 unsold round
*(this is the filled sample questionnaire)*

**Box cricket (6-a-side)**
purse ₹30 L · squad 6 to 8 · two categories · timer 15 s

## Auctioneer controls

| Key | Action |
|---|---|
| `N` | Next player |
| `1`–`8` | Record a room bid for team 1–8 |
| `Z` | Undo last bid |
| `S` | Mark sold to the leading team |
| `U` | Unsold |

Also: pick a specific player, enter a paddle sale's final amount, reverse the last sale, start the next round for unsold players, and end the auction.
