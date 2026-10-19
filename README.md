# Cleaning Dashboard — Admin Frontend

Admin SPA for Cleanilo, Hamburg Teppichreinigung, and Teppichreinigen Lassen. Built with React + Vite + TypeScript + Tailwind + shadcn/ui.

## Requirements

- Node.js 24 (`nvm use` reads `.nvmrc`); the git hooks (lint-staged 17) need >= 22.22
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

| Surface                         | Use it for                                                        | Examples                                                                                    |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Own route** (`/x/:id`)        | Every record: anything a list row opens                           | orders, inquiries, contacts, emails, tasks, partners, invoices, customers, blog, brands     |
| **Form route** (`/x/neu`, …)    | Any in-depth form: creating or editing a record, multi-step flows | new order, receipt confirmation, subscription, partner, customer, customer address, invoice |
| **Sheet** (`variant="content"`) | A short task that is not a record: import, configure, generate    | new task, CSV import, new export                                                            |
| **Dialog**                      | Confirmations, actions and quick edits of about three fields      | cancel order, invite partner, create city, edit prompt                                      |

Form routes use `FormActionBar` (sticky save bar) and `useLeaveGuard` +
`LeaveGuardDialog` so unsaved input is never lost by a stray click.

The one exception is chat: it is a live messenger, so the conversation list
and the thread stay side by side on desktop (list → thread on a phone).

Rules that go with it:

- **A record page is two columns from `xl`** (below that the rail stacks under the main column — with the sidebar open, `lg` leaves the main column narrower than the rail): the work (positions, messages,
  history) in a fluid main column, the facts and side actions (customer,
  payment, documents, notes) in a 22rem rail. Header = `BackLink` +
  `PageHeading` with the status in `meta`, one primary action, the rest in an
  overflow menu. Prev/next arrows walk the list the user came from (ids passed
  in `location.state`). Old query-param deep links (`?order=`, `?inquiry=`,
  `?contact=`, `?email=`, `?partner=`, tasks `?id=`) redirect to the page.
- **Lists are tables, not card stacks.** One bordered container, 44px rows,
  sentence-case sticky header, status only in its badge, amounts right-aligned.
  Below `md` the same container holds compact stacked rows. No avatar circles
  or coloured row bars.
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
- **The sidebar is grouped by job** (daily work, customers & finance, marketing,
  platform) and collapses to an icon rail on desktop (remembered per browser).
  The brand switcher at its top scopes every list. Account, appearance and
  language live in the header's account menu; both it and Settings save
  through `useUserPreferences`, so the choice follows the user to any device.

## Design system

The tokens live in two files and nowhere else: the CSS variables in
[`src/index.css`](src/index.css), and their Tailwind names in
[`tailwind.config.js`](tailwind.config.js). `pnpm run check:tokens` fails the
build on anything outside them, so this stays true by construction rather than
by review.

### Direction

The console is a desk with paper on it. A warm cream **canvas** (`background`)
holds the shell; lighter parchment **sheets** (`card`) hold records; hairline
**rules** (`border`) separate rows. Dark warm-brown **ink** (`primary`) is the
text, the buttons and the logo; one accent, **rust**, marks what is selected,
unread or a link (the active nav icon, counters, highlighted values, focus in
dark mode). Status colours are reserved for status. One
typeface, IBM Plex Sans (self-hosted), with tabular figures on every number that
lines up.

What that rules out: serif display headings, ALL-CAPS letter-spaced eyebrow
labels, coloured gradient washes, a shadow under every card, and decorative
entrance animations.

### Type scale

There is no `text-[13px]`. The scale is:

| Class         | Size | For                                             |
| ------------- | ---- | ----------------------------------------------- |
| `text-3xs`    | 10px | counters inside pills only                      |
| `text-2xs`    | 11px | metadata, captions, brand chips                 |
| `text-xs`     | 12px | labels over groups, helper text, table headers  |
| `text-2sm`    | 13px | dense rows, table cells, nav, tabs, form labels |
| `text-sm`     | 14px | body, card titles (`font-semibold`)             |
| `text-base`   | 16px | in-page section headings, mobile inputs         |
| `text-lg`     | 18px | small KPI values                                |
| `text-title`  | 22px | the page `<h1>` (PageHeading renders it)        |
| `text-metric` | 26px | KPI values (StatTile renders it)                |

Weights: 400 body, 500 labels and buttons, 600 titles and values. Labels are
sentence case. `font-serif` and `uppercase tracking-*` labels are not part of
the system.

### Colour

Reach for a **semantic** token, never a raw Tailwind palette colour:

- `primary` — ink as a **fill** (`bg-primary`: buttons, logo, solid badges, with
  `text-primary-foreground` on it) but rust as **text, border and ring**
  (`text-primary`, `border-primary`, `ring-primary` — tailwind.config.js maps
  those to `--primary-text` / `--highlight`). A selected or active tint is
  `bg-primary-soft` (rust-soft). Rust text clears AA on card, canvas, muted,
  accent and `primary-soft`.
- `highlight` — the rust fill for counters, unread dots and markers
  (`bg-highlight text-highlight-foreground`).
- status — `success` / `warning` / `info` / `destructive`, each with a `-soft`
  surface and a `-foreground` for the solid fill. The soft pairing is
  `bg-warning-soft text-warning`. `text-destructive` resolves to an AA text
  token; `bg-destructive` is the fill.
- neutrals — `muted` (quiet fill), `muted-foreground` (secondary text — already
  the quiet step, never add alpha to it), `accent` (hover), `border` (rules),
  `border-strong` (outline buttons, selected chips), `input` (field outlines,
  3:1).
- `claude` for the AI surface only, `rating` for stars, `ink`/`parchment`/
  `primary-on-ink` for the login panel, which must **not** flip with the theme.

Every pairing is measured against WCAG 2.2 AA in both themes; the numbers are
next to each token in `index.css`. Re-measure if you change one.

Two deliberate exceptions, both allowlisted in
[`scripts/check-design-tokens.mjs`](scripts/check-design-tokens.mjs) with a
reason: the Google SERP preview on the blog page, and the categorical brand /
order-status colours. Categorical colour is data, not chrome — but it lives in
one map per concern, never inline.

### Shape, elevation, motion

- Radius: `rounded-sm` 4px badges and chips · `rounded-md` 6px controls ·
  `rounded-lg` 8px cards and panels · `rounded-xl` 10px menus · `rounded-2xl`
  12px dialogs. `rounded-full` only for avatars, dots and counters.
- Elevation: cards sit on the canvas with a border and **no** shadow. `shadow-sm`
  lifts a selected chip, `shadow-md` a menu, `shadow-lg`/`xl` a dialog or sheet.
- Motion: `duration-fast` (120ms) for hover/state, `duration-base` (180ms) for
  panels. No entrance animations on page content. `prefers-reduced-motion` is
  honoured globally.
- Layers: `z-header` 30 · `z-overlay` 50 (Radix content) · `z-toast` 100.

### Layout

- `AppLayout` owns the page padding (`px-4 sm:px-5 lg:px-8`). Pages never add
  their own outer padding or `min-h-[calc(100svh-…)]`.
- Wrap a page in `PageContainer`. Every list and record page is full width (up to 100rem);
  `width="narrow"` (forms, settings, profile) keeps a reading width but stays left-aligned, so
  the title sits at the same place on every page.
- Every routed page starts with `PageHeading` — title, optional `breadcrumb`
  (an array of `{ label, to }`), `subtitle`, `meta` badges and `actions`.
- Sections inside a page: `SectionCard` for a titled sheet, `SectionHeading`
  for an `<h2>` between sections, `SectionLabel` for the small label over a
  group of facts inside a panel.

### Components

Use these before writing markup; most of them replace several hand-rolled
copies.

| Need                              | Use                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Page title, breadcrumb, actions   | `PageHeading`, `PageContainer` (`page-heading.tsx`)                                               |
| Titled panel / form section       | `SectionCard` (`as="fieldset"` for forms), `SectionHeading`, `SectionLabel`                       |
| One-of-n filter (status, kind)    | `SegmentedControl` (`ui/segmented-control.tsx`, radiogroup + arrows)                              |
| Independent on/off filter         | `FilterChip` (`aria-pressed`)                                                                     |
| Section switch with real panels   | `Tabs` — `variant="line"` inside a record, `segmented` otherwise                                  |
| Failed request, callout, notice   | `Alert` (`tone`), `ErrorState` (message + retry) — `ui/alert.tsx`                                 |
| Nothing to show / loading         | `EmptyState` (`variant="dashed"` on the bare canvas), `LoadingState`, `Skeleton` / `ListSkeleton` |
| A KPI                             | `StatTile`, `StatGrid`                                                                            |
| Facts about a record              | `KeyValueList` + `KeyValue` (`inline` / `grid` / `stacked`)                                       |
| Status                            | `StatusBadge` (tone) or `Badge` (`success`/`warning`/`info`/`destructive`/`secondary`/`accent`)   |
| Which brand a row belongs to      | `BrandChip` (`brand-mark.tsx`)                                                                    |
| List search                       | `SearchInput` + `useDebounced` (`lib/use-debounced.ts`)                                           |
| Refresh in a header               | `RefreshButton fetching={query.isFetching}`                                                       |
| Back to the parent list           | `BackLink`                                                                                        |
| Password field                    | `PasswordInput`                                                                                   |
| Pick one of several values        | `Select options={…}` (groups, icon, description, meta); adds search above 12 options              |
| Searchable picker that adds a row | `Combobox value=""` with `triggerIcon` (e.g. the order catalogue)                                 |
| Date / date + time                | `DatePicker` / `DateTimePicker` (`ui/date-picker.tsx`; native string formats, 24h, Monday-first)  |
| Back link + prev/next on a record | `RecordNav` with `RecordPager` (`record-pager.tsx`)                                               |
| Form field with label/hint/error  | `FormField` (sets `id`, `aria-invalid`, `aria-describedby`)                                       |
| Destructive confirmation          | `ConfirmDialog isDangerous` (focus lands on Cancel; locked while pending)                         |
| Busy button                       | `<Button loading={mutation.isPending}>`                                                           |

Buttons: `default` is the one primary action of a view; `outline` for the
others; `outline-destructive` for a destructive action that opens a
confirmation; `ghost` in toolbars and rows. Sizes `default`/`sm`/`xs`/`icon`/
`icon-sm` already step down at `sm:` for pointer devices — don't add `h-11`.

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
