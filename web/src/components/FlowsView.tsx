import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Leg {
  buy: number;
  sell: number;
  net: number;
}
type OiRow = Record<string, number>;
interface Flows {
  generatedAt?: string;
  cash: Record<string, { fii?: Leg; dii?: Leg }>;
  fno: Record<string, Record<string, OiRow>>;
  nsdl: Record<string, Record<string, Leg>>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const cr = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
const signCls = (v: number | null | undefined) => (v == null || v === 0 ? 'text-ink-2' : v > 0 ? 'text-up' : 'text-down');

interface Day {
  date: string;
  fii?: number;
  dii?: number;
  idxFutNet?: number;
  idxFutLongPct?: number;
}

function buildDays(f: Flows): Day[] {
  const dates = [...new Set([...Object.keys(f.cash), ...Object.keys(f.fno)])].sort();
  return dates.map((date) => {
    const oi = f.fno[date]?.FII;
    const lo = oi?.idxFutLong;
    const sh = oi?.idxFutShort;
    return {
      date,
      fii: f.cash[date]?.fii?.net,
      dii: f.cash[date]?.dii?.net,
      idxFutNet: lo != null && sh != null ? lo - sh : undefined,
      idxFutLongPct: lo != null && sh != null && lo + sh > 0 ? Math.round((1000 * lo) / (lo + sh)) / 10 : undefined,
    };
  });
}

function FlowTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="num flex items-center gap-2 text-ink-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold text-ink">₹{cr(p.value)} Cr</span>
        </div>
      ))}
    </div>
  );
}

export function FlowsView() {
  const [flows, setFlows] = useState<Flows | null | 'error'>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/flows.json`, { cache: 'no-cache' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Flows;
        setFlows({ cash: j.cash ?? {}, fno: j.fno ?? {}, nsdl: j.nsdl ?? {}, generatedAt: j.generatedAt });
      })
      .catch(() => setFlows('error')); // missing file or Vite's index.html fallback
  }, []);

  const days = useMemo(() => (flows && flows !== 'error' ? buildDays(flows) : []), [flows]);
  const nsdlDays = useMemo(() => (flows && flows !== 'error' ? Object.keys(flows.nsdl).sort().slice(-10).reverse() : []), [flows]);

  if (flows === null) return <p className="text-sm text-ink-3">Loading…</p>;
  if (flows === 'error' || !days.length) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
        <p>No daily flow data yet. From the fetcher folder:</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs text-ink">{`.venv/bin/python -m fii_fetcher flows`}</pre>
      </div>
    );
  }

  const cash = days.filter((d) => d.fii != null || d.dii != null).slice(-30);
  const table = [...days].reverse().slice(0, 15);
  const latest = cash[cash.length - 1];
  const sum5 = (k: 'fii' | 'dii') => cash.slice(-5).reduce((a, d) => a + (d[k] ?? 0), 0);
  const nsdlCats = flows.nsdl[nsdlDays[0]] ? Object.keys(flows.nsdl[nsdlDays[0]]) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Daily net buying, cash market</h2>
          <span className="text-xs text-ink-3">₹ crore · NSE provisional · <span className="text-up">■</span> FII <span className="text-[var(--series-dii)]">■</span> DII</span>
        </div>
        {latest && (
          <p className="num mb-3 text-sm text-ink-2">
            {fmtDay(latest.date)}: FII <span className={`font-semibold ${signCls(latest.fii)}`}>₹{cr(latest.fii)} Cr</span> · DII{' '}
            <span className={`font-semibold ${signCls(latest.dii)}`}>₹{cr(latest.dii)} Cr</span> · last 5 sessions FII{' '}
            <span className={signCls(sum5('fii'))}>₹{cr(sum5('fii'))} Cr</span>, DII <span className={signCls(sum5('dii'))}>₹{cr(sum5('dii'))} Cr</span>
          </p>
        )}
        <div style={{ height: 260 }} role="img" aria-label="Daily FII and DII net buying in rupees crore">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cash.map((d) => ({ ...d, label: fmtDay(d.date) }))} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => v.toLocaleString('en-IN')} />
              <ReferenceLine y={0} stroke="var(--ink-3)" />
              <Tooltip content={<FlowTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fii" name="FII" fill="var(--series-fii)" isAnimationActive={false} radius={2} />
              <Bar dataKey="dii" name="DII" fill="var(--series-dii)" isAnimationActive={false} radius={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {cash.length < 5 && (
          <p className="mt-2 text-xs text-ink-3">
            NSE's cash API returns only the latest session, so this chart grows by one day each time <code>fii_fetcher flows</code> runs.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold text-ink">Daily table</h2>
        <p className="mb-3 text-xs text-ink-3">
          Index futures are FII open interest in contracts: net = long − short; long % = long share of the two. Below 50% means FIIs are net short.
        </p>
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-1.5 pr-3 font-medium">Date</th>
                <th className="px-3 text-right font-medium">FII net ₹Cr</th>
                <th className="px-3 text-right font-medium">DII net ₹Cr</th>
                <th className="px-3 text-right font-medium">FII idx fut net</th>
                <th className="pl-3 text-right font-medium">FII idx fut long %</th>
              </tr>
            </thead>
            <tbody>
              {table.map((d) => (
                <tr key={d.date} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3 text-ink-2">{fmtDay(d.date)}</td>
                  <td className={`px-3 text-right ${signCls(d.fii)}`}>{cr(d.fii)}</td>
                  <td className={`px-3 text-right ${signCls(d.dii)}`}>{cr(d.dii)}</td>
                  <td className={`px-3 text-right ${signCls(d.idxFutNet)}`}>{d.idxFutNet == null ? '—' : d.idxFutNet.toLocaleString('en-IN')}</td>
                  <td className="pl-3 text-right text-ink-2">{d.idxFutLongPct == null ? '—' : `${d.idxFutLongPct.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {nsdlDays.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-1 text-base font-semibold text-ink">NSDL FPI net investment</h2>
          <p className="mb-3 text-xs text-ink-3">₹ crore, imported from NSDL CSVs. Official custodian figures; they lag NSE by 1–2 days and include primary-market deals.</p>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  {nsdlCats.map((c) => (
                    <th key={c} className="px-3 text-right font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nsdlDays.map((d) => (
                  <tr key={d} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 text-ink-2">{fmtDay(d)}</td>
                    {nsdlCats.map((c) => (
                      <td key={c} className={`px-3 text-right ${signCls(flows.nsdl[d][c]?.net)}`}>
                        {cr(flows.nsdl[d][c]?.net)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
