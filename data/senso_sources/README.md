# Senso source pages

The 5 to 10 public pages Senso ingests so the agent can cite them. Add each page as a row below, then PR to `main`. Keanu's `scripts/senso-ingest.ts` reads this list.

Rules:
- Public pages only (store military-discount policies, the SOI-W check-in page). No logins, no personal data.
- One row per page. `retrieved` is the date you checked the page still says what we rely on.
- Only official pages from the store or the base. No blogs or coupon aggregators.

| title | url | covers | retrieved |
|---|---|---|---|
| Holabird Sports: Exclusive Discounts (military 10% sitewide via VerifyPass; excludes tennis balls, ball machines, stringing machines, court equipment, gift cards) | https://www.holabirdsports.com/pages/exclusive-discounts | military discount for Holabird catalog rows | 2026-11-20 |
| SOI-West: Check In (what to bring from boot camp, Service "A" check-in at the San Diego airport USO, Lima Company SDO contact, gate/road closures). Blocks automated fetches: save it from a browser and upload the file | https://www.soiwest.marines.mil/Students/Check-In/ | what a new Marine must bring and do when reporting to SOI-West | 2026-11-20 (search listing only; page text not yet read) |
| Running Warehouse: Order Information (military, police, fire and EMS discount on applicable orders; no percent stated; verified once by ID or proof-of-service memo and saved to the customer file; one discount per order; price match within 7 days) | https://www.runningwarehouse.com/SupportCenter/OrderInfo/ | military discount and price match for Running Warehouse catalog rows | 2026-11-20 |
| Running Warehouse: Shipping & Returns (new, unworn items within 90 days for a full refund; worn items exchange or store credit only; free 2-day over $50 in the lower 48; APO/FPO ships USPS Priority only) | https://www.runningwarehouse.com/SupportCenter/Shipping/ | returns and shipping for Running Warehouse catalog rows | 2026-11-20 |
| Target: How do I verify my military status? (Target Circle members who are active or veteran service members plus one dependent; verified through SheerID; military bonus appears only during a live campaign) | https://www.target.com/help/article/000170253 | who qualifies for Target's military offer and that it is not year-round | 2026-11-20 |
| Target press release, June 2, 2026 (verified military members, veterans and families who are Target Circle members get 20% off one qualifying storewide purchase, June 21 to July 4) | https://corporate.target.com/press/release/2026/06/new,-deep-savings-for-back-to-school-and-summer-target-circle-deal-days-delivers-value-with-style | the most recent dated Target military offer (ended July 4, 2026) | 2026-11-20 |
| U.S. Elite Gear: Service Discount (10% "Duty Call" discount; verified by emailing the store; excludes hazmat, fitness equipment, Oakley and sale items; does not stack with promos) | https://us-elitegear.com/pages/service-discount | military discount for U.S. Elite Gear catalog rows (boots) | 2026-11-20 |
| U.S. Elite Gear: Return Policy (90 days, new and unused with tags; footwear returnable only if not worn outside, scuffed or polished; customer pays return shipping; Duty Call discount does not combine with coupons) | https://us-elitegear.com/pages/return-policy | returns for U.S. Elite Gear catalog rows (boots) | 2026-11-20 |
| Gear Rack: Refund Policy (14 days from delivery; unworn and unused; surplus wear, fading and markings are not defects; customer may pay return shipping; Final Sale items non-returnable) | https://gearrack.com/policies/refund-policy | returns for Gear Rack catalog rows (used and new cammies, covers) | 2026-11-20 |
| HiVis365: Refund Policy (30 days from receipt, original condition and packaging; wrong-size items must show no wear; no return shipping reimbursement; clearance and closeout final; possible 15% restocking fee) | https://www.hivis365.com/policies/refund-policy | returns for HiVis365 catalog rows (boots) | 2026-11-20 |
