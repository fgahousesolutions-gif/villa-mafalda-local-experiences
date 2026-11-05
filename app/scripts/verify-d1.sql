-- Sola lettura: valida schema, migrazioni e dati iniziali senza esporre ospiti/token.
SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name;
SELECT id, json_extract(data,'$.name') AS name, json_extract(data,'$.price') AS euros,
       json_extract(data,'$.active') AS active, json_extract(data,'$.seasonal') AS seasonal
FROM menus ORDER BY id;
SELECT json_extract(data,'$.pastaPrice') AS pasta_euros,
       json_extract(data,'$.referencePrice') AS reference_euros FROM settings WHERE id=1;
SELECT key AS language, json_extract(value,'$.included') IS NOT NULL AS has_included,
       json_extract(value,'$.excluded') IS NOT NULL AS has_excluded
FROM settings, json_each(settings.data,'$.conditions') ORDER BY key;
PRAGMA foreign_key_check;
