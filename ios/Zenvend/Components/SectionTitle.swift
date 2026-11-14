import SwiftUI

/// A list section's header in Lagoon: a bold title in heading color, not the
/// system's small uppercase caption, with an optional "3 products" count.
struct SectionTitle: View {
    let title: String
    var productCount: Int?

    init(_ title: String, productCount: Int? = nil) {
        self.title = title
        self.productCount = productCount
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.bold())
                .foregroundStyle(.heading)
            if let productCount, productCount > 0 {
                Spacer()
                Text("^[\(productCount) product](inflect: true)")
                    .font(.subheadline)
                    .foregroundStyle(.secondaryText)
            }
        }
        .textCase(nil)
    }
}
