import SwiftUI

/// A list section's header in Lagoon: a bold title in heading color, not the
/// system's small uppercase caption.
struct SectionTitle: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.title3.bold())
            .foregroundStyle(.heading)
            .textCase(nil)
    }
}
