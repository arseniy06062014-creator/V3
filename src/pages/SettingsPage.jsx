import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import ServerIcon from '../components/ServerIcon';
import { STATUS } from './HomePage';
import { api } from '../api';
import { useApp } from '../context';

const ADDRESS_RE = /^[A-Za-z0-9._-]{1,253}(:\d{1,5})?$/;

// One editable server line. When the address is valid it is pinged (debounced) so the
// server's real icon, status and players show up right away.
function ServerRow({ server, onChange, onRemove }) {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const address = server.address.trim();
  const valid = ADDRESS_RE.test(address);

  useEffect(() => {
    setInfo(null);
    if (!valid || !api) return undefined;
    let alive = true;
    setChecking(true);
    const t = setTimeout(() => {
      api
        .pingServer(address)
        .then((r) => alive && setInfo(r))
        .catch(() => alive && setInfo(null))
        .finally(() => alive && setChecking(false));
    }, 700);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [address, valid]);

  const st = info ? STATUS[info.status] || STATUS.unknown : null;
  const displayName = server.name || address;

  return (
    <li className="flex items-center gap-2">
      <ServerIcon icon={info?.icon} name={displayName} size={40} />
      <input
        className="input w-44"
        placeholder="Название"
        value={server.name}
        onChange={(e) => onChange('name', e.target.value)}
      />
      <div className="relative flex-1">
        <input
          className={`input ${address && !valid ? '!border-red-500/70' : ''}`}
          placeholder="адрес[:порт], например play.example.com"
          value={server.address}
          onChange={(e) => onChange('address', e.target.value)}
        />
      </div>
      <div className="w-36 shrink-0 text-xs leading-tight">
        {checking && <span className="flex items-center gap-1.5 text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Проверка…</span>}
        {!checking && address && !valid && <span className="text-red-300">Неверный адрес</span>}
        {!checking && st && (
          <>
            <span className="flex items-center gap-1.5 text-white/90">
              <span className={`dot ${st.cls}`} /> {st.label}
            </span>
            {info.players && <span className="text-white/50">{info.players.online}/{info.players.max} игроков</span>}
          </>
        )}
      </div>
      <button onClick={onRemove} className="btn-ghost" aria-label="Удалить сервер">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function AboutSection() {
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    api.appVersion().then(setVersion).catch(() => {});
    return api.onUpdateEvent((ev) => {
      if (ev.type === 'none') setStatus('У вас установлена последняя версия');
      if (ev.type === 'available') setStatus(`Доступна версия ${ev.version} — подтвердите обновление вверху окна`);
      if (ev.type === 'downloaded') setStatus('Обновление скачано, осталось перезапустить лаунчер');
      if (ev.type === 'error') setStatus(`Не удалось проверить: ${ev.message}`);
    });
  }, []);

  const check = async () => {
    setBusy(true);
    setStatus('Проверка…');
    try {
      const r = await api.checkUpdates();
      if (!r.supported) setStatus('Обновления работают только в установленной версии лаунчера');
    } catch (e) {
      setStatus(`Не удалось проверить: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="О лаунчере">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px]">
            BeastLauncher <b>{version ? `v${version}` : ''}</b>
          </p>
          {status && <p className="mt-1 text-sm text-white/60">{status}</p>}
          <p className="mt-1 text-xs text-white/40">Новые версии предлагаются автоматически.</p>
        </div>
        <button onClick={check} disabled={busy} className="btn-ghost">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Проверить обновления
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <section className="glass fade-up mb-5 rounded-2xl p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, settings, saveSettings, onLogout } = useApp();

  const [javaPath, setJavaPath] = useState(settings.javaPath);
  const [javaInfo, setJavaInfo] = useState(null);
  const [servers, setServers] = useState(settings.servers);
  const [saved, setSaved] = useState(false);

  const checkJava = async () => {
    setJavaInfo({ text: 'Проверка…' });
    await saveSettings({ javaPath });
    setJavaInfo(await api.checkJava(javaPath));
  };

  const setServer = (i, key, value) =>
    setServers((list) => list.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));

  const saveServers = async () => {
    await saveSettings({ servers });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,77,0,0.12),transparent_60%)] p-8">
      <h1 className="text-lava-gradient mb-6 font-display text-4xl font-bold">Настройки</h1>

      <div className="max-w-3xl">
        <AboutSection />

        <Section title="Аккаунт">
          <div className="flex items-center justify-between">
            <span className="text-[15px]">
              Вы вошли как <b>{user.name}</b>
              {user.offline ? ' (офлайн)' : ' (Ely.by)'}
            </span>
            <button onClick={onLogout} className="btn-ghost">
              {user.offline ? 'Сменить ник / войти через Ely.by' : 'Выйти из аккаунта'}
            </button>
          </div>
        </Section>

        <Section title="Игра">
          <label className="mb-1.5 block text-sm font-semibold">Путь к Java</label>
          <div className="flex gap-2">
            <input className="input flex-1" value={javaPath} onChange={(e) => setJavaPath(e.target.value)} />
            <button onClick={checkJava} className="btn-ghost">
              Проверить
            </button>
          </div>
          {javaInfo && (
            <p className={`mt-2 text-sm ${javaInfo.ok === false ? 'text-red-300' : 'text-white/70'}`}>{javaInfo.text}</p>
          )}
          <p className="mt-2 text-xs text-white/45">
            Значение «java» — автоматический режим: лаунчер сам скачает нужную Java (8, 17 или 21) под выбранную версию
            Minecraft. Менять путь нужно только если хотите использовать свою Java.
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-[15px] font-semibold">Показывать снапшоты</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showSnapshots}
              onClick={() => saveSettings({ showSnapshots: !settings.showSnapshots })}
              className="toggle"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[15px] font-semibold">Показывать Beta и Alpha</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showOld}
              onClick={() => saveSettings({ showOld: !settings.showOld })}
              className="toggle"
            />
          </div>

          <button onClick={() => api.openGameFolder()} className="btn-ghost mt-5">
            <FolderOpen className="h-4 w-4" /> Открыть папку лаунчера
          </button>
        </Section>

        <Section title="Серверы (статус и авто-подключение)">
          <p className="mb-3 text-xs text-white/50">
            Введите IP или домен — лаунчер сам найдёт значок сервера, онлайн и версию. Порт указывать нужно только если он
            не 25565.
          </p>
          <ul className="flex flex-col gap-2">
            {servers.map((s, i) => (
              <ServerRow
                key={i}
                server={s}
                onChange={(key, value) => setServer(i, key, value)}
                onRemove={() => setServers((l) => l.filter((_, idx) => idx !== i))}
              />
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setServers((l) => [...l, { name: '', address: '' }])}
              disabled={servers.length >= 10}
              className="btn-ghost"
            >
              <Plus className="h-4 w-4" /> Добавить
            </button>
            <button onClick={saveServers} className="btn-lava">
              {saved ? 'Сохранено' : 'Сохранить'}
            </button>
          </div>

          <label className="mb-1.5 mt-5 block text-sm font-semibold">Сервер для авто-подключения</label>
          <select
            className="input cursor-pointer"
            value={settings.autoConnectServer}
            onChange={(e) => saveSettings({ autoConnectServer: e.target.value })}
          >
            <option value="" className="bg-[#111]">
              Первый в списке
            </option>
            {settings.servers.map((s) => (
              <option key={s.address} value={s.address} className="bg-[#111]">
                {s.name} ({s.address})
              </option>
            ))}
          </select>
        </Section>
      </div>
    </div>
  );
}
