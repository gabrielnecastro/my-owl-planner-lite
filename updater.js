// =====================================================================
//  My Owl Planner Lite — atualizações pelas Releases do GitHub
//
//  Instalado (Setup .exe): electron-updater baixa o novo instalador e
//  reinstala em silêncio, reabrindo o app.
//  Portátil (.exe avulso): baixa o novo .exe portátil, troca pelo atual
//  (o antigo vira "<nome>.old" e é apagado na próxima abertura) e reabre.
//  Rodando pelo código (npm start): só verifica; "atualizar" abre a página.
//
//  Nada é baixado sem o usuário confirmar.
// =====================================================================
const { app, net, shell } = require('electron');
const fs = require('fs');

const OWNER = 'gabrielnecastro';
const REPO = 'my-owl-planner-lite';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

const PORTABLE_FILE = process.env.PORTABLE_EXECUTABLE_FILE || null;
const KIND = !app.isPackaged ? 'dev' : PORTABLE_FILE ? 'portable' : 'installer';

let autoUpdater = null;
if (KIND === 'installer') {
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;          // só baixa depois do "Atualizar"
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
  } catch { autoUpdater = null; }
}

/** status: idle | checking | none | available | downloading | ready | error */
const state = { kind: KIND, status: 'idle', current: app.getVersion(), latest: null, percent: 0, error: null, notesUrl: RELEASES_URL };
let latestRelease = null;
let onChange = () => {};

function set(patch) {
  Object.assign(state, patch);
  try { onChange({ ...state }); } catch { /* ok */ }
}

/** 1.10.0 > 1.9.3 */
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function fetchLatestRelease() {
  const res = await net.fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${REPO}/${state.current}` } });
  if (res.status === 404) throw new Error('no-release');
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

/** Verifica se há versão nova. Devolve o estado. */
async function check() {
  if (['checking', 'downloading'].includes(state.status)) return { ...state };
  set({ status: 'checking', error: null });
  try {
    latestRelease = await fetchLatestRelease();
    const latest = String(latestRelease.tag_name || '').replace(/^v/, '');
    if (latestRelease.html_url) state.notesUrl = latestRelease.html_url;
    if (latest && isNewer(latest, state.current)) set({ status: 'available', latest });
    else set({ status: 'none', latest: latest || state.current });
  } catch (err) {
    set({ status: 'error', error: err.message === 'no-release' ? 'no-release' : err.message });
  }
  return { ...state };
}

// ---------- instalado: electron-updater ----------
async function updateInstaller() {
  if (!autoUpdater) throw new Error('electron-updater');
  const result = await autoUpdater.checkForUpdates(); // o electron-updater precisa da própria verificação (latest.yml)
  if (!result?.updateInfo || !isNewer(result.updateInfo.version, state.current)) throw new Error('latest.yml');
  autoUpdater.removeAllListeners('download-progress');
  autoUpdater.on('download-progress', (p) => set({ percent: Math.round(p.percent || 0) }));
  await autoUpdater.downloadUpdate();
  set({ status: 'ready', percent: 100 });
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 800); // silencioso e reabre o app
}

// ---------- portátil: troca o .exe ----------
async function download(url, dest) {
  const res = await net.fetch(url, { headers: { 'User-Agent': `${REPO}/${state.current}` } });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (total) set({ percent: Math.min(99, Math.round((got / total) * 100)) });
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (total && got !== total) throw new Error('download incompleto');
}

async function updatePortable() {
  const asset = (latestRelease?.assets || []).find((a) => /portable\.exe$/i.test(a.name));
  if (!asset) throw new Error('portable asset');
  const target = PORTABLE_FILE;
  const tmp = `${target}.new`;
  const old = `${target}.old`;
  await download(asset.browser_download_url, tmp);
  try { fs.rmSync(old, { force: true }); } catch { /* ok */ }
  fs.renameSync(target, old); // o Windows deixa renomear um .exe em uso (só não deixa apagar)
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.renameSync(old, target); } catch { /* ok */ }
    throw err;
  }
  set({ status: 'ready', percent: 100 });
  app.relaunch({ execPath: target, args: [] }); // abre a versão nova depois que esta fechar
  setTimeout(() => app.quit(), 800);
}

/** Baixa e instala a versão nova (o usuário já confirmou). */
async function update() {
  if (state.status !== 'available') return { ...state };
  if (KIND === 'dev') { shell.openExternal(state.notesUrl); return { ...state }; }
  set({ status: 'downloading', percent: 0, error: null });
  try {
    if (KIND === 'installer') await updateInstaller();
    else await updatePortable();
  } catch (err) {
    set({ status: 'error', error: err.message });
  }
  return { ...state };
}

/** Na abertura do portátil: apaga o .exe antigo que ficou da última atualização. */
function cleanup() {
  if (KIND !== 'portable') return;
  try { fs.rmSync(`${PORTABLE_FILE}.old`, { force: true }); } catch { /* ok */ }
  try { fs.rmSync(`${PORTABLE_FILE}.new`, { force: true }); } catch { /* ok */ }
}

module.exports = {
  state: () => ({ ...state }),
  check, update, cleanup, isNewer,
  openReleases: () => shell.openExternal(state.notesUrl || RELEASES_URL),
  onChange: (fn) => { onChange = fn; },
  KIND, RELEASES_URL,
};
