import Foundation

/// Money is `Int` cents everywhere else in the app. This is the only place it
/// becomes text, so rounding lives here and nowhere else.
func priceText(cents: Int) -> String {
    String(format: "$%d.%02d", cents / 100, cents % 100)
}
