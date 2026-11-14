import SwiftUI

/// The Lagoon scales, copied by hand from `docs/design-system.md`. Not generated
/// from the web's `theme.css`, so iOS is free to diverge where it wants to.
///
/// Views reach for the semantic styles below, not these. Namespaced because
/// `Color.primary` is already SwiftUI's label color.
enum LagoonPalette {
    static let primary50 = Color(hex: 0xE2FEF9)
    static let primary100 = Color(hex: 0xC4F9F3)
    static let primary200 = Color(hex: 0x91EEE7)
    static let primary300 = Color(hex: 0x4DDBD6)
    static let primary400 = Color(hex: 0x01BCBB)
    static let primary500 = Color(hex: 0x019EA0)
    static let primary600 = Color(hex: 0x088387)
    static let primary700 = Color(hex: 0x08686C)
    static let primary800 = Color(hex: 0x044D53)
    static let primary900 = Color(hex: 0x00353A)

    static let gray50 = Color(hex: 0xF5F9F9)
    static let gray100 = Color(hex: 0xECF1F1)
    static let gray200 = Color(hex: 0xDCE5E5)
    static let gray300 = Color(hex: 0xC5D0D0)
    static let gray400 = Color(hex: 0x9AA8A8)
    static let gray500 = Color(hex: 0x6E7E7E)
    static let gray600 = Color(hex: 0x4E5F5E)
    static let gray700 = Color(hex: 0x384949)
    static let gray800 = Color(hex: 0x243434)
    static let gray900 = Color(hex: 0x101F1F)

    static let green50 = Color(hex: 0xE9FEE9)
    static let green100 = Color(hex: 0xD3F8D6)
    static let green200 = Color(hex: 0xACEEB7)
    static let green300 = Color(hex: 0x78DC93)
    static let green400 = Color(hex: 0x30C26F)
    static let green500 = Color(hex: 0x07A25D)
    static let green600 = Color(hex: 0x01824E)
    static let green700 = Color(hex: 0x026841)
    static let green800 = Color(hex: 0x014E32)
    static let green900 = Color(hex: 0x013522)

    static let red50 = Color(hex: 0xFFF4F2)
    static let red100 = Color(hex: 0xFFE7E3)
    static let red200 = Color(hex: 0xFFCDC4)
    static let red300 = Color(hex: 0xFFA999)
    static let red400 = Color(hex: 0xFE745B)
    static let red500 = Color(hex: 0xEF462A)
    static let red600 = Color(hex: 0xCE2C17)
    static let red700 = Color(hex: 0xA52014)
    static let red800 = Color(hex: 0x7E150F)
    static let red900 = Color(hex: 0x570E0B)

    static let amber50 = Color(hex: 0xFFFAEB)
    static let amber100 = Color(hex: 0xFFF1CC)
    static let amber200 = Color(hex: 0xFFE29B)
    static let amber300 = Color(hex: 0xFFCC5A)
    static let amber400 = Color(hex: 0xFBB61B)
    static let amber500 = Color(hex: 0xED9F00)
    static let amber600 = Color(hex: 0xCD7D00)
    static let amber700 = Color(hex: 0xA45801)
    static let amber800 = Color(hex: 0x803D05)
    static let amber900 = Color(hex: 0x5D2A0B)
}

// MARK: - Semantic styles

/// What views use: `.foregroundStyle(.heading)`, `.background(.card)`.
/// Names avoid SwiftUI's own styles (`.link`, `.secondary`, `.background`),
/// which would make the dot syntax ambiguous.
extension ShapeStyle where Self == Color {
    // Surfaces
    static var appBackground: Color { LagoonPalette.gray50 }
    static var card: Color { .white }
    static var divider: Color { LagoonPalette.gray100 }
    static var line: Color { LagoonPalette.gray200 }

    // Text
    static var heading: Color { LagoonPalette.gray900 }
    static var bodyText: Color { LagoonPalette.gray700 }
    /// Meta lines and labels. Gray-600, not muted gray-500, to clear 4.5:1 on white.
    static var secondaryText: Color { LagoonPalette.gray600 }
    static var fieldBorder: Color { LagoonPalette.gray500 }

    // Actions
    /// The asset catalog's AccentColor, so system controls and Lagoon views
    /// can't drift apart. It holds primary-600.
    static var action: Color { .accentColor }
    static var actionSoft: Color { LagoonPalette.primary50 }
    static var linkText: Color { LagoonPalette.primary700 }
    static var focus: Color { LagoonPalette.primary500 }

    // Status
    static var warning: Color { LagoonPalette.amber800 }
    /// Icons and tints that flag a warning, where amber-800 reads as brown.
    static var warningAccent: Color { LagoonPalette.amber500 }
    static var warningSoft: Color { LagoonPalette.amber50 }
    /// A tile that needs a second look — stronger than `warningSoft`.
    static var warningFill: Color { LagoonPalette.amber100 }
    static var warningBorder: Color { LagoonPalette.amber200 }
    static var success: Color { LagoonPalette.green700 }
    static var successSoft: Color { LagoonPalette.green50 }
    static var successFill: Color { LagoonPalette.green100 }
    static var successBorder: Color { LagoonPalette.green200 }
    static var error: Color { LagoonPalette.red700 }
}

// MARK: - Shape

enum LagoonRadius {
    static let field: CGFloat = 12
}

extension View {
    /// Swaps a `Form` or `List`'s system gray for the teal-tinted app
    /// background. Rows stay white, which is already Lagoon's card.
    func lagoonBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(.appBackground)
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
