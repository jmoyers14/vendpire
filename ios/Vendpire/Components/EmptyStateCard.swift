import SwiftUI

/// The empty state inside a list section: an icon in a soft circle, a title,
/// and one line of what to do next.
struct EmptyStateCard: View {
    let systemImage: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(.bodyText)
                .frame(width: 52, height: 52)
                .background(.divider, in: Circle())
                .padding(.bottom, 4)
            Text(title)
                .font(.headline)
                .foregroundStyle(.heading)
            Text(message)
                .font(.body)
                .foregroundStyle(.bodyText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}
