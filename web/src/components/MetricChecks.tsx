import { METRICS, METRIC_COLOR, METRIC_HINT, METRIC_LABEL, METRIC_LONG, type Metric } from '../metrics';

/** Checkboxes that decide which series are plotted and shown in the list. At least one stays on. */
export function MetricChecks({ active, onToggle }: { active: Record<Metric, boolean>; onToggle: (m: Metric) => void }) {
  const count = METRICS.filter((m) => active[m]).length;
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Series to show</legend>
      <span aria-hidden className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-3">
        Show
      </span>
      {METRICS.map((m) => {
        const on = active[m];
        const last = on && count === 1;
        return (
          <label
            key={m}
            title={last ? 'Keep at least one series selected' : METRIC_LONG[m]}
            className={`inline-flex select-none items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-3 ${
              last ? 'cursor-not-allowed' : 'cursor-pointer'
            } ${on ? 'border-ink-3 bg-surface text-ink shadow-sm' : 'border-line text-ink-3 hover:bg-surface-2 hover:text-ink-2'}`}
          >
            <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(m)} disabled={last} />
            <span
              aria-hidden
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-2 transition-colors"
              style={{ borderColor: METRIC_COLOR[m], background: on ? METRIC_COLOR[m] : 'transparent' }}
            >
              {on && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.2l2.4 2.4 4.6-5" />
                </svg>
              )}
            </span>
            {METRIC_LABEL[m]}
            <span className="hidden text-xs font-normal text-ink-3 sm:inline">{METRIC_HINT[m]}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
