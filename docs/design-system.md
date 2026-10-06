# Vendpire Design System

Implementation guide for the web app's visual design (Tailwind CSS v4). Built with the
Refactoring UI method: one primary hue, a tinted gray scale, and three state colors, each
with 10 shades (50 = lightest, 900 = darkest).

**Overall feel:** fun and friendly. Fully rounded (pill) buttons, generously rounded cards,
a bright teal primary.

**Scope:** light mode only. Dark mode is not designed yet. Don't add `dark:` variants or
invent dark values. If dark mode comes up, flag it instead of guessing.

## Where this lives in the code

| Thing | Path |
|---|---|
| Tokens (`@theme`) | `packages/web/src/theme.css` |
| Stylesheet entry | `packages/web/src/index.css` |
| Fonts | `packages/web/index.html` |
| Components | `packages/web/src/ui/` |
| Import barrel | `packages/web/src/ui.tsx` |
| Living reference | `/design` route — `packages/web/src/screens/design-system/DesignSystemScreen.tsx` |

`theme.css` **removes Tailwind's default palette** (`--color-*: initial`). Only the colors
below exist, so `bg-blue-500` or `text-slate-600` won't generate. That's deliberate. If a
component needs a color that isn't here, add a semantic token to `theme.css` rather than a
one-off hex.

## Color scales

| Scale | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| `primary` (Lagoon teal) | #E2FEF9 | #C4F9F3 | #91EEE7 | #4DDBD6 | #01BCBB | #019EA0 | #088387 | #08686C | #044D53 | #00353A |
| `gray` (teal-tinted) | #F5F9F9 | #ECF1F1 | #DCE5E5 | #C5D0D0 | #9AA8A8 | #6E7E7E | #4E5F5E | #384949 | #243434 | #101F1F |
| `green` (success) | #E9FEE9 | #D3F8D6 | #ACEEB7 | #78DC93 | #30C26F | #07A25D | #01824E | #026841 | #014E32 | #013522 |
| `red` (error/loss) | #FFF4F2 | #FFE7E3 | #FFCDC4 | #FFA999 | #FE745B | #EF462A | #CE2C17 | #A52014 | #7E150F | #570E0B |
| `amber` (warning) | #FFFAEB | #FFF1CC | #FFE29B | #FFCC5A | #FBB61B | #ED9F00 | #CD7D00 | #A45801 | #803D05 | #5D2A0B |

### Semantic tokens (prefer these)

| Token | Maps to | Example class |
|---|---|---|
| `app` | gray-50 | `bg-app` (page background) |
| `card` | white | `bg-card` |
| `divider` | gray-100 | `divide-divider`, `border-divider` |
| `line` | gray-200 | `border-line` |
| `heading` | gray-900 | `text-heading` |
| `body` | gray-700 | `text-body` |
| `muted` | gray-500 | `text-muted` |
| `nav` | gray-100 | `bg-nav` |
| `tab` / `tab-active` / `tab-indicator` | gray-600 / primary-700 / primary-500 | `text-tab`, `text-tab-active`, `border-tab-indicator` |
| `profit` / `loss` | green-700 / red-700 | `text-profit`, `text-loss` |

Also defined: `font-display`, `font-sans` (default body), `font-mono`, `rounded-card`
(18px), `shadow-card`.

## Color rules

1. **Primary is for brand and actions only:** filled buttons, links, the selected tab,
   focus rings, selection states.
2. **Status always uses green / amber / red, never primary.** In stock = green, low stock
   or fill due = amber, out of stock or broken = red.
3. **Money:** positive profit/margin → `text-profit`. Losses/spoilage → `text-loss`.
   Always show a sign (`+$171`, `−$36`).
4. **Never white text on amber.** It fails contrast. Amber is always dark amber text on
   light amber fill.
5. **Contrast floor is 4.5:1 for text.** That's why the selected tab uses primary-700
   instead of 600 (600 on gray-100 is only 4.0:1). White on primary-600 is 4.6:1.

## Typography

| Role | Classes |
|---|---|
| Page title | `font-display text-2xl font-extrabold text-heading` (`<PageTitle>`) |
| Card/section title | `font-display text-lg font-extrabold text-heading` (`<CardTitle>`) |
| KPI value | `font-display text-2xl font-extrabold tabular-nums` |
| KPI label | `text-xs uppercase tracking-wider text-gray-600` |
| Body | `text-base text-body` (default) |
| Secondary / meta | `text-sm text-gray-600` |
| Slot codes (A1, B2) | `font-mono text-xs text-muted` |

Use `tabular-nums` anywhere numbers line up (counts, money).

## Shape & spacing

- **Buttons and pills:** `rounded-full`. Never `rounded-md`/`rounded-lg` on a button.
- **Cards, list groups, alerts:** `rounded-card`. Cards on the page background also get
  `shadow-card`.
- **Form controls** keep a soft rectangle (`rounded-xl`) — a fully rounded text input
  reads as a search box.
- **Page gutter:** `px-4 sm:px-6` (handled by `<Page>`). Gap between stacked sections:
  `gap-4` (use flex/grid `gap`, not margins).
- **Focus:** every interactive element gets the shared `focusRing` —
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`.

## Components

Import everything from `../components/ui.tsx`.

### Top nav bar with tabs

`packages/web/src/screens/RootLayout.tsx`. The selected tab gets `aria-current="page"`,
`text-tab-active` and `border-tab-indicator`. Unselected tabs get `text-tab` with a
transparent 3px border, so the label doesn't shift when it becomes current.

Current tabs: **Dashboard, Locations, Machines, Products, Packs, Purchases**.

### Buttons — `<Button>` / `buttonClass()`

Base: `inline-flex items-center justify-center rounded-full font-bold transition-transform
active:scale-[.96] motion-reduce:transition-none disabled:opacity-50
disabled:pointer-events-none`

| Variant | Add |
|---|---|
| `primary` | `bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800` |
| `secondary` | `bg-gray-200 text-gray-800 hover:bg-gray-300` |
| `danger` | `bg-red-50 text-red-700 hover:bg-red-100` |

Sizes: `md` (`px-5 py-3`, the documented default) and `sm` (`px-3.5 py-1.5 text-sm`) for
dense contexts like table-row actions. `full` makes it `w-full` — use that for a page's
main action (e.g. "Start fill visit").

Use `<Button>` for `<button>` elements and `buttonClass({ ... })` for router `<Link>`s and
anchors, so both wear identical styling.

### Status pill — `<StatusPill tone>`

Base: `inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap`

| Tone | Add |
|---|---|
| `ok` | `bg-green-100 text-green-800` |
| `warning` | `bg-amber-100 text-amber-800` |
| `critical` | `bg-red-100 text-red-800` |

`stockTone(remaining, capacity)` picks the tone from the shared thresholds: critical at 0,
warning at 30% or below, otherwise ok.

### Alert banner — `<Alert tone title>`

Base: `rounded-card border px-3.5 py-3 text-sm grid gap-0.5`, bold title line plus
optional detail line. Tones: `warning` (amber-50/200/900), `critical` (red-50/200/900),
`success` (green-50/200/900). `<ErrorNote message>` is the critical variant for
query/mutation failures and renders nothing when `message` is null.

### KPI card — `<KpiCard label value tone>` inside `<KpiGrid>`

`bg-card rounded-card shadow-card p-3`, label on top and value below. `tone` is `profit`,
`loss`, or `neutral`. `<KpiGrid>` lays them out two-up (`grid grid-cols-2 gap-2.5`).

### Slot list — `<SlotList>` + `<SlotRow code label status>`

`bg-card rounded-card shadow-card divide-y divide-divider`. Each row is
`grid grid-cols-[36px_1fr_auto] items-center gap-2.5 px-3 py-2.5 text-sm`: slot code
(mono, muted), product name, then a status pill.

### Layout — `<Page>`, `<PageTitle>`, `<PageSubtitle>`, `<Card>`, `<CardTitle>`, `<TableScroll>`, `<EmptyState>`

### Form controls — `inputClass`, `labelClass`, `hintClass`, `checkboxClass`

`checkboxClass` applies `accent-primary-600` so native checkboxes stop rendering in the
browser's default blue.

### List controls — `<SearchInput>`, `<LoadMore>`

`<SearchInput value onChange placeholder label?>` is the filter box above a table. It
wears `inputClass`, so it is a soft rectangle rather than a pill, and it is a plain
input — not a combobox — because it narrows the table in place instead of opening a
result list. It is `w-full`; wrap it in a sized box (`w-full sm:max-w-xs`) to constrain
it.

`<LoadMore hasMore loading onClick label?>` is the footer of a cursor-paginated list. It
renders nothing when `hasMore` is false, so screens can include it unconditionally. A
`secondary` `sm` button, centered — secondary so it doesn't compete with the page's
primary action.

## Don'ts

- No arbitrary color values (`bg-[#088387]`) and no inline hex styles.
- No primary color for status, and no red/amber/green for brand or actions.
- No rounded-rect buttons. Buttons are `rounded-full`.
- No `dark:` variants until dark mode is designed.
- No per-element margins for layout spacing. Use `gap`.
