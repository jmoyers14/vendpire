import type {
  Cents,
  PnlRows,
  PnlTotals,
  VisitAnomaly,
} from "@vendpire/domain";
import type { VisitRange } from "@vendpire/platform";

/** One machine's product-level profitability over a window. */
export interface MachinePnl {
  machineId: string;
  /** Echoed back so a caller can label the period it asked for. */
  from: string | null;
  to: string | null;
  rows: PnlRows;
  totals: PnlTotals;
  anomalies: VisitAnomaly[];
}

/** One product's sales in one machine, all of its slots combined. */
export interface PnlSheetItem {
  productId: string;
  productName: string;
  units: number;
  revenueCents: Cents;
  cogsCents: Cents | null;
  grossProfitCents: Cents | null;
}

/** One product's written-off units in one machine, at cost. */
export interface PnlSheetPulledItem {
  productId: string;
  productName: string;
  units: number;
  costCents: Cents | null;
}

export interface PnlSheetMachine {
  machineId: string;
  machineName: string;
  items: PnlSheetItem[];
  pulled: PnlSheetPulledItem[];
  totals: PnlTotals;
}

export interface PnlSheetLocation {
  locationId: string;
  locationName: string;
  machines: PnlSheetMachine[];
  totals: PnlTotals;
}

/** Every machine's P&L over one window, grouped location → machine → item. */
export interface PnlSheet {
  from: string;
  to: string;
  locations: PnlSheetLocation[];
  totals: PnlTotals;
}

export interface PnlService {
  byMachine(
    orgId: string,
    machineId: string,
    range?: VisitRange,
  ): Promise<MachinePnl>;
  /** A machine is filed under the location of its last visit in the window. */
  sheet(orgId: string, range: { from: string; to: string }): Promise<PnlSheet>;
}
