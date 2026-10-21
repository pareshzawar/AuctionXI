# Setting your auction rules

Every tournament runs differently, so every auction carries its own rules. You set them in one of two ways:

1. **The setup questionnaire (recommended).** Download `templates/tournament_setup_template.csv`, or from Admin → Setup a copy pre-filled with that auction's current answers. Fill in the **answer** column with your committee in Excel or Google Sheets, then upload it under Admin → Setup → *Upload filled questionnaire*. [`templates/sample_tournament_setup.csv`](../templates/sample_tournament_setup.csv) is a fully filled example.
2. **The Setup form** in the admin console, which has the same fields.

Keep the filled questionnaire. Next season, upload it again and change only what's different.

Amounts can be written however people type them: `50`, `200`, `5,00,000`, `5L`, `1Cr`, `50k`.

## The core model

| Setting | Example | Meaning |
|---|---|---|
| `players_per_side` | 8 | Players in a match |
| `squad_size` | 10 | Players every team **must own** by the end, captain and vice-captain included. The extra 2 are the reserves |
| `purse_per_team` | ₹1,000 | Virtual money each team starts with |
| `leaders` | `captain_vc` | Who is allotted to each team before the auction: `captain` only, or `captain_vc` (captain and vice-captain) |
| `captain_price`, `vc_price` | ₹200, ₹150 | Their **value**. It is **not** taken from the purse: the purse is only for buying players. The value is the budget the team gets back for next season's mini auction if the captain or vice-captain is unavailable. They join their team when the auction starts and are never auctioned |
| `bidders` | `captain_vc` | Who bids for the team: only the `captain`, or `captain_vc` (both, each with their own code) |
| `purse_visibility` | `own` | Who sees remaining purse and max bid (below) |
| Base price | ₹50 | Starting price of every auctioned player (one category). Add more categories if some players start higher |

In the players CSV, mark each team's captain and vice-captain with `allotted_team` (the team ID) and `allotted_as` (`C` or `VC`). Everyone else is auctioned.

## Pools and choosing the next player

Every player has a **role** (Batter, Bowler, All-rounder, Wicket-keeper) and a **pool**: Pool A = the strongest players, then Pool B, Pool C… The admin decides each player's pool from how they play, either in the players CSV (`pool` column: `A`, `B`, `Pool C`…) or in the Players tab. The number of pools, their names and base prices are set in the questionnaire (`pool_N_…`) or under Setup → Pools. Each pool can also have a per-team minimum or maximum (e.g. at most 3 Pool A players per team).

The control room's **Next player** panel always offers both ways:

| | How it works |
|---|---|
| **Random draw** | The built-in logic picks a random player from the strongest pool still in play: all of Pool A first, then B, then C. Choose a pool and/or a role to draw only from that group instead, e.g. "a random Pool B bowler". Key `N` |
| **Chit (search)** | Draw a chit in the hall. Type the name or player number into the search box; matching players not yet auctioned this round appear. Press Enter or *Bring up* and the player is on the stage for bidding. `N` jumps to the search box |

The stage shows how each player came up ("Random draw from Pool B", "Chit"). Captains and vice-captains are never offered, and neither are players already sold. Unsold players come back in the next round. `pick_order` in the questionnaire sets the default (`category-random` = random, pool by pool; `manual` = chits); you can switch at any moment.

## Max bid

A team must always be able to fill its squad, so:

```
max bid = purse left − (players still to buy − 1) × base price
          and never more than the purse left
```

**Example** (8-a-side, squad of 10, purse ₹1,000, base ₹50):

- Captain (value ₹200) and vice-captain (value ₹150) are allotted. Their values are recorded but **not** taken from the purse → **₹1,000 left**, **8 players to buy**
- First max bid = ₹1,000 − 7 × ₹50 = **₹650** (₹350 is kept back for the other 7 players)
- If the team buys a player for ₹650: ₹350 left, 7 to buy → max bid = ₹350 − 6 × ₹50 = ₹50
- For the last player, the max bid is the whole purse left

Each captain's phone shows **Purse left** and **Max bid** for their team, updated after every sale. The **BID** button stops at the max bid and says why, e.g. *"Over your max bid of ₹650. Keep ₹350 for 7 more players."* Optional house rules (category limits, role minimums, price cap) can lower it further, as below.

## Next season's mini auction

The captain / vice-captain values and each team's remaining purse carry over to next season.

1. After the auction, open **Admin → Results → Next season: mini auction**.
2. For each team, tick the players it **keeps**. Everyone unticked is released. The team's budget updates as you tick:

   ```
   budget = remaining purse + value of released players
   ```

   A released captain or vice-captain brings back their value (e.g. ₹200 / ₹150); a released bought player brings back the price paid.
   *Example:* a team ends with ₹650, releases its vice-captain (₹150) and a ₹300 player → **₹1,100** for the mini auction.
3. Choose whether released and unsold players go back into the player pool, then **Create mini auction**.

The new auction copies the rules, teams and house rules, and makes new captain / vice-captain codes. Kept players are already in their team (as captain, vice-captain or *Retained*) and are never auctioned. Each team's budget appears in the Teams tab, where it can be adjusted. Add new registrations in the Players tab (upload with "add to the list"), pick a new captain or vice-captain for any team that released one, lock, and run it like any auction. Max bid works the same: budget left − (players still to buy − 1) × base price.

## Who sees the remaining purse and max bid

| `purse_visibility` | Captains / vice-captains | Team members, audience, stage screen | Admins |
|---|---|---|---|
| `own` (default) | Their own team only | Nobody's: they see squad counts ("6/10 · 4 still to buy") | Every team |
| `bidders` | Every team | Nobody's | Every team |
| `everyone` | Every team | Every team | Every team |

Everyone always sees the player on the block, the current bid and who is leading, as they would in the hall.

> The app hides purses on screen. Sale prices are announced in the hall and stay on the activity feed, though, so a determined person could still add them up.

## Rules for everyone to see

The **Rules** tab on every phone, the results page, and the stage screen before the start show the tournament rules:

- format and squad size
- purse, captain/VC values (not from the purse) and base price
- the max-bid formula with a worked example from your numbers
- increments and timer
- who bids, and who sees purses
- your house-rule answers

Phones open on the Rules tab until the auction starts.

## House rules

Each group has its own house rules. The questionnaire asks the common questions (eligibility, how captains are chosen, required players, same-wing limits, how reserves are used, unsold players, dropouts, trades, conduct, disputes, plus three free rules). Your answers are shown to everyone under **Rules**.

Where a rule can be expressed as a number, the app **enforces** it:

| House rule | Setting |
|---|---|
| "Every team needs a wicket-keeper" | `min_wicketkeepers` = 1 (also batters, bowlers, all-rounders) |
| "At least 1 junior / woman / senior per team" | A category for them (e.g. `J`, Junior) with `min_per_team` = 1 |
| "At most 2 icon players per team" | Icon category with `max_per_team` = 2 |
| "Nobody goes for more than ₹400" | `max_price_per_player` = 400 |

Rules like "max 4 players from the same wing", "no trades" or "unsold players go by lottery" are written in the house-rule answers and checked by the auctioneer.

## The rest of the questionnaire

| Section | Keys |
|---|---|
| Tournament | `auction_name`, `tournament_name`, `venue`, `date`, `organiser`, `players_per_side`, `overs` |
| Money | `currency` (`₹` virtual rupees, or `pts`), `purse_per_team`, `max_price_per_player` |
| Categories (up to 6) | `category_N_id`, `_name`, `_base_price`, `_min_per_team`, `_max_per_team`. One category is enough when everyone starts at the same base price |
| Bid increments (up to 4) | `increment_N_below`, `increment_N_raise_by`; leave `below` blank on the last slab for "and above" |
| Bidding | `bid_mode` (`phones` / `room`), `bid_timer_seconds`, `pick_order`, `unsold_rounds` |

## Bidding modes

| Mode | What happens |
|---|---|
| **Phones + room** (`phones`) | Captains (and vice-captains, if allowed) tap **BID**. The auctioneer can also record a bid for any team (keys 1–8), or enter just the final amount |
| **Room only** (`room`) | Paddles in the hall. Phones show the auction but can't bid. The auctioneer records each bid, or enters the **winning team and final amount** under *Paddle auction* |

You can switch at any moment in the control room. A common plan: start with phones, and if captains struggle, switch to Room only and enter the final amounts.

## Presets

**Friends or family, 6-a-side, squads of 8:** purse ₹500 · C value ₹100, VC value ₹75 · base ₹25 · +₹5 below ₹100, +₹10 above · timer 20 s

**Society league, 8-a-side, squads of 10** *(the filled sample)*: purse ₹1,000 · C value ₹200, VC value ₹150 · base ₹50 · at least 1 WK · +₹10 below ₹200, +₹25 above · timer 30 s

**11-a-side, squads of 14, captain only:** purse ₹1 Cr · C value ₹10 L · base ₹1 L · +₹50,000 below ₹10 L, +₹1 L above · timer 30 s

## Auctioneer controls

| Key | Action |
|---|---|
| `N` | Next player |
| `1`–`8` | Record a room bid for team 1–8 |
| `Z` | Undo last bid |
| `S` | Mark sold to the leading team |
| `U` | Unsold |

Also: pick a specific player, enter a paddle sale's final amount, reverse the last sale, start the next round for unsold players, and end the auction.
