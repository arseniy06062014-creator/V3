import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import { api } from '../api';

// Asks the player to update when a new launcher version is published on GitHub.
export default function UpdateBanner() {
  const [st, setSt] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return undefined;
    api.updateState().then((s) => ['available', 'progress', 'downloaded'].includes(s.type) && setSt(s)).catch(() => {});
    return api.onUpdateEvent((ev) => {
      if (['available', 'progress', 'downloaded'].includes(ev.type)) {
        setSt((prev) => ({ ...prev, ...ev }));
        setHidden(false);
        setError('');
      } else if (ev.type === 'error') {
        setError(ev.message);
      }
    });
  }, []);

  if (!st || hidden) return null;

  const start = async () => {
    setError('');
    setSt((s) => ({ ...s, type: 'progress', percent: 0 }));
    try {
      await api.downloadUpdate();
    } catch (e) {
      setError(e.message);
      setSt((s) => ({ ...s, type: 'available' }));
    }
  };

  return (
    <div className="fade-up relative z-40 flex shrink-0 items-center gap-4 border-b border-lava/40 bg-gradient-to-r from-lava/25 via-lava/10 to-transparent px-5 py-2.5">
      {st.type === 'progress' ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-lava" />
      ) : (
        <Download className="h-5 w-5 shrink-0 text-lava" />
      )}

      <div className="min-w-0 flex-1">
        {st.type === 'available' && (
          <>
            <p className="text-sm font-bold">Доступно обновление BeastLauncher {st.version}</p>
            {st.notes && <p className="truncate text-xs text-white/60">{st.notes.split('\n')[0]}</p>}
          </>
        )}
        {st.type === 'progress' && (
          <>
            <p className="text-sm font-bold">Скачивание обновления… {st.percent ?? 0}%</p>
            <div className="mt-1 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lava to-amber-400 transition-all"
                style={{ width: `${st.percent ?? 0}%` }}
              />
            </div>
          </>
        )}
        {st.type === 'downloaded' && (
          <p className="text-sm font-bold">Обновление {st.version} скачано. Перезапустите лаунчер, чтобы установить.</p>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>

      {st.type === 'available' && (
        <button className="btn-lava" onClick={start}>
          <Download className="h-4 w-4" /> Обновить
        </button>
      )}
      {st.type === 'downloaded' && (
        <button className="btn-lava" onClick={() => api.installUpdate().catch((e) => setError(e.message))}>
          <RefreshCw className="h-4 w-4" /> Перезапустить
        </button>
      )}
      {st.type !== 'progress' && (
        <button className="btn-ghost" onClick={() => setHidden(true)} aria-label="Позже">
          <X className="h-4 w-4" /> Позже
        </button>
      )}
    </div>
  );
}
