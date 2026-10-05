import { Button } from "./Button.tsx";

/**
 * Footer for a cursor-paginated list. Renders nothing when there is no next
 * page, so a screen can drop it in unconditionally under its table.
 *
 * A button rather than infinite scroll: the operator is usually scanning for
 * one specific supply run, and a deliberate click keeps the page footer
 * reachable instead of forever retreating.
 */
export const LoadMore = ({
  hasMore,
  loading,
  onClick,
  label = "Load more",
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
}) =>
  hasMore ? (
    <div className="flex justify-center">
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? "Loading…" : label}
      </Button>
    </div>
  ) : null;
