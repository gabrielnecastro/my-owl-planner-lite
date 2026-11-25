// =====================================================================
//  My Owl Planner — janela de configurações
//  Não guarda nada sozinha: cada mudança vai para o widget (dono do estado),
//  que salva no banco e devolve o estado atualizado para esta janela.
// =====================================================================
const api = window.settingsApi || (() => {
  // fallback p/ abrir no navegador (testes)
  let st = window.__SETTINGS || { ui: { lang: 'pt', barPos: 'bottom', lineSize: 'medium', side: 'left', panelSideChoice: 'left', reminderMin: 10,
    hoverOpen: false, startCollapsed: false, notifyOverdue: true, notifySchedule: true, sound: true, askMood: true,
    msgTone: 'all', customMessages: '', updateCheck: true, theme: 'light' }, demo: false, version: '1.0.0', storage: 'SQLite', startup: false,
    update: { status: 'idle', kind: 'dev', current: '1.0.0', latest: null, percent: 0 } };
  let cb = () => {};
  window.__calls = [];
  return {
    get: () => st,
    set: (patch) => {
      window.__calls.push(['set', patch]);
      st = { ...st, ui: { ...st.ui, ...patch } };
      if (patch.side) st.ui.panelSideChoice = patch.side;
      const bp = st.ui.barPos;
      st.ui.side = bp === 'left' || bp === 'right' ? bp : st.ui.panelSideChoice;
      setTimeout(() => cb(st), 0);
    },
    action: async (name, arg) => { window.__calls.push(['action', name, arg]); if (name === 'startup') { st.startup = !!arg; setTimeout(() => cb(st), 0); } return true; },
    onState: (fn) => { cb = fn; },
  };
})();

const { t } = I18n;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = api.get();

function flashSaved() {
  const el = $('#saved');
  el.classList.add('on');
  clearTimeout(flashSaved.timer);
  flashSaved.timer = setTimeout(() => el.classList.remove('on'), 1200);
}

function setSeg(id, value) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.v === String(value)));
}

function render() {
  const ui = state.ui;
  I18n.setLang(ui.lang || 'pt');
  I18n.apply(document);
  document.title = t('win.settings');

  setSeg('lang', ui.lang);
  setSeg('theme', ui.theme === 'dark' ? 'dark' : 'light');
  setSeg('lineSize', ui.lineSize);
  const vis = ui.barVisibility === 'always' ? 'always' : 'peek';
  setSeg('barVisibility', vis);
  setSeg('peekEvery', Number(ui.peekEvery) || 2);
  $$('#peekEvery button').forEach((b) => { b.disabled = vis === 'always'; });
  $('#peekEvery').classList.toggle('disabled', vis === 'always');
  setSeg('reminderMin', ui.reminderMin);
  $$('#barPos button').forEach((b) => b.classList.toggle('active', b.dataset.v === ui.barPos));

  // lado do painel: só faz sentido com a barra no topo ou na base
  const sideBar = ui.barPos === 'left' || ui.barPos === 'right';
  setSeg('side', sideBar ? ui.barPos : (ui.panelSideChoice || ui.side));
  $$('#side button').forEach((b) => { b.disabled = sideBar; });
  $('#side').classList.toggle('disabled', sideBar);
  $('#panelSideHint').textContent = t(sideBar ? 'set.panelSide.auto' : 'set.panelSide.hint');

  for (const id of ['hoverOpen', 'startCollapsed', 'notifyOverdue', 'notifySchedule', 'sound', 'askMood']) $(`#${id}`).checked = !!ui[id];
  $('#updateCheck').checked = ui.updateCheck !== false;
  setSeg('msgTone', ui.msgTone || 'all');
  if (document.activeElement !== $('#customMessages')) $('#customMessages').value = ui.customMessages || '';
  const nMsg = String(ui.customMessages || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length;
  $('#customCount').textContent = I18n.tn('set.customMsg.count', nMsg, { n: nMsg });

  $('#startup').checked = !!state.startup;
  $('#startup').disabled = !!state.demo;
  $('#startupHint').textContent = t(state.demo ? 'set.startup.demo' : 'set.startup.hint');


  $('#version').textContent = t('set.about.version', { v: state.version });
  $('#storage').textContent = t('set.about.storage', { kind: state.storage });
  $('#demoBadge').classList.toggle('hidden', !state.demo);
  $('#demoBadge').textContent = t('demo.badgeLong');
  $('#demoBox').classList.toggle('hidden', !!state.demo);
  renderUpdate();
}

/** Linha de status da atualização: "Verificando…", "Baixando… 42%", "Versão 1.1.0 disponível"… */
function renderUpdate() {
  const u = state.update || {};
  const busy = u.status === 'checking' || u.status === 'downloading' || u.status === 'ready';
  const text = {
    checking: t('upd.s.checking'),
    none: t('upd.s.none'),
    available: t('upd.s.available', { v: u.latest }),
    downloading: t('upd.s.downloading', { p: u.percent || 0 }),
    ready: t('upd.s.ready'),
    error: t('upd.s.error'),
  }[u.status] || t(u.kind === 'portable' ? 'upd.s.portable' : u.kind === 'installer' ? 'upd.s.installer' : 'upd.s.dev');
  $('#updStatus').textContent = text;
  $('#btnUpdate').disabled = busy;
}

function change(patch) {
  api.set(patch);
  flashSaved();
}

// ---------- controles ----------
$$('#lang button').forEach((b) => b.addEventListener('click', () => change({ lang: b.dataset.v })));
$$('#theme button').forEach((b) => b.addEventListener('click', () => change({ theme: b.dataset.v })));
$$('#lineSize button').forEach((b) => b.addEventListener('click', () => change({ lineSize: b.dataset.v })));
$$('#barVisibility button').forEach((b) => b.addEventListener('click', () => change({ barVisibility: b.dataset.v })));
$$('#peekEvery button').forEach((b) => b.addEventListener('click', () => !b.disabled && change({ peekEvery: +b.dataset.v })));
$$('#reminderMin button').forEach((b) => b.addEventListener('click', () => change({ reminderMin: +b.dataset.v })));
$$('#barPos button').forEach((b) => b.addEventListener('click', () => change({ barPos: b.dataset.v })));
$$('#side button').forEach((b) => b.addEventListener('click', () => !b.disabled && change({ side: b.dataset.v })));
for (const id of ['hoverOpen', 'startCollapsed', 'notifyOverdue', 'notifySchedule', 'sound', 'askMood']) {
  $(`#${id}`).addEventListener('change', (e) => change({ [id]: e.target.checked }));
}
$('#updateCheck').addEventListener('change', (e) => change({ updateCheck: e.target.checked }));
$$('#msgTone button').forEach((b) => b.addEventListener('click', () => change({ msgTone: b.dataset.v })));
let customTimer = null;
$('#customMessages').addEventListener('input', (e) => {
  clearTimeout(customTimer);
  customTimer = setTimeout(() => change({ customMessages: e.target.value }), 500);
});
$('#startup').addEventListener('change', async (e) => { await api.action('startup', e.target.checked); flashSaved(); });
$('#test').addEventListener('click', () => api.action('test'));
// links (abrem no navegador / no app de e-mail)
$$('[data-link]').forEach((b) => b.addEventListener('click', () => api.action('link', b.dataset.link)));

$$('[data-action]').forEach((b) => b.addEventListener('click', async () => {
  const ok = await api.action(b.dataset.action);
  if (ok && b.dataset.action === 'backup') {
    b.classList.add('ok');
    b.textContent = t('set.data.backupDone');
    setTimeout(() => { b.classList.remove('ok'); b.textContent = t('set.data.backup'); }, 2000);
  }
}));

api.onState((s) => { state = s; render(); });
render();
