-- Hey Boot: SingleStore tables (approved 2026-11-20).
-- catalog = exactly the spec's 7 columns. audit_events = spec columns + run_id, seq.

CREATE TABLE IF NOT EXISTS catalog (
  item             VARCHAR(255)  NOT NULL,
  store            VARCHAR(128)  NOT NULL,
  price            DECIMAL(10,2) NOT NULL,           -- list price, USD
  mil_discount_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
  url              TEXT          NOT NULL,
  captured_at      DATETIME(6)   NOT NULL,
  in_stock         BOOLEAN       NOT NULL DEFAULT TRUE,
  PRIMARY KEY (item, store),
  SHARD KEY (item, store),
  SORT KEY (price)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id       VARCHAR(36) NOT NULL,                     -- uuid from the app
  run_id   VARCHAR(64) NOT NULL,                     -- Convex runs._id
  user_id  VARCHAR(64) NOT NULL,
  seq      INT         NOT NULL,                     -- step order within the run
  step     VARCHAR(48) NOT NULL,
  input    JSON,
  output   JSON,
  sources  JSON,                                     -- [{title,url,captured_at|retrieved_at}]
  ts       DATETIME(6) NOT NULL,
  PRIMARY KEY (run_id, id),
  SHARD KEY (run_id),
  SORT KEY (ts)
);
