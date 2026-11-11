-- Marks this database as the live one. Run on tas-db only.
INSERT OR REPLACE INTO app_meta (key, value) VALUES ('env', 'production');
