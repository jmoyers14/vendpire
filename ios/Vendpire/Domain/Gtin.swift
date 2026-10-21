import Foundation

/// What a scanned code looked like before normalization.
nonisolated enum GtinFormat: String, Sendable {
    case upcE = "upc-e"
    case upcA = "upc-a"
    case ean13 = "ean-13"
    case gtin14 = "gtin-14"
}

nonisolated struct NormalizedGtin: Equatable, Sendable {
    /// Canonical 14-digit form — the only spelling that gets stored.
    let gtin14: String
    let format: GtinFormat
    /// A native 14-digit code whose indicator digit is 1–8: a strong signal
    /// it's a pack rather than a unit.
    let likelyCase: Bool
}

/// Barcode normalization, ported from `packages/domain/src/gtin/gtin.ts`.
///
/// Both implementations are tested against the same `vectors.json`, so a fix to
/// one is a failing test in the other until it is ported across.
nonisolated enum Gtin {
    /// GS1 mod-10 check digit for `digits`, which excludes the check digit.
    static func gs1CheckDigit(_ digits: String) -> Int {
        // Weights 3,1,3,1… from the rightmost digit.
        let sum = digits.reversed().enumerated().reduce(0) { total, pair in
            let (index, character) = pair
            return total + (character.wholeNumberValue ?? 0) * (index.isMultiple(of: 2) ? 3 : 1)
        }
        return (10 - (sum % 10)) % 10
    }

    /// Normalizes any scanned or typed barcode to GTIN-14; `nil` when the input
    /// cannot be a valid GTIN.
    static func normalize(_ raw: String) -> NormalizedGtin? {
        let digits = String(raw.filter { $0.isASCII && $0.isNumber })
        var code = digits
        let format: GtinFormat

        switch digits.count {
        case 8:
            guard let expanded = expandUpcE(digits) else { return nil }
            code = expanded
            format = .upcE
        case 12:
            format = .upcA
        case 13:
            format = .ean13
        case 14:
            format = .gtin14
        default:
            return nil
        }

        guard hasValidCheckDigit(code) else { return nil }

        let gtin14 = String(repeating: "0", count: 14 - code.count) + code
        let indicator = gtin14.first
        return NormalizedGtin(
            gtin14: gtin14,
            format: format,
            likelyCase: format == .gtin14 && indicator != "0" && indicator != "9"
        )
    }

    /// Expands UPC-E to UPC-A. The check digit carries over unchanged because
    /// it is computed from the expanded form — which is why this has to happen
    /// before validation.
    private static func expandUpcE(_ code: String) -> String? {
        let digits = Array(code)
        let numberSystem = digits[0]
        guard numberSystem == "0" || numberSystem == "1" else { return nil }

        let x1 = digits[1], x2 = digits[2], x3 = digits[3]
        let x4 = digits[4], x5 = digits[5], x6 = digits[6]
        let check = digits[7]

        let body: String
        switch x6 {
        case "0", "1", "2": body = "\(x1)\(x2)\(x6)0000\(x3)\(x4)\(x5)"
        case "3": body = "\(x1)\(x2)\(x3)00000\(x4)\(x5)"
        case "4": body = "\(x1)\(x2)\(x3)\(x4)00000\(x5)"
        default: body = "\(x1)\(x2)\(x3)\(x4)\(x5)0000\(x6)"
        }
        return "\(numberSystem)\(body)\(check)"
    }

    private static func hasValidCheckDigit(_ code: String) -> Bool {
        guard let check = code.last?.wholeNumberValue else { return false }
        return gs1CheckDigit(String(code.dropLast())) == check
    }
}
