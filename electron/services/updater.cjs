const { app, BrowserWindow } = require('electron');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  /* dependency missing — updates simply stay disabled */
}

// Updates only exist in the installed (packaged) app, not in `npm run electron:dev`.
const supported = () => !!autoUpdater && app.isPackaged;

let state = { type: 'idle' };
let timer = null;
let announced = null;

function emit(payload) {
  state = payload;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('updater:event', payload);
  }
}

// GitHub release notes arrive as HTML or markdown; show them as short plain text.
function plainNotes(notes) {
  if (!notes) return '';
  const raw = Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n') : String(notes);
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 600);
}

function init() {
  if (!supported()) return;
  autoUpdater.autoDownload = false; // always ask the player first
  autoUpdater.autoInstallOnAppQuit = true; // a downloaded update installs when the launcher is closed
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => emit({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    announced = info.version;
    emit({ type: 'available', version: info.version, notes: plainNotes(info.releaseNotes) });
  });
  autoUpdater.on('update-not-available', () => emit({ type: 'none' }));
  autoUpdater.on('download-progress', (p) =>
    emit({ type: 'progress', percent: Math.round(p.percent || 0), version: announced })
  );
  autoUpdater.on('update-downloaded', (info) => emit({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => emit({ type: 'error', message: (err && err.message) || 'Ошибка обновления' }));

  // check shortly after start, then every 30 minutes
  setTimeout(() => check().catch(() => {}), 5000);
  timer = setInterval(() => {
    if (state.type === 'idle' || state.type === 'none' || state.type === 'error') check().catch(() => {});
  }, 30 * 60 * 1000);
}

async function check() {
  if (!supported()) return { supported: false, version: app.getVersion() };
  await autoUpdater.checkForUpdates();
  return { supported: true, version: app.getVersion() };
}

async function download() {
  if (!supported()) throw new Error('Обновления работают только в установленной версии лаунчера');
  await autoUpdater.downloadUpdate();
}

function install() {
  if (!supported()) throw new Error('Обновления работают только в установленной версии лаунчера');
  if (timer) clearInterval(timer);
  autoUpdater.quitAndInstall(false, true); // not silent: the launcher restarts after installing
}

const getState = () => ({ ...state, current: app.getVersion(), supported: supported() });

module.exports = { init, check, download, install, getState, plainNotes };
