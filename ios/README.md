# Vendpire iOS

Native SwiftUI app for field work. Lives outside the Bun workspace — Biome's
`files.includes` is JS/TS only, so nothing here is linted by the root tooling.

## Running it

**Day to day, use Xcode** (`ios/Vendpire.xcodeproj`). Previews, the debugger,
and the view inspector have no CLI equivalent.

The scripts below exist for the reproducible path — agent loops, and later CI:

```sh
bun run ios:build        # compile for the simulator
bun run ios:test         # unit tests only (UI tests are skipped)
bun run ios:run          # build, boot the simulator, install, launch
bun run ios:install-staging  # Release build onto the plugged-in phone
bun run ios:screenshot   # capture the booted simulator to ios/build/screenshot.png
```

All four delegate to `ios/Scripts/xc`, which can also be called directly
(`ios/Scripts/xc run --console-pty` streams the app's stdout).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) — layering, why there are no view models
yet, and why auth never gates the store.

## Toolchain

This machine has two Xcodes. The scripts pin **Xcode 26.1** via `DEVELOPER_DIR`
because `xcode-select` has pointed at 16.4, whose iOS 18.5 SDK silently fails to
build this project. Override if yours differs:

```sh
DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer bun run ios:build
VENDPIRE_SIM="iPhone 16" bun run ios:run      # default: iPhone 17 Pro
```

- Deployment target: **iOS 18.0**
## Two apps on one phone

Debug and Release install as separate apps so day-to-day development never
replaces the app holding real data:

| Scheme | Configuration | App | Bundle ID | API |
|---|---|---|---|---|
| `Vendpire` | Debug | Vendpire Dev (DEV icon) | `com.dogbeach.dev.Vendpire.debug` | localhost, or `Local.xcconfig` |
| `Vendpire Staging` | Release | Vendpire | `com.dogbeach.dev.Vendpire` | staging (Cloud Run) |

Run either scheme from Xcode with the phone selected, or use
`ios:install-staging`. The identity comes from `BUNDLE_ID_SUFFIX`,
`APP_DISPLAY_NAME`, and `APP_ICON_NAME` in `Config/*.xcconfig`.
