import type { ReactNode } from "react";

/** A key name in a keyboard hint: "Enter next slot". */
export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-md border border-b-2 border-line-strong bg-app px-1.5 font-mono text-xs leading-[18px] text-ink">
    {children}
  </kbd>
);
