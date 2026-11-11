/** A thin bar for "12 of 37 counted". `label` is the accessible name. */
export const ProgressBar = ({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) => {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 overflow-hidden rounded-full bg-divider"
    >
      <div
        className="h-full rounded-full bg-action transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};
