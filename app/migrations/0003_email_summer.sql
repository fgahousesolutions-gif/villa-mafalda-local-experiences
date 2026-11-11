-- No default seasonal dates. Existing settings deliberately have no summerWindow.
ALTER TABLE outbox ADD COLUMN first_attempt_at INTEGER;
ALTER TABLE outbox ADD COLUMN provider_id TEXT;
-- Old attempted rows cannot safely be replayed against a new provider.
UPDATE outbox SET state='review',last_error='LEGACY_ATTEMPT_REVIEW' WHERE attempts>0 AND state IN ('pending','retry');
CREATE TRIGGER summer_booking_guard BEFORE INSERT ON requests
WHEN NEW.experience='dinner' AND NEW.menu_id='summer' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM settings
 WHERE json_extract(data,'$.summerWindow.start') IS NOT NULL
 AND json_extract(data,'$.summerWindow.end') IS NOT NULL
 AND NEW.date BETWEEN json_extract(data,'$.summerWindow.start') AND json_extract(data,'$.summerWindow.end'))
 THEN RAISE(ABORT,'SUMMER_UNAVAILABLE') END;
END;

UPDATE menus SET data=json_set(data,'$.active',json('true'),'$.seasonal',json('true')),version=version+1 WHERE id='summer';
