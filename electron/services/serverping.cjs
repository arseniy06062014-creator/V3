const net = require('net');
const dns = require('dns').promises;
const { fetchJson } = require('./http.cjs');

const ADDRESS_RE = /^[A-Za-z0-9._-]{1,253}(:\d{1,5})?$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const MAX_BYTES = 1024 * 1024;

function parseAddress(address) {
  const a = String(address || '').trim();
  if (!ADDRESS_RE.test(a)) throw new Error('Некорректный адрес сервера');
  const [host, p] = a.split(':');
  const port = p ? Number(p) : 25565;
  if (port < 1 || port > 65535) throw new Error('Некорректный порт');
  return { host, port, explicitPort: !!p };
}

// ---- tiny VarInt helpers ---------------------------------------------------
function varint(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}
function readVarint(buf, off) {
  let result = 0;
  let shift = 0;
  let i = off;
  for (;;) {
    if (i >= buf.length) return null; // need more data
    const b = buf[i++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: result, next: i };
    shift += 7;
    if (shift > 35) throw new Error('bad varint');
  }
}
const packet = (id, payload = Buffer.alloc(0)) => {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
};

// Minecraft "description" can be a string or a nested chat component.
function flatten(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(flatten).join('');
  return (d.text || '') + flatten(d.extra);
}
const cleanMotd = (d) =>
  flatten(d)
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/\s*\n\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

// Real Server List Ping: handshake + status request.
function slp(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let sentAt = 0;
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve(val);
    };
    socket.setTimeout(timeout, () => finish(new Error('timeout')));
    socket.on('error', finish);
    socket.on('close', () => finish(new Error('closed')));

    socket.on('connect', () => {
      const hostBuf = Buffer.from(host, 'utf8');
      const port16 = Buffer.alloc(2);
      port16.writeUInt16BE(port);
      const handshake = packet(
        0x00,
        Buffer.concat([varint(765), varint(hostBuf.length), hostBuf, port16, varint(1)])
      );
      sentAt = Date.now();
      socket.write(Buffer.concat([handshake, packet(0x00)]));
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_BYTES) return finish(new Error('too large'));
      try {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len.next + len.value) return; // wait for the rest
        const id = readVarint(buf, len.next);
        if (!id || id.value !== 0x00) return finish(new Error('bad packet'));
        const strLen = readVarint(buf, id.next);
        if (!strLen) return;
        const json = JSON.parse(buf.toString('utf8', strLen.next, strLen.next + strLen.value));
        finish(null, { json, latency: Date.now() - sentAt });
      } catch (e) {
        finish(e);
      }
    });
  });
}

async function resolveTarget({ host, port, explicitPort }) {
  if (explicitPort || IPV4_RE.test(host) || host === 'localhost') return { host, port };
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv && srv.length) return { host: srv[0].name, port: srv[0].port, display: host };
  } catch {
    /* no SRV record — normal */
  }
  return { host, port };
}

const MAINTENANCE_RE = /maint|обслуж|техн\S* работ|на\s+ремонт|restart|перезагруз/i;

function shape(address, json, latency) {
  const motd = cleanMotd(json.description);
  const icon =
    typeof json.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(json.favicon) && json.favicon.length < 200000
      ? json.favicon
      : null;
  return {
    address,
    status: MAINTENANCE_RE.test(motd) ? 'maintenance' : 'online',
    players: json.players ? { online: json.players.online ?? 0, max: json.players.max ?? 0 } : null,
    version: json.version?.name ? cleanMotd(json.version.name) : null,
    motd,
    latency,
    icon,
  };
}

// Fallback for networks where direct pings are blocked.
async function viaMcsrvstat(address) {
  const r = await fetchJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, { timeout: 12000 });
  if (!r.online) return { address, status: 'offline', players: null, version: null, motd: '', latency: null, icon: null };
  const motd = (r.motd?.clean || []).join(' · ');
  return {
    address,
    status: MAINTENANCE_RE.test(motd) ? 'maintenance' : 'online',
    players: r.players ? { online: r.players.online, max: r.players.max } : null,
    version: r.version || null,
    motd,
    latency: null,
    icon: typeof r.icon === 'string' && r.icon.startsWith('data:image/png;base64,') ? r.icon : null,
  };
}

async function pingServer(address) {
  const parsed = parseAddress(address);
  try {
    const target = await resolveTarget(parsed);
    const { json, latency } = await slp(target.host, target.port);
    return shape(address, json, latency);
  } catch {
    try {
      return await viaMcsrvstat(address);
    } catch {
      return { address, status: 'offline', players: null, version: null, motd: '', latency: null, icon: null };
    }
  }
}

module.exports = { pingServer, parseAddress, cleanMotd, slp };
