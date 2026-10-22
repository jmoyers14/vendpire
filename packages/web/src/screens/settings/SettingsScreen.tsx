import { OrganizationProfile } from "@clerk/react";
import { Page, PageSubtitle, PageTitle } from "../../ui.tsx";

// Not backed by the membership mirror: Clerk fires
// organizationMembership.created only on accept, so a pending invitation has no
// row and the invitee would be missing from the list. See docs/adr/0001.
//
// routing="hash" keeps Clerk's sub-navigation out of TanStack Router — in
// "path" mode it drives window.history directly and the two desync.
const appearance = {
  elements: {
    // Clerk's default is a rounded rect; ours are pills.
    formButtonPrimary:
      "rounded-full bg-primary-600 hover:bg-primary-700 active:bg-primary-800 font-bold normal-case",
    organizationPreviewMainIdentifier: "text-gray-800 font-bold",
    headerTitle: "font-display font-extrabold text-heading",
    navbarButton: "text-tab",
  },
};

export function SettingsScreen() {
  return (
    <Page max="4xl" className="grid gap-4">
      <div className="grid gap-1">
        <PageTitle>Settings</PageTitle>
        <PageSubtitle>
          Manage your business details and who has access to it.
        </PageSubtitle>
      </div>
      <OrganizationProfile
        routing="hash"
        afterLeaveOrganizationUrl="/"
        appearance={appearance}
      />
    </Page>
  );
}
