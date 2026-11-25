import type { EtfRow } from '../types';
import { breadth, extremes, type MarketState } from '../utils/etfCalculations';
import { pct } from '../format';

function Card({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-100">{children}</div>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function KpiCards({ rows, market }: { rows: EtfRow[]; market: MarketState }) {
  const { discount, premium } = extremes(rows);
  const b = breadth(rows);
  const total = Math.max(1, b.advancing + b.declining);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Highest discount opportunity" sub={discount?.name}>
        {discount ? (
          <>
            <span className="text-emerald-400">{discount.symbol}</span> <span className="text-base text-emerald-400">{pct(discount.spreadPct)}</span>
          </>
        ) : '—'}
      </Card>
      <Card label="Highest premium risk" sub={premium?.name}>
        {premium ? (
          <>
            <span className="text-amber-400">{premium.symbol}</span> <span className="text-base text-amber-400">{pct(premium.spreadPct)}</span>
          </>
        ) : '—'}
      </Card>
      <Card label="Market breadth" sub={`${b.unchanged} unchanged`}>
        <span className="text-emerald-400">{b.advancing}</span>
        <span className="text-slate-600"> ▲ / </span>
        <span className="text-rose-400">{b.declining}</span>
        <span className="text-slate-600"> ▼</span>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="bg-emerald-500" style={{ width: `${(b.advancing / total) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(b.declining / total) * 100}%` }} />
        </div>
      </Card>
      <Card label="Trading status (NSE 09:15–15:30 IST)" sub={market.countdown}>
        <span className={market.open ? 'text-emerald-400' : 'text-slate-400'}>{market.label}</span>
      </Card>
    </div>
  );
}
