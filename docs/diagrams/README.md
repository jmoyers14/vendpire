# Diagrams

Mermaid diagrams, kept as fenced code blocks inside Markdown so they stay
diffable and reviewable — a changed arrow shows up in a PR as a changed line,
which a checked-in SVG or PNG can't do.

## Index

| File | Shows |
|---|---|
| `barcode-resolution.md` | How a scanned barcode resolves to a product or pack. |
| `webhook-ingestion.md` | How a Clerk webhook becomes a local user / org / membership row. |
| `visit-calculations.md` | How two visit counts become sold units, revenue, COGS, and profit — with worked numbers. |

## Authoring

Write a ` ```mermaid ` fence in any `.md` file here. One file per mechanism,
named after what it shows.

Conventions worth keeping:

- **Label every arrow.** An unlabeled arrow only says "related somehow";
  `writes`, `miss`, `invalidates` is information.
- **Name the real call.** `products.findByUpc` beats "look up product" — it
  makes the diagram greppable against the code it describes.
- **No hardcoded colors.** GitHub renders these in both light and dark themes,
  and a hardcoded `fill:#fff` turns into white-on-white for half your readers.
  Let the theme supply the palette; use node *shape* to carry meaning instead.
- **One diagram, one claim.** If you need a second claim, add a second fence
  with its own heading.

## Previewing

| Where | How |
|---|---|
| GitHub | Renders `mermaid` fences natively — just push. |
| VS Code | Built-in Markdown preview does **not** do Mermaid; install `bierner.markdown-mermaid`. |
| Quick iteration | <https://mermaid.live> — paste the fence body, edit live, copy back. |

## Exporting an image

Only when something outside the repo needs it (a slide, an issue comment).
Don't commit the output — regenerate it.

```sh
bunx @mermaid-js/mermaid-cli -i docs/diagrams/barcode-resolution.md -o /tmp/barcode.svg
```

## Index

| Diagram | Shows |
|---|---|
| [barcode-resolution.md](barcode-resolution.md) | What happens when an operator enters a UPC during purchase entry |
