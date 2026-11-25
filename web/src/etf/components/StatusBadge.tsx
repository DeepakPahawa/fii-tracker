import type { EtfStatus } from '../types';

const STYLE: Record<EtfStatus, { cls: string; text: string }> = {
  fair: { cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300', text: 'Fair value' },
  marginal: { cls: 'border-slate-600/50 bg-slate-700/30 text-slate-300', text: 'Marginal' },
  discount: { cls: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300', text: 'Discount · Buy' },
  premium: { cls: 'border-amber-400/50 bg-amber-500/20 text-amber-300', text: 'Premium · Risk' },
};

export function StatusBadge({ status }: { status: EtfStatus }) {
  const s = STYLE[status];
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.text}</span>;
}
