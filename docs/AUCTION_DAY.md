# Auction-day checklist

## Information to collect beforehand

Three templates hold everything (all in `templates/`):

- [ ] **Tournament setup questionnaire** (`tournament_setup_template.csv`): format, purse, squad and reserves, categories and base prices, role minimums, increments, bid mode, and your house-rule answers. Fill it in with the committee and get every captain to agree to it. See [RULES.md](RULES.md).
- [ ] **Teams** (`teams_template.csv`): names, 3-letter codes, colours, owners, captains
- [ ] **Players** (`players_template.csv`): name, role, category, `pool` (main or reserve), batting/bowling style, age, flat/locality, photo (optional), past stats (optional), retained captains
- [ ] Who is the auctioneer (admin), and who is the backup (co-admin)

Tip: collect registrations with a Google Form → the responses go to a Google Sheet → rename the columns to match the template → *File → Download → CSV*.

## A day before

- [ ] Upload the setup questionnaire, then teams and players. Check every name, category and reserve, then **lock** the list
- [ ] Do a mock auction with 2–3 players, then **create a fresh auction** for the real one (or undo the mock sales)
- [ ] Send each captain their code ("Copy WhatsApp message" in Access and sharing)
- [ ] Ask captains to join on their phones and check they appear as "Signed in"
- [ ] Give the co-admin the admin code

## At the venue

- [ ] Laptop for the admin (charged, on mains power), a stable internet connection plus a phone hotspot as backup
- [ ] Projector/TV showing the **stage screen** link (full-screen with F11)
- [ ] QR code from Access and sharing printed or shown at the start so the audience can join
- [ ] Mic for the auctioneer
- [ ] Announce the rules once before starting

## During

- `N` next player → bids → `S` sold / `U` unsold
- If a captain's phone dies: the auctioneer records that team's bids (keys `1`–`8`)
- If captains can't manage the phones: switch the control room to **Room only**, run the bidding with paddles, and enter just the winning team and final amount under *Paddle auction*
- Wrong bid recorded: `Z` undoes the last bid
- If a wrong sale happens: **Reverse last sale** immediately
- When the main pool is done, reserve players come up; when a round finishes, **Start round 2** re-auctions unsold players

## After

- [ ] **End auction**
- [ ] Share the results link and a screenshot in the group
- [ ] Download the **Full auction JSON** and commit it to `archive/` so the results stay online permanently
