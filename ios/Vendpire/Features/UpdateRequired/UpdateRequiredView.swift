import SwiftUI

/// The update wall.
///
/// Sits in the bottom safe area rather than covering the screen: the store has
/// to stay readable behind it, so someone standing at a machine still sees
/// their planogram while being told to update. A wall that hides the data is a
/// worse bug than no wall.
struct UpdateRequiredView: View {
    let requirement: UpdateRequirement
    let updateUrl: URL?
    let onDismiss: (() -> Void)?

    private var title: String {
        requirement == .required ? "Update required" : "Update available"
    }

    private var message: String {
        requirement == .required
            ? "This version can no longer sync. Your counts are saved and will send once you update."
            : "A newer version is available."
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: requirement == .required
                ? "exclamationmark.triangle.fill"
                : "arrow.down.circle.fill")
                .foregroundStyle(requirement == .required ? .orange : .accentColor)
                .font(.title2)

            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            VStack(spacing: 8) {
                if let updateUrl {
                    Link("Update", destination: updateUrl)
                        .buttonStyle(.borderedProminent)
                }
                if let onDismiss {
                    Button("Later", action: onDismiss)
                        .buttonStyle(.borderless)
                        .font(.footnote)
                }
            }
        }
        .padding()
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}

extension View {
    func updateWall(_ support: ClientSupport) -> some View {
        safeAreaInset(edge: .bottom) {
            if support.isWallVisible {
                UpdateRequiredView(
                    requirement: support.requirement,
                    updateUrl: support.updateUrl,
                    onDismiss: support.isDismissible ? { support.dismissNudge() } : nil
                )
                .transition(.move(edge: .bottom))
            }
        }
        .animation(.default, value: support.isWallVisible)
    }
}
