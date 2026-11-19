import { useEffect, useState } from 'react';

type Tag = 'FII' | 'DII' | 'other' | 'promoter';
interface Deal {
  d: string;
  s: string;
  c: string;
  side: 'BUY' | 'SELL';
  q: number;
  p: number | null;
  t: Tag;
}
interface Sast {
  id: string;
  filed: string;
  s: string;
  who: string;
  t: Tag;
  kind: string | null;
  acqPct: number | null;
  soldPct: number | null;
  afterPct: number | null;
}
type DeliveryDay = Record<string, [number, number, number, number | null]>; // symbol -> [traded, delivered, delivery %, close]

interface Data {
  deals: Deal[];
  delivery: Record<string, DeliveryDay>;
  sast: Sast[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const fmtQty = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : n.toLocaleString('en-IN'));

function lastMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

async function getJson<T>(path: string, empty: T): Promise<T> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { cache: 'no-cache' });
    if (!r.ok) return empty;
    return (await r.json()) as T; // Vite's index.html fallback throws here and lands in the catch
  } catch {
    return empty;
  }
}

// One load shared by every stock the user clicks through.
let cache: Promise<Data> | null = null;
function loadAll(): Promise<Data> {
  cache ??= (async () => {
    const months = lastMonths(3);
    const [deals, delivery, sast] = await Promise.all([
      Promise.all(months.map((m) => getJson<{ bulk?: Deal[]; block?: Deal[] }>(`deals/${m}.json`, {}))),
      Promise.all(months.map((m) => getJson<Record<string, DeliveryDay>>(`delivery/${m}.json`, {}))),
      Promise.all(months.map((m) => getJson<Sast[]>(`sast/${m}.json`, []))),
    ]);
    return {
      deals: deals.flatMap((x) => [...(x.bulk ?? []), ...(x.block ?? [])]),
      delivery: Object.assign({}, ...delivery),
      sast: sast.flat(),
    };
  })();
  return cache;
}

const tagCls: Record<Tag, string> = {
  FII: 'bg-[color-mix(in_srgb,var(--series-fii)_18%,transparent)] text-ink',
  DII: 'bg-[color-mix(in_srgb,var(--series-dii)_18%,transparent)] text-ink',
  promoter: 'bg-[color-mix(in_srgb,var(--series-pro)_18%,transparent)] text-ink',
  other: 'bg-surface-2 text-ink-3',
};

function TagPill({ t }: { t: Tag }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tagCls[t]}`}>{t === 'other' ? 'Other' : t === 'promoter' ? 'Promoter' : t}</span>;
}

export function StockActivity({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    loadAll().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;
  const deals = data.deals.filter((x) => x.s === symbol).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 12);
  const sast = data.sast.filter((x) => x.s === symbol).sort((a, b) => b.filed.localeCompare(a.filed)).slice(0, 8);
  const delivery = Object.keys(data.delivery)
    .sort()
    .reverse()
    .map((d) => ({ d, v: data.delivery[d][symbol] }))
    .filter((x) => x.v)
    .slice(0, 10);
  if (!deals.length && !sast.length && !delivery.length) return null;

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface p-4">
      <h3 className="text-base font-semibold text-ink">Recent activity</h3>
      <p className="mb-3 text-xs text-ink-3">
        Daily signals from NSE. Investor-type tags (FII / DII) are guessed from the name and can be wrong. This is not a record of everything FIIs bought.
      </p>

      {deals.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-sm font-medium text-ink">Bulk and block deals</h4>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <tbody>
                {deals.map((x, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 text-ink-2">{fmtDay(x.d)}</td>
                    <td className="pr-3">
                      <TagPill t={x.t} />
                    </td>
                    <td className="max-w-[240px] truncate pr-3 text-ink" title={x.c}>
                      {x.c}
                    </td>
                    <td className={`pr-3 font-medium ${x.side === 'BUY' ? 'text-up' : 'text-down'}`}>{x.side === 'BUY' ? 'Bought' : 'Sold'}</td>
                    <td className="pr-3 text-right text-ink-2">{fmtQty(x.q)}</td>
                    <td className="text-right text-ink-3">{x.p == null ? '' : `@ ₹${x.p.toLocaleString('en-IN')}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sast.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-sm font-medium text-ink">Substantial-holder filings</h4>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <tbody>
                {sast.map((x) => (
                  <tr key={x.id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 text-ink-2">{fmtDay(x.filed)}</td>
                    <td className="pr-3">
                      <TagPill t={x.t} />
                    </td>
                    <td className="max-w-[240px] truncate pr-3 text-ink" title={x.who}>
                      {x.who}
                    </td>
                    <td className="pr-3 text-ink-2">{x.kind ?? ''}</td>
                    <td className="text-right text-ink-3">{x.afterPct == null ? '' : `now ${x.afterPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {delivery.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-ink">Delivery volume</h4>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-1 pr-3 font-medium">Date</th>
                  <th className="pr-3 text-right font-medium">Close ₹</th>
                  <th className="pr-3 text-right font-medium">Traded</th>
                  <th className="pr-3 text-right font-medium">Delivered</th>
                  <th className="text-right font-medium">Delivery %</th>
                </tr>
              </thead>
              <tbody>
                {delivery.map(({ d, v }) => (
                  <tr key={d} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 text-ink-2">{fmtDay(d)}</td>
                    <td className="pr-3 text-right text-ink-2">{v[3] == null ? '—' : v[3].toLocaleString('en-IN')}</td>
                    <td className="pr-3 text-right text-ink-2">{fmtQty(v[0])}</td>
                    <td className="pr-3 text-right text-ink-2">{fmtQty(v[1])}</td>
                    <td className="text-right font-medium text-ink">{v[2].toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
