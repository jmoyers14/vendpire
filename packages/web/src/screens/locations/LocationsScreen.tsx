import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ApiLocation } from "../../apiTypes.ts";
import {
  Badge,
  buttonClass,
  ErrorNote,
  focusRing,
  Page,
  PageHeader,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { trpc } from "../../trpc.ts";
import { commissionLabel } from "./commission.ts";
import { addressLineFor, telHrefFor } from "./locationForm.ts";

/** Location · Contact · Commission. */
const LOCATION_COLUMNS = "minmax(0,1.4fr) minmax(0,1fr) 160px";

const contactLinkClass = `rounded-sm text-body-sm text-link hover:underline ${focusRing}`;

/** Where your machines live, read as an address book: where, and who to call. */
export function LocationsScreen() {
  const locationsQuery = useQuery(trpc.locations.list.queryOptions());
  const locations = locationsQuery.data ?? [];

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        title="Locations"
        meta={
          locationsQuery.isLoading ? undefined : "Where your machines live, and who to call there."
        }
        aside={
          <Link to="/locations/new" className={buttonClass()}>
            Add location
          </Link>
        }
      />

      <ErrorNote message={locationsQuery.error?.message ?? null} />

      {locationsQuery.isLoading ? (
        <p className="text-body text-muted-strong">Loading…</p>
      ) : null}
      {locationsQuery.isSuccess ? (
        <RowTable
          columns={LOCATION_COLUMNS}
          minWidth="640px"
          // The boxed table draws the border; this adds the card's fill and shadow behind it.
          className="rounded-panel bg-card shadow-card"
        >
          <RowTableHeader>
            <span>Location</span>
            <span>Contact</span>
            <span>Commission</span>
          </RowTableHeader>
          {locations.length > 0 ? (
            <RowTableBody>
              {locations.map((location) => (
                <LocationRow key={location.id} location={location} />
              ))}
            </RowTableBody>
          ) : (
            <RowTableEmpty>No locations yet. Add the first spot your machines live.</RowTableEmpty>
          )}
        </RowTable>
      ) : null}
    </Page>
  );
}

/** One location. The name links to its edit page; phone and email open the dialer or mail app. */
function LocationRow({ location }: { location: ApiLocation }) {
  const addressLine = addressLineFor(location.address);
  const { contact } = location;
  const hasContact = Boolean(contact.name || contact.phone || contact.email);

  return (
    <RowTableRow className="items-start">
      <div className="grid min-w-0 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/locations/$locationId/edit"
            params={{ locationId: location.id }}
            className={`rounded-sm text-label text-ink hover:text-link hover:underline ${focusRing}`}
          >
            {location.name}
          </Link>
          {location.active ? null : (
            <Badge size="sm" tone="neutral">
              Inactive
            </Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-strong">
          <RowTableCellLabel>Address</RowTableCellLabel>
          {addressLine ?? "No address"}
        </p>
      </div>
      <div className="grid min-w-0 justify-items-start gap-0.5">
        <RowTableCellLabel>Contact</RowTableCellLabel>
        {hasContact ? null : <p className="text-body-sm text-muted-strong">No contact</p>}
        {contact.name ? <p className="text-body-sm text-ink">{contact.name}</p> : null}
        {contact.phone ? (
          <a href={telHrefFor(contact.phone)} className={contactLinkClass}>
            {contact.phone}
          </a>
        ) : null}
        {contact.email ? (
          <a href={`mailto:${encodeURI(contact.email)}`} className={`${contactLinkClass} max-w-full truncate`}>
            {contact.email}
          </a>
        ) : null}
      </div>
      <p
        className={`font-mono text-mono tabular-nums ${location.commission.type === "none" ? "text-muted-strong" : "text-ink"}`}
      >
        <RowTableCellLabel>Commission</RowTableCellLabel>
        {commissionLabel(location.commission)}
      </p>
    </RowTableRow>
  );
}
