import SwiftUI

/// The theme at a glance, for previews only — the iOS counterpart of the web's
/// `/design` route. Nothing in the app navigates here.
private struct LagoonSwatches: View {
    private let swatches: [(name: String, color: Color)] = [
        ("appBackground", .appBackground), ("card", .card), ("divider", .divider),
        ("line", .line), ("heading", .heading), ("bodyText", .bodyText),
        ("secondaryText", .secondaryText), ("fieldBorder", .fieldBorder),
        ("action", .action), ("actionSoft", .actionSoft), ("linkText", .linkText),
        ("focus", .focus), ("warning", .warning), ("warningSoft", .warningSoft),
        ("warningBorder", .warningBorder), ("success", .success),
        ("successSoft", .successSoft), ("profit", .profit), ("loss", .loss),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                typeSample
                swatchGrid
            }
            .padding(16)
        }
        .background(.appBackground)
    }

    /// The mockup's three fonts, mapped onto system text styles.
    private var typeSample: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Items")
                .font(.title3.bold())
                .foregroundStyle(.heading)
            Text("Orange soda Sunkist")
                .font(.headline)
                .foregroundStyle(.heading)
            Text("Scan each product's barcode, or add it by name.")
                .font(.body)
                .foregroundStyle(.bodyText)
            Text("35 cans")
                .font(.subheadline)
                .foregroundStyle(.secondaryText)
            HStack {
                Text("$37.98")
                Spacer()
                Text("$41.20")
            }
            .font(.body.monospacedDigit())
            .foregroundStyle(.heading)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    private var swatchGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 12) {
            ForEach(swatches, id: \.name) { swatch in
                VStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: LagoonRadius.field, style: .continuous)
                        .fill(swatch.color)
                        .frame(height: 48)
                        .overlay {
                            RoundedRectangle(cornerRadius: LagoonRadius.field, style: .continuous)
                                .strokeBorder(.line)
                        }
                    Text(swatch.name)
                        .font(.caption)
                        .foregroundStyle(.secondaryText)
                }
            }
        }
        .padding(16)
        .cardStyle()
    }
}

#Preview("Lagoon") {
    LagoonSwatches()
}
