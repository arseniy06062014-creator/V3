import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Flame, Loader2, Play, Plug, RotateCw } from 'lucide-react';
import ServerIcon from '../components/ServerIcon';
import VersionPicker from '../components/VersionPicker';
import { api } from '../api';
import { useApp } from '../context';
import { fmtDate, heroStyle, openLink } from '../utils';

/* ------------------------------ Control panel ------------------------------ */

const LOADER_NAMES = { forge: 'Forge', fabric: 'Fabric', vanilla: 'Vanilla' };

function ControlPanel() {
  const { settings, saveSettings, selection, setSelection, versions, versionsError, system, onSessionExpired } =
    useApp();

  const [phase, setPhase] = useState('idle'); // idle | starting | running
  const [prog, setProg] = useState({ text: '', percent: null });
  const [error, setError] = useState('');

  const MIN_RAM = 2;
  const MAX_RAM = Math.max(MIN_RAM + 1, Math.min(32, system.totalMemGB));
  const [ram, setRam] = useState(Math.min(MAX_RAM, Math.max(MIN_RAM, settings.ram)));
  const fill = ((ram - MIN_RAM) / (MAX_RAM - MIN_RAM)) * 100;

  // persist RAM a moment after the slider stops moving
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return undefined;
    }
    const t = setTimeout(() => saveSettings({ ram }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ram]);

  useEffect(
    () =>
      api.onLaunchEvent((ev) => {
        if (ev.type === 'stage') setProg({ text: ev.text, percent: null });
        if (ev.type === 'progress') setProg({ text: ev.text, percent: ev.percent });
        if (ev.type === 'started') setPhase('running');
        if (ev.type === 'closed') {
          setPhase('idle');
          if (ev.code) setError(`Игра завершилась с ошибкой (код ${ev.code}). Проверьте Java и версию.`);
        }
      }),
    []
  );

  const options = useMemo(() => {
    const groups = [];
    if (!versions) return groups;
    const add = (label, items) => items.length && groups.push({ label, items });
    add(
      'Forge',
      versions.forge.map((f) => ({ value: `forge:${f.mc}`, label: `Forge ${f.mc}` }))
    );
    add(
      'Fabric',
      (versions.fabric || []).map((f) => ({
        value: `fabric:${f.mc}`,
        label: `Fabric ${f.mc}${f.type === 'snapshot' ? ' (снапшот)' : ''}`,
      }))
    );
    const van = (type) =>
      versions.vanilla
        .filter((v) => v.type === type)
        .map((v) => ({ value: `vanilla:${v.id}`, label: `Vanilla ${v.id}` }));
    add('Vanilla — релизы', van('release'));
    add('Vanilla — снапшоты', van('snapshot'));
    add('Vanilla — Beta', van('old_beta'));
    add('Vanilla — Alpha', van('old_alpha'));
    return groups;
  }, [versions]);

  const current = `${selection.loader}:${selection.mc}`;
  const handlePlay = async () => {
    setPhase('starting');
    setError('');
    setProg({ text: 'Запуск…', percent: null });
    try {
      await api.play({ loader: selection.loader, mc: selection.mc, ram, autoConnect: settings.autoConnect });
      setPhase((p) => (p === 'starting' ? 'running' : p));
    } catch (e) {
      setPhase('idle');
      setError(e.message);
      if (e.code === 'NOT_LOGGED_IN') onSessionExpired();
    }
  };

  return (
    <section className="glass-strong fade-up absolute bottom-6 left-6 w-[420px] rounded-2xl p-5">
      <label className="mb-2 block text-[15px] font-semibold">Версия</label>
      <VersionPicker
        groups={options}
        value={current}
        currentLabel={`${LOADER_NAMES[selection.loader]} ${selection.mc}`}
        disabled={phase !== 'idle'}
        onChange={(v) => {
          const [loader, ...rest] = v.split(':');
          setSelection({ loader, mc: rest.join(':') });
        }}
      />
      {versionsError && <p className="mt-1.5 text-xs text-red-300">Не удалось загрузить список версий: {versionsError}</p>}

      <div className="mt-5">
        <div className="mb-2 text-[15px] font-semibold">Выделение RAM</div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={MIN_RAM}
            max={MAX_RAM}
            step={1}
            value={ram}
            onChange={(e) => setRam(Number(e.target.value))}
            className="range-lava"
            style={{ '--fill': `${fill}%` }}
            aria-label="Выделение RAM"
          />
          <div className="w-16 shrink-0 text-right leading-none">
            <span className="text-lava-gradient font-display text-3xl font-bold">{ram}</span>
            <span className="ml-0.5 text-base font-semibold text-white/90">GB</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-[15px] font-semibold">Авто-подключение</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.autoConnect}
          onClick={() => saveSettings({ autoConnect: !settings.autoConnect })}
          className="toggle"
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <button
        onClick={handlePlay}
        disabled={phase !== 'idle'}
        className="btn-play mt-5 flex w-full items-center justify-center gap-3 rounded-xl py-4 font-display text-4xl font-bold tracking-wide text-white disabled:cursor-wait disabled:opacity-90"
      >
        {phase === 'idle' && (
          <>
            ИГРАТЬ
            <Play className="h-7 w-7 fill-white" />
          </>
        )}
        {phase === 'starting' && (
          <span className="flex items-center gap-3 text-2xl">
            <Loader2 className="h-6 w-6 animate-spin" />
            {prog.text}
            {prog.percent != null && ` ${prog.percent}%`}
          </span>
        )}
        {phase === 'running' && <span className="text-2xl">Игра запущена</span>}
      </button>
    </section>
  );
}

/* ------------------------------ News / servers ------------------------------ */

export function NewsThumb({ src, size = 72 }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-orange-900 via-neutral-800 to-neutral-900"
      style={{ width: size, height: size }}
    >
      {src && !failed && (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      )}
    </div>
  );
}

function NewsCard() {
  const [news, setNews] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getNews().then((n) => setNews(n.slice(0, 3))).catch((e) => setError(e.message));
  }, []);

  return (
    <section className="glass fade-up flex min-h-0 flex-1 flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-3 border-b border-white/10 pb-3">
        <Flame className="h-6 w-6 text-lava" />
        <h2 className="text-lg font-bold">Последние новости</h2>
      </div>

      {!news && !error && <p className="py-6 text-center text-sm text-white/50">Загрузка…</p>}
      {error && <p className="py-4 text-center text-sm text-red-300">Не удалось загрузить новости</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {(news || []).map((n) => (
          <li key={n.id} onClick={() => openLink(n.url)} className="glass-item flex cursor-pointer gap-3 rounded-xl p-2.5">
            <NewsThumb src={n.image} />
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-[14px] font-bold leading-tight">{n.title}</h3>
              <p className="mt-0.5 text-xs text-white/50">{fmtDate(n.date)}</p>
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/75">{n.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const STATUS = {
  online: { cls: 'dot-online', label: 'В сети' },
  maintenance: { cls: 'dot-maintenance', label: 'Обслуживание' },
  offline: { cls: 'dot-offline', label: 'Не в сети' },
  unknown: { cls: 'dot-unknown', label: 'Нет данных' },
};

function ServerStatusCard() {
  const { settings, saveSettings } = useApp();
  const [servers, setServers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [toast, setToast] = useState('');
  const key = JSON.stringify(settings.servers);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServers(await api.getServerStatus());
      setUpdated(new Date());
    } catch {
      /* keep the previous data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [key]);

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  };

  const copy = async (s) => {
    try {
      await navigator.clipboard.writeText(s.address);
      flash(`Адрес скопирован: ${s.address}`);
    } catch {
      flash('Не удалось скопировать');
    }
  };

  const connectHere = (s) => {
    saveSettings({ autoConnect: true, autoConnectServer: s.address });
    flash(`Авто-подключение: ${s.name}`);
  };

  const target = settings.autoConnectServer || settings.servers[0]?.address;

  return (
    <section className="glass fade-up flex min-h-0 shrink-0 flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Статус серверов</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Обновить"
          title={updated ? `Обновлено в ${updated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Обновить'}
        >
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!servers && <p className="py-3 text-center text-sm text-white/50">Загрузка…</p>}
      {servers && servers.length === 0 && (
        <p className="py-3 text-center text-sm text-white/50">Добавьте серверы в Настройках</p>
      )}

      <ul className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto pr-1">
        {(servers || []).map((s) => {
          const st = STATUS[s.status] || STATUS.unknown;
          const isTarget = s.address === target;
          const meta = [
            s.players ? `${s.players.online}/${s.players.max}` : null,
            s.version,
            s.latency != null ? `${s.latency} мс` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={s.address}
              className={`glass-item group flex items-center gap-3 rounded-lg px-2.5 py-2 ${
                isTarget ? '!border-lava/60' : ''
              }`}
              title={s.motd || s.address}
            >
              <ServerIcon icon={s.icon} name={s.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">{s.name}</span>
                  {isTarget && settings.autoConnect && (
                    <span className="shrink-0 rounded bg-lava/25 px-1.5 text-[10px] font-bold text-lava">АВТО</span>
                  )}
                </div>
                <p className="truncate text-xs text-white/50">{meta || s.address}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-1.5 text-[13px] text-white/90">
                  <span className={`dot ${st.cls}`} />
                  {st.label}
                </span>
                <span className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => copy(s)} className="rounded p-0.5 text-white/60 hover:text-white" title="Копировать адрес">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => connectHere(s)}
                    className="rounded p-0.5 text-white/60 hover:text-lava"
                    title="Подключаться при запуске игры"
                  >
                    <Plug className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {toast && <p className="mt-2 text-center text-xs text-white/70">{toast}</p>}
    </section>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function HomePage() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="hero-bg absolute inset-0" style={heroStyle} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/40" />

      <ControlPanel />

      <aside className="absolute bottom-6 right-6 top-6 flex w-[340px] flex-col gap-4">
        <NewsCard />
        <ServerStatusCard />
      </aside>
    </div>
  );
}
