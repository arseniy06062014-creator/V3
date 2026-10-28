import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SearchInput from './SearchInput';

// Drop-up list of versions (grouped) with a search field. groups = [{label, items:[{value,label}]}]
export default function VersionPicker({ groups, value, currentLabel, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // scroll the selected version into view when opening
  useEffect(() => {
    if (open && !q) listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, [open, q]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((o) => {
          const hay = `${g.label} ${o.label}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((g) => g.items.length);
  }, [groups, q]);

  const count = filtered.reduce((n, g) => n + g.items.length, 0);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/60 px-4 py-3 text-left text-[15px] font-medium outline-none transition hover:border-white/25 focus:border-lava disabled:opacity-60"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/80 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="glass-strong absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl">
          <div className="border-b border-white/10 p-2">
            <SearchInput
              value={q}
              onChange={setQ}
              autoFocus
              placeholder="Поиск версии: 1.20, forge, fabric, beta…"
              onSubmit={() => count === 1 && pick(filtered[0].items[0].value)}
            />
          </div>
          <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
            {count === 0 && <p className="px-4 py-3 text-sm text-white/50">Ничего не найдено</p>}
            {filtered.map((g) => (
              <div key={g.label}>
                <div className="sticky top-0 bg-[#141414] px-4 py-1 text-xs font-bold uppercase tracking-wide text-white/40">
                  {g.label}
                </div>
                {g.items.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="picker-item"
                    data-selected={o.value === value}
                    onClick={() => pick(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
