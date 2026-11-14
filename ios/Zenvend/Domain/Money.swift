import Foundation

/// Money is `Int` cents everywhere else in the app. These are the only places
/// it crosses a text boundary, ported from `packages/web/src/utils/money.ts`.
nonisolated enum Money {
    /// Render integer cents as "$1,234.56" — matches the web's
    /// `toLocaleString("en-US", { style: "currency", currency: "USD" })`.
    static func formatCents(_ cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "$0.00"
    }

    /// "25.98" — no symbol and no grouping, so it fills a cost field and
    /// `parseDollarsToCents` reads it straight back.
    static func formatCentsForEditing(_ cents: Int) -> String {
        String(format: "%d.%02d", cents / 100, cents % 100)
    }

    /// Parse a dollars text field ("1.75") to integer cents, or `nil` if invalid.
    ///
    /// Ports `Number.parseFloat` followed by a negative/NaN guard, not strict
    /// numeric parsing: the web reads only the longest numeric prefix of the
    /// string and ignores the rest, so "12.99 " parses and "$12.99" does not
    /// (the `$` isn't part of a numeric prefix, so parseFloat itself returns
    /// NaN there — a text field that wants to accept a leading `$` has to
    /// strip it before calling this, same as the web does).
    static func parseDollarsToCents(_ text: String) -> Int? {
        guard let value = leadingDouble(in: text), value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    /// Mirrors `Number.parseFloat`: skip leading whitespace, then read the
    /// longest prefix matching `[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?`.
    /// Returns `nil` when no numeric prefix exists at all — JS's `NaN` has no
    /// analog worth inventing here.
    private static func leadingDouble(in text: String) -> Double? {
        let chars = Array(text.drop { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "\r" })
        var index = 0

        if index < chars.count, chars[index] == "+" || chars[index] == "-" {
            index += 1
        }

        let intDigitsStart = index
        while index < chars.count, chars[index].isASCII, chars[index].isNumber {
            index += 1
        }
        let hasIntDigits = index > intDigitsStart

        var hasFracDigits = false
        if index < chars.count, chars[index] == "." {
            index += 1
            let fracDigitsStart = index
            while index < chars.count, chars[index].isASCII, chars[index].isNumber {
                index += 1
            }
            hasFracDigits = index > fracDigitsStart
        }

        guard hasIntDigits || hasFracDigits else { return nil }

        var numberEnd = index
        if index < chars.count, chars[index] == "e" || chars[index] == "E" {
            var exponentIndex = index + 1
            if exponentIndex < chars.count, chars[exponentIndex] == "+" || chars[exponentIndex] == "-" {
                exponentIndex += 1
            }
            let exponentDigitsStart = exponentIndex
            while exponentIndex < chars.count, chars[exponentIndex].isASCII, chars[exponentIndex].isNumber {
                exponentIndex += 1
            }
            if exponentIndex > exponentDigitsStart {
                numberEnd = exponentIndex
            }
        }

        return Double(String(chars[0..<numberEnd]))
    }
}
