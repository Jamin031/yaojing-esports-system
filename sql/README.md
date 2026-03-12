# SQL Scripts Guide

This directory stores SQL scripts intended for repository upload and environment setup.

## Current Structure

```text
sql/
|-- 001_init_schema.sql
|-- 002_upgrade_existing.sql
|-- 003_seed_basic_data.sql
`-- README.md
```

## Execution Order

1. `001_init_schema.sql`
2. `002_upgrade_existing.sql`
3. `003_seed_basic_data.sql` (optional demo seed)

## Notes

- These scripts target the `xbdj_saas` database.
- The backend also provides a separate full schema at `yaojing-backend/sql/schema.sql` (targets `yaojing_saas`).
- Pick one schema path for initialization to avoid mixed or conflicting definitions.
- Keep only generic/demo seed data in SQL files when uploading to a public repository.
