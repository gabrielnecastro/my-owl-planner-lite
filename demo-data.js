// =====================================================================
//  My Owl Planner Lite — dados simulados para o modo demonstração (npm run demo)
//  Gera ~2 anos de uso realista, relativo à data de hoje:
//  sessões com pausas e motivos, reagendamentos, tarefas concluídas e não
//  concluídas, e um "hoje" com tarefa rodando, pausada, para o dia e agendada.
// =====================================================================
const MIN = 60000;

function generate(now = Date.now(), days = 760) {
  let seed = 20261114;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const categories = [
    { id: 'trabalho', name: 'Trabalho', color: '#8fb3e0' },
    { id: 'freela', name: 'Freela', color: '#b5a3dc' },
    { id: 'estudo', name: 'Estudo', color: '#9cc59a' },
    { id: 'pessoal', name: 'Pessoal', color: '#e6a77f' },
  ];
  const titles = {
    trabalho: ['Revisar PR dos testes E2E', 'Daily', 'Corrigir teste flaky', 'Automação do checkout', 'Planejamento da sprint', 'Pipeline de CI', 'Testes de API'],
    freela: ['Landing page: layout', 'Landing page: catálogo', 'Ajustes no site do cliente', 'Reunião com cliente'],
    estudo: ['Estudar Playwright fixtures', 'Curso de JavaScript', 'Ler sobre CI/CD', 'Praticar TypeScript'],
    pessoal: ['Academia', 'Pagar contas', 'Mercado', 'Organizar a casa'],
  };
  const pauseTypes = ['break', 'break', 'other_tasks', 'procrastination', 'unexpected', 'other'];
  const details = { unexpected: ['Ligação', 'Queda de internet', 'Reunião urgente'], other: ['Almoço demorado', 'Médico', null] };
  // vieses: freela costuma estourar, estudo costuma sobrar
  const bias = { trabalho: 1.12, freela: 1.38, estudo: 0.9, pessoal: 1.0 };

  const tasks = [];
  let n = 0;
  const id = () => `demo${(n++).toString(36)}`;

  function makeTask(cat, est, startAt, opts = {}) {
    const sessions = [];
    let t = startAt;
    let remaining = est * bias[cat] * (0.65 + rnd() * 0.7) * MIN;
    let pieces = 1 + Math.floor(rnd() * 3);
    while (remaining > 0 && pieces-- > 0) {
      const len = pieces ? remaining * (0.3 + rnd() * 0.4) : remaining;
      const s = { start: Math.round(t), end: Math.round(t + len) };
      t += len;
      remaining -= len;
      if (pieces > 0) {
        const type = pick(pauseTypes);
        s.pauseReason = { type, description: details[type] ? pick(details[type]) : null };
        t += (type === 'break' ? 10 : 5) * MIN + rnd() * 35 * MIN;
      }
      sessions.push(s);
    }
    return { sessions, end: t };
  }

  // humor 1–5: antes ao acaso (mais baixo de manhã cedo e no fim do dia); depois sobe quando conclui,
  // cai com procrastinação ou quando não conclui. Estudo tende a melhorar o humor, Freela a piorar um pouco.
  const clamp = (v) => Math.max(1, Math.min(5, Math.round(v)));
  const moodBias = { trabalho: 0, freela: -0.4, estudo: 0.6, pessoal: 0.3 };
  function moods(cat, ok, reasons, startAt) {
    if (rnd() < 0.15) return { before: null, after: null }; // às vezes a pessoa pula
    const h = new Date(startAt).getHours();
    const before = clamp(3 + (rnd() * 2.4 - 1.2) - (h < 9 || h >= 18 ? 0.6 : 0));
    const procr = reasons.some((r) => r.type === 'procrastination') ? -0.8 : 0;
    const after = clamp(before + (ok ? 0.8 : -0.9) + moodBias[cat] + procr + (rnd() * 1.2 - 0.6));
    return { before, after };
  }

  function reasonsFromSessions(sessions) {
    const acc = {};
    sessions.forEach((s, i) => {
      const next = sessions[i + 1];
      const r = s.pauseReason;
      if (!r || !next || r.type === 'break') return;
      const a = (acc[r.type] ??= { type: r.type, minutes: 0, description: r.description || null });
      a.minutes += Math.round((next.start - s.end) / MIN);
    });
    return Object.values(acc);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // ---------- dias passados ----------
  for (let back = days; back >= 1; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const dow = day.getDay();
    const weekend = dow === 0 || dow === 6;
    if (weekend && rnd() < 0.45) continue;      // alguns fins de semana sem nada
    if (!weekend && rnd() < 0.04) continue;     // folga / feriado
    // tendência: produtividade melhora devagar ao longo do ano
    const trend = 0.85 + 0.3 * (1 - back / days);
    let t = day.getTime() + (8 + rnd() * 1.5) * 3600e3;
    const count = weekend ? 1 + Math.floor(rnd() * 2) : Math.round((3 + rnd() * 3) * trend);

    for (let i = 0; i < count; i++) {
      const cat = weekend ? pick(['pessoal', 'pessoal', 'estudo']) : pick(['trabalho', 'trabalho', 'trabalho', 'freela', 'estudo']);
      const est = pick([15, 30, 30, 45, 60, 60, 90, 120]);
      const scheduled = rnd() < 0.35 ? Math.round(t - rnd() * 45 * MIN) : null;
      const { sessions, end } = makeTask(cat, est, t);
      const ok = rnd() < 0.72 + 0.12 * trend - 0.1;
      const reasons = reasonsFromSessions(sessions);
      if (!ok && !reasons.length) reasons.push({ type: pick(['procrastination', 'other_tasks', 'unexpected']), minutes: 10 + Math.floor(rnd() * 35), description: null });
      const m = moods(cat, ok, reasons, sessions[0].start);
      tasks.push({
        id: id(), title: pick(titles[cat]), categoryId: cat, estimate: est,
        scheduledAt: scheduled, plannedDate: dayKey(day.getTime()),
        createdAt: day.getTime() - rnd() * 864e5,
        sessions, reschedules: [],
        done: true, archived: back > 2,
        moodBefore: m.before,
        result: { outcome: ok ? 'done' : 'not_done', finishedAt: sessions.at(-1).end, reasons, note: '', moodAfter: m.after },
        notifiedOverdue: true, notifiedSchedule: true,
      });
      t = end + (10 + rnd() * 70) * MIN;
      if (rnd() < 0.15) t += 60 * MIN; // almoço
    }
  }

  // ---------- hoje ----------
  const todayKey = dayKey(now);
  let t = Math.min(today.getTime() + 8.5 * 3600e3, now - 4 * 3600e3);
  // tarefas já finalizadas hoje (até ~1h antes de agora)
  while (t < now - 90 * MIN && tasks.filter((x) => x.plannedDate === todayKey).length < 3) {
    const cat = pick(['trabalho', 'freela', 'estudo']);
    const est = pick([30, 45, 60]);
    const { sessions, end } = makeTask(cat, est, t);
    if (end > now - 50 * MIN) break;
    tasks.push({
      id: id(), title: pick(titles[cat]), categoryId: cat, estimate: est, scheduledAt: null, plannedDate: todayKey,
      createdAt: t - 30 * MIN, sessions, reschedules: [], done: true, archived: false,
      moodBefore: 3,
      result: { outcome: 'done', finishedAt: sessions.at(-1).end, reasons: reasonsFromSessions(sessions), note: '', moodAfter: 4 },
      notifiedOverdue: true, notifiedSchedule: true,
    });
    t = end + 15 * MIN;
  }

  // pausada por imprevisto, reagendada para amanhã 9h
  const tomorrow9 = new Date(today); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
  tasks.push({
    id: id(), title: 'Landing page: catálogo', categoryId: 'freela', estimate: 90, scheduledAt: tomorrow9.getTime(), moodBefore: 3,
    plannedDate: dayKey(tomorrow9.getTime()), createdAt: now - 6 * 3600e3,
    sessions: [{ start: now - 150 * MIN, end: now - 110 * MIN, pauseReason: { type: 'unexpected', description: 'Ligação do cliente' } }],
    reschedules: [{ at: now - 110 * MIN, toTime: tomorrow9.getTime(), toDay: null }],
    done: false, archived: false, result: null, notifiedOverdue: false, notifiedSchedule: false,
  });

  // rodando agora (≈75% do tempo → barra amarelando)
  tasks.unshift({
    id: id(), title: 'Estudar Playwright fixtures', categoryId: 'estudo', estimate: 60, scheduledAt: null, moodBefore: 4,
    plannedDate: todayKey, createdAt: now - 3 * 3600e3,
    sessions: [{ start: now - 45 * MIN, end: null }],
    reschedules: [], done: false, archived: false, result: null, notifiedOverdue: false, notifiedSchedule: true,
  });

  // para o dia, sem horário
  tasks.push({
    id: id(), title: 'Estudar 2h', categoryId: 'estudo', estimate: 120, scheduledAt: null, plannedDate: todayKey,
    createdAt: now - 8 * 3600e3, sessions: [], reschedules: [], done: false, archived: false, result: null,
    notifiedOverdue: false, notifiedSchedule: false,
  });

  // agendada para daqui a 2h
  const later = Math.ceil((now + 2 * 3600e3) / (30 * MIN)) * 30 * MIN;
  tasks.push({
    id: id(), title: 'Academia', categoryId: 'pessoal', estimate: 60, scheduledAt: later, plannedDate: dayKey(later),
    createdAt: now - 5 * 3600e3, sessions: [], reschedules: [], done: false, archived: false, result: null,
    notifiedOverdue: false, notifiedSchedule: false,
  });

  return {
    version: 2,
    demo: true,
    ui: { mode: 'pinned', side: 'left', hoverOpen: false, barPos: 'bottom', lineSize: 'medium', askMood: true },
    categories,
    tasks,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { generate };
else if (typeof window !== 'undefined') window.DemoData = { generate };
