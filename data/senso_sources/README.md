# Senso source pages

The 5 to 10 public pages Senso ingests so the agent can cite them. Add each page as a row below, then PR to `main`. Keanu's `scripts/senso-ingest.ts` reads this list.

Rules:
- Public pages only (store military-discount policies, the SOI-W check-in page). No logins, no personal data.
- One row per page. `retrieved` is the date you checked the page still says what we rely on.
- Only official pages from the store or the base. No blogs or coupon aggregators.

| title | url | covers | retrieved |
|---|---|---|---|
