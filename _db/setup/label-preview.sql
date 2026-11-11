-- Marks this database as the preview one. Run on tas-db-preview only.
INSERT OR REPLACE INTO app_meta (key, value) VALUES ('env', 'preview');
