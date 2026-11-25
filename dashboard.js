// =====================================================================
//  My Owl Planner — dashboard
// =====================================================================
const A = window.Analytics;
const api = window.dashApi || {
  // fallback p/ abrir no navegador (testes)
  load: () => window.__DATA || JSON.parse(localStorage.getItem('d') || 'null'),
  onData() {}, onLang() {},
  systemLocale: navigator.language,
};
const { t, tn } = I18n;
const L = () => I18n.locale();

const MIN = 60000;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const REASON_COLOR = (type) => css(`--r-${type}`) || css('--r-other');
const REASON = (type) => t(`reason.${type}`);

// ---------- estado da tela ----------
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`dash:${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`dash:${k}`, JSON.stringify(v)); } catch { /* ok */ } },
};
const view = {
  tab: store.get('tab', 'day'),
  day: A.dayKey(Date.now()),
  unit: store.get('unit', 'month'),           // week | month | year | custom
  anchor: A.dayKey(Date.now()),                // dia de referência p/ semana/mês/ano
  customFrom: store.get('customFrom', A.addDays(A.dayKey(Date.now()), -29)),
  customTo: store.get('customTo', A.dayKey(Date.now())),
};

// ---------- períodos ----------
// nomes de meses e intervalos de datas vêm do Intl, no idioma escolhido
const monthShort = (m) => new Date(2020, m - 1, 1).toLocaleDateString(L(), { month: 'short' }).replace('.', '');
const monthYear = (y, m) => new Date(y, m - 1, 1).toLocaleDateString(L(), { month: 'long', year: 'numeric' });
const ymd = (k) => k.split('-').map(Number);
const mk = (y, m, d) => A.dayKey(new Date(y, m - 1, d).getTime());

/** Início e fim do período atual (ou deslocado `shift` unidades). */
function bounds(shift = 0) {
  const [y, m] = ymd(view.anchor);
  if (view.unit === 'week') {
    const s = A.addDays(A.weekStart(view.anchor), 7 * shift);
    return [s, A.addDays(s, 6)];
  }
  if (view.unit === 'month') return [mk(y, m + shift, 1), mk(y, m + shift + 1, 0)];
  if (view.unit === 'year') return [mk(y + shift, 1, 1), mk(y + shift, 12, 31)];
  let [a, b] = [view.customFrom, view.customTo];
  if (a > b) [a, b] = [b, a];
  const len = A.daysBetween(a, b);
  return [A.addDays(a, len * shift), A.addDays(b, len * shift)];
}

function periodLabel(a, b) {
  const [ya, ma] = ymd(a);
  if (view.unit === 'month') return monthYear(ya, ma);
  if (view.unit === 'year') return String(ya);
  const fmt = new Intl.DateTimeFormat(L(), { day: 'numeric', month: 'short', year: 'numeric' });
  return fmt.formatRange(new Date(A.keyToMs(a)), new Date(A.keyToMs(b)));
}

/** Rótulos dos agrupamentos (dia / semana / mês). */
function bucketTitle(b) {
  if (b.gran === 'day') return `${weekday(b.key)} ${fmtDayShort(b.key)}`;
  if (b.gran === 'week') return t('dash.week', { a: fmtDayShort(b.startKey), b: fmtDayShort(b.endKey) });
  const [y, m] = ymd(b.key + '-01');
  return monthYear(y, m);
}
let data = api.load() || { tasks: [], categories: [] };

// ---------- formatação ----------
function fmtDur(min, { zero = '0min' } = {}) {
  min = Math.round(min);
  if (min <= 0) return zero;
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
const fmtMs = (ms, o) => fmtDur(ms / MIN, o);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(L(), { hour: '2-digit', minute: '2-digit' });
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtSigned = (x) => { const v = Math.round(x * 100); return v === 0 ? '0%' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`; };
function fmtDayLong(key) {
  const d = new Date(A.keyToMs(key));
  const today = A.dayKey(Date.now());
  const rel = key === today ? t('dash.todayPrefix') : key === A.addDays(today, -1) ? t('dash.yesterdayPrefix') : '';
  return rel + d.toLocaleDateString(L(), { weekday: 'long', day: '2-digit', month: 'long' });
}
const fmtDayShort = (key) => new Date(A.keyToMs(key)).toLocaleDateString(L(), { day: '2-digit', month: '2-digit' });
const weekday = (key) => new Date(A.keyToMs(key)).toLocaleDateString(L(), { weekday: 'short' }).replace('.', '');

const STATUS = (st) => t(`dash.st.${st}`);

// ================== tooltip ==================
const tips = [];
const tip = (html) => (tips.push(html), `data-tip="${tips.length - 1}"`);
const tipRow = (color, label, value) =>
  `<div class="row">${color ? `<i style="background:${color}"></i>` : ''}<span>${esc(label)}</span><span class="v">${esc(value)}</span></div>`;

document.addEventListener('mousemove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  const box = $('#tip');
  if (!el) { box.classList.remove('on'); return; }
  box.innerHTML = tips[+el.dataset.tip] || '';
  box.classList.add('on');
  const { innerWidth: W, innerHeight: H } = window;
  const r = box.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > W - 8) x = e.clientX - r.width - 14;
  if (y + r.height > H - 8) y = e.clientY - r.height - 14;
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
});
document.addEventListener('mouseleave', () => $('#tip').classList.remove('on'));

// ================== peças ==================
function kpi(label, value, sub = '', delta = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ''}${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;
}

function card(title, hint, body, wide = false) {
  return `<section class="card${wide ? ' wide' : ''}"><h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;
}

const legend = (items) => `<div class="legend">${items.map(([c, l, dash, ring]) =>
  `<span><i class="${dash ? 'dash' : ring ? 'ring' : ''}" style="${dash || ring ? `border-color:${c}` : `background:${c}`}"></i>${esc(l)}</span>`).join('')}</div>`;

/** Retângulo com cantos superiores arredondados (ponta do dado), base reta no eixo. */
function topRounded(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
/** Barra horizontal com a ponta direita arredondada. */
function rightRounded(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  r = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function leftRounded(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  r = Math.min(r, h / 2, w);
  return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
}

/** Passos "redondos" para o eixo de horas. */
function niceHourStep(maxMin) {
  for (const s of [15, 30, 60, 120, 180, 240, 360, 480, 600, 1200, 1800, 3000, 6000, 12000]) if (maxMin / s <= 5) return s;
  return 30000;
}

// ================== gráficos ==================

/** Linha do tempo do dia: uma faixa por tarefa, sessões como barras e pausas tracejadas na cor do motivo. */
function chartTimeline(d, width) {
  if (!d.timeline.length) return `<div class="empty">${t('dash.empty.timeline')}</div>`;
  const labelW = Math.min(190, width * 0.28);
  const rowH = 30, top = 22, barH = 12;
  const now = Date.now();
  const isToday = now >= d.from && now < d.to;

  let t0 = Math.min(...d.timeline.map((r) => r.sessions[0].start));
  let t1 = Math.max(...d.timeline.flatMap((r) => r.sessions.map((s) => s.end)));
  if (isToday) t1 = Math.max(t1, now);
  const h0 = new Date(t0); h0.setMinutes(0, 0, 0); t0 = h0.getTime();
  const h1 = new Date(t1); if (h1.getMinutes() || h1.getSeconds()) h1.setHours(h1.getHours() + 1, 0, 0, 0); t1 = h1.getTime();
  if (t1 - t0 < 4 * 3600e3) t1 = Math.min(d.to, t0 + 4 * 3600e3);

  const plotW = width - labelW - 8;
  const x = (ms) => labelW + ((ms - t0) / (t1 - t0)) * plotW;
  const H = top + d.timeline.length * rowH + 4;
  const hours = (t1 - t0) / 3600e3;
  const step = hours > 14 ? 2 : 1;

  let g = '<g class="grid">';
  for (let ms = t0; ms <= t1; ms += step * 3600e3) {
    g += `<line x1="${x(ms)}" x2="${x(ms)}" y1="${top - 6}" y2="${H}"/>`;
    g += `<text x="${x(ms)}" y="${top - 10}" text-anchor="middle">${new Date(ms).getHours()}h</text>`;
  }
  g += '</g>';

  let rows = '';
  d.timeline.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const title = r.title.length > 26 ? r.title.slice(0, 25) + '…' : r.title;
    rows += `<text class="t2" x="0" y="${cy + 4}">${esc(title)}</text>`;
    rows += `<line class="axis" x1="${labelW}" x2="${width - 8}" y1="${cy}" y2="${cy}" opacity=".35"/>`;
    for (const p of r.pauses) {
      const c = REASON_COLOR(p.type);
      const tipHtml = `<b>⏸ ${esc(REASON(p.type))}</b>${p.auto ? ` <span>${t('dash.auto')}</span>` : ''}<br>
        ${fmtTime(p.start)}–${fmtTime(p.end)} · ${fmtMs(p.end - p.start)}${p.description && !p.auto ? `<br>${esc(p.description)}` : ''}`;
      rows += `<g ${tip(tipHtml)}><rect class="hit" x="${x(p.start)}" y="${cy - 9}" width="${Math.max(6, x(p.end) - x(p.start))}" height="18"/>
        <line x1="${x(p.start)}" x2="${x(p.end)}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="${x(p.start)}" cy="${cy}" r="3.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/></g>`;
    }
    for (const s of r.sessions) {
      const w = Math.max(3, x(s.end) - x(s.start) - 2);
      const tipHtml = `<b>${esc(r.title)}</b><br>${fmtTime(s.start)}–${s.open ? t('dash.now') : fmtTime(s.end)} · ${fmtMs(s.end - s.start)}
        <br><span style="color:${r.category.color}">●</span> ${esc(r.category.name)}`;
      rows += `<g ${tip(tipHtml)}><rect class="hit" x="${x(s.start)}" y="${cy - 10}" width="${w}" height="20"/>
        <rect class="mark" x="${x(s.start) + 1}" y="${cy - barH / 2}" width="${w}" height="${barH}" rx="4" fill="${r.category.color}"/></g>`;
    }
  });

  const nowLine = isToday ? `<line class="now" x1="${x(now)}" x2="${x(now)}" y1="${top - 6}" y2="${H}"/>
    <text x="${x(now)}" y="${H + 12}" text-anchor="middle" class="t2">${t('dash.now')}</text>` : '';

  return `<svg viewBox="0 0 ${width} ${H + (isToday ? 16 : 4)}" height="${H + (isToday ? 16 : 4)}">${g}${rows}${nowLine}</svg>`;
}

/** Barras horizontais simples: [{label, value, color, tip, valueLabel}] */
function chartHBars(items, width, { labelW = 120, unit = (v) => v } = {}) {
  if (!items.length) return `<div class="empty">${t('dash.empty.period')}</div>`;
  const rowH = 30, barH = 14;
  const valueW = 92;
  const plotW = Math.max(40, width - labelW - valueW);
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const H = items.length * rowH;
  let out = '';
  items.forEach((it, i) => {
    const cy = i * rowH + rowH / 2;
    const w = (it.value / max) * plotW;
    out += `<g ${tip(it.tip)}><rect class="hit" x="0" y="${cy - rowH / 2}" width="${width}" height="${rowH}"/>
      <text class="t2" x="0" y="${cy + 4}">${esc(it.label)}</text>
      <rect x="${labelW}" y="${cy - barH / 2}" width="${plotW}" height="${barH}" rx="4" fill="var(--grid)" opacity=".5"/>
      ${w > 0 ? `<path class="mark" d="${rightRounded(labelW, cy - barH / 2, w, barH)}" fill="${it.color}"/>` : ''}
      <text class="t1" x="${labelW + plotW + 10}" y="${cy + 4}">${esc(it.valueLabel ?? unit(it.value))}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${H}" height="${H}">${out}</svg>`;
}

/** Colunas empilhadas: days=[{key, segs:[{id,value,color,label}], tip}], yFmt */
function chartStackedCols(cols, width, { height = 220, yFmt, step, xLabel }) {
  const left = 44, bottom = 22, top = 8;
  const plotW = width - left - 4, plotH = height - top - bottom;
  const totals = cols.map((c) => c.segs.reduce((s, x) => s + x.value, 0));
  const rawMax = Math.max(...totals, 0);
  const st = step(rawMax);
  const max = Math.max(st, Math.ceil(rawMax / st) * st);
  const y = (v) => top + plotH - (v / max) * plotH;
  const slot = plotW / cols.length;
  const bw = Math.max(2, Math.min(42, slot * 0.68));

  let g = '<g class="grid">';
  for (let v = 0; v <= max + 1e-9; v += st) {
    g += `<line x1="${left}" x2="${width - 4}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`;
  }
  g += '</g>';

  let bars = '';
  cols.forEach((c, i) => {
    const cx = left + slot * i + slot / 2;
    let acc = 0;
    const segs = c.segs.filter((s) => s.value > 0);
    let body = '';
    segs.forEach((s, j) => {
      const y0 = y(acc), y1 = y(acc + s.value);
      const h = Math.max(1, y0 - y1 - (j < segs.length - 1 ? 2 : 0)); // 2px de respiro entre segmentos
      body += j === segs.length - 1
        ? `<path class="mark" d="${topRounded(cx - bw / 2, y1, bw, h)}" fill="${s.color}"/>`
        : `<rect class="mark" x="${cx - bw / 2}" y="${y0 - h}" width="${bw}" height="${h}" fill="${s.color}"/>`;
      acc += s.value;
    });
    bars += `<g class="col" ${tip(c.tip)}><rect class="hit" x="${cx - slot / 2}" y="${top}" width="${slot}" height="${plotH + bottom}"/>${body}</g>`;
    const lbl = xLabel(c, i);
    if (lbl) bars += `<text x="${cx}" y="${height - 6}" text-anchor="middle">${esc(lbl)}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" height="${height}">${g}
    <line class="axis" x1="${left}" x2="${width - 4}" y1="${y(0)}" y2="${y(0)}"/>${bars}</svg>`;
}

/** Barras divergentes em torno de 0 (precisão: −30% … +60%). */
function chartDiverging(items, width) {
  if (!items.length) return `<div class="empty">${t('dash.empty.accuracy')}</div>`;
  const labelW = 120, valueW = 64, rowH = 30, barH = 14, top = 18;
  const plotW = width - labelW - valueW;
  const lim = Math.max(0.25, ...items.map((i) => Math.abs(i.value))) * 1.05;
  const x = (v) => labelW + ((v + lim) / (2 * lim)) * plotW;
  const H = top + items.length * rowH;
  let out = `<text x="${x(-lim)}" y="10">${t('dash.faster')}</text><text x="${x(lim)}" y="10" text-anchor="end">${t('dash.slower')}</text>
    <line class="axis" x1="${x(0)}" x2="${x(0)}" y1="${top - 4}" y2="${H}"/>`;
  items.forEach((it, i) => {
    const cy = top + i * rowH + rowH / 2;
    const xv = x(it.value), x0 = x(0);
    const color = it.value >= 0 ? 'var(--over)' : 'var(--under)';
    const d = it.value >= 0 ? rightRounded(x0, cy - barH / 2, xv - x0, barH) : leftRounded(xv, cy - barH / 2, x0 - xv, barH);
    out += `<g ${tip(it.tip)}><rect class="hit" x="0" y="${cy - rowH / 2}" width="${width}" height="${rowH}"/>
      <text class="t2" x="0" y="${cy + 4}">${esc(it.label)}</text>
      ${Math.abs(xv - x0) >= 1 ? `<path class="mark" d="${d}" fill="${color}"/>` : `<line x1="${x0}" x2="${x0}" y1="${cy - 7}" y2="${cy + 7}" stroke="var(--text-2)" stroke-width="2"/>`}
      <text class="t1" x="${width - valueW + 10}" y="${cy + 4}">${fmtSigned(it.value)}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${H}" height="${H}">${out}</svg>`;
}

// ================== humor ==================
const moodEmoji = (v) => A.MOOD_EMOJI[Math.min(5, Math.max(1, Math.round(v)))];
const fmtMood = (v) => v.toLocaleString(L(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function moodKpi(m) {
  if (!m.n) return kpi(t('dash.k.mood'), '—', t('dash.k.mood.none'));
  const d = Math.round(m.delta * 10) / 10;
  const verdict = t(d > 0.05 ? 'dash.mood.better' : d < -0.05 ? 'dash.mood.worse' : 'dash.mood.same');
  return kpi(t('dash.k.mood'), `${moodEmoji(m.before)} → ${moodEmoji(m.after)}`,
    `${fmtMood(m.before)} → ${fmtMood(m.after)} (${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMood(Math.abs(d))}) · ${verdict}<br>${tn('dash.k.mood.sub', m.n)}`);
}

/** "Halteres": antes (círculo vazado, azul) → depois (círculo cheio, verde) numa escala 1–5. */
function chartMood(items, width) {
  if (!items.length) return `<div class="empty">${t('dash.empty.mood')}</div>`;
  const labelW = Math.min(150, width * 0.32), valueW = 96, rowH = 32, top = 22;
  const plotW = Math.max(60, width - labelW - valueW - 8);
  const x = (v) => labelW + ((v - 1) / 4) * plotW;
  const H = top + items.length * rowH;
  const cBefore = css('--mood-before'), cAfter = css('--mood-after');
  let g = '<g class="grid">';
  for (let v = 1; v <= 5; v++) {
    g += `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 6}" y2="${H}"/><text x="${x(v)}" y="${top - 10}" text-anchor="middle" style="font-size:13px">${A.MOOD_EMOJI[v]}</text>`;
  }
  g += '</g>';
  let rows = '';
  items.forEach((it, i) => {
    const cy = top + i * rowH + rowH / 2;
    const xb = x(it.before), xa = x(it.after);
    const d = it.after - it.before;
    rows += `<g ${tip(`<b>${esc(it.label)}</b><br>${tn('dash.mood.tip', it.n, { b: `${moodEmoji(it.before)} ${fmtMood(it.before)}`, a: `${moodEmoji(it.after)} ${fmtMood(it.after)}` })}`)}>
      <rect class="hit" x="0" y="${cy - rowH / 2}" width="${width}" height="${rowH}"/>
      ${it.sep ? `<line class="axis" x1="0" x2="${width}" y1="${cy - rowH / 2}" y2="${cy - rowH / 2}" opacity=".6"/>` : ''}
      <text class="t2" x="0" y="${cy + 4}">${esc(it.label)}</text>
      <line x1="${xb}" x2="${xa}" y1="${cy}" y2="${cy}" stroke="var(--text-2)" stroke-width="2" opacity=".55"/>
      <circle cx="${xb}" cy="${cy}" r="6" fill="var(--surface)" stroke="${cBefore}" stroke-width="2.5"/>
      <circle cx="${xa}" cy="${cy}" r="6.5" fill="${cAfter}" stroke="var(--surface)" stroke-width="2"/>
      <text class="t1" x="${labelW + plotW + 14}" y="${cy + 4}">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMood(Math.abs(d))}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${H}" height="${H}">${g}${rows}</svg>`;
}

// ================== aba: Dia ==================
function lostItems(lost) {
  return A.PAUSE_TYPES
    .map((type) => ({ type, ...lost.by[type] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((r) => ({
      label: REASON(r.type), value: r.minutes, color: REASON_COLOR(r.type),
      valueLabel: `${fmtDur(r.minutes)} · ${r.count}×`,
      tip: `<b>${REASON(r.type)}</b><br>${tn('dash.occ', r.count, { d: fmtDur(r.minutes) })}`,
    }));
}

function renderDay(W) {
  const d = A.day(data, view.day);
  const acc = d.accuracy;
  const half = W >= 980 ? (W - 16) / 2 - 38 : W - 38;

  const kpis = `<div class="kpis">
    ${kpi(t('dash.k.focus'), fmtMs(d.focusMs), tn('dash.k.focus.sub', d.timeline.length))}
    ${kpi(t('dash.k.finished'), `${d.finishedN}<small>${t('dash.k.of', { n: d.relevantN })}</small>`, t('dash.k.finished.sub', { done: d.doneN, not: d.notDoneN }))}
    ${kpi(t('dash.k.accuracy'), acc.ratio == null ? '—' : fmtSigned(acc.ratio - 1),
      acc.ratio == null ? t('dash.k.accuracy.none') : t('dash.k.accuracy.sub', { worked: fmtMs(acc.workedMs), est: fmtMs(acc.estMs) }))}
    ${kpi(t('dash.k.lost'), fmtDur(d.lost.total), t('dash.k.lost.sub'))}
    ${kpi(t('dash.k.pauses'), d.pausesN, t('dash.k.pauses.sub'))}
    ${moodKpi(d.mood)}
  </div>`;

  const usedReasons = new Set(d.timeline.flatMap((r) => r.pauses.map((p) => p.type)));
  const cats = [...new Map(d.timeline.map((r) => [r.category.id, r.category])).values()];
  const tlLegend = legend([
    ...cats.map((c) => [c.color, c.name]),
    ...[...usedReasons].map((type) => [REASON_COLOR(type), t('dash.legend.pause', { r: REASON(type) }), true]),
  ]);

  const table = d.rows.length ? `<table>
      <thead><tr><th>${t('dash.th.task')}</th><th>${t('dash.th.category')}</th><th class="num">${t('dash.th.estimate')}</th><th class="num">${t('dash.th.day')}</th>
        <th class="num">${t('dash.th.total')}</th><th class="num">${t('dash.th.pauses')}</th><th>${t('dash.th.mood')}</th><th>${t('dash.th.status')}</th></tr></thead>
      <tbody>${d.rows.map((r) => `<tr>
        <td class="title">${esc(r.title)}</td>
        <td class="cat"><span class="dot" style="background:${r.category.color}"></span>${esc(r.category.name)}</td>
        <td class="num">${fmtDur(r.estimateMin)}</td>
        <td class="num">${fmtDur(r.workedTodayMin, { zero: '—' })}</td>
        <td class="num">${fmtDur(r.workedTotalMin, { zero: '—' })}</td>
        <td class="num">${r.pauses || '—'}</td>
        <td class="mood">${r.moodBefore || r.moodAfter ? `${A.MOOD_EMOJI[r.moodBefore] || '·'} → ${A.MOOD_EMOJI[r.moodAfter] || '·'}` : '—'}</td>
        <td class="st ${r.status}">${STATUS(r.status)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${t('dash.empty.dayTasks')}</div>`;

  return kpis + `<div class="grid">
    ${card(t('dash.c.timeline'), t('dash.c.timeline.hint'), tlLegend + `<div class="chart">${chartTimeline(d, W - 38)}</div>`, true)}
    ${card(t('dash.c.dayTasks'), t('dash.c.dayTasks.hint'), table, true)}
    ${card(t('dash.c.lost'), t('dash.c.lost.hintDay'), `<div class="chart">${chartHBars(lostItems(d.lost), half)}</div>`)}
  </div>`;
}

// ================== aba: Período ==================

function delta(cur, prev, { fmt = (x) => fmtPct(x), invert = false, abs = false } = {}) {
  if (cur == null || prev == null) return '';
  if (abs) {
    const diff = cur - prev;
    if (Math.abs(diff) < 0.005) return t('dash.delta.same');
    return t('dash.delta.vs', { arrow: diff > 0 ? '▲' : '▼', v: fmt(Math.abs(diff)) });
  }
  if (!prev) return '';
  const ch = cur / prev - 1;
  if (Math.abs(ch) < 0.005) return t('dash.delta.same');
  return t('dash.delta.vs', { arrow: ch > 0 ? '▲' : '▼', v: fmtPct(Math.abs(ch)) });
}

function renderRange(W) {
  const [a, b] = bounds(0);
  const [pa, pb] = bounds(-1);
  const r = A.period(data, a, b);
  const p = A.period(data, pa, pb);
  $('#rangeLabel').textContent = periodLabel(a, b);
  const B = r.buckets;
  const gw = t(`dash.gran.${r.gran}`);
  const half = W >= 980 ? (W - 16) / 2 - 38 : W - 38;
  const full = W - 38;

  const kpis = `<div class="kpis">
    ${kpi(t('dash.k.avgFocus'), fmtMs(r.focusAvgMs), tn('dash.k.avgFocus.sub', r.activeDays, { total: fmtMs(r.focusMs) }) +
      (r.sinceFirstUse ? `<br>${t('dash.k.avgFocus.since', { d: fmtDayShort(r.sinceFirstUse) })}` : ''), delta(r.focusAvgMs, p.focusAvgMs))}
    ${kpi(t('dash.k.completion'), r.completion == null ? '—' : fmtPct(r.completion), t('dash.k.completion.sub', { done: r.doneN, n: r.finishedN }),
      delta(r.completion, p.completion, { abs: true, fmt: (x) => t('dash.pp', { n: Math.round(x * 100) }) }))}
    ${kpi(t('dash.k.accuracy'), r.accuracy.ratio == null ? '—' : fmtSigned(r.accuracy.ratio - 1),
      r.accuracy.ratio == null ? t('dash.k.accuracy.noneR') : t(r.accuracy.ratio > 1 ? 'dash.k.accuracy.more' : 'dash.k.accuracy.less'))}
    ${kpi(t('dash.k.lost'), fmtDur(r.lost.total), t('dash.k.lost.perDay', { d: fmtDur(r.lost.total / r.elapsedDays) }), delta(r.lost.total, p.lost.total))}
    ${kpi(t('dash.k.finishedR'), r.finishedN, tn('dash.k.finishedR.sub', r.days), delta(r.finishedN, p.finishedN))}
    ${moodKpi(r.mood)}
    ${kpi(t('dash.k.start'), r.startDelay ? fmtDur(Math.abs(r.startDelay.avgMin), { zero: t('dash.k.start.onTime') }) : '—',
      r.startDelay ? `${t(r.startDelay.avgMin >= 0 ? 'dash.k.start.late' : 'dash.k.start.early')} · ${tn('dash.k.resched', r.reschedules)}`
        : tn('dash.k.resched', r.reschedules))}
  </div>`;

  // --- foco por dia, empilhado por categoria ---
  const catOrder = r.categories;
  const multiYear = r.startKey.slice(0, 4) !== r.endKey.slice(0, 4);
  const focusCols = B.map((d) => ({
    key: d.key,
    segs: catOrder.map((c) => ({ id: c.id, value: (d.byCat[c.id] || 0) / MIN, color: c.color })),
    tip: `<b>${bucketTitle(d)}</b> · ${fmtMs(d.focusMs)}` +
      (d.gran !== 'day' ? `<br>${t('dash.avgPerDay', { d: fmtMs(d.focusMs / d.days) })}` : '') +
      catOrder.filter((c) => d.byCat[c.id]).map((c) => tipRow(c.color, c.name, fmtMs(d.byCat[c.id]))).join(''),
  }));
  const every = Math.max(1, Math.ceil(B.length / (full > 700 ? 14 : 8)));
  const xLabel = (c, i) => {
    const bk = B[i];
    if (bk.gran === 'month') { const m = +bk.key.slice(5, 7); return monthShort(m) + (multiYear ? `/${bk.key.slice(2, 4)}` : ''); }
    if (B.length <= 10 && bk.gran === 'day') return `${weekday(bk.key)} ${bk.key.slice(8)}`;
    if (i % every) return '';
    return view.unit === 'month' && bk.gran === 'day' ? String(+bk.key.slice(8)) : fmtDayShort(bk.startKey);
  };
  const focusChart = r.focusMs
    ? legend(catOrder.map((c) => [c.color, c.name])) + `<div class="chart nav-days">${chartStackedCols(focusCols, full, {
      yFmt: (v) => fmtDur(v, { zero: '0' }), step: niceHourStep, xLabel,
    })}</div>`
    : `<div class="empty">${t('dash.empty.focus')}</div>`;

  const focusTable = `<details class="tbl"><summary>${t('dash.table')}</summary><table>
    <thead><tr><th>${t(`dash.th.period.${r.gran}`)}</th>${catOrder.map((c) => `<th class="num">${esc(c.name)}</th>`).join('')}<th class="num">${t('dash.th.total')}</th>
      <th class="num">${t('dash.th.done')}</th><th class="num">${t('dash.th.notDone')}</th><th class="num">${t('dash.th.lost')}</th></tr></thead>
    <tbody>${B.filter((d) => !d.future).slice().reverse().map((d) => `<tr><td>${bucketTitle(d)}</td>
      ${catOrder.map((c) => `<td class="num">${fmtMs(d.byCat[c.id] || 0, { zero: '—' })}</td>`).join('')}
      <td class="num">${fmtMs(d.focusMs, { zero: '—' })}</td><td class="num">${d.done || '—'}</td><td class="num">${d.notDone || '—'}</td>
      <td class="num">${fmtDur(d.lostMin, { zero: '—' })}</td></tr>`).join('')}</tbody></table></details>`;

  // --- concluídas × não concluídas por dia ---
  const anyFinished = B.some((d) => d.done + d.notDone);
  const finCols = B.map((d) => ({
    key: d.key,
    segs: [{ value: d.done, color: css('--good') }, { value: d.notDone, color: css('--critical') }],
    tip: `<b>${bucketTitle(d)}</b>` + tipRow(css('--good'), t('dash.lg.done'), d.done) + tipRow(css('--critical'), t('dash.lg.notDone'), d.notDone),
  }));
  const finChart = anyFinished
    ? legend([[css('--good'), t('dash.lg.done')], [css('--critical'), t('dash.lg.notDone')]]) +
      `<div class="chart nav-days">${chartStackedCols(finCols, half, {
        height: 180, yFmt: (v) => String(v),
        xLabel: (c, i) => (B.length <= 10 && r.gran === 'day' ? weekday(c.key) : (B.length > 16 && i % (every * 2) ? '' : xLabel(c, i))),
        step: (m) => { for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]) if (m / s <= 5) return s; return 1000; },
      })}</div>`
    : `<div class="empty">${t('dash.empty.finished')}</div>`;

  // --- precisão por categoria ---
  const accItems = r.categories.filter((c) => c.accuracy.n).map((c) => ({
    label: c.name, value: c.accuracy.ratio - 1,
    tip: `<b>${esc(c.name)}</b><br>${tn('dash.acc.tip', c.accuracy.n, { worked: fmtMs(c.accuracy.workedMs), est: fmtMs(c.accuracy.estMs) })}`,
  }));

  // --- humor antes × depois ---
  const moodItems = r.categories.filter((c) => c.mood.n).map((c) => ({ label: c.name, ...c.mood }));
  const mo = r.moodByOutcome;
  if (moodItems.length) {
    if (mo.done.n) moodItems.push({ label: t('dash.lg.done'), ...mo.done, sep: true });
    if (mo.not_done.n) moodItems.push({ label: t('dash.lg.notDone'), ...mo.not_done, sep: !mo.done.n });
  }
  const moodChart = legend([[css('--mood-before'), t('dash.lg.before'), false, 'ring'], [css('--mood-after'), t('dash.lg.after')]]) +
    `<div class="chart">${chartMood(moodItems, half)}</div>`;

  // --- horas do dia ---
  const hourCols = r.byHour.map((ms, h) => ({
    key: h, segs: [{ value: ms / MIN, color: css('--seq') }],
    tip: `<b>${h}h – ${h + 1}h</b><br>${t('dash.hours.tip', { d: fmtMs(ms, { zero: t('dash.nothing') }) })}`,
  }));
  const hourChart = r.focusMs
    ? `<div class="chart">${chartStackedCols(hourCols, full, {
      height: 180, yFmt: (v) => fmtDur(v, { zero: '0' }), step: niceHourStep, xLabel: (c) => (c.key % 3 === 0 ? `${c.key}h` : ''),
    })}</div>`
    : `<div class="empty">${t('dash.empty.hours')}</div>`;

  return kpis + `<div class="grid">
    ${card(t('dash.c.focus', { g: gw }), `${t('dash.c.focus.hint')} ${t(r.gran === 'day' ? 'dash.c.focus.clickDay' : 'dash.c.focus.clickMore')}`, focusChart + focusTable, true)}
    ${card(t('dash.c.finished', { g: gw }), t('dash.c.finished.hint'), finChart)}
    ${card(t('dash.c.accuracy'), t('dash.c.accuracy.hint'), `<div class="chart">${chartDiverging(accItems, half)}</div>`)}
    ${card(t('dash.c.mood'), t('dash.c.mood.hint'), moodChart)}
    ${card(t('dash.c.lost'), t('dash.c.lost.hintRange'), `<div class="chart">${chartHBars(lostItems(r.lost), half)}</div>`)}
    ${card(t('dash.c.hours'), t('dash.c.hours.hint'), hourChart, true)}
  </div>
  <p class="foot">${t('dash.foot')}</p>`;
}

// ================== render ==================
/** Idioma: o escolhido nas configurações (vem junto com os dados) ou o do Windows. */
let appliedLang = null;
function syncLang(force) {
  const lang = force || data.ui?.lang || I18n.fromSystem(api.systemLocale);
  if (lang === appliedLang) return;
  appliedLang = lang;
  I18n.setLang(lang);
  I18n.apply(document);
  const badge = $('.demo-badge');
  if (badge) { badge.textContent = t('demo.badgeLong'); badge.title = t('dash.demo.title'); }
}

/** Nomes das categorias padrão no idioma atual (as que você renomeou ficam como estão). */
function localizeCategories() {
  for (const c of data.categories || []) {
    const names = I18n.DEFAULT_CAT_NAMES[c.id];
    if (names && names.includes(c.name)) c.name = t(`catdef.${c.id}`);
  }
}

function render() {
  syncLang();
  localizeCategories();
  tips.length = 0;
  const W = Math.min(1400, document.documentElement.clientWidth) - 48;
  $$('#unitSeg button').forEach((b) => b.classList.toggle('active', b.dataset.unit === view.unit));
  $('#stepNav').classList.toggle('hidden', view.unit === 'custom');
  $('#customNav').classList.toggle('hidden', view.unit !== 'custom');
  $('#fromPick').value = view.customFrom;
  $('#toPick').value = view.customTo;
  $('#rangeNext').disabled = view.unit !== 'custom' && bounds(1)[0] > A.dayKey(Date.now());
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view.tab));
  $('#dayControls').classList.toggle('hidden', view.tab !== 'day');
  $('#rangeControls').classList.toggle('hidden', view.tab !== 'range');
  $('#dayPick').value = view.day;

  const hasData = (data.tasks || []).some((x) => (x.sessions || []).length || x.done);
  if (!hasData) {
    $('#view').innerHTML = `<div class="empty" style="padding:80px 0">${t('dash.empty.all')}</div>`;
    return;
  }
  $('#view').innerHTML = view.tab === 'day' ? renderDay(W) : renderRange(W);
  document.title = `${view.tab === 'day' ? fmtDayLong(view.day) : ($('#rangeLabel').textContent || t('dash.title.range'))} — My Owl Planner`;
}

// ---------- controles ----------
$$('.tabs button').forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; store.set('tab', view.tab); render(); }));
$('#dayPrev').addEventListener('click', () => { view.day = A.addDays(view.day, -1); render(); });
$('#dayNext').addEventListener('click', () => { view.day = A.addDays(view.day, 1); render(); });
$('#dayToday').addEventListener('click', () => { view.day = A.dayKey(Date.now()); render(); });
$('#dayPick').addEventListener('change', (e) => { if (e.target.value) { view.day = e.target.value; render(); } });
const today = () => A.dayKey(Date.now());
function setUnit(unit) { view.unit = unit; store.set('unit', unit); render(); }
function setCustom(from, to) {
  if (from > to) [from, to] = [to, from];
  view.customFrom = from; view.customTo = to;
  store.set('customFrom', from); store.set('customTo', to);
  setUnit('custom');
}

$$('#unitSeg button').forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit)));
$('#rangePrev').addEventListener('click', () => { view.anchor = bounds(-1)[0]; render(); });
$('#rangeNext').addEventListener('click', () => { view.anchor = bounds(1)[0]; render(); });
$('#rangeToday').addEventListener('click', () => { view.anchor = today(); render(); });
$('#fromPick').addEventListener('change', (e) => e.target.value && setCustom(e.target.value, view.customTo));
$('#toPick').addEventListener('change', (e) => e.target.value && setCustom(view.customFrom, e.target.value));
$('#preset').addEventListener('change', (e) => {
  const v = e.target.value;
  e.target.value = '';
  if (!v) return;
  const td = today();
  if (v === 'ytd') return setCustom(`${td.slice(0, 4)}-01-01`, td);
  if (v === 'all') {
    const starts = (data.tasks || []).flatMap((x) => (x.sessions || []).map((s) => s.start)).concat((data.tasks || []).map((x) => x.createdAt).filter(Boolean));
    return setCustom(starts.length ? A.dayKey(Math.min(...starts)) : td, td);
  }
  setCustom(A.addDays(td, -(+v - 1)), td);
});

// clicar numa coluna: dia → abre na aba Dia; semana/mês → detalha esse período
$('#view').addEventListener('click', (e) => {
  const col = e.target.closest('.nav-days .col');
  if (!col || view.tab !== 'range') return;
  const idx = $$('.col', col.ownerSVGElement).indexOf(col);
  const [a, b] = bounds(0);
  const bk = A.period(data, a, b).buckets[idx];
  if (!bk) return;
  if (bk.gran === 'day') {
    view.tab = 'day'; view.day = bk.key; store.set('tab', 'day');
  } else if (bk.gran === 'week') {
    view.anchor = bk.key; view.unit = 'week';
  } else {
    view.anchor = bk.startKey; view.unit = 'month';
  }
  render();
  window.scrollTo(0, 0);
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });
api.onData?.((d) => { data = d; render(); });
api.onLang?.((lang) => { data.ui = { ...(data.ui || {}), lang }; render(); });
setInterval(render, 30000); // mantém a tarefa em andamento atualizada

if (api.isDemo) {
  const b = document.createElement('span');
  b.className = 'demo-badge';
  $('.brand').append(b);
}
render();
