import { Page, PageHeader } from "../../ui.tsx";
import { ComponentGallery } from "./ComponentGallery.tsx";

/**
 * Living reference for the design system: every primitive on one page, so a
 * change to theme.css can be eyeballed against the whole set. Not linked from
 * the nav; reachable at /design.
 */
export function DesignSystemScreen() {
  return (
    <Page max="wide" className="grid gap-10">
      <PageHeader title="Design system" meta="Lagoon · light mode only · every primitive on one page" />
      <ComponentGallery />
    </Page>
  );
}
