// Design system barrel. Screens import from here; the implementations live in
// ./ui/ so each primitive stays small and independently readable.

export type { AlertTone } from "./ui/Alert.tsx";
export { Alert, ErrorNote } from "./ui/Alert.tsx";
export type { ButtonSize, ButtonVariant } from "./ui/Button.tsx";
export { Button, buttonClass } from "./ui/Button.tsx";
export type { KpiTone } from "./ui/Card.tsx";
export { Card, CardTitle, KpiCard, KpiGrid } from "./ui/Card.tsx";
export { checkboxClass, hintClass, inputClass, labelClass } from "./ui/Field.tsx";
export { focusRing } from "./ui/focus.ts";
export {
  EmptyState,
  Page,
  PageSubtitle,
  PageTitle,
  TableScroll,
} from "./ui/Page.tsx";
export { SlotList, SlotRow } from "./ui/SlotList.tsx";
export type { Tone } from "./ui/StatusPill.tsx";
export { StatusPill, stockTone } from "./ui/StatusPill.tsx";
