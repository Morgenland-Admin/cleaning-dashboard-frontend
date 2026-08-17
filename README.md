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
| `check:tokens`      | Fail on off-scale type / raw palette colours  |
| `check`             | Lint + format + typecheck + tokens (CI-ready) |

## UI conventions

These exist because the app had drifted into four different ways of showing one
record. Pick the surface from this table, not from whichever page you copied.

| Surface                         | Use it for                                                              | Examples                                   |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| **Own route** (`/x/:id`)        | Records with deep content, many actions, or that get linked and printed | invoices, customers, blog articles, brands |
| **`DetailPane`**                | Triage surfaces — read a record, act, move to the next one              | orders, inquiries, contacts, partners      |
| **Sheet** (`variant="content"`) | A form or task that is not a record: create, import, configure          | new subscription, CSV import, task detail  |
| **Dialog**                      | Confirmations, and quick edits of about three fields or fewer           | cancel order, create city, edit prompt     |

Rules that go with it:

- **`DetailPane` is the only master–detail implementation.** It is a sticky column
  at `lg`, and a full-screen sheet below `lg`. Do not hand-roll a
  `grid-cols-2` + `<aside>`: on a phone that renders the panel _below_ the list
  and reads as a dead tap, which is the bug it was written to fix.
- **Selection belongs in the URL**, via `useSelectedId` / `useSelectedBrandRef`.
  Reload-safe, linkable, and the phone's back gesture closes the detail instead
  of leaving the page. Never mirror a search param into state in an effect.
- **A nested `overflow-y-auto` list box is a `lg:` affordance.** It keeps a sticky
  detail column in reach; on a phone it just fights the page scroll. Scope those
  classes to `lg:`, and pass the `InfiniteScrollSentinel` a `rootRef` only when
  the box actually scrolls (`useIsDesktop`) — otherwise the sentinel sits inside
  it permanently and pages in the entire list.
- **PWA icons are generated, not hand-drawn.** `public/icon-{app,maskable}-{192,512}.png`
  are rendered from the two SVGs. Regenerate them if the SVG changes:

  ```bash
  qlmanage -t -s 512 -o /tmp/ql public/icon-maskable.svg && mv /tmp/ql/icon-maskable.svg.png public/icon-maskable-512.png
  cp public/icon-maskable-512.png public/icon-maskable-192.png && sips -z 192 192 public/icon-maskable-192.png
  ```

  The `any` pair must be rendered from a **square** copy of `icon-app.svg` (drop the
  `rx`): rasterizing the rounded rect flattens the transparent corners to opaque
  white, and every launcher applies its own corner mask anyway.

- **Global search is `⌘K`** (`components/command-palette.tsx`), backed by
  `GET /admin/search`. It spans orders, customers, inquiries, contacts, invoices
  and partners across every brand the user can see. Per-page filters stay the tool
  for working a list; the palette is for jumping to a known record.
- **Sizing lives in the primitives.** `Input`/`Textarea`/`Select` are 16px on
  mobile because iOS Safari zooms the viewport on any smaller focused field, and
  `Button` steps down at `sm:`. Don't re-add per-page `h-11 sm:h-9`.

## Design system

The tokens live in two files and nowhere else: the CSS variables in
[`src/index.css`](src/index.css), and their Tailwind names in
[`tailwind.config.js`](tailwind.config.js). `pnpm run check:tokens` fails the
build on anything outside them, so this stays true by construction rather than
by review.

### Type scale

There is no `text-[13px]`. The scale is:

| Class       | Size | For                                        |
| ----------- | ---- | ------------------------------------------ |
| `text-3xs`  | 10px | micro labels, counters, uppercase eyebrows |
| `text-2xs`  | 11px | metadata, captions                         |
| `text-xs`   | 12px | secondary body                             |
| `text-2sm`  | 13px | dense rows, nav, tab triggers              |
| `text-sm`   | 14px | body                                       |
| `text-base` | 16px | primary values, list-row titles            |

Plus three display steps for the serif page heroes — `text-display-sm|md|lg`
(30/36/44px). Those bake in their own line-height and tracking, so a hero is one
class, not three. If you need a size that is not here, add it to the config so
the next person gets it too.

### Colour

Reach for a **semantic** token, never a raw Tailwind palette colour:

- status — `success` / `warning` / `info` / `destructive`, each with a `-soft`
  surface and a `-foreground` for when it is a fill. The soft pairing is
  `bg-warning-soft text-warning`; `warning-foreground` is near-white and only
  belongs on the solid fill.
- brand — `rust` for accents and fills, `text-rust` for rust text (it resolves
  to a darker token that clears AA on tinted surfaces), `claude` for the AI
  surface only.
- `rating` for stars, `ink`/`parchment` for the two surfaces that must **not**
  flip with the theme (the login showcase panel, brand wordmarks).

Every pairing in the app is checked against WCAG AA (4.5:1 for body text). The
status tokens are darker than they look like they should be for exactly that
reason — `warning` on `warning-soft` used to measure 3.30:1.

Two deliberate exceptions, both allowlisted in
[`scripts/check-design-tokens.mjs`](scripts/check-design-tokens.mjs) with a
reason: the Google SERP preview on the blog page, and the categorical brand /
order-status gradients. Categorical colour is data, not chrome — but it lives in
one map per concern, never inline.

### Focus

One treatment, everywhere: `focus-visible:ring-2 focus-visible:ring-ring`.
Nothing uses `focus:` (that fires on mouse clicks too) and nothing tints the
ring — the faint `ring-rust/30` variants this replaced measured 1.5:1, which is
not a visible focus indicator. The single exception is the image lightbox, which
sits on its own dark scrim and uses `ring-white`.

### Scrollbars

Styled once, globally, in `index.css` — there is no per-component scrollbar
class. Two things are worth knowing before touching that block:

- The standard properties and the WebKit pseudo-elements cannot both be
  declared. Since Chrome 121, setting `scrollbar-color` anywhere (it inherits)
  makes the browser ignore every `::-webkit-scrollbar` rule in the document. The
  block picks one per engine with `@supports selector(::-webkit-scrollbar)`.
- `html` carries `overflow-y: scroll`, not just `scrollbar-gutter: stable`.
  Chromium only honours the gutter once the root is really a scroll container,
  and `overflow-y: auto` is not enough — without this the whole layout slides
  10px sideways when you navigate from a short page to a long one.

Utilities: `scrollbar-none` hides the bar where it would be noise (a horizontal
tab strip, where the cut-off item is the affordance), and `scroll-fade-x` masks
the strip's edges based on scroll position so there is still a cue. `TabsList`
applies both for you via `overflow="scroll"`.

### Time-dependent rendering

Anything whose output changes as time passes on its own — an expiry, an overdue
flag — reads the clock through [`useNow`](src/lib/use-now.ts), not `Date.now()`
in a component body. Calling it during render is impure, rows in one list can
land on opposite sides of a boundary, and once a query stops polling the value
never updates at all.

## Tooling

- **ESLint** (flat config) — React + react-hooks + jsx-a11y + import-x + typescript-eslint
- **Prettier** with `prettier-plugin-tailwindcss` — sorts class names automatically
- **Husky** — pre-commit runs `lint-staged` + `typecheck`; commit-msg runs commitlint
- **commitlint** — Conventional Commits (`feat:`, `fix:`, `chore:`, …)

## Environment

**`.env` in this repo points at production.** For local development create a
`.env.local` (gitignored, takes precedence):

```
VITE_API_URL=http://localhost:8000
VITE_AUTH_URL=http://localhost:8000
```

Without it, sign-in appears to succeed and then drops you back on `/login`: the
session cookie is `SameSite=Lax`, so a localhost page never gets to send it to
`api.reinigungs-portal.com`, and the next `get-session` returns no user.

Both values must match the backend's `BETTER_AUTH_URL`. If port 8000 is taken by
another project, change it in three places — the backend's `PORT` and
`BETTER_AUTH_URL`, and both values here — or better-auth will issue cookies for
an origin the browser is not talking to.

See [`.env.example`](.env.example):

- `VITE_API_URL` — backend API base URL
- `VITE_AUTH_URL` — Better Auth base URL (usually the same)
