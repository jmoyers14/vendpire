// Design system barrel. Screens import from here; the implementations live in
// ./ui/ so each primitive stays small and independently readable.

export { Alert, ErrorNote } from "./ui/Alert.tsx";
export type { BadgeSize, BadgeTone } from "./ui/Badge.tsx";
export { Badge } from "./ui/Badge.tsx";
export type { ButtonSize, ButtonVariant } from "./ui/Button.tsx";
export { Button, buttonClass, IconButton } from "./ui/Button.tsx";
export type { KpiTone } from "./ui/Card.tsx";
export { Card, CardTitle, KPI_TONE_TEXT, KpiCard, KpiGrid, profitToneFor } from "./ui/Card.tsx";
export type { ChipOption } from "./ui/ChipGroup.tsx";
export { ChipGroup } from "./ui/ChipGroup.tsx";
export { DeleteSection } from "./ui/DeleteSection.tsx";
export type { FactTone, VerdictTone } from "./ui/FactsPanel.tsx";
export { Fact, FactsPanel, FactVerdict } from "./ui/FactsPanel.tsx";
export {
  checkboxClass,
  countInputClass,
  Field,
  hintClass,
  inputClass,
  labelClass,
} from "./ui/Field.tsx";
export { FieldRow, FormSection, SectionDivider } from "./ui/FormSection.tsx";
export { focusRing, insetFocusRing } from "./ui/focus.ts";
export { InfoHint } from "./ui/InfoHint.tsx";
export { Kbd } from "./ui/Kbd.tsx";
export { LoadMore } from "./ui/LoadMore.tsx";
export type {
  LegendIndicator,
  MachineTile,
  MachineTileProduct,
  MachineTileTone,
} from "./ui/MachineMap.tsx";
export { MachineMap, MachineMapLegend } from "./ui/MachineMap.tsx";
export { countMeterFor } from "./ui/machineMap.ts";
export type { NumberInputSize } from "./ui/NumberInput.tsx";
export { DecimalInput, MoneyInput, NumberInput } from "./ui/NumberInput.tsx";
export {
  EmptyState,
  Page,
  PageSubtitle,
  PageTitle,
  TableScroll,
} from "./ui/Page.tsx";
export {
  eyebrowLinkClass,
  PageHeader,
  pageLinkClass,
} from "./ui/PageHeader.tsx";
export { ProgressBar } from "./ui/ProgressBar.tsx";
export type { RowTableVariant } from "./ui/RowTable.tsx";
export {
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableEmpty,
  RowTableFooter,
  RowTableHeader,
  RowTableRow,
} from "./ui/RowTable.tsx";
export { SaveBar } from "./ui/SaveBar.tsx";
export { SearchInput } from "./ui/SearchInput.tsx";
export type { SlotCell, SlotCellState } from "./ui/SlotFaceGrid.tsx";
export {
  buildProductsCell,
  SlotFaceGrid,
  slotPositionLabel,
} from "./ui/SlotFaceGrid.tsx";
export { SlotList, SlotRow } from "./ui/SlotList.tsx";
export { StatusPill } from "./ui/StatusPill.tsx";
export type { Step, StepStatus } from "./ui/Stepper.tsx";
export { Stepper } from "./ui/Stepper.tsx";
export { Switch } from "./ui/Switch.tsx";
export { Select, TextArea, TextInput } from "./ui/TextInput.tsx";
export type { StatusTone } from "./ui/tone.ts";
export { stockTone } from "./ui/tone.ts";
export { useFormDraft } from "./ui/useFormDraft.ts";
