-- Track the actual closure time of declined/cancelled requests.
-- Existing terminal requests are conservatively backfilled from their last update audit.
ALTER TABLE requests ADD COLUMN closed_at INTEGER;
UPDATE requests
SET closed_at=COALESCE(
  (SELECT MAX(a.created) FROM audit a WHERE a.request_id=requests.id AND a.action LIKE 'request.updated:%'),
  created
)
WHERE status IN ('declined','cancelled') AND closed_at IS NULL;
