import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { trpc } from "../../trpc.ts";

/** The machine's location name, once both have loaded. */
export const useLocationName = (machine: { locationId: string } | null | undefined) => {
  const location = useQuery({
    ...trpc.locations.get.queryOptions({ id: machine?.locationId ?? "" }),
    enabled: Boolean(machine),
  });
  return location.data?.name;
};

/**
 * The line under a machine page's title: the location in bold, since machine
 * names alone don't say which one this is, then the page's own details.
 */
export const MachineMetaLine = ({
  locationName,
  details,
}: {
  locationName: string | undefined;
  details?: ReactNode;
}) => {
  if (!locationName) {
    return details ?? null;
  }
  // One span: the header lays out its meta as flex items, which would gap the "·".
  return (
    <span>
      <span className="font-bold text-ink">{locationName}</span>
      {details ? <> · {details}</> : null}
    </span>
  );
};
