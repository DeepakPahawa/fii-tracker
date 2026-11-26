import { useEffect, useMemo, useState } from 'react';

interface Stock {
  symbol: string;
  name: string;
  industry: string;
  isin: string;
}
interface HoldingsFile {
  symbol: string;
  kind: 'equity' | 'commodity' | 'foreign' | 'unavailable';
  index: string | null;
  note?: string;
  source?: string;
  factsheet?: string;
  fetchedAt: string;
  constituents: Stock[];
}

const BAR = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#f97316', '#2dd4bf', '#94a3b8'];

/** The stocks an ETF holds, via the index it tracks (NSE's official constituent list). */
export function Constituents({ symbol }: { symbol: string }) {
  const [rec, setRec] = useState<HoldingsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setRec(null);
    setError(null);
    setQ('');
    fetch(`${import.meta.env.BASE_URL}data/etf-constituents/${encodeURIComponent(symbol)}.json`, { signal: ctrl.signal, cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`No holdings file for ${symbol} (HTTP ${r.status}). Run: node web/etf-proxy/fetch-constituents.mjs`);
        return r.json() as Promise<HoldingsFile>;
      })
      .then(setRec)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [symbol]);

  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    rec?.constituents.forEach((s) => m.set(s.industry, (m.get(s.industry) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rec]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const a = rec?.constituents ?? [];
    return t ? a.filter((s) => s.symbol.toLowerCase().includes(t) || s.name.toLowerCase().includes(t) || s.industry.toLowerCase().includes(t)) : a;
  }, [rec, q]);

  const head = (
    <>
      <h2 className="text-base font-semibold text-slate-100">What this ETF holds</h2>
    </>
  );

  if (error) return <section className="mt-6">{head}<p className="mt-2 text-sm text-rose-300">{error}</p></section>;
  if (!rec) return <section className="mt-6">{head}<p className="mt-2 text-sm text-slate-500">Loading holdings…</p></section>;
  if (rec.kind !== 'equity') {
    return (
      <section className="mt-6">
        {head}
        <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-400">
          {rec.index && <b className="mr-1 text-slate-200">{rec.index}.</b>}
          {rec.note}
        </p>
      </section>
    );
  }

  const total = rec.constituents.length;
  const top = sectors.slice(0, 7);
  const rest = sectors.slice(7).reduce((s, [, n]) => s + n, 0);
  const segs = rest ? [...top, ['Other', rest] as [string, number]] : top;

  return (
    <section className="mt-6">
      {head}
      <p className="text-xs text-slate-500">
        Tracks <b className="text-slate-300">{rec.index}</b>, {total} stocks. Membership and sectors from NSE's official index list (fetched {rec.fetchedAt.slice(0, 10)}).
        {rec.factsheet && <> Weights are published in the <a className="text-sky-400 hover:underline" href={rec.factsheet} target="_blank" rel="noreferrer">index factsheet</a>.</>}
      </p>

      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="mb-2 text-xs text-slate-400">Stocks by sector</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800" role="img" aria-label="Share of stocks by sector">
          {segs.map(([name, n], i) => <div key={name} title={`${name}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: BAR[i % BAR.length] }} />)}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {segs.map(([name, n], i) => (
            <li key={name}><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: BAR[i % BAR.length] }} />{name} <span className="tabular-nums text-slate-500">{n}</span></li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <label className="flex items-center gap-2">Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="symbol, company or sector" className="w-52 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" />
        </label>
        <span>{list.length === total ? `${total} stocks` : `${list.length} of ${total}`}</span>
      </div>
      <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Symbol</th><th className="px-3 py-2 font-medium">Company</th><th className="px-3 py-2 font-medium">Sector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {list.map((s) => (
              <tr key={s.symbol}>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-200">
                  <a className="hover:text-sky-400 hover:underline" href={`https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(s.symbol)}`} target="_blank" rel="noreferrer">{s.symbol}</a>
                </td>
                <td className="px-3 py-1.5 text-slate-300">{s.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{s.industry}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={3} className="px-3 py-3 text-slate-500">No stock matches that search.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
