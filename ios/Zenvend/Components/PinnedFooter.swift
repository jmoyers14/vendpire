import SwiftUI

extension View {
    /// A card-colored bar pinned under the content, above the keyboard when
    /// it's up — where a screen's main action lives.
    func pinnedFooter<Footer: View>(
        isVisible: Bool = true,
        @ViewBuilder _ footer: () -> Footer
    ) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if isVisible {
                footer()
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                    .background(.card)
                    .overlay(alignment: .top) {
                        Rectangle()
                            .fill(.line)
                            .frame(height: 1)
                    }
            }
        }
    }
}
