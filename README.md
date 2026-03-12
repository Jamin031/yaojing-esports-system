# Yaojing Esports System

Monorepo for the Yaojing esports order platform.

## Subprojects

- `yaojing-frontend`
  - User-facing ordering frontend
  - Tech stack: Vue 3 + Vite
- `yaojing-admin`
  - Admin dashboard for stores, users, orders, and operations
  - Tech stack: Vue 3 + Vite + Element Plus
- `yaojing-backend`
  - API service, auth, and business logic
  - Tech stack: Node.js + Express + MySQL + Socket.IO

## Repository Structure

```text
yaojing-esports-system/
|-- README.md
|-- .gitignore
|-- sql/
|   |-- 001_init_schema.sql
|   |-- 002_upgrade_existing.sql
|   |-- 003_seed_basic_data.sql
|   `-- README.md
|-- yaojing-frontend/
|-- yaojing-admin/
`-- yaojing-backend/
```

## Local Development

### 1) Backend

```bash
cd yaojing-backend
cp .env.example .env
npm install
npm run dev
```

Default backend port: `3000`

### 2) Frontend (user)

```bash
cd yaojing-frontend
npm install
npm run dev
```

Default dev port: `5174`

### 3) Admin

```bash
cd yaojing-admin
npm install
npm run dev
```

Default dev port: `5174` (change one side if you need frontend and admin running at the same time).

## Database Scripts

- Main SQL scripts live under `sql/`
- Backend also contains a complete schema at `yaojing-backend/sql/schema.sql`
- See [sql/README.md](sql/README.md) for execution order and usage notes

## GitHub Upload Notes

- Commit source code, configs, and `*.example` templates
- Do not commit local runtime files such as `.env`, logs, PID files, `node_modules`, and build outputs
- Root `.gitignore` already contains monorepo-level rules for all three subprojects
