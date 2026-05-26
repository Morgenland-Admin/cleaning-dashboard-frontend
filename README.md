# Cleaning Dashboard — Admin Frontend

Admin SPA for Cleanilo, Hamburg Teppichreinigung, and Teppichreinigen Lassen. Built with React + Vite + TypeScript + Tailwind + shadcn/ui.

## Requirements

- Node.js >= 20
- pnpm >= 10 (`corepack enable` provisions the pinned version)

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env with your API URL
```

## Development

```bash
pnpm dev
```

App runs at `http://localhost:5173` by default.

## Build & Preview

```bash
pnpm build
pnpm preview
```

## Scripts

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `dev`               | Start Vite dev server                         |
| `build`             | Type-check + bundle for production            |
| `preview`           | Serve the production build locally            |
| `typecheck`         | Type-check without bundling                   |
| `lint` / `lint:fix` | Run ESLint (auto-fix with `:fix`)             |
| `format`            | Format with Prettier (auto-sorts Tailwind)    |
| `format:check`      | Verify formatting without writing             |
| `check`             | Lint + format check + typecheck (CI-friendly) |

## Tooling

- **ESLint** (flat config) — React + react-hooks + jsx-a11y + import-x + typescript-eslint
- **Prettier** with `prettier-plugin-tailwindcss` — sorts class names automatically
- **Husky** — pre-commit runs `lint-staged` + `typecheck`; commit-msg runs commitlint
- **commitlint** — Conventional Commits (`feat:`, `fix:`, `chore:`, …)

## Environment

See [`.env.example`](.env.example):

- `VITE_API_URL` — backend API base URL
- `VITE_AUTH_URL` — Better Auth base URL (usually the same)
