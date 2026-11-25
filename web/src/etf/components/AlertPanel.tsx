import type { AlertSettings } from '../types';

const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? Math.max(0, parseFloat(v)) : fallback);

export function AlertPanel({ settings, onChange }: { settings: AlertSettings; onChange: (s: AlertSettings) => void }) {
  const field = 'w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right tabular-nums text-slate-100 outline-none focus:border-emerald-500';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => onChange({ ...settings, enabled: e.target.checked })} className="accent-emerald-500" />
        Alerts
      </label>
      <label className="flex items-center gap-1.5">
        Discount beyond <input aria-label="Discount alert threshold percent" className={field} value={settings.discountPct} onChange={(e) => onChange({ ...settings, discountPct: num(e.target.value, settings.discountPct) })} type="number" step="0.05" min="0" />%
      </label>
      <label className="flex items-center gap-1.5">
        Premium above <input aria-label="Premium alert threshold percent" className={field} value={settings.premiumPct} onChange={(e) => onChange({ ...settings, premiumPct: num(e.target.value, settings.premiumPct) })} type="number" step="0.05" min="0" />%
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ ...settings, sound: e.target.checked })} className="accent-emerald-500" />
        Sound
      </label>
    </div>
  );
}
