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
| `ink` | gray-900 | `text-ink` (headings) |
| `ink-soft` | gray-700 | `text-ink-soft` (body text) |
| `muted` | gray-500 | `text-muted` (16px+ only; fails 4.5:1 smaller) |
| `muted-strong` | gray-600 | `text-muted-strong` (secondary text under 18px) |
| `nav` | gray-100 | `bg-nav` |
| `tab` / `tab-active` / `tab-indicator` | gray-600 / primary-700 / primary-500 | `text-tab`, `text-tab-active`, `border-tab-indicator` |
| `profit` / `loss` | green-700 / red-700 | `text-profit`, `text-loss` |
| `action` / `action-hover` / `action-soft` / `on-action` | primary-600 / primary-700 / primary-50 / white | `bg-action` (primary button), `bg-action-soft` (selected rows) |
| `link` | primary-700 | `text-link` (text links, outline and text button labels) |
| `field` | gray-500 | `border-field` (input borders, 3:1 on white) |
| `line-strong` | gray-300 | `border-line-strong` (outline button border) |
| `focus` | primary-500 | `outline-focus` |
| `disabled` / `on-disabled` | gray-100 / gray-600 | `bg-disabled text-on-disabled` (neutral, never faded teal) |
| `success` / `success-soft` | green-700 / green-50 | good, stocked, profit |
| `warning` / `warning-soft` | amber-800 / amber-50 | low, expiring, attention |
| `danger` / `danger-soft` / `danger-fill` | red-700 / red-50 / red-600 | empty, errors, loss; `danger-fill` is reserved for a solid destructive fill (unused today) |

`heading` and `body` were renamed to `ink` and `ink-soft` so the names `text-heading`
and `text-body` belong to the type scale below; Tailwind resolves a shared name to the
color and silently drops the size.

Also defined: `font-display`, `font-sans` (default body), `font-mono`, `rounded-control`
(12px), `rounded-panel` (14px: insets, tables, steps), `rounded-card` (18px), `shadow-card`,
`max-w-form` (1080px) and `max-w-wide` (1320px). Meter and dot colors: `success-indicator`,
`warning-indicator`, `danger-indicator` (never for text).

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
| Page title | `font-display text-2xl font-extrabold text-ink` (`<PageTitle>`) |
| Card/section title | `font-display text-lg font-extrabold text-ink` (`<CardTitle>`) |
| KPI value | `font-display text-2xl font-extrabold tabular-nums` |
| KPI label | `text-xs uppercase tracking-wider text-gray-600` |
| Body | `text-base text-ink-soft` (default) |
| Secondary / meta | `text-sm text-gray-600` |
| Slot codes (A1, B2) | `font-mono text-xs text-muted` |

Use `tabular-nums` anywhere numbers line up (counts, money).

### Type scale

Each `text-*` sets size, line height and weight (and tracking where noted). A
Tailwind `--text-*` token can't carry a font family or text-transform, so pair it
with the family class shown.

| Utility | Pair with | Size / line | Weight | Use |
|---|---|---|---|---|
| `text-display` | `font-display` | 32 / 36, -0.01em | 700 | Page H1, one per page |
| `text-title` | `font-display` | 24 / 30 | 700 | Card or editor title |
| `text-heading` | `font-display` | 18 / 24 | 600 | Section titles |
| `text-stat` | `font-display tabular-nums` | 28 / 32 | 700 | Big numbers |
| `text-body` | — | 16 / 24 | 400 | Default |
| `text-body-sm` | — | 14 / 20 | 400 | Hints, meta, descriptions |
| `text-label` | — | 14 / 20 | 700 | Field labels |
| `text-overline` | `uppercase` | 12 / 16, 0.06em | 700 | Table headers, small captions |
| `text-mono` | `font-mono tabular-nums` | 15 / 20 | 500 | Slot codes, counts, prices |

## Shape & spacing

- **Inputs:** 48px tall (`h-12`), 56px for big count inputs (`h-14`), `rounded-control`.
- **Cards:** `rounded-card`, 24px padding (`p-6`) on web.
- **Buttons:** pills, 44px tall (`h-11`), `text-button` (15/20 bold).
- **Spacing:** 8px label to input, 20–24px between fields, 32px between sections.
- **Shadow:** `shadow-card` is the only shadow.

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

`packages/web/src/screens/root-layout/RootLayout.tsx`. The selected tab gets `aria-current="page"`,
`text-tab-active` and `border-tab-indicator`. Unselected tabs get `text-tab` with a
transparent 3px border, so the label doesn't shift when it becomes current.

Current tabs: **Dashboard, Locations, Machines, Products, Packs, Purchases,
Settings**.

### Buttons — `<Button>` / `buttonClass()` / `<IconButton>`

Every button is a pill (`rounded-full`), text buttons included — it's the shape their
focus ring takes. **One `primary` per view**; everything else is `secondary` or `text`.

| Variant | Look | Use |
|---|---|---|
| `primary` | `bg-action text-on-action`, hover `action-hover` | The view's one main action |
| `secondary` | `border-line-strong bg-card text-link`, hover border `action` | Other actions, Previous, Discard/Cancel |
| `text` | `text-link`, underline on hover | Low-weight actions inside content ("Use it", "Mark the rest unchanged") |
| `danger` | `border-danger-indicator bg-danger-soft text-danger` | Confirming a destructive action, never a page's main action |

Sizes: `md` (`h-11`, the default), `lg` (`h-12`, beside a 48px input: "Look up", "Add") and
`sm` (`h-9`) for dense contexts like table-row actions. `isFullWidth` makes it `w-full`.
Disabled is a neutral `bg-disabled text-on-disabled` fill, never a faded teal.

Use `<Button>` for `<button>` elements and `buttonClass({ ... })` for router `<Link>`s and
anchors, so both wear identical styling. `<IconButton label tone>` is the round icon-only
button (`neutral` or `danger` hover); `label` becomes its accessible name and tooltip.

### Status tones — `StatusTone`

One vocabulary for status across components: `success`, `warning`, `danger`, named after
the color tokens. Components that need more add `neutral` (and `pending` on MachineMap
tiles, `action` on badges). `stockTone(remaining, capacity)` picks the status from the
shared thresholds: danger at 0, warning at 30% or below, otherwise success.
`countMeterFor({ found, par })` turns a count into a MachineMap tile's meter and tone.

### Status pill — `<StatusPill tone>`

Base: `inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap`.
Tones `success` / `warning` / `danger` (green, amber, red 100/800). New screens use `<Badge>`.

### Alert banner — `<Alert tone title>`

Base: `rounded-card border px-3.5 py-3 text-sm grid gap-0.5`, bold title line plus
optional detail line. Tones: `warning` (amber-50/200/900), `danger` (red-50/200/900),
`success` (green-50/200/900). `<ErrorNote message>` is the danger variant for
query/mutation failures and renders nothing when `message` is null.

### KPI card — `<KpiCard label value tone>` inside `<KpiGrid>`

`bg-card rounded-card shadow-card p-3`, label on top and value below. `tone` is `profit`,
`loss`, or `neutral`. `<KpiGrid>` lays them out two-up (`grid grid-cols-2 gap-2.5`).

### Slot list — `<SlotList>` + `<SlotRow code label status>`

`bg-card rounded-card shadow-card divide-y divide-divider`. Each row is
`grid grid-cols-[36px_1fr_auto] items-center gap-2.5 px-3 py-2.5 text-sm`: slot code
(mono, muted), product name, then a status pill.

### Layout — `<Page>`, `<PageTitle>`, `<PageSubtitle>`, `<Card>`, `<CardTitle>`, `<TableScroll>`, `<EmptyState>`

### Form controls — `inputClass`, `countInputClass`, `labelClass`, `hintClass`, `checkboxClass` (deprecated)

New screens use `<Field>` with `<TextInput>`, `<NumberInput>`, `<Switch>` and friends (see Lagoon components). These class strings stay until every screen migrates.

`checkboxClass` applies `accent-primary-600` so native checkboxes stop rendering in the
browser's default blue.

`countInputClass` is the variant for fields filled in standing at a machine: 16px text
(iOS Safari zooms the whole page when a focused input's text is smaller) plus
`tabular-nums` so counts line up down a column. Both it and `inputClass` are composed
from one shared base, because two font-size utilities on one element leaves the winner up
to stylesheet order. Use it with `inputMode="numeric"` for count fields.

### Machine face — `<SlotFaceGrid shelves renderCell onSelect selectedCode>` (deprecated)

Replaced by `<MachineMap>`; stays until the visit, planogram and machine screens migrate.

One strip of cells per shelf, cells spanning equal width, on a `bg-gray-100 rounded-md`
tray. Every screen that shows a machine layout renders through this — the machine form
(bare codes), the planogram screen, and the visit screens — so a slot looks and behaves
the same wherever it appears.

Consumers supply a cell's content and `state`; the grid owns all the chrome, including
selection. States carry meaning rather than color: `assigned` (white), `empty` (dashed),
`done` (green — counted, filled, complete), `attention` (amber — worth a look, never a
block). Selection uses primary, because it's an interaction and not a status. Cells
become buttons only when `onSelect` is passed.

Cells have a `min-w-14` floor and the tray scrolls horizontally, so a wide shelf on a
phone scrolls instead of crushing eight cells into slivers.

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

## Lagoon components

All live in `packages/web/src/ui/`, are exported from `ui.tsx`, and render in every state on `/design`.

| Component | Use |
|---|---|
| `PageHeader` | Eyebrow breadcrumb, H1 (the record's name on edit/detail pages), badge + meta row, a right-hand link that names its destination. Use `eyebrowLinkClass` / `pageLinkClass` on the links. |
| `FormSection`, `FieldRow`, `SectionDivider` | 260px title + description column beside a card of fields; sections divided by a rule. `layout="stacked"` puts the title above a full-width card, for forms whose tables need the room (Log Purchase). `FieldRow` puts two fields side by side. |
| `Field` + `TextInput` / `Select` / `TextArea` | Visible label, optional "optional" marker, hint and error. The control picks up its id and `aria-describedby` from the Field. |
| `NumberInput`, `MoneyInput` | Mono, tabular, `inputMode` set, password managers kept out. Sizes `sm` (table row), `md` (form), `lg` (count at the machine); optional prefix and suffix. Values stay strings. |
| `Button`, `IconButton` | See Buttons above. |
| `Switch` | Title + description + switch over a real checkbox. |
| `SaveBar` + `useFormDraft` | Sticky footer with saved/unsaved state or a summary; Save is disabled on a clean form. `dismissal="discard"` (edit pages) or `"cancel"` (create pages). Render it after the page container and pass `formId`. |
| `RowTable` (+ `Header`, `Body`, `Row`, `Footer`, `Empty`) | CSS-grid rows of inputs. `boxed` or `plain`. Inputs need their own `aria-label`. |
| `FactsPanel`, `Fact`, `FactVerdict` | Tinted key/value list with an optional success/warning verdict row. |
| `Stepper` | Numbered steps with done/current/upcoming and a progress line; replaces tabs for sequential flows. |
| `MachineMap`, `MachineMapLegend` | The machine face: one row per shelf, tiles sharing the width, value + meter + ×N marker, optional product name (read-only maps); selected, empty, target, source and search-dimmed states; optional "go to slot or product" search. Replaces `SlotFaceGrid`. |
| `Badge`, `ChipGroup`, `Kbd`, `ProgressBar` | Uppercase status labels, single-choice chips, key hints, the thin progress bar. |

The old class strings in `Field.tsx` (`inputClass`, `labelClass`, …) and `SlotFaceGrid` are deprecated and go away as screens migrate.

## Don'ts

- No arbitrary color values (`bg-[#088387]`) and no inline hex styles.
- No primary color for status, and no red/amber/green for brand or actions.
- No rounded-rect buttons. Buttons are `rounded-full`.
- No `dark:` variants until dark mode is designed.
- No per-element margins for layout spacing. Use `gap`.
