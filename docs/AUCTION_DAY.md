# Auction-day checklist

## Information to collect beforehand

Three templates hold everything (all in `templates/`):

- [ ] **Tournament setup questionnaire** (`tournament_setup_template.csv`): players per side and squad size, purse, captain and vice-captain values, who bids, who sees purses, base price, role minimums, increments, bid mode, and your house-rule answers. Fill it in with the committee and get every captain to agree to it. See [RULES.md](RULES.md).
- [ ] **Teams** (`teams_template.csv`): names, 3-letter codes, colours, owners
- [ ] **Players** (`players_template.csv`): name, role, **pool** (A = strongest, B, C… decided by the committee), batting/bowling style, age, flat/locality, photo (optional), past stats (optional), and each team's captain and vice-captain (`allotted_team`, `allotted_as`)
- [ ] Who is the auctioneer (admin), and who is the backup (co-admin)

Tip: collect registrations with a Google Form → the responses go to a Google Sheet → rename the columns to match the template → *File → Download → CSV*.

## A day before

- [ ] Upload the setup questionnaire, then teams and players. Check every name and that every team has its captain (and vice-captain), then **lock** the list
- [ ] Do a mock auction with 2–3 players, then **create a fresh auction** for the real one (or undo the mock sales)
- [ ] Send each captain and vice-captain their own code ("Copy message" buttons in Access and sharing)
- [ ] Ask captains to join on their phones and check they appear as "Signed in"
- [ ] Give the co-admin the admin code
- [ ] Upload the league **logo and banner** (Setup tab) and the **player photos** (Players tab → Upload many photos, files named by player ID or name). Ask players for a clear head-and-shoulders photo, portrait way up
- [ ] Remind captains and vice-captains to fill in their **My workbook** tab (their list, max bid per player, notes) before the day. It is private and locked with their own PIN
- [ ] If people will watch on Zoom or Google Meet, schedule the call and test sharing the stage tab with sound (see below)

## At the venue

- [ ] Laptop for the admin (charged, on mains power), a stable internet connection plus a phone hotspot as backup
- [ ] Projector/TV showing the **stage screen** link (full-screen with F11)
- [ ] QR code from Access and sharing printed or shown at the start so the audience can join
- [ ] Mic for the auctioneer
- [ ] Optional: connect the admin laptop to the hall speakers and press *Read aloud on this laptop* for spoken commentary
- [ ] Video call (optional): open the stage on the laptop in the call, press `V` for voice, and share it: **Meet** → Present now → *A tab* with *Also share tab audio*; **Zoom** → Share screen with *Share sound* ticked. Steps and per-language links are under *Access and sharing → Present on Zoom or Google Meet*. Mute the laptop's mic while the voice speaks
- [ ] Show the stage screen before the start (it lists the key rules) and announce them once

## During

- Next player: **Random draw** (`N`; auto = Pool A first, or pick a pool / role) or **Chit**: draw a chit, type the name, Enter → bids → `S` sold / `U` unsold
- If you use chits, prepare one chit per player with their name and number (the Players tab or the CSV export lists them)
- If a captain's phone dies: the auctioneer records that team's bids (keys `1`–`8`)
- If captains can't manage the phones: switch the control room to **Room only**, run the bidding with paddles, and enter just the winning team and final amount under *Paddle auction*
- Wrong bid recorded: `Z` undoes the last bid
- If a wrong sale happens: **Reverse last sale** immediately
- When a round finishes, **Start round 2** re-auctions unsold players. Check every team reaches the squad size before ending

## After

- [ ] **End auction**
- [ ] Share the results link and a screenshot in the group
- [ ] Download the **Full auction JSON** and commit it to `archive/` so the results stay online permanently
