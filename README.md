# FBL Draft Intelligence — alpha 0.1

Mobile-first draft prototype. Run `npm install && npm test && npm run build`.

## Implemented
- Straight 8-team, 10-round draft with pick history and local persistence.
- Position matching, price verification, salary-cap checks, undo, JSON export/import.
- Manual player JSON import and basic candidate list.

## NOT implemented / blocking live use
- No verified NBA roster, Yahoo positions, Sports.ru prices, or scoring data.
- No projections, rookie rule, opponent bots, season simulations, or cloud persistence.
- Import does not independently verify authenticity of prices or Yahoo positions.
- Candidate list is NOT a mathematically optimized recommendation.
- No edit of arbitrary historical picks, only undo.
- Browser storage is device-local. Export backups regularly.

**NO-GO as a primary live draft advisor until these are implemented and tested.**
