import SwiftUI

/// A small capsule of text — the shape every status marker uses. Soft fill,
/// dark text, thin border, per Lagoon: never white text on a status color.
struct Pill: View {
    enum Tone {
        case neutral
        case outlined
        case warning
    }

    let text: String
    let tone: Tone

    init(_ text: String, tone: Tone) {
        self.text = text
        self.tone = tone
    }

    var body: some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .foregroundStyle(foreground)
            .background(fill, in: Capsule())
            .overlay(Capsule().strokeBorder(border))
    }

    private var foreground: Color {
        switch tone {
        case .neutral: LagoonPalette.gray800
        case .outlined: .secondaryText
        case .warning: .warning
        }
    }

    private var fill: Color {
        switch tone {
        case .neutral: .divider
        case .outlined: .card
        case .warning: .warningSoft
        }
    }

    private var border: Color {
        switch tone {
        case .neutral: .divider
        case .outlined: .line
        case .warning: .warningBorder
        }
    }
}

/// The "ITEM" / "CASE" pill shown anywhere a `CatalogItem` or `PurchaseRow`
/// needs to say which kind of record it is.
struct KindBadge: View {
    let isPack: Bool

    var body: some View {
        Pill(isPack ? "CASE" : "ITEM", tone: isPack ? .neutral : .outlined)
            .tracking(0.5)
    }
}
