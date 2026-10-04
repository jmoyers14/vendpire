import {
  CreateOrganization,
  OrganizationSwitcher,
  Show,
  UserButton,
  useOrganization,
} from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { focusRing, Page, PageTitle } from "../../ui.tsx";
import { VersionFooter } from "./VersionFooter.tsx";
import { queryClient } from "../../trpc.ts";
import { LandingScreen } from "../landing/LandingScreen.tsx";

// `exact` keeps the Dashboard tab from matching every nested route under "/".
const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/locations", label: "Locations" },
  { to: "/machines", label: "Machines" },
  { to: "/products", label: "Products" },
  { to: "/packs", label: "Packs" },
  { to: "/purchases", label: "Purchases" },
];

// Router Link appends activeProps to the base className rather than replacing
// it, so the tab's color and border live entirely in active/inactiveProps —
// otherwise the two sets collide and stylesheet order decides the winner.
const TAB_BASE =
  "border-b-[3px] px-2.5 pt-2 pb-2.5 text-sm font-bold whitespace-nowrap";

const Header = () => (
  <header className="border-b border-line bg-nav">
    <div className="flex flex-col gap-2.5 px-4 pt-3.5 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          className={`flex items-center gap-2 font-display font-extrabold text-heading ${focusRing}`}
        >
          <span className="size-[18px] rounded-md bg-primary-500" />
          Vendpire
        </Link>
        <div className="flex items-center gap-3">
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/"
            appearance={{
              elements: {
                organizationSwitcherTrigger:
                  "text-gray-700 hover:bg-gray-200 rounded-full",
                organizationPreviewMainIdentifier: "text-gray-800 font-bold",
              },
            }}
          />
          <UserButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto" aria-label="Main">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={tab.exact ? { exact: true } : undefined}
            className={`${TAB_BASE} ${focusRing}`}
            activeProps={{
              className: "border-tab-indicator text-tab-active",
              "aria-current": "page",
            }}
            inactiveProps={{
              // Transparent (not absent) so the label doesn't shift when the
              // tab becomes current.
              className: "border-transparent text-tab hover:text-gray-800",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  </header>
);

const SignedInArea = () => {
  const { organization, isLoaded } = useOrganization();

  // On org switch, drop cached data so queries refetch for the new business.
  useEffect(() => {
    queryClient.invalidateQueries();
  }, [organization?.id]);

  if (!isLoaded) {
    return <div className="p-4 text-muted sm:p-6">Loading…</div>;
  }

  // The Clerk organization IS the business — a user must belong to one before
  // anything else works, since every document is keyed by its orgId.
  if (!organization) {
    return (
      <Page max="xl" className="grid gap-4">
        <div className="grid gap-1">
          <PageTitle>Create your business</PageTitle>
          <p className="text-body">
            Set up your vending business to continue. You can invite your
            partner afterward.
          </p>
        </div>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </Page>
    );
  }

  return <Outlet />;
};

export function RootLayout() {
  return (
    <>
      <Show when="signed-out">
        <LandingScreen />
      </Show>
      <Show when="signed-in">
        <div className="flex min-h-screen flex-col bg-app">
          <Header />
          <div className="flex-1">
            <SignedInArea />
          </div>
          <VersionFooter />
        </div>
      </Show>
    </>
  );
}
