const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const I18n = require('./i18n.js');
const { t } = I18n;
const OwlMessages = require('./messages.js');
const Updater = require('./updater.js');
const os = require('os');

// ---------- links da tela "Sobre" (só estes podem ser abertos) ----------
const REPO_URL = 'https://github.com/gabrielnecastro/my-owl-planner-lite';
const CONTACT_EMAIL = 'gabriel@gabrielcastro.net';
const LINKS = {
  instagram: 'https://www.instagram.com/myowlplanner/',
  linkedinPage: 'https://www.linkedin.com/company/myowlplanner/',
  site: 'https://myowlplanner.com',
  makerLinkedin: 'https://www.linkedin.com/in/gncastro/',
  makerGithub: 'https://github.com/gabrielnecastro',
  makerSite: 'https://gabrielcastro.net',
  makerEmail: `mailto:${CONTACT_EMAIL}`,
};
const osLabel = () => `Windows ${os.release()}${process.arch === 'arm64' ? ' (ARM64)' : ''}`;
/** Abre o formulário de bug no GitHub já com a versão do app e do Windows preenchidas. */
function reportBug() {
  const q = new URLSearchParams({ template: 'bug_report.yml', version: app.getVersion(), os: osLabel() });
  shell.openExternal(`${REPO_URL}/issues/new?${q}`);
}
/** Abre o app de e-mail com assunto e as informações técnicas no fim. */
function sendMessage() {
  const subject = `My Owl Planner Lite — ${t('mail.subject')}`;
  const body = `${t('mail.body')}\n\n\n---\n${t('mail.info')}\n${t('mail.version')}: ${app.getVersion()}\n${t('mail.os')}: ${osLabel()}`;
  shell.openExternal(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}

const WIDTH = 330;       // painel aberto
const LINE_SIZES = { thin: 6, medium: 10, thick: 15 }; // espessura da barra recolhida (px)
const LEAVE_DELAY = 600; // ms fora do painel antes de recolher

let win, tray, dash, settingsWin;
// configuração atual (fonte: o widget, que salva no banco e envia por 'ui:config')
let cfg = {
  mode: 'pinned',        // 'pinned' = sempre aberto | 'auto' = vira barra ao sair o mouse
  side: 'left',          // lado efetivo do painel aberto
  panelSideChoice: 'left',
  barPos: 'bottom',      // barra recolhida: 'top' | 'bottom' | 'left' | 'right'
  lineSize: 'medium',
  barVisibility: 'peek', // barra recolhida: 'peek' (aparece de tempos em tempos, padrão) | 'always'
  peekEvery: 2,          // minutos entre uma aparição e outra (1 a 5)
  hoverOpen: false,
  reminderMin: 10,       // lembrete periódico enquanto uma tarefa roda (0 = desligado)
  sound: true,
  lang: null,
  startCollapsed: false, notifyOverdue: true, notifySchedule: true, askMood: true,
  // mensagens nos avisos
  msgTone: 'all',        // all | motivating | fun | off
  customMessages: '',    // as suas, uma por linha
  updateCheck: true,     // procurar versão nova ao abrir o app
  theme: 'light',        // light (padrão) | dark
};
const REMINDER_OPTIONS = [0, 5, 10, 15, 20, 30, 60];
let expanded = true;
let busy = false;        // renderer avisa quando há diálogo aberto / campo em edição
let outsideSince = null;

app.setAppUserModelId('net.gabrielcastro.myowlplannerlite'); // necessário p/ notificações no Windows

// ================== Modo demonstração ==================
// `npm run demo` (ou o atalho com --demo) usa uma pasta de dados separada,
// preenchida com dados simulados. Os dados reais nunca são tocados.
const DEMO = process.argv.includes('--demo') || process.env.TASK_WIDGET_DEMO === '1';
if (DEMO) app.setPath('userData', path.join(app.getPath('appData'), 'my-owl-planner-lite-demo'));

// ================== Uma cópia por vez ==================
// Duas cópias abertas disputam o mesmo cache do Chromium ("Unable to move the cache: Access is denied")
// e o mesmo banco. A trava vale por pasta de dados: o modo demo pode rodar junto com o normal.
const gotLock = app.requestSingleInstanceLock();
// janela ainda "viva"? (ao fechar o app, a janela e o conteúdo dela são destruídos em momentos diferentes)
const alive = (w) => !!w && !w.isDestroyed() && !w.webContents.isDestroyed();
let quitting = false;
app.on('before-quit', () => { quitting = true; });
if (!gotLock) app.quit();

// ================== Persistência (SQLite) ==================
// Banco: %APPDATA%\my-owl-planner-lite\tasks.db  (demo: %APPDATA%\my-owl-planner-lite-demo\tasks.db)
// Na primeira execução, o data.json antigo é importado e guardado como backup.
const dataDir = () => app.getPath('userData');
const dbFile = () => path.join(dataDir(), 'tasks.db');
const jsonFile = () => path.join(dataDir(), 'data.json');
const backupDir = () => path.join(dataDir(), 'backups');
const today = () => { // data local (AAAA-MM-DD), não UTC
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

let store = null;          // Store (SQLite) ou JsonStore (plano B)
let storageKind = 'sqlite';

/** Plano B: se o SQLite não puder ser aberto, continua funcionando com o data.json. */
class JsonStore {
  isEmpty() { return !fs.existsSync(jsonFile()); }
  load() { try { return JSON.parse(fs.readFileSync(jsonFile(), 'utf8')); } catch { return null; } }
  save(data) {
    const tmp = jsonFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, jsonFile());
  }
  close() {}
}

function openStore() {
  fs.mkdirSync(dataDir(), { recursive: true });
  try {
    const { Store } = require('./db.js');
    store = new Store(dbFile());
    storageKind = 'sqlite';
  } catch (err) {
    console.error('SQLite indisponível, usando data.json:', err);
    store = new JsonStore();
    storageKind = 'json';
    dialog.showErrorBox('My Owl Planner', t('err.sqlite', { msg: err.message }));
    return;
  }

  if (!store.isEmpty()) return;
  if (DEMO) {
    const demo = require('./demo-data.js').generate(Date.now());
    store.save(demo);
  } else if (fs.existsSync(jsonFile())) {
    // migração única: data.json → SQLite
    const old = JSON.parse(fs.readFileSync(jsonFile(), 'utf8'));
    store.save(old);
    fs.renameSync(jsonFile(), path.join(dataDir(), `data.json.migrado-${today()}.bak`));
  }
}

function closeStore() {
  try { store?.close(); } catch { /* ok */ }
  store = null;
}

/** Backup diário automático (mantém os 10 mais recentes). */
function dailyBackup(force = false) {
  if (storageKind !== 'sqlite' || !store) return null;
  fs.mkdirSync(backupDir(), { recursive: true });
  const file = path.join(backupDir(), `tasks-${today()}.db`);
  if (fs.existsSync(file)) {
    if (!force) return null;
    fs.rmSync(file);
  }
  store.backup(file);
  const old = fs.readdirSync(backupDir()).filter((f) => /^tasks-.*\.db$/.test(f)).sort().slice(0, -10);
  old.forEach((f) => fs.rmSync(path.join(backupDir(), f), { force: true }));
  return file;
}

function readData() {
  if (!store || store.isEmpty()) return null; // o widget cria o estado inicial (categorias padrão)
  return store.load();
}

function resetDemo() {
  if (!DEMO) return;
  closeStore();
  for (const f of ['tasks.db', 'tasks.db-wal', 'tasks.db-shm']) fs.rmSync(path.join(dataDir(), f), { force: true });
  openStore();
  win?.webContents.reload();
  if (dash && !dash.isDestroyed()) dash.webContents.reload();
}

ipcMain.on('app:demo', (e) => { e.returnValue = DEMO; });

/**
 * Como relançar este app: no .exe portátil, o arquivo .exe original (o process.execPath aponta
 * para uma pasta temporária que some); em desenvolvimento, o electron.exe + a pasta do projeto.
 */
function launchTarget() {
  if (app.isPackaged) return { exe: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] };
  return { exe: process.execPath, args: [app.getAppPath()] };
}

/** Abre uma cópia separada em modo demonstração (funciona no npm start e no .exe). */
function openDemo() {
  const { spawn } = require('child_process');
  const { exe, args } = launchTarget();
  spawn(exe, [...args, '--demo'], { detached: true, stdio: 'ignore', env: { ...process.env, TASK_WIDGET_DEMO: '1' } }).unref();
}

function loginItem(open) {
  const { exe, args } = launchTarget();
  const opts = { path: exe, args };
  if (open === undefined) return app.getLoginItemSettings(opts).openAtLogin;
  app.setLoginItemSettings({ ...opts, openAtLogin: open });
}
ipcMain.on('store:load', (e) => { e.returnValue = readData(); });
ipcMain.on('store:save', (_e, json) => {
  const data = JSON.parse(json);
  try { store.save(data); } catch (err) { console.error('Falha ao salvar:', err); }
  // o dashboard aberto acompanha as mudanças na hora
  if (dash && !dash.isDestroyed()) dash.webContents.send('dash:data', data);
});

// ================== Dashboard ==================
function openDashboard() {
  if (dash && !dash.isDestroyed()) {
    if (dash.isMinimized()) dash.restore();
    dash.focus();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  dash = new BrowserWindow({
    width: Math.min(1240, workArea.width - 80),
    height: Math.min(860, workArea.height - 60),
    minWidth: 760, minHeight: 560,
    title: t(DEMO ? 'win.dashboardDemo' : 'win.dashboard'),
    backgroundColor: themeBg(),
    autoHideMenuBar: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'dash-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  dash.loadFile('dashboard.html');
  dash.on('closed', () => { dash = null; });
}

ipcMain.on('dash:open', openDashboard);
ipcMain.on('dash:load', (e) => { e.returnValue = readData(); });

// ================== Log simples (diagnóstico) ==================
// %APPDATA%\my-owl-planner-lite\logs\main.log — só eventos raros (ex.: o Windows não respeitou o tamanho da barra).
function log(...args) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'main.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + '.old');
    fs.appendFileSync(file, `${new Date().toISOString()} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
  } catch { /* log nunca derruba o app */ }
}

/** Onde a janela deve estar agora (barra recolhida ou painel aberto). */
function targetBounds() {
  const wa = screen.getPrimaryDisplay().workArea; // área útil, sem a barra de tarefas
  const thick = LINE_SIZES[cfg.lineSize] || LINE_SIZES.medium;
  if (!expanded) {
    // barra recolhida: topo / base (largura toda) ou esquerda / direita (altura toda)
    if (cfg.barPos === 'top') return { x: wa.x, y: wa.y, width: wa.width, height: thick };
    if (cfg.barPos === 'bottom') return { x: wa.x, y: wa.y + wa.height - thick, width: wa.width, height: thick };
    const x = cfg.barPos === 'left' ? wa.x : wa.x + wa.width - thick;
    return { x, y: wa.y, width: thick, height: wa.height };
  }
  const x = cfg.side === 'left' ? wa.x : wa.x + wa.width - WIDTH;
  return { x, y: wa.y, width: WIDTH, height: wa.height };
}

const sameBounds = (a, b) => ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1);
let placing = false, checkTimer = null;

function place() {
  if (!win || win.isDestroyed()) return;
  const want = targetBounds();
  placing = true;
  win.setMinimumSize(1, 1); // o Windows às vezes impõe um mínimo (~altura de barra de título) em janelas finas
  win.setBounds(want);
  placing = false;
  // confere depois que o Windows aplicou; se ele "engordou" a barra, corrige
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => verifyBounds(want, 1), 150);
}

function verifyBounds(want, attempt) {
  if (!win || win.isDestroyed() || !sameBounds(want, targetBounds())) return; // já mudou de novo
  const got = win.getBounds();
  if (sameBounds(got, want)) return;
  log('barra fora do tamanho', { tentativa: attempt, esperado: want, obtido: got, barPos: cfg.barPos, espessura: cfg.lineSize,
    recolhida: !expanded, escala: screen.getPrimaryDisplay().scaleFactor });
  if (attempt > 3) return;
  placing = true;
  win.setSize(want.width, want.height); // às vezes só o setSize separado "pega"
  win.setPosition(want.x, want.y);
  placing = false;
  checkTimer = setTimeout(() => verifyBounds(want, attempt + 1), 200 * attempt);
}

function setExpanded(value) {
  if (expanded === value || !alive(win)) return;
  expanded = value;
  outsideSince = null;
  if (expanded) win.setIgnoreMouseEvents(false); // painel aberto sempre recebe cliques
  place();
  win.webContents.send('ui:expanded', expanded);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH, height: 800,
    minWidth: 1, minHeight: 1,
    // sem a moldura grossa do Windows: é ela que impõe o tamanho mínimo e deixava a barra mais grossa
    thickFrame: false,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: false, // tem botão na barra de tarefas
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  place();
  win.loadFile('index.html');

  // Botão na barra de tarefas: clicar abre ou recolhe o painel (nunca some de verdade, a barra continua na tela).
  // Painel aberto + clique → o Windows tenta minimizar: desfazemos e recolhemos.
  win.on('minimize', () => {
    win.restore();
    win.webContents.send('ui:set', { mode: expanded ? 'auto' : 'pinned' });
  });
  win.on('restore', () => place());
  // Painel recolhido + clique → o Windows só traz a janela para a frente: abrimos o painel.
  // (Clique na própria barra já abre sozinho; ignoramos o foco que vem da abertura do app.)
  const bornAt = Date.now();
  win.on('focus', () => {
    if (expanded || Date.now() - bornAt < 2000) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (!inside) win.webContents.send('ui:set', { mode: 'pinned' });
  });

  // troca de resolução / escala / monitor (ex.: ao abrir um jogo em tela cheia): reposiciona
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, () => setTimeout(place, 300));
  // se algo de fora mexer no tamanho (o Windows, outro app), volta ao lugar certo
  let driftTimer = null;
  win.on('resize', () => {
    if (placing) return;
    clearTimeout(driftTimer);
    driftTimer = setTimeout(() => { if (!sameBounds(win.getBounds(), targetBounds())) place(); }, 250);
  });

  // Recolhe quando o mouse sai do painel (só no modo linha)
  setInterval(() => {
    if (!alive(win) || cfg.mode !== 'auto' || !expanded || busy || !win.isVisible()) { outsideSince = null; return; }
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside) { outsideSince = null; return; }
    outsideSince ??= Date.now();
    if (Date.now() - outsideSince > LEAVE_DELAY) setExpanded(false);
  }, 150);
}

ipcMain.on('ui:config', (_e, next) => {
  if (quitting) return; // o widget ainda salva ao fechar; a bandeja e as janelas já foram embora
  const langChanged = next.lang && next.lang !== cfg.lang;
  const themeChanged = next.theme && next.theme !== cfg.theme;
  cfg = { ...cfg, ...next };
  if (themeChanged) applyTheme();
  if (cfg.lang) I18n.setLang(cfg.lang);
  setExpanded(cfg.mode === 'pinned');
  place();
  refreshTrayMenu();
  sendSettingsState();
  if (langChanged) {
    if (tray && !tray.isDestroyed()) tray.setToolTip(t(DEMO ? 'tray.tooltipDemo' : 'tray.tooltip'));
    if (dash && !dash.isDestroyed()) { dash.setTitle(t(DEMO ? 'win.dashboardDemo' : 'win.dashboard')); dash.webContents.send('dash:lang', cfg.lang); }
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(t('win.settings'));
  }
});
ipcMain.on('app:locale', (e) => { e.returnValue = app.getLocale(); });

// ================== Tema (claro / escuro) ==================
const currentTheme = () => (cfg.theme === 'dark' ? 'dark' : 'light');
/** Cor de fundo das janelas normais enquanto carregam (evita um clarão da cor errada). */
function themeBg() { return currentTheme() === 'dark' ? '#172b44' : '#f7f1e3'; }
ipcMain.on('theme:get', (e) => { e.returnValue = currentTheme(); });
function applyTheme() {
  nativeTheme.themeSource = currentTheme(); // menus e caixas de diálogo do Windows acompanham
  for (const w of BrowserWindow.getAllWindows()) {
    if (!alive(w)) continue;
    w.webContents.send('theme:set', currentTheme());
    if (w === dash || w === settingsWin) w.setBackgroundColor(themeBg());
  }
}
ipcMain.on('ui:expand', () => setExpanded(true));
ipcMain.on('ui:busy', (_e, value) => { busy = value; });
ipcMain.on('hide', () => { if (alive(win)) win.hide(); });
// barra escondida (modo "de tempos em tempos"): os cliques passam direto para a janela de baixo
ipcMain.on('ui:clickthrough', (_e, on) => {
  if (!alive(win)) return;
  win.setIgnoreMouseEvents(!!on && !expanded);
});
// progresso da tarefa no botão da barra de tarefas: { p: 0..1 ou -1 (nenhum), mode: normal | paused | error | indeterminate }
ipcMain.on('ui:progress', (_e, { p, mode }) => {
  if (!alive(win)) return;
  win.setProgressBar(p, mode ? { mode } : undefined);
});

/** Opções do lembrete (usadas na bandeja e no sino do widget). */
function reminderItems() {
  return REMINDER_OPTIONS.map((m) => ({
    label: m ? t('rem.every', { m }) : t('rem.offLabel'),
    type: 'radio',
    checked: cfg.reminderMin === m,
    click: () => { if (alive(win)) win.webContents.send('ui:set', { reminderMin: m }); },
  }));
}
ipcMain.on('reminder:menu', () => Menu.buildFromTemplate(reminderItems()).popup({ window: win }));

// ================== Aviso da coruja (sai da barra; substitui a notificação do Windows) ==================
const TOAST_W = 380, TOAST_H = 92, TOAST_H_MSG = 116, TOAST_H_LONG = 138, TOAST_SIDE_W = 360; // com frase, o aviso fica um pouco mais alto
let toastWin = null, toastReady = false, toastBusy = false;
const toastQueue = [];

function createToast() {
  toastWin = new BrowserWindow({
    width: TOAST_W, height: TOAST_H, show: false, minWidth: 1, minHeight: 1, thickFrame: false,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'toast-preload.js'), contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // o pio toca sem precisar de clique
    },
  });
  toastWin.setAlwaysOnTop(true, 'screen-saver'); // por cima do próprio widget
  toastWin.loadFile('toast.html');
  toastWin.webContents.on('did-finish-load', () => { toastReady = true; nextToast(true); });
}

/** Encosta o aviso na barra: em cima dela (base), embaixo (topo) ou ao lado (laterais). */
function toastBounds(H = TOAST_H) {
  const wa = screen.getPrimaryDisplay().workArea;
  const bar = expanded ? 0 : (LINE_SIZES[cfg.lineSize] || LINE_SIZES.medium);
  const panel = expanded ? WIDTH : 0;
  switch (cfg.barPos) {
    case 'top':
      return { x: Math.round(wa.x + (wa.width - TOAST_W) / 2), y: wa.y + bar, width: TOAST_W, height: H };
    case 'left':
      return { x: wa.x + Math.max(bar, panel), y: wa.y + wa.height - H - 24, width: TOAST_SIDE_W, height: H };
    case 'right':
      return { x: wa.x + wa.width - Math.max(bar, panel) - TOAST_SIDE_W, y: wa.y + wa.height - H - 24, width: TOAST_SIDE_W, height: H };
    default: // base
      return { x: Math.round(wa.x + (wa.width - TOAST_W) / 2), y: wa.y + wa.height - bar - H, width: TOAST_W, height: H };
  }
}

let toastCurrent = null;
function showToast(payload) {
  toastQueue.push(payload);
  if (toastQueue.length > 3) toastQueue.splice(0, toastQueue.length - 3); // não acumula avisos velhos
  if (!toastBusy) nextToast();
}

function nextToast(fromLoad) {
  if (!toastWin || toastWin.isDestroyed()) return;
  if (!toastReady) return; // mostra quando a página terminar de carregar
  if (fromLoad && toastBusy) return;
  const p = toastQueue.shift();
  toastCurrent = p || null;
  if (!p) { toastBusy = false; toastWin.hide(); return; }
  toastBusy = true;
  // altura conforme o texto: sem frase, com frase de 1 linha ou de 2 linhas
  const long = p.msg && String(p.msg).length > 34; // a frase (maior, em cima) quebra em 2 linhas
  toastWin.setBounds(toastBounds(!p.msg ? TOAST_H : long ? TOAST_H_LONG : TOAST_H_MSG));
  toastWin.showInactive(); // aparece sem roubar o foco do que você está fazendo
  toastWin.webContents.send('toast:show', { ...p, from: cfg.barPos || 'bottom', sound: cfg.sound });
}

ipcMain.on('toast:done', () => nextToast());
ipcMain.on('toast:size', (_e, h) => {
  if (!toastWin || toastWin.isDestroyed() || !Number.isFinite(h)) return;
  toastWin.setBounds(toastBounds(Math.max(60, Math.min(200, Math.ceil(h)))));
});
ipcMain.on('toast:click', () => {
  const kind = toastCurrent?.kind;
  nextToast();
  if (kind === 'update') { promptUpdate(); return; }
  if (!alive(win)) return;
  win.show();
  setExpanded(true);
});

// ================== Atualizações ==================
Updater.onChange(() => sendSettingsState());

/** Pergunta se quer atualizar (versão nova encontrada). */
async function promptUpdate() {
  const st = Updater.state();
  if (st.status !== 'available') return;
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  const buttons = [t('upd.now'), t('upd.later'), t('upd.notes')];
  const { response } = await dialog.showMessageBox(parent, {
    type: 'info', title: t('upd.title'), icon: path.join(__dirname, 'icon.png'),
    message: t('upd.available', { v: st.latest }),
    detail: t(st.kind === 'dev' ? 'upd.detailDev' : 'upd.detail', { cur: st.current }),
    buttons, defaultId: 0, cancelId: 1, noLink: true,
  });
  if (response === 2) { Updater.openReleases(); return; }
  if (response !== 0) return;
  if (st.kind !== 'dev') showToast({ title: t('upd.downloadingTitle'), body: t('upd.downloadingBody', { v: st.latest }), kind: 'update' });
  const after = await Updater.update();
  if (after.status === 'error') updateError(after);
}

function updateError(st) {
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  dialog.showMessageBox(parent, {
    type: 'warning', title: t('upd.title'), message: t('upd.error'),
    detail: t('upd.errorDetail'), buttons: [t('upd.notes'), t('upd.close')], defaultId: 0, cancelId: 1, noLink: true,
  }).then(({ response }) => { if (response === 0) Updater.openReleases(); });
}

/** Botão "Verificar atualizações" (manual): sempre responde, mesmo sem novidade. */
async function checkUpdatesManual() {
  const st = await Updater.check();
  if (st.status === 'available') return promptUpdate();
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  if (st.status === 'none') {
    dialog.showMessageBox(parent, { type: 'info', title: t('upd.title'), message: t('upd.none'), detail: t('upd.noneDetail', { v: st.current }), buttons: ['OK'], noLink: true });
  } else if (st.status === 'error') {
    dialog.showMessageBox(parent, { type: 'warning', title: t('upd.title'), message: t(st.error === 'no-release' ? 'upd.noRelease' : 'upd.checkError'), buttons: ['OK'], noLink: true });
  }
}

/** Ao abrir: verifica em silêncio; se houver versão nova, avisa pela coruja (clicar abre a pergunta). */
function checkUpdatesOnStart() {
  if (DEMO || !app.isPackaged || cfg.updateCheck === false) return;
  setTimeout(async () => {
    const st = await Updater.check();
    if (st.status === 'available') showToast({ title: t('upd.toastTitle', { v: st.latest }), body: t('upd.toastBody'), kind: 'update' });
  }, 8000);
}
ipcMain.on('notify', (_e, { title, body, kind, day, msg }) => showToast({ title, body, kind, day, msg }));

// ================== Exportação (JSON) ==================
async function exportData() {
  const data = readData() || { tasks: [] };
  const { canceled, filePath } = await dialog.showSaveDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
    title: t('export.title'),
    defaultPath: path.join(app.getPath('documents'), `${t('export.file')}-${today()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  shell.showItemInFolder(filePath);
}

// ================== Bandeja ==================
// Só o essencial; o resto fica na janela de Configurações.
function refreshTrayMenu() {
  if (!tray || tray.isDestroyed() || quitting) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.showHide'), click: () => { if (alive(win)) (win.isVisible() ? win.hide() : win.show()); } },
    { label: t('tray.dashboard'), click: openDashboard },
    { label: t('tray.settings'), click: openSettings },
    { label: t('tray.reminder', { v: cfg.reminderMin ? `${cfg.reminderMin} min` : t('rem.offLabel').toLowerCase() }), submenu: reminderItems() },
    { type: 'separator' },
    ...(DEMO
      ? [{ label: t('tray.demoReset'), click: resetDemo }, { type: 'separator' }]
      : [{ label: t('tray.demoOpen'), click: openDemo }, { type: 'separator' }]),
    { label: t('tray.quit'), click: () => app.quit() },
  ]));
}

/**
 * Ícone da bandeja. No Windows, o .ico (vários tamanhos: o Windows escolhe o certo para a escala da tela);
 * se vier vazio, tenta o PNG e por último a logo grande reduzida. Fica anotado no log qual foi usado.
 */
function trayImage() {
  const size = Math.round(16 * (screen.getPrimaryDisplay().scaleFactor || 1));
  const tries = process.platform === 'win32' ? ['icon.ico', 'tray.png', 'icon.png'] : ['tray.png', 'icon.png'];
  for (const f of tries) {
    let img = nativeImage.createFromPath(path.join(__dirname, f));
    if (img.isEmpty()) { log('bandeja: ícone vazio', f); continue; }
    if (f !== 'icon.ico') img = img.resize({ width: size, height: size, quality: 'best' });
    if (img.isEmpty()) { log('bandeja: ícone vazio após reduzir', f); continue; }
    return img;
  }
  return nativeImage.createEmpty();
}

function createTray() {
  const icon = trayImage();
  icon.setTemplateImage?.(false);
  tray = new Tray(icon);
  tray.setToolTip(t(DEMO ? 'tray.tooltipDemo' : 'tray.tooltip'));
  tray.on('click', () => { if (!alive(win)) return; win.show(); setExpanded(true); });
  refreshTrayMenu();
}

// ================== Configurações ==================
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560, height: 720, minWidth: 480, minHeight: 520,
    title: t('win.settings'),
    backgroundColor: themeBg(),
    autoHideMenuBar: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

function settingsState() {
  return {
    ui: cfg,
    demo: DEMO,
    version: app.getVersion(),
    storage: storageKind === 'sqlite' ? 'SQLite' : 'JSON',
    startup: DEMO ? false : loginItem(),
    update: Updater.state(),
  };
}
function sendSettingsState() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:state', settingsState());
}

ipcMain.on('settings:open', openSettings);
ipcMain.on('settings:get', (e) => { e.returnValue = settingsState(); });
// a janela de configurações não salva sozinha: pede ao widget (dono do estado), que salva e devolve o novo cfg
ipcMain.on('settings:set', (_e, patch) => { if (alive(win)) win.webContents.send('ui:set', patch); });
ipcMain.handle('settings:action', async (_e, action, arg) => {
  switch (action) {
    case 'startup': if (!DEMO) loginItem(!!arg); sendSettingsState(); return true;
    case 'folder': shell.showItemInFolder(storageKind === 'sqlite' ? dbFile() : jsonFile()); return true;
    case 'backup': { const f = dailyBackup(true); if (f) shell.showItemInFolder(f); return !!f; }
    case 'json': await exportData(); return true;
    case 'demo': openDemo(); return true;
    case 'update': await checkUpdatesManual(); return true;
    case 'bug': reportBug(); return true;
    case 'message': sendMessage(); return true;
    case 'link': if (LINKS[arg]) shell.openExternal(LINKS[arg]); return !!LINKS[arg];
    case 'test':
      showToast({ title: t('set.test.title'), body: t('set.test.body'), kind: 'reminder',
        msg: OwlMessages.pick('run.mid', { lang: I18n.getLang(), tone: cfg.msgTone === 'off' ? 'off' : cfg.msgTone, custom: cfg.customMessages, vars: { task: t('set.test.title'), time: '15min' } }) });
      return true;
    default: return false;
  }
});

// abriram o app de novo: em vez de outra cópia, mostra a que já está aberta
app.on('second-instance', () => {
  if (!alive(win)) return;
  win.show();
  setExpanded(true);
  win.focus();
});

app.whenReady().then(() => {
  if (!gotLock) return;
  I18n.setLang(I18n.fromSystem(app.getLocale()));
  openStore();
  // aplica as configurações salvas já na abertura (idioma da bandeja, posição da barra…)
  try {
    const ui = readData()?.ui;
    if (ui) {
      cfg = { ...cfg, ...ui };
      if (!ui.barPos) cfg.barPos = ui.linePos === 'side' ? (ui.side || 'left') : 'bottom';
      cfg.panelSideChoice = ui.side || 'left';
      cfg.side = cfg.barPos === 'left' || cfg.barPos === 'right' ? cfg.barPos : cfg.panelSideChoice;
      if (ui.lang) I18n.setLang(ui.lang);
    }
  } catch (err) { console.error('Config inicial:', err); }
  try { dailyBackup(); } catch (err) { console.error('Backup falhou:', err); }
  nativeTheme.themeSource = currentTheme();
  createWindow();
  createToast();
  createTray();
  Updater.cleanup();
  checkUpdatesOnStart();
});
// destrói o ícone da bandeja ao sair (senão o Windows deixa um "fantasma" vazio até passar o mouse)
app.on('will-quit', () => { quitting = true; try { tray?.destroy(); } catch { /* ok */ } tray = null; closeStore(); });
app.on('window-all-closed', () => app.quit());
// fechar o dashboard não fecha o widget (o widget é a janela principal)
