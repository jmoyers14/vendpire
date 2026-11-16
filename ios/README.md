# Zenvend iOS

Native SwiftUI app for field work. Lives outside the Bun workspace — Biome's
`files.includes` is JS/TS only, so nothing here is linted by the root tooling.

## Running it

**Day to day, use Xcode** (`ios/Zenvend.xcodeproj`). Previews, the debugger,
and the view inspector have no CLI equivalent.

The scripts below exist for the reproducible path — agent loops, and later CI:

```sh
bun run ios:build        # compile for the simulator
bun run ios:test         # unit tests only (UI tests are skipped)
bun run ios:run          # build, boot the simulator, install, launch
bun run ios:install-production  # Release build onto the plugged-in phone
bun run ios:testflight   # archive Release and upload to TestFlight
bun run ios:screenshot   # capture the booted simulator to ios/build/screenshot.png
```

All of them delegate to `ios/Scripts/xc`, which can also be called directly
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
ZENVEND_SIM="iPhone 16" bun run ios:run      # default: iPhone 17 Pro
```

- Deployment target: **iOS 18.0**
## Two apps on one phone

Debug and Release install as separate apps so day-to-day development never
replaces the app holding real data:

| Scheme | Configuration | App | Bundle ID | API |
|---|---|---|---|---|
| `Zenvend` | Debug | Zenvend Dev (DEV icon) | `com.dogbeach.zenvend.debug` | localhost, or `Local.xcconfig` |
| `Zenvend Production` | Release | Zenvend | `com.dogbeach.zenvend` | production (`api.zenvend.app`) |

Run either scheme from Xcode with the phone selected, or use
`ios:install-production`. The identity comes from `BUNDLE_ID_SUFFIX`,
`APP_DISPLAY_NAME`, and `APP_ICON_NAME` in `Config/*.xcconfig`.

## TestFlight

`bun run ios:testflight` archives the `Zenvend Production` scheme and uploads it
to App Store Connect. The version comes from the root `package.json` (which
release-please bumps) and the build number is a UTC timestamp, so any machine
can upload without coordinating.

It authenticates with an App Store Connect API key (App Manager role):

```sh
export ASC_KEY_ID=…       # Users and Access → Integrations → App Store Connect API
export ASC_ISSUER_ID=…
# Default key location; set ASC_KEY_PATH to use another.
# ~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8
bun run ios:testflight
```

Signing is manual (see `Config/ExportOptions.plist`), so the machine also needs
the team's **Apple Distribution** certificate in its keychain and the App Store
profile named **Zenvend Production** for `com.dogbeach.zenvend` installed. The
profile expires 2027-11-15.

Releases are manual — not every web release needs an iOS build.
