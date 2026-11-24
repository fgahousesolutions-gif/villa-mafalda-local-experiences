CREATE TABLE IF NOT EXISTS clicks (
 day TEXT NOT NULL,
 experience TEXT NOT NULL CHECK (experience IN ('classics', 'gourmerenda', 'secrets', 'table', 'chocolate', 'luxury')),
 total INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (day, experience)
);
