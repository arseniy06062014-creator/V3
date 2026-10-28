const os = require('os');
const { execFile } = require('child_process');
const store = require('./store.cjs');
const { fetchJson } = require('./http.cjs');
const { pingServer } = require('./serverping.cjs');

const MOJANG_CONTENT = 'https://launchercontent.mojang.com';

// Real news: official Minecraft: Java Edition patch notes from Mojang.
async function getNews() {
  const data = await fetchJson(`${MOJANG_CONTENT}/v2/javaPatchNotes.json`);
  const entries = (data.entries || []).map((e) => {
    const version = e.version || '';
    const imageUrl = e.image && e.image.url ? e.image.url : null;
    return {
      id: `${e.type || 'x'}-${version}`,
      title: e.title || `Minecraft ${version}`,
      type: e.type || 'release',
      version,
      date: e.date || null,
      text: e.shortText || '',
      image: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : MOJANG_CONTENT + imageUrl) : null,
      url: `https://minecraft.wiki/w/Java_Edition_${encodeURIComponent(version.replace(/ /g, '_'))}`,
    };
  });
  entries.sort((a, b) => (new Date(b.date || 0) - new Date(a.date || 0)));
  return entries.slice(0, 40);
}

// Real server status: every server is pinged directly with the Minecraft protocol
// (icon, players, version, MOTD, latency); a public API is only a fallback.
async function getServerStatus() {
  const { servers } = store.getSettings();
  return Promise.all(
    servers.map(async (s) => {
      try {
        return { ...(await pingServer(s.address)), name: s.name };
      } catch {
        return { name: s.name, address: s.address, status: 'unknown', players: null, icon: null };
      }
    })
  );
}

function checkJava(javaPath) {
  return new Promise((resolve) => {
    execFile(String(javaPath || 'java'), ['-version'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, text: 'Java не найдена по этому пути' });
      resolve({ ok: true, text: String(stderr || stdout).split('\n')[0].trim() });
    });
  });
}

const systemInfo = () => ({ totalMemGB: Math.max(2, Math.floor(os.totalmem() / 1024 ** 3)) });

module.exports = { getNews, getServerStatus, pingServer, checkJava, systemInfo };
