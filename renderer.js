// =====================================================================
//  My Owl Planner — widget (renderer)
//  Modelo de tarefa:
//  { id, title, categoryId, estimate (min), scheduledAt (ms|null), createdAt,
//    plannedDate ('AAAA-MM-DD'|null),   ← tarefa "para o dia", sem horário
//    sessions: [{ start, end|null, pauseReason? }],   ← cada play/pause vira uma sessão
//    reschedules: [{ at, toTime|null, toDay|null }],
//    done, archived, result: { outcome, finishedAt, reasons[], note } | null,
//    notifiedOverdue, notifiedSchedule }
// =====================================================================

const api = window.widget || {
  // fallback p/ abrir o index.html direto no navegador (sem Electron)
  load: () => JSON.parse(localStorage.getItem('task-widget:v2') || 'null'),
  save: (json) => localStorage.setItem('task-widget:v2', json),
  setConfig() {}, expand() {}, setBusy() {}, hide() {}, setProgress() {}, setClickThrough() {}, onExpanded() {}, onSet() {}, notify() {},
  systemLocale: navigator.language,
};
const { t, tn } = I18n;

const defaultCategories = () => [
  { id: 'trabalho', name: t('catdef.trabalho'), color: '#8fb3e0' },
  { id: 'freela',   name: t('catdef.freela'),   color: '#b5a3dc' },
  { id: 'estudo',   name: t('catdef.estudo'),   color: '#9cc59a' },
  { id: 'pessoal',  name: t('catdef.pessoal'),  color: '#e6a77f' },
];
// cores padrão antigas → tons pastéis da nova paleta (só troca se você não mudou a cor)
const OLD_DEFAULT_COLORS = { '#4f8cff': '#8fb3e0', '#7c5cff': '#b5a3dc', '#2fbf71': '#9cc59a', '#ff9f43': '#e6a77f' };

const PAUSE_LABEL = (type) => t(`pz.${type}`);

// humor: 1 (esgotado) … 5 (ótimo)
const MOOD_EMOJI = { 1: '😫', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const moodButtons = (selected) => [1, 2, 3, 4, 5].map((v) =>
  `<button type="button" data-v="${v}" class="${selected === v ? 'on' : ''}" title="${t(`mood.${v}`)}"><span class="e">${MOOD_EMOJI[v]}</span><small>${t(`mood.${v}`)}</small></button>`).join('');

// ================== Carregar / migrar / salvar ==================
function migrateV1() {
  try {
    const old = JSON.parse(localStorage.getItem('task-widget:v1'));
    if (!old?.tasks) return null;
    return {
      version: 2,
      categories: old.categories || defaultCategories(),
      ui: { mode: 'pinned' },
      tasks: old.tasks.map((t) => ({
        id: t.id, title: t.title, categoryId: t.categoryId, estimate: t.estimate,
        scheduledAt: null, createdAt: t.startedAt || Date.now(),
        sessions: t.startedAt ? [{ start: t.startedAt, end: t.done ? (t.doneAt || Date.now()) : null }] : [],
        done: !!t.done, archived: false,
        result: t.done ? { outcome: 'done', finishedAt: t.doneAt || Date.now(), reasons: [], note: '' } : null,
        notifiedOverdue: !!t.notified, notifiedSchedule: true,
      })),
    };
  } catch { return null; }
}

// idioma: escolhido nas configurações; na primeira vez, segue o idioma do Windows
const loaded = api.load();
I18n.setLang(loaded?.ui?.lang || I18n.fromSystem(api.systemLocale));

const state = loaded || migrateV1() || {
  version: 2, tasks: [], categories: defaultCategories(), ui: { mode: 'pinned' },
};
state.ui = {
  mode: 'pinned', side: 'left', hoverOpen: false, lineSize: 'medium', barVisibility: 'peek', peekEvery: 2, reminderMin: 10,
  lang: I18n.getLang(), notifyOverdue: true, notifySchedule: true, sound: true, startCollapsed: false, askMood: true,
  msgTone: 'all', customMessages: '', updateCheck: true, theme: 'light',
  ...state.ui,
};
// posição da barra: antes era 'bottom' | 'side' (+ lado do painel); agora topo/base/esquerda/direita
if (!state.ui.barPos) state.ui.barPos = state.ui.linePos === 'side' ? state.ui.side : 'bottom';
delete state.ui.linePos;
if (state.ui.startCollapsed) state.ui.mode = 'auto';
for (const t of state.tasks) { t.plannedDate ??= null; t.reschedules ??= []; t.moodBefore ??= null; }
for (const c of state.categories) if (OLD_DEFAULT_COLORS[c.color?.toLowerCase()]) c.color = OLD_DEFAULT_COLORS[c.color.toLowerCase()];

const save = () => api.save(JSON.stringify(state));
save();

// ================== Helpers ==================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byId = (id) => state.tasks.find((x) => x.id === id);
const catOf = (task) => state.categories.find((c) => c.id === task.categoryId) || { name: t('cat.none'), color: '#8a8d99' };
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' });
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDuration(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "30", "45min", "2h", "1h30", "1,5h", "1:30" → minutos */
function parseDuration(text) {
  const s = String(text).trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/))) return Math.round(parseFloat(m[1]) * 60 + (+m[2] || 0));
  if ((m = s.match(/^(\d+):(\d{2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+)(?:m|min)?$/))) return +m[1];
  return null;
}

function fmtSchedule(ms) {
  const d = new Date(ms), today = new Date();
  const dayDiff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 864e5);
  const day = dayDiff === 0 ? t('rel.today') : dayDiff === 1 ? t('rel.tomorrow') : dayDiff === -1 ? t('rel.yesterday')
    : d.toLocaleDateString(I18n.locale(), { day: '2-digit', month: '2-digit' });
  return `${day} ${fmtTime(ms)}`;
}

const toLocalInput = (ms) => {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);
const dayKey = (ms = Date.now()) => toLocalInput(ms).slice(0, 10); // 'AAAA-MM-DD' local
const tomorrowKey = () => dayKey(Date.now() + 864e5);

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const ms = new Date(y, m - 1, d).getTime();
  const diff = Math.round((ms - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return t('rel.today');
  if (diff === 1) return t('rel.tomorrow');
  if (diff === -1) return t('rel.yesterday');
  return new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
}

const nextHalfHour = () => { const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d.getTime(); };

// ---------- tempo da tarefa ----------
const isRunning = (task) => { const s = task.sessions.at(-1); return !!s && s.end == null; };
const workedMs = (task, now = Date.now()) => task.sessions.reduce((sum, s) => sum + ((s.end ?? now) - s.start), 0);

function timing(task) {
  if (!task.sessions.length) return null;
  const now = Date.now();
  const est = task.estimate * 60000;
  const worked = workedMs(task, now);
  const running = isRunning(task);
  return {
    running,
    worked,
    pct: Math.min(100, (worked / est) * 100),
    expired: worked >= est,
    warning: worked >= est * 0.8,
    leftMin: (est - worked) / 60000,
    eta: running ? now + (est - worked) : null,
  };
}

/** Agendada (ou reagendada) e já passou da hora, sem estar rodando. */
function isDue(task) {
  if (task.done || !task.scheduledAt || isRunning(task) || Date.now() < task.scheduledAt) return false;
  const last = task.sessions.at(-1);
  return !last || task.scheduledAt > last.end; // reagendamento posterior à última pausa
}
/** "Para o dia" que já passou e não foi iniciada. */
const isDayOverdue = (task) => !task.done && !task.scheduledAt && task.plannedDate && task.plannedDate < dayKey() && !task.sessions.length;

// ================== Ações de tempo ==================
function play(task) {
  // só uma tarefa rodando por vez: pausa as outras (motivo registrado automaticamente)
  for (const other of state.tasks) {
    if (other !== task && isRunning(other)) {
      pause(other, { type: 'other_tasks', description: `→ ${task.title}`, auto: true });
    }
  }
  if (task.sessions.length) task.scheduledAt = null; // retomou: o reagendamento já foi cumprido
  task.sessions.push({ start: Date.now(), end: null });
  task.notifiedSchedule = true;
}

function pause(task, reason = null) {
  if (!isRunning(task)) return;
  const s = task.sessions.at(-1);
  s.end = Date.now();
  if (reason) s.pauseReason = reason;
}

// ================== Render ==================
function fillCategorySelect(select, selectedId) {
  select.innerHTML = state.categories
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('');
}

function openCardHtml(task) {
  const cat = catOf(task);
  const started = task.sessions.length > 0;
  return `
    <button class="done-btn" data-action="finish" title="${t('card.finish')}"></button>
    <div class="title">${escapeHtml(task.title)}</div>
    <button class="icon menu" data-action="edit" title="${t('card.edit')}">⋯</button>
    <div class="meta"><span class="tag">${escapeHtml(cat.name)}</span><span>${fmtDuration(task.estimate)}</span></div>
    <div class="when"></div>
    <div class="footer">
      ${started ? '<div class="progress"><i></i></div>' : '<span class="spacer"></span>'}
      <button class="play" data-action="toggle"></button>
    </div>`;
}

function doneCardHtml(task) {
  const cat = catOf(task);
  const ok = task.result?.outcome === 'done';
  const worked = workedMs(task) / 60000;
  const n = task.result?.reasons?.length || 0;
  return `
    <span class="done-gap"></span>
    <div class="title">${escapeHtml(task.title)}</div>
    <span class="badge ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span>
    <div class="meta">
      <span class="tag">${escapeHtml(cat.name)}</span>
      <span>${t('card.workedOf', { worked: fmtDuration(worked), est: fmtDuration(task.estimate) })}</span>
      ${n ? `<span>· ${tn('card.reasons', n)}</span>` : ''}
      ${task.moodBefore || task.result?.moodAfter ? `<span class="mood">· ${MOOD_EMOJI[task.moodBefore] || '·'} → ${MOOD_EMOJI[task.result?.moodAfter] || '·'}</span>` : ''}
    </div>`;
}

function updateCard(li, task) {
  const tm = timing(task);
  const when = $('.when', li);
  const btn = $('.play', li);

  li.classList.toggle('running', !!tm?.running);
  li.classList.toggle('paused', !!tm && !tm.running);
  li.classList.toggle('expired', !!tm?.expired);
  li.classList.toggle('warning', !!tm?.warning && !tm.expired);
  li.classList.toggle('due', isDue(task));

  if (!tm) {
    btn.textContent = t('card.start');
    li.classList.toggle('due', isDue(task) || isDayOverdue(task));
    if (task.scheduledAt) {
      when.innerHTML = isDue(task) ? `📅 <b>${t('card.wasFor', { when: fmtSchedule(task.scheduledAt) })}</b>` : `📅 ${fmtSchedule(task.scheduledAt)}`;
    } else if (task.plannedDate) {
      when.innerHTML = isDayOverdue(task) ? `🗓 <b>${t('card.wasFor', { when: fmtDay(task.plannedDate) })}</b>` : `🗓 ${t('card.noTime', { day: fmtDay(task.plannedDate) })}`;
    } else {
      when.textContent = t('card.noDate');
    }
    return;
  }

  const remaining = tm.expired
    ? `<b class="remaining">${t('card.over', { d: fmtDuration(-tm.leftMin) })}</b>`
    : `<b class="remaining">${t('card.left', { d: fmtDuration(Math.ceil(tm.leftMin)) })}</b>`;

  if (tm.running) {
    btn.textContent = t('card.pause');
    when.innerHTML = tm.expired
      ? `${t('card.running')} · ${remaining}`
      : `${t('card.ends', { time: fmtTime(tm.eta) })} · ${remaining}`;
  } else {
    btn.textContent = t('card.resume');
    const reason = task.sessions.at(-1).pauseReason;
    const next = isDue(task) ? ` · <b>📅 ${t('card.wasResume', { when: fmtSchedule(task.scheduledAt) })}</b>`
      : task.scheduledAt > task.sessions.at(-1).end ? ` · 📅 ${t('card.resumeAt', { when: fmtSchedule(task.scheduledAt) })}`
      : task.plannedDate && task.plannedDate > dayKey() ? ` · 🗓 ${t('card.resumeAt', { when: fmtDay(task.plannedDate) })}` : '';
    when.innerHTML = `⏸ ${t('card.doneAmount', { d: fmtDuration(tm.worked / 60000) })} · ${remaining}`
      + (reason ? ` · <span class="pz">${PAUSE_LABEL(reason.type)}</span>` : '') + next;
  }
  const bar = $('.progress > i', li);
  bar.style.width = `${tm.pct}%`;
  bar.style.background = tm.expired ? '' : timeColor(tm.pct);
}

function makeCard(task, isOpen) {
  const li = document.createElement('li');
  li.className = 'card' + (!isOpen && task.result?.outcome !== 'done' ? ' not-done' : '');
  li.dataset.id = task.id;
  li.style.setProperty('--cat', catOf(task).color);
  // arrastar só entre as sem data: as demais seguem o horário
  li.draggable = isOpen && isUndated(task);
  li.innerHTML = isOpen ? openCardHtml(task) : doneCardHtml(task);
  if (isOpen) updateCard(li, task);
  else li.title = t('card.finishedTitle');
  return li;
}

// ================== Ordem da lista ==================
// 1) a que está rodando; 2) com horário ou dia marcado, do mais cedo para o mais tarde
//    (no mesmo dia, as "para o dia, sem horário" vêm depois das com horário);
// 3) sem data nem horário, na ordem em que você arrastou.
function sortKey(task) {
  if (isRunning(task)) return [0, 0];
  if (task.scheduledAt) return [1, task.scheduledAt];
  if (task.plannedDate) {
    const [y, m, d] = task.plannedDate.split('-').map(Number);
    return [1, new Date(y, m - 1, d, 23, 59, 59, 999).getTime()];
  }
  return [2, 0];
}
const isUndated = (task) => sortKey(task)[0] === 2;
function sortedOpen() {
  return state.tasks.filter((x) => !x.done)
    .map((x, i) => ({ x, i, k: sortKey(x) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i) // empate: mantém a ordem salva
    .map((o) => o.x);
}

function render() {
  const open = sortedOpen();
  const done = state.tasks.filter((x) => x.done && !x.archived)
    .sort((a, b) => (b.result?.finishedAt || 0) - (a.result?.finishedAt || 0));

  const list = $('#list');
  list.innerHTML = open.length ? '' : `<li class="empty">${t('list.empty')}</li>`;
  open.forEach((x) => list.appendChild(makeCard(x, true)));

  const doneList = $('#doneList');
  doneList.innerHTML = '';
  done.forEach((x) => doneList.appendChild(makeCard(x, false)));
  $('#doneCount').textContent = done.length;
  $('#doneBox').classList.toggle('hidden', !done.length);

  fillCategorySelect($('#fCategory'), $('#fCategory').value || state.categories[0]?.id);
  updateHeader();
  updateLine();
}

const svg = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  // chevrons descendo até a barra na base
  collapseDown: svg('<path d="M4 3.5l4 3.5 4-3.5M4 7.5l4 3.5 4-3.5"/><path d="M2.5 14h11"/>'),
  // chevrons indo até a borda lateral
  collapseSide: (side) => svg(side === 'left'
    ? '<path d="M12.5 4l-3.5 4 3.5 4M8.5 4L5 8l3.5 4"/><path d="M2 2.5v11"/>'
    : '<path d="M3.5 4L7 8l-3.5 4M7.5 4L11 8l-3.5 4"/><path d="M14 2.5v11"/>'),
  // chevrons subindo até a barra no topo
  collapseUp: svg('<path d="M4 12.5l4-3.5 4 3.5M4 8.5l4-3.5 4 3.5"/><path d="M2.5 2h11"/>'),
  // engrenagem (ícone "settings" do Feather Icons, licença MIT)
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  pin: svg('<path d="M6 2h4l-.5 4 2.5 2.5H4L6.5 6z"/><path d="M8 8.5V14"/>'),
  bell: svg('<path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8z"/><path d="M6.5 14a1.6 1.6 0 0 0 3 0"/>'),
  bellOff: svg('<path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8z"/><path d="M6.5 14a1.6 1.6 0 0 0 3 0"/><path d="M2 2l12 12"/>'),
};

function updateHeader() {
  updateReminderButton();
  const open = state.tasks.filter((x) => !x.done);
  const late = open.filter((x) => timing(x)?.expired).length;
  $('#counter').textContent = open.length
    ? `${open.length}${late ? ` · ${tn('hdr.overCount', late)}` : ''}` : '';
  const auto = state.ui.mode === 'auto';
  const pos = state.ui.barPos;
  $('#btnMode').innerHTML = auto ? ICONS.pin
    : pos === 'top' ? ICONS.collapseUp : pos === 'bottom' ? ICONS.collapseDown : ICONS.collapseSide(pos);
  $('#btnMode').title = auto ? t('hdr.pin') : t('hdr.collapse');
}

/**
 * Cor do tempo: verde no começo → amarelo → laranja → vermelho no fim.
 * Fica verde até ~40%, passa por amarelo em ~70% e chega ao vermelho em 100%.
 */
function timeColor(pct) {
  const p = Math.min(100, Math.max(0, pct));
  const hue = p <= 40 ? 145 - (p / 40) * 25          // 145 (verde) → 120
    : p <= 70 ? 120 - ((p - 40) / 30) * 72            // 120 → 48 (amarelo)
    : 48 - ((p - 70) / 30) * 48;                      // 48 → 0 (vermelho)
  const light = document.documentElement.dataset.theme !== 'dark';
  return `hsl(${hue.toFixed(0)} ${light ? '50% 50%' : '55% 64%'})`; // tons pastéis (no claro, um pouco mais fortes)
}

/** A barra mostra a tarefa que está rodando (ou a pausada / a agendada que passou da hora). */
function updateLine() {
  const line = $('#line');
  const fill = $('#lineFill');
  const open = sortedOpen(); // a barra mostra a mais próxima no horário
  const current = open.find(isRunning);
  const paused = open.find((x) => x.sessions.length && !isRunning(x));
  const due = open.find(isDue);

  line.classList.remove('idle', 'expired', 'due', 'paused');
  fill.style.removeProperty('--fill');
  fill.style.setProperty('--p', '0%');

  if (current) {
    const tm = timing(current);
    fill.style.setProperty('--fill', timeColor(tm.pct));
    fill.style.setProperty('--p', `${tm.pct}%`);
    if (tm.expired) line.classList.add('expired');
    line.title = `${current.title} — ${tm.expired ? t('line.overTime') : t('card.left', { d: fmtDuration(Math.ceil(tm.leftMin)) })}`;
  } else if (due) {
    line.classList.add('due');
    fill.style.setProperty('--p', '100%');
    line.title = t('line.startNow', { title: due.title });
  } else if (paused) {
    const tm = timing(paused);
    line.classList.add('paused');
    fill.style.setProperty('--fill', timeColor(tm.pct));
    fill.style.setProperty('--p', `${tm.pct}%`);
    line.title = t('line.paused', { title: paused.title });
  } else {
    line.classList.add('idle');
    line.title = t('line.idle');
  }
  updateTaskbar(current, paused, due);
  peekOnChange(`${current?.id || ''}|${current && timing(current).expired ? 'x' : ''}|${paused?.id || ''}|${due?.id || ''}`);
}

/** Espelha a barra no botão da barra de tarefas: progresso verde, amarelo na pausa, vermelho no tempo extra. */
let lastTaskbar = '';
function updateTaskbar(current, paused, due) {
  let p = -1, mode = 'none', title = 'My Owl Planner Lite';
  if (current) {
    const tm = timing(current);
    p = tm.expired ? 1 : Math.max(0.01, tm.pct / 100);
    mode = tm.expired ? 'error' : 'normal';
    title = `▶ ${current.title} · My Owl Planner Lite`;
  } else if (due) {
    p = 1; mode = 'paused';
    title = `⏰ ${due.title} · My Owl Planner Lite`;
  } else if (paused) {
    p = Math.max(0.01, timing(paused).pct / 100); mode = 'paused';
    title = `⏸ ${paused.title} · My Owl Planner Lite`;
  }
  const key = `${p.toFixed(2)}|${mode}|${title}`;
  if (key === lastTaskbar) return;
  lastTaskbar = key;
  api.setProgress(p, mode);
  document.title = title;
}

// ================== Lembrete periódico enquanto a tarefa roda ==================
// Conta a partir do play da sessão atual: com 10 min, avisa aos 10, 20, 30… minutos.
// Só em memória: ao reabrir o app, não dispara uma enxurrada de lembretes atrasados.
const reminderSlots = new Map(); // "idDaTarefa:inicioDaSessao" → último bloco avisado
let reminderInterval = null;

// ================== Mensagens dos avisos ("Keep it up!") ==================
const Msg = window.OwlMessages || { pick: () => null };
const msgLang = () => I18n.getLang();
function message(pool, vars) {
  try {
    return Msg.pick(pool, { lang: msgLang(), tone: state.ui.msgTone || 'all', custom: state.ui.customMessages || '', vars });
  } catch { return null; }
}

/** Frase para o lembrete durante a tarefa: começo / meio / reta final / passou do tempo. */
function runMessage(task, tm) {
  const pool = tm.expired ? 'over' : tm.pct < 30 ? 'run.start' : tm.pct < 70 ? 'run.mid' : 'run.end';
  const time = fmtDuration(Math.max(1, Math.round(Math.abs(tm.leftMin))));
  return message(pool, { task: task.title, time });
}

/** Ao concluir: um aviso de comemoração. */
function notifyDone(task) {
  const worked = workedMs(task, Date.now()) / 60000;
  const msg = message('done', { task: task.title, time: fmtDuration(Math.round(worked)) });
  if (!msg) return; // tom "desligado": sem aviso de conclusão
  api.notify(`✓ ${task.title}`, t('notif.doneBody', { worked: fmtDuration(Math.round(worked)), est: fmtDuration(task.estimate) }), 'done', null, msg);
}

function reminderText(task, tm) {
  const worked = fmtDuration(tm.worked / 60000);
  const status = tm.expired
    ? t('rem.overEst', { d: fmtDuration(-tm.leftMin) })
    : t('card.left', { d: fmtDuration(Math.ceil(tm.leftMin)) });
  return `${t('card.workedOf', { worked, est: fmtDuration(task.estimate) })} · ${status}`;
}

function checkReminder(task, tm, justNotified) {
  const every = state.ui.reminderMin;
  if (every !== reminderInterval) { reminderSlots.clear(); reminderInterval = every; }
  if (!every || !tm?.running) return;
  const s = task.sessions.at(-1);
  const key = `${task.id}:${s.start}`;
  const slot = Math.floor((Date.now() - s.start) / (every * 60000));
  if (!reminderSlots.has(key)) { reminderSlots.set(key, slot); return; }
  if (slot <= reminderSlots.get(key)) return;
  reminderSlots.set(key, slot);
  if (justNotified) return; // já avisou do tempo esgotado neste mesmo instante
  api.notify(`${tm.expired ? '⏰' : '▶'} ${task.title}`, reminderText(task, tm), tm.expired ? 'over' : 'reminder', null, runMessage(task, tm));
}

function updateReminderButton() {
  const m = state.ui.reminderMin;
  const btn = $('#btnReminder');
  btn.innerHTML = m ? ICONS.bell : ICONS.bellOff;
  btn.classList.toggle('off', !m);
  btn.title = m ? t('rem.on', { m }) : t('rem.off');
}

// ================== Relógio: atualiza + notifica ==================
function tick() {
  let changed = false;
  for (const task of state.tasks) {
    if (task.done) continue;
    const li = $(`#list .card[data-id="${task.id}"]`);
    if (li) updateCard(li, task);

    const tm = timing(task);
    let justNotified = false;
    if (tm?.expired && !task.notifiedOverdue) {
      task.notifiedOverdue = changed = true;
      if (state.ui.notifyOverdue) {
        justNotified = true;
        api.notify(t('notif.overTitle'), t('notif.overBody', { title: task.title, d: fmtDuration(task.estimate) }), 'over', null,
          message('over', { task: task.title, time: fmtDuration(Math.max(1, Math.round(-tm.leftMin))) }));
      }
    }
    checkReminder(task, tm, justNotified);
    if (isDue(task) && !task.notifiedSchedule) {
      task.notifiedSchedule = changed = true;
      if (state.ui.notifySchedule) {
        api.notify(t('notif.dueTitle'), t('notif.dueBody', { title: task.title, time: fmtTime(task.scheduledAt) }), 'due', null,
          message('due', { task: task.title, time: fmtTime(task.scheduledAt) }));
      }
    }
  }
  if (changed) save();
  updateHeader();
  updateLine();
}
setInterval(tick, 1000);

// ================== Nova tarefa ==================
$('#fWhen').addEventListener('change', () => {
  const v = $('#fWhen').value;
  $('#fSchedule').classList.toggle('hidden', v !== 'schedule');
  $('#fDay').classList.toggle('hidden', v !== 'day');
  if (v === 'schedule' && !$('#fSchedule').value) $('#fSchedule').value = toLocalInput(nextHalfHour());
  if (v === 'day' && !$('#fDay').value) $('#fDay').value = dayKey();
});

$('#fEstimate').addEventListener('input', (e) => e.target.classList.remove('invalid'));

$('#newTask').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#fTitle').value.trim();
  const estimate = parseDuration($('#fEstimate').value);
  if (!title) return;
  if (!estimate) { $('#fEstimate').classList.add('invalid'); $('#fEstimate').focus(); return; }

  const when = $('#fWhen').value;
  const task = {
    id: uid(), title, categoryId: $('#fCategory').value, estimate,
    scheduledAt: when === 'schedule' ? fromLocalInput($('#fSchedule').value) : null,
    plannedDate: when === 'day' ? ($('#fDay').value || dayKey())
      : when === 'schedule' ? dayKey(fromLocalInput($('#fSchedule').value) || Date.now()) : null,
    createdAt: Date.now(), sessions: [], reschedules: [], done: false, archived: false, result: null,
    notifiedOverdue: false, notifiedSchedule: false,
  };
  state.tasks.unshift(task);
  save();
  $('#fTitle').value = '';
  render();
  if (when === 'now') startTask(task);
  else $('#fTitle').focus();
});

// ================== Cliques nos cards ==================
$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const task = byId(btn.closest('.card').dataset.id);
  if (!task) return;
  if (btn.dataset.action === 'toggle') {
    if (isRunning(task)) return openPause(task);
    startTask(task);
  }
  if (btn.dataset.action === 'edit') openEdit(task);
  if (btn.dataset.action === 'finish') openFinish(task);
});

$('#list').addEventListener('dblclick', (e) => {
  const li = e.target.closest('.card');
  if (li && !e.target.closest('[data-action]')) openEdit(byId(li.dataset.id));
});

$('#doneList').addEventListener('click', (e) => {
  const li = e.target.closest('.card');
  if (li) openFinish(byId(li.dataset.id));
});

$('#btnClearDone').addEventListener('click', () => {
  // arquiva: some da tela, mas continua no data.json p/ o dashboard
  state.tasks.forEach((x) => { if (x.done) x.archived = true; });
  save();
  render();
});

// ================== Drag and drop ==================
let draggedId = null;
const list = $('#list');

list.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.card');
  if (!li) return;
  draggedId = li.dataset.id;
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
list.addEventListener('dragend', () => {
  draggedId = null;
  $$('.card', list).forEach((c) => c.classList.remove('dragging', 'drop-before', 'drop-after'));
});
list.addEventListener('dragover', (e) => {
  if (!draggedId) return;
  e.preventDefault();
  const li = e.target.closest('.card');
  $$('.drop-before, .drop-after', list).forEach((c) => c.classList.remove('drop-before', 'drop-after'));
  if (!li || li.dataset.id === draggedId) return;
  const tgt = byId(li.dataset.id);
  if (!tgt || !isUndated(tgt)) return; // só reordena entre as sem data
  const { top, height } = li.getBoundingClientRect();
  li.classList.add(e.clientY < top + height / 2 ? 'drop-before' : 'drop-after');
});
list.addEventListener('drop', (e) => {
  e.preventDefault();
  const target = $('.drop-before, .drop-after', list);
  if (!draggedId || !target) return;
  const after = target.classList.contains('drop-after');
  const [moved] = state.tasks.splice(state.tasks.findIndex((x) => x.id === draggedId), 1);
  const to = state.tasks.findIndex((x) => x.id === target.dataset.id);
  state.tasks.splice(after ? to + 1 : to, 0, moved);
  save();
  render();
});

// ================== Editar ==================
let editingId = null;

function openEdit(task) {
  editingId = task.id;
  $('#eTitle').value = task.title;
  fillCategorySelect($('#eCategory'), task.categoryId);
  $('#eEstimate').value = fmtDuration(task.estimate);
  $('#eDay').value = task.plannedDate || (task.scheduledAt ? dayKey(task.scheduledAt) : '');
  $('#eTime').value = task.scheduledAt ? toLocalInput(task.scheduledAt).slice(11) : '';
  $('#editDialog').showModal();
}

$('#editForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const task = byId(editingId);
  const estimate = parseDuration($('#eEstimate').value);
  if (!task) return;
  if (!estimate) { $('#eEstimate').classList.add('invalid'); return; }
  $('#eEstimate').classList.remove('invalid');

  task.title = $('#eTitle').value.trim() || task.title;
  task.categoryId = $('#eCategory').value;
  if (estimate !== task.estimate) {
    task.estimate = estimate;
    if (!timing(task)?.expired) task.notifiedOverdue = false; // permite avisar de novo
  }
  const day = $('#eDay').value || ($('#eTime').value ? dayKey() : '');
  const time = $('#eTime').value;
  const sched = day && time ? fromLocalInput(`${day}T${time}`) : null;
  task.plannedDate = day || null;
  if (sched !== task.scheduledAt) { task.scheduledAt = sched; task.notifiedSchedule = false; }

  save();
  $('#editDialog').close();
  render();
});
$('#eCancel').addEventListener('click', () => $('#editDialog').close());
$('#eDelete').addEventListener('click', () => {
  if (!confirm(t('confirm.delete'))) return;
  state.tasks = state.tasks.filter((x) => x.id !== editingId);
  save();
  $('#editDialog').close();
  render();
});

// ================== Pausar (motivo + reagendar) ==================
let pausingId = null;

function openPause(task) {
  pausingId = task.id;
  const tm = timing(task);
  $('#pauseTitle').textContent = t('pause.titleTask', { title: task.title });
  $('#pauseSummary').textContent = tm.expired
    ? t('pause.sumOver', { done: fmtDuration(tm.worked / 60000), over: fmtDuration(-tm.leftMin) })
    : t('pause.sumLeft', { done: fmtDuration(tm.worked / 60000), left: fmtDuration(Math.ceil(tm.leftMin)) });
  $('input[name=pauseReason][value=break]').checked = true;
  $('input[name=pauseNext][value=keep]').checked = true;
  $('#pauseDesc').value = '';
  $('#pauseTime').value = toLocalInput(nextHalfHour());
  $('#pauseDay').value = tomorrowKey();
  syncPauseNext();
  $('#pauseDialog').showModal();
}

function syncPauseNext() {
  const v = $('input[name=pauseNext]:checked').value;
  $('#pauseTime').classList.toggle('hidden', v !== 'time');
  $('#pauseDay').classList.toggle('hidden', v !== 'day');
}
$$('input[name=pauseNext]').forEach((r) => r.addEventListener('change', syncPauseNext));
$('#pauseCancel').addEventListener('click', () => $('#pauseDialog').close());

$('#pauseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const task = byId(pausingId);
  if (!task) return;
  pause(task, {
    type: $('input[name=pauseReason]:checked').value,
    description: $('#pauseDesc').value.trim() || null,
  });

  const next = $('input[name=pauseNext]:checked').value;
  if (next === 'time') {
    const at = fromLocalInput($('#pauseTime').value);
    if (at) {
      task.scheduledAt = at;
      task.plannedDate = dayKey(at);
      task.notifiedSchedule = false;
      task.reschedules.push({ at: Date.now(), toTime: at, toDay: null });
    }
  } else if (next === 'day') {
    const day = $('#pauseDay').value;
    if (day) {
      task.scheduledAt = null;
      task.plannedDate = day;
      task.reschedules.push({ at: Date.now(), toTime: null, toDay: day });
    }
  }
  save();
  $('#pauseDialog').close();
  render();
});

/** Sugere os motivos da finalização a partir das pausas (quanto tempo cada pausa durou). */
function reasonsFromPauses(task) {
  const acc = {};
  task.sessions.forEach((s, i) => {
    const next = task.sessions[i + 1];
    const r = s.pauseReason;
    if (!r || !next || r.type === 'break') return; // intervalo não conta como "atrapalhou"
    const a = (acc[r.type] ??= { type: r.type, minutes: 0, description: [] });
    a.minutes += Math.round((next.start - s.end) / 60000);
    if (r.description && !r.auto) a.description.push(r.description);
  });
  return Object.values(acc).map((a) => ({ ...a, description: a.description.join('; ') || null }));
}

// ================== Humor ao começar ==================
let moodTaskId = null;

/** Primeiro play de uma tarefa: pergunta como você está (se ativado). Retomadas não perguntam. */
function startTask(task) {
  if (!task.sessions.length && state.ui.askMood && task.moodBefore == null) return openMood(task);
  play(task);
  save();
  render();
}

function openMood(task) {
  moodTaskId = task.id;
  $('#moodTask').textContent = task.title;
  $('#moodPick').innerHTML = moodButtons(null);
  $('#moodDialog').showModal();
}

function beginWithMood(value) {
  const task = byId(moodTaskId);
  $('#moodDialog').close();
  if (!task) return;
  task.moodBefore = value;
  play(task);
  save();
  render();
}

$('#moodPick').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (b) beginWithMood(+b.dataset.v);
});
$('#moodSkip').addEventListener('click', () => beginWithMood(null));
$('#moodCancel').addEventListener('click', () => $('#moodDialog').close());

// ================== Finalizar (com motivos) ==================
let finishingId = null;

function openFinish(task) {
  finishingId = task.id;
  const worked = workedMs(task) / 60000;
  const diff = Math.round(worked - task.estimate);
  $('#finTitle').textContent = task.title;
  $('#finSummary').textContent = task.sessions.length
    ? t('fin.summary', { est: fmtDuration(task.estimate), worked: fmtDuration(worked), diff: `${diff >= 0 ? '+' : '−'}${fmtDuration(Math.abs(diff))}` })
    : t('fin.notStarted', { est: fmtDuration(task.estimate) });

  const r = task.result || { reasons: reasonsFromPauses(task) };
  $(`input[name=outcome][value=${r.outcome || 'done'}]`).checked = true;
  for (const row of $$('.reason')) {
    const saved = r?.reasons?.find((x) => x.type === row.dataset.type);
    $('input[type=checkbox]', row).checked = !!saved;
    $('.min', row).value = saved?.minutes ?? '';
    if ($('.desc', row)) $('.desc', row).value = saved?.description ?? '';
    row.classList.toggle('on', !!saved);
  }
  $('#finNote').value = r.note || '';
  // humor: antes (do início, editável) e depois
  $('#finMoodBox').classList.toggle('hidden', !state.ui.askMood && task.moodBefore == null && r.moodAfter == null);
  $('[data-mood=before]').innerHTML = moodButtons(task.moodBefore ?? null);
  $('[data-mood=after]').innerHTML = moodButtons(r.moodAfter ?? null);
  $('#finReopen').classList.toggle('hidden', !task.done);
  $('#finishDialog').showModal();
}

// escolher humor no diálogo de finalizar (clicar de novo desmarca)
$('#finMoodBox').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  const on = b.classList.contains('on');
  $$('button', b.parentElement).forEach((x) => x.classList.remove('on'));
  if (!on) b.classList.add('on');
});
const pickedMood = (which) => { const b = $(`[data-mood=${which}] button.on`); return b ? +b.dataset.v : null; };

// marcar/desmarcar e auto-marcar ao digitar
$('#finishForm').addEventListener('input', (e) => {
  const row = e.target.closest('.reason');
  if (!row) return;
  const box = $('input[type=checkbox]', row);
  if (e.target !== box && e.target.value) box.checked = true;
  row.classList.toggle('on', box.checked);
});

$('#finishForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const task = byId(finishingId);
  if (!task) return;

  const reasons = $$('.reason')
    .filter((row) => $('input[type=checkbox]', row).checked)
    .map((row) => {
      const min = parseInt($('.min', row).value, 10);
      return {
        type: row.dataset.type,
        minutes: Number.isFinite(min) ? min : null,
        description: $('.desc', row)?.value.trim() || null,
      };
    });

  pause(task);
  task.moodBefore = pickedMood('before');
  const firstFinish = !task.done;
  task.result = {
    outcome: $('input[name=outcome]:checked').value,
    finishedAt: task.result?.finishedAt || Date.now(),
    reasons,
    note: $('#finNote').value.trim(),
    moodAfter: pickedMood('after'),
  };
  task.done = true;
  save();
  $('#finishDialog').close();
  render();
  if (firstFinish && task.result.outcome === 'done') notifyDone(task);
});

$('#finCancel').addEventListener('click', () => $('#finishDialog').close());
$('#finReopen').addEventListener('click', () => {
  const task = byId(finishingId);
  if (!task) return;
  task.done = false;
  task.archived = false;
  task.result = null;
  save();
  $('#finishDialog').close();
  render();
});

// ================== Categorias ==================
function renderCategories() {
  $('#catList').innerHTML = state.categories.map((c) => `
    <li data-id="${c.id}">
      <input type="color" value="${c.color}" data-cat-color />
      <span>${escapeHtml(c.name)}</span>
      <button class="icon" data-cat-del title="${t('common.remove')}">✕</button>
    </li>`).join('');
}
$('#btnCategories').addEventListener('click', () => { renderCategories(); $('#catDialog').showModal(); });
$('#catClose').addEventListener('click', () => $('#catDialog').close());
$('#catDialog').addEventListener('close', render);
$('#catList').addEventListener('input', (e) => {
  if (!e.target.matches('[data-cat-color]')) return;
  state.categories.find((c) => c.id === e.target.closest('li').dataset.id).color = e.target.value;
  save();
});
$('#catList').addEventListener('click', (e) => {
  if (!e.target.matches('[data-cat-del]') || state.categories.length <= 1) return;
  const id = e.target.closest('li').dataset.id;
  state.categories = state.categories.filter((c) => c.id !== id);
  save();
  renderCategories();
});
$('#catForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#cName').value.trim();
  if (!name) return;
  state.categories.push({ id: uid(), name, color: $('#cColor').value });
  save();
  $('#cName').value = '';
  renderCategories();
});

// ================== Modo linha / painel ==================
function showExpanded(expanded) {
  $('#panel').classList.toggle('hidden', !expanded);
  $('#line').classList.toggle('hidden', expanded);
  peekExpanded = expanded;
  schedulePeek();
}

// ================== Barra "de tempos em tempos" ==================
// Recolhida, a barra fica invisível (e os cliques passam para a janela de baixo, como o "X" de fechar).
// A cada 1–5 min ela aparece por uns 3 s e some. Também aparece quando a tarefa começa, pausa ou estoura.
const PEEK_SHOW_MS = 3000;
let peekTimer = null, peekHideTimer = null, peekExpanded = true, lastPeekKey = '';
const peekMode = () => state.ui.barVisibility !== 'always';
function barHasSomething() {
  const open = sortedOpen();
  return open.some((x) => x.sessions.length) || open.some(isDue);
}
function setBarHidden(hidden) {
  document.body.classList.toggle('bar-off', hidden);
  api.setClickThrough(hidden);
}
function peek() {
  clearTimeout(peekHideTimer);
  setBarHidden(false);
  peekHideTimer = setTimeout(() => { if (!peekExpanded && peekMode()) setBarHidden(true); }, PEEK_SHOW_MS);
}
function schedulePeek() {
  clearInterval(peekTimer);
  clearTimeout(peekHideTimer);
  if (peekExpanded || !peekMode()) { setBarHidden(false); return; }
  if (barHasSomething()) peek(); else setBarHidden(true); // ao recolher: aparece uma vez e some
  const every = Math.min(5, Math.max(1, Number(state.ui.peekEvery) || 2)) * 60000;
  peekTimer = setInterval(() => { if (!peekExpanded && peekMode() && barHasSomething()) peek(); }, every);
}
/** Chamado a cada atualização da barra: mostra quando algo importante muda. */
function peekOnChange(key) {
  if (key === lastPeekKey) return;
  const first = lastPeekKey === '';
  lastPeekKey = key;
  if (first || peekExpanded || !peekMode()) return;
  if (barHasSomething()) peek(); else setBarHidden(true);
}

/** Lado em que o painel abre: com a barra na lateral, o mesmo lado da barra. */
const panelSide = () => (state.ui.barPos === 'left' || state.ui.barPos === 'right' ? state.ui.barPos : state.ui.side);

function applyUi() {
  const side = panelSide();
  document.body.classList.toggle('left', side === 'left');
  document.body.classList.toggle('right', side !== 'left');
  document.body.classList.toggle('bar-h', state.ui.barPos === 'top' || state.ui.barPos === 'bottom');
  updateHeader();
  const { mode, hoverOpen, barPos, lineSize, barVisibility, peekEvery, reminderMin, lang, sound, startCollapsed, notifyOverdue, notifySchedule, askMood,
    msgTone, updateCheck, theme } = state.ui;
  api.setConfig({ mode, side, panelSideChoice: state.ui.side, hoverOpen, barPos, lineSize, barVisibility, peekEvery, reminderMin, lang, sound,
    startCollapsed, notifyOverdue, notifySchedule, askMood, msgTone, updateCheck, theme, customMessages: state.ui.customMessages });
  schedulePeek();
}

/** Troca de idioma: textos fixos, categorias padrão ainda não renomeadas e tudo que é desenhado. */
function applyLang() {
  I18n.setLang(state.ui.lang);
  I18n.apply(document);
  for (const c of state.categories) {
    const names = I18n.DEFAULT_CAT_NAMES[c.id];
    if (names && names.includes(c.name)) c.name = t(`catdef.${c.id}`);
  }
  $('#btnSettings').innerHTML = ICONS.gear;
  const badge = $('.demo-badge');
  if (badge) { badge.textContent = t('demo.badge'); badge.title = t('demo.title'); }
  render();
}

function setUi(patch) {
  const langChanged = patch.lang && patch.lang !== state.ui.lang;
  Object.assign(state.ui, patch);
  if (langChanged) applyLang();
  save();
  applyUi();
}

$('#btnMode').addEventListener('click', () => setUi({ mode: state.ui.mode === 'auto' ? 'pinned' : 'auto' }));
$('#btnDash').addEventListener('click', () => api.openDashboard?.());
$('#btnSettings').addEventListener('click', () => api.openSettings?.());
$('#btnReminder').addEventListener('click', () => {
  if (api.reminderMenu) return api.reminderMenu();
  // fallback (navegador): alterna entre as opções
  const opts = [0, 5, 10, 15, 20, 30, 60];
  setUi({ reminderMin: opts[(opts.indexOf(state.ui.reminderMin) + 1) % opts.length] });
});
api.onExpanded(showExpanded);
api.onSet(setUi);

// clicar na linha abre o painel; passar o mouse só abre se a opção estiver ligada (menu da bandeja)
let hoverTimer = null;
$('#line').addEventListener('click', () => api.expand());
$('#line').addEventListener('mouseenter', () => {
  if (state.ui.hoverOpen) hoverTimer = setTimeout(() => api.expand(), 250);
});
$('#line').addEventListener('mouseleave', () => clearTimeout(hoverTimer));

// não recolhe enquanto há diálogo aberto ou texto sendo digitado
let lastBusy = null;
setInterval(() => {
  const busy = !!$('dialog[open]') || (document.hasFocus() && $('#fTitle').value.trim() !== '');
  if (busy !== lastBusy) { lastBusy = busy; api.setBusy(busy); }
}, 300);

// ================== Início ==================
applyLang();
if (api.isDemo) {
  const b = document.createElement('span');
  b.className = 'demo-badge';
  b.textContent = t('demo.badge');
  b.title = t('demo.title');
  $('header h1').append(b);
}
save();
applyUi();
tick();
