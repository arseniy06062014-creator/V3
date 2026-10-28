const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const paths = require('./paths.cjs');
const { fetchJson, downloadFile } = require('./http.cjs');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
// Same Java runtime catalogue the official Minecraft launcher uses.
const RUNTIME_ALL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

const COMPONENT_BY_MAJOR = {
  8: 'jre-legacy',
  16: 'java-runtime-alpha',
  17: 'java-runtime-gamma',
  21: 'java-runtime-delta',
  25: 'java-runtime-epsilon',
};

// Fallback when the version json has no javaVersion (very old versions).
function fallbackMajor(mc) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mc);
  if (!m) return 8; // alpha / beta / classic and other pre-1.0 ids
  if (Number(m[1]) >= 26) return 25;
  const minor = Number(m[2]);
  const patch = Number(m[3] || 0);
  if (minor <= 16) return 8;
  if (minor === 17) return 16;
  if (minor < 20 || (minor === 20 && patch < 5)) return 17;
  return 21;
}

// Mojang's own version json says which Java the version needs.
async function requiredJava(mc) {
  try {
    const manifest = await fetchJson(MANIFEST_URL);
    const entry = manifest.versions.find((v) => v.id === mc);
    if (entry) {
      const jv = (await fetchJson(entry.url)).javaVersion;
      if (jv && jv.majorVersion) {
        return {
          major: jv.majorVersion,
          component: jv.component || COMPONENT_BY_MAJOR[jv.majorVersion] || null,
        };
      }
    }
  } catch {
    /* fall through to the table */
  }
  const major = fallbackMajor(mc);
  return { major, component: COMPONENT_BY_MAJOR[major] || null };
}
const requiredMajor = async (mc) => (await requiredJava(mc)).major;

const EXE = process.platform === 'win32' ? 'java.exe' : 'java';

function findJava(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let list;
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === EXE && path.basename(d) === 'bin') return p;
    }
  }
  return null;
}

const MARK = '.beast-complete';

/* ---------------------------------------------------------------------------
 * 1) Mojang runtime: individual files, each verified by SHA-1. No archives.
 * ------------------------------------------------------------------------- */
function runtimePlatform() {
  const a = process.arch;
  if (process.platform === 'win32') return a === 'arm64' ? 'windows-arm64' : a === 'ia32' ? 'windows-x86' : 'windows-x64';
  if (process.platform === 'darwin') return a === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return a === 'ia32' ? 'linux-i386' : 'linux';
}

async function installMojang(component, dir, onProgress) {
  const all = await fetchJson(RUNTIME_ALL);
  const list = all?.[runtimePlatform()]?.[component];
  if (!list || !list.length) throw new Error(`в каталоге Mojang нет ${component}`);
  const manifest = await fetchJson(list[0].manifest.url);

  const root = path.resolve(dir);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  const safe = (rel) => {
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('небезопасный путь в каталоге Java');
    return target;
  };

  const files = [];
  for (const [rel, info] of Object.entries(manifest.files || {})) {
    if (info.type === 'directory') fs.mkdirSync(safe(rel), { recursive: true });
    else if (info.type === 'file' && info.downloads?.raw) files.push([rel, info]);
  }
  if (!files.length) throw new Error('пустой каталог Java');

  let done = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const [rel, info] = queue.shift();
      const dest = safe(rel);
      await downloadFile(info.downloads.raw.url, dest, { sha1: info.downloads.raw.sha1 });
      if (info.executable && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
      done++;
      if (onProgress) onProgress(done / files.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  if (!findJava(root)) throw new Error(`после загрузки не найден ${EXE}`);
  fs.writeFileSync(path.join(root, MARK), 'ok');
  return findJava(root);
}

/* ---------------------------------------------------------------------------
 * 2) Fallback: Temurin archive from Adoptium (zip on Windows, tar.gz elsewhere).
 * ------------------------------------------------------------------------- */
const OS = { win32: 'windows', linux: 'linux', darwin: 'mac' }[process.platform];
const ARCH = process.arch === 'arm64' ? 'aarch64' : 'x64';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 300000, windowsHide: true }, (err, _out, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim())) : resolve()
    );
  });
}

// Pure-Node .zip extractor. Supports stored + deflate. Guards against "zip slip".
function extractZip(archive, dest) {
  const buf = fs.readFileSync(archive);
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('скачанный файл не является zip-архивом');
  }
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('повреждённый zip-архив');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  fs.mkdirSync(root, { recursive: true });

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('повреждённый zip-архив');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;

    const target = path.resolve(root, name.replace(/\\/g, '/'));
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('небезопасный путь в архиве');
    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = zlib.inflateRawSync(data);
    else throw new Error(`неподдерживаемый способ сжатия ${method}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, out);
  }
}

// Tries every extraction method we have until a java executable shows up.
async function extract(archive, dest) {
  const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const q = (p) => `'${p.replace(/'/g, "''")}'`;
  const methods = [];
  if (archive.endsWith('.zip')) {
    methods.push(['встроенная распаковка', async () => extractZip(archive, dest)]);
    if (process.platform === 'win32') {
      methods.push([
        'PowerShell',
        () =>
          run(path.join(sys, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `Expand-Archive -LiteralPath ${q(archive)} -DestinationPath ${q(dest)} -Force`,
          ]),
      ]);
      methods.push(['tar', () => run(path.join(sys, 'tar.exe'), ['-xf', archive, '-C', dest])]);
    }
  } else {
    methods.push(['tar', () => run('tar', ['-xzf', archive, '-C', dest])]);
  }

  const errors = [];
  for (const [name, fn] of methods) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    try {
      await fn();
      const found = findJava(dest);
      if (found) return found;
      errors.push(`${name}: ${EXE} не найден`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  fs.rmSync(dest, { recursive: true, force: true });
  throw new Error(errors.join('; '));
}

async function installAdoptium(major, dir, onProgress) {
  if (!OS) throw new Error('система не поддерживается');
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${OS}/${ARCH}/jre/hotspot/normal/eclipse`;
  const archive = path.join(paths.ensure(path.dirname(dir)), `jre-${major}.${OS === 'windows' ? 'zip' : 'tar.gz'}`);
  await downloadFile(url, archive, { onProgress, timeout: 600000 });
  try {
    const found = await extract(archive, dir);
    if (process.platform !== 'win32') fs.chmodSync(found, 0o755);
    fs.writeFileSync(path.join(dir, MARK), 'ok');
    return found;
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */
async function ensureJava({ major, component }, onProgress) {
  const base = path.join(paths.cacheDir(), 'java');
  const dirM = component ? path.join(base, component) : null;
  const dirA = path.join(base, `adoptium-${major}`);

  for (const d of [dirM, dirA]) {
    if (d && fs.existsSync(path.join(d, MARK))) {
      const j = findJava(d);
      if (j) return j;
    }
  }

  const errors = [];
  if (dirM) {
    try {
      return await installMojang(component, dirM, onProgress);
    } catch (e) {
      fs.rmSync(dirM, { recursive: true, force: true });
      errors.push(`Mojang: ${e.message}`);
    }
  }
  try {
    return await installAdoptium(major, dirA, onProgress);
  } catch (e) {
    errors.push(`Adoptium: ${e.message}`);
  }
  throw new Error(`Не удалось подготовить Java ${major}. ${errors.join(' | ')}`);
}

// "java" (default) = automatic. Any other value is the user's own path and is used as is.
async function resolveJava(userPath, mc, send) {
  if (userPath && userPath !== 'java') return userPath;
  const req = await requiredJava(mc);
  send({ type: 'stage', text: `Подготовка Java ${req.major}…` });
  return ensureJava(req, (p) =>
    send({ type: 'progress', text: `Загрузка Java ${req.major}…`, percent: Math.round(p * 100) })
  );
}

module.exports = { extractZip, resolveJava, ensureJava, requiredMajor, requiredJava, fallbackMajor, findJava };
