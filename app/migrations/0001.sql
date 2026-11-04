PRAGMA foreign_keys=ON;
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE menus (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE blocks (id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL, experience TEXT NOT NULL CHECK(experience IN ('all','dinner','pasta')), reason TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, CHECK(start<=end));
CREATE TABLE requests (
 id TEXT PRIMARY KEY, partner TEXT NOT NULL DEFAULT 'simonetta', idem TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
 name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, checkin TEXT NOT NULL, checkout TEXT NOT NULL,
 date TEXT NOT NULL, experience TEXT NOT NULL CHECK(experience IN ('dinner','pasta')), menu_id TEXT,
 snapshot TEXT NOT NULL, people INTEGER NOT NULL CHECK(people BETWEEN 1 AND 20), initial INTEGER NOT NULL CHECK(initial>0),
 final INTEGER CHECK(final>0), status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','completed','declined','cancelled')),
 notes TEXT NOT NULL, lang TEXT NOT NULL, preferred_time TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 token_expires INTEGER NOT NULL, created INTEGER NOT NULL, confirmed_at INTEGER, completed_at INTEGER, message TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 CHECK(checkin<=date AND date<checkout), CHECK(experience!='pasta' OR people<=6)
);
CREATE INDEX requests_date ON requests(date);
CREATE TABLE payments (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, cents INTEGER NOT NULL CHECK(cents>0), date TEXT NOT NULL, reference TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE audit (id INTEGER PRIMARY KEY, request_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE outbox (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, payload TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_error TEXT);
CREATE INDEX outbox_due ON outbox(state,next_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TRIGGER booking_guard BEFORE INSERT ON requests BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM blocks WHERE NEW.date BETWEEN start AND end AND experience IN ('all',NEW.experience)) THEN RAISE(ABORT,'DATE_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.experience='dinner' AND NOT EXISTS(SELECT 1 FROM menus WHERE id=NEW.menu_id AND json_extract(data,'$.active')=1 AND CAST(ROUND(json_extract(data,'$.price')*100) AS INTEGER)*NEW.people=NEW.initial AND json(data)=json(json_extract(NEW.snapshot,'$.menu'))) THEN RAISE(ABORT,'MENU_CHANGED') END;
 SELECT CASE WHEN NEW.experience='pasta' AND NOT EXISTS(SELECT 1 FROM settings WHERE CAST(ROUND(json_extract(data,'$.pastaPrice')*100) AS INTEGER)*NEW.people=NEW.initial) THEN RAISE(ABORT,'PRICE_CHANGED') END;
END;
CREATE TRIGGER payment_guard BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM requests WHERE id=NEW.request_id AND experience='dinner' AND status='completed' AND NEW.cents+COALESCE((SELECT SUM(cents) FROM payments WHERE request_id=NEW.request_id),0)<=CAST(ROUND(final*0.1) AS INTEGER)) THEN RAISE(ABORT,'INVALID_PAYMENT') END;
END;
CREATE TRIGGER correction_guard BEFORE UPDATE ON requests BEGIN
 SELECT CASE WHEN NEW.status='confirmed' AND OLD.status='requested' AND EXISTS(SELECT 1 FROM blocks WHERE NEW.date BETWEEN start AND end AND experience IN ('all',NEW.experience)) THEN RAISE(ABORT,'DATE_UNAVAILABLE') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(cents) FROM payments WHERE request_id=NEW.id),0)>0 AND (NEW.status!='completed' OR NEW.final!=OLD.final) THEN RAISE(ABORT,'PAYMENTS_EXIST') END;
END;
