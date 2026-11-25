// =====================================================================
//  My Owl Planner Lite — analytics
//  Cálculos puros sobre os dados do widget (sem DOM). Usado pelo dashboard
//  e pelos testes. Se um dia o armazenamento virar SQLite, só esta camada muda.
// =====================================================================
(function (root) {
  const MIN = 60000;

  // ---------- datas (sempre no fuso local) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const keyToMs = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
  const dayRange = (key) => [keyToMs(key), keyToMs(addDays(key, 1))];
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  const PAUSE_TYPES = ['other_tasks', 'procrastination', 'unexpected', 'other'];
  const LABELS = {
    break: 'Intervalo', other_tasks: 'Outras tarefas', procrastination: 'Procrastinação',
    unexpected: 'Imprevisto', other: 'Outro',
  };

  // ---------- por tarefa ----------
  const sessionsOf = (t, now) => (t.sessions || []).map((s) => ({ start: s.start, end: s.end ?? now, open: s.end == null }));
  const workedMs = (t, now) => sessionsOf(t, now).reduce((sum, s) => sum + (s.end - s.start), 0);

  /** Pausas já encerradas (houve retomada depois). Pausa em aberto não conta como tempo perdido. */
  function pausesOf(t) {
    const out = [];
    const ss = t.sessions || [];
    ss.forEach((s, i) => {
      const next = ss[i + 1];
      if (s.end == null || !next) return;
      const r = s.pauseReason || { type: 'other', description: null };
      out.push({ type: r.type, description: r.description, auto: !!r.auto, start: s.end, end: next.start });
    });
    return out;
  }

  function status(t, now) {
    if (t.done) return t.result?.outcome === 'done' ? 'done' : 'not_done';
    const ss = t.sessions || [];
    if (!ss.length) return 'not_started';
    return ss.at(-1).end == null ? 'running' : 'paused';
  }

  /**
   * Motivos de tempo perdido de uma tarefa.
   * Finalizada: usa o que você confirmou na finalização (pode ter sido ajustado à mão).
   * Em aberto: usa as pausas encerradas (exceto intervalos).
   * Cada item: { type, minutes, at } — `at` define em que dia o tempo é contado.
   */
  function lostItems(t) {
    if (t.done && t.result) {
      return (t.result.reasons || []).map((r) => ({ type: r.type, minutes: r.minutes || 0, at: t.result.finishedAt }));
    }
    return pausesOf(t)
      .filter((p) => p.type !== 'break')
      .map((p) => ({ type: p.type, minutes: (p.end - p.start) / MIN, at: p.start }));
  }

  // ---------- agregações ----------
  function catMap(data) {
    const m = new Map((data.categories || []).map((c) => [c.id, c]));
    return (id) => m.get(id) || { id: '_none', name: 'Sem categoria', color: '#8a8d99' };
  }

  function focusBetween(tasks, from, to, now) {
    let ms = 0;
    for (const t of tasks) for (const s of sessionsOf(t, now)) ms += overlap(s.start, s.end, from, to);
    return ms;
  }

  function lostBetween(tasks, from, to) {
    const by = Object.fromEntries(PAUSE_TYPES.map((k) => [k, { minutes: 0, count: 0 }]));
    for (const t of tasks) {
      for (const it of lostItems(t)) {
        if (it.at < from || it.at >= to) continue;
        const b = (by[it.type] ??= { minutes: 0, count: 0 });
        b.minutes += it.minutes;
        b.count += 1;
      }
    }
    const total = Object.values(by).reduce((s, b) => s + b.minutes, 0);
    return { by, total };
  }

  const finishedBetween = (tasks, from, to) =>
    tasks.filter((t) => t.done && t.result && t.result.finishedAt >= from && t.result.finishedAt < to);

  /** Precisão: tempo trabalhado ÷ estimado das tarefas finalizadas que tiveram sessões. */
  function accuracy(finished, now) {
    const withWork = finished.filter((t) => (t.sessions || []).length);
    const est = withWork.reduce((s, t) => s + t.estimate * MIN, 0);
    const worked = withWork.reduce((s, t) => s + workedMs(t, now), 0);
    return { n: withWork.length, estMs: est, workedMs: worked, ratio: est ? worked / est : null };
  }

  /** Humor (1–5) antes e depois, só nas tarefas finalizadas com os dois registros. */
  function moodStats(finished) {
    const pairs = finished.filter((t) => t.moodBefore != null && t.result?.moodAfter != null);
    if (!pairs.length) return { n: 0, before: null, after: null, delta: null };
    const before = pairs.reduce((s, t) => s + t.moodBefore, 0) / pairs.length;
    const after = pairs.reduce((s, t) => s + t.result.moodAfter, 0) / pairs.length;
    return { n: pairs.length, before, after, delta: after - before };
  }

  // ================== Visão: Dia ==================
  function day(data, key, now = Date.now()) {
    const [from, to] = dayRange(key);
    const tasks = data.tasks || [];
    const cat = catMap(data);

    const workedToday = (t) => sessionsOf(t, now).reduce((s, x) => s + overlap(x.start, x.end, from, to), 0);
    const planned = (t) => t.plannedDate === key || (t.scheduledAt && dayKey(t.scheduledAt) === key);
    const finishedToday = (t) => t.done && t.result && dayKey(t.result.finishedAt) === key;

    const relevant = tasks.filter((t) => planned(t) || workedToday(t) > 0 || finishedToday(t));
    const finished = relevant.filter(finishedToday);
    const doneN = finished.filter((t) => t.result.outcome === 'done').length;

    const rows = relevant.map((t) => {
      const pauses = pausesOf(t).filter((p) => p.start >= from && p.start < to);
      return {
        id: t.id, title: t.title, category: cat(t.categoryId),
        estimateMin: t.estimate,
        workedTodayMin: workedToday(t) / MIN,
        workedTotalMin: workedMs(t, now) / MIN,
        status: status(t, now),
        planned: planned(t),
        pauses: pauses.length,
        moodBefore: t.moodBefore ?? null,
        moodAfter: t.result?.moodAfter ?? null,
      };
    });

    // linha do tempo: sessões e pausas recortadas no dia
    const timeline = relevant
      .map((t) => ({
        id: t.id, title: t.title, category: cat(t.categoryId), status: status(t, now),
        sessions: sessionsOf(t, now)
          .filter((s) => overlap(s.start, s.end, from, to) > 0)
          .map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end, to), open: s.open })),
        pauses: pausesOf(t)
          .filter((p) => overlap(p.start, p.end, from, to) > 0)
          .map((p) => ({ ...p, start: Math.max(p.start, from), end: Math.min(p.end, to) })),
      }))
      .filter((r) => r.sessions.length)
      .sort((a, b) => a.sessions[0].start - b.sessions[0].start);

    return {
      key, from, to,
      focusMs: focusBetween(tasks, from, to, now),
      plannedN: relevant.filter(planned).length,
      relevantN: relevant.length,
      finishedN: finished.length,
      doneN,
      notDoneN: finished.length - doneN,
      accuracy: accuracy(finished, now),
      mood: moodStats(finished),
      lost: lostBetween(tasks, from, to),
      pausesN: rows.reduce((s, r) => s + r.pauses, 0),
      rows,
      timeline,
    };
  }

  // ================== Visão: Período (do dia X ao dia Y) ==================
  const daysBetween = (a, b) => Math.round((keyToMs(b) - keyToMs(a)) / 864e5) + 1;
  const weekStart = (key) => addDays(key, -((new Date(keyToMs(key)).getDay() + 6) % 7)); // segunda-feira

  /** Agrupamento automático: por dia (até ~2 meses), por semana (até ~6 meses) ou por mês. */
  function granularity(days) {
    return days <= 62 ? 'day' : days <= 186 ? 'week' : 'month';
  }

  function bucketize(perDay, gran) {
    const keyOf = (k) => (gran === 'day' ? k : gran === 'week' ? weekStart(k) : k.slice(0, 7));
    const out = [];
    for (const d of perDay) {
      const k = keyOf(d.key);
      let b = out.at(-1);
      if (!b || b.key !== k) {
        b = { key: k, gran, startKey: d.key, endKey: d.key, focusMs: 0, byCat: {}, done: 0, notDone: 0, lostMin: 0, days: 0, future: true };
        out.push(b);
      }
      b.endKey = d.key;
      b.focusMs += d.focusMs;
      for (const [c, ms] of Object.entries(d.byCat)) b.byCat[c] = (b.byCat[c] || 0) + ms;
      b.done += d.done;
      b.notDone += d.notDone;
      b.lostMin += d.lostMin;
      b.days += 1;
      if (!d.future) b.future = false;
    }
    return out;
  }

  function range(data, endKey, days, now = Date.now()) {
    return period(data, addDays(endKey, -(days - 1)), endKey, now);
  }

  function period(data, startKey, endKey, now = Date.now()) {
    if (startKey > endKey) [startKey, endKey] = [endKey, startKey];
    const days = daysBetween(startKey, endKey);
    const tasks = data.tasks || [];
    const cat = catMap(data);
    const from = keyToMs(startKey);
    const to = keyToMs(addDays(endKey, 1));

    // por dia — uma única passada pelas sessões, finalizações e motivos (rápido mesmo com anos de dados)
    const perDay = [];
    const bounds = [];
    for (let i = 0; i <= days; i++) bounds.push(keyToMs(addDays(startKey, i)));
    for (let i = 0; i < days; i++) {
      perDay.push({ key: addDays(startKey, i), focusMs: 0, byCat: {}, done: 0, notDone: 0, lostMin: 0, future: bounds[i] > now });
    }
    /** índice do dia que contém `ms` (busca binária nos limites; -1 se fora do período) */
    const dayIdx = (ms) => {
      if (ms < from || ms >= to) return -1;
      let lo = 0, hi = days - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bounds[mid] <= ms) lo = mid; else hi = mid - 1; }
      return lo;
    };

    for (const t of tasks) {
      const cid = cat(t.categoryId).id;
      for (const x of sessionsOf(t, now)) {
        let a = Math.max(x.start, from);
        const b = Math.min(x.end, to);
        let i = dayIdx(a);
        while (a < b && i >= 0 && i < days) {
          const ms = Math.min(b, bounds[i + 1]) - a;
          const d = perDay[i];
          d.focusMs += ms;
          d.byCat[cid] = (d.byCat[cid] || 0) + ms;
          a = bounds[i + 1];
          i += 1;
        }
      }
      if (t.done && t.result) {
        const i = dayIdx(t.result.finishedAt);
        if (i >= 0) perDay[i][t.result.outcome === 'done' ? 'done' : 'notDone'] += 1;
      }
      for (const it of lostItems(t)) {
        const i = dayIdx(it.at);
        if (i >= 0) perDay[i].lostMin += it.minutes;
      }
    }

    // categorias (foco total + precisão)
    const finished = finishedBetween(tasks, from, to);
    const catIds = new Set();
    perDay.forEach((d) => Object.keys(d.byCat).forEach((id) => catIds.add(id)));
    finished.forEach((t) => catIds.add(cat(t.categoryId).id));
    const categories = [...catIds].map((id) => {
      const c = (data.categories || []).find((x) => x.id === id) || cat(id);
      const fin = finished.filter((t) => cat(t.categoryId).id === id);
      const done = fin.filter((t) => t.result.outcome === 'done').length;
      return {
        id, name: c.name, color: c.color,
        focusMs: perDay.reduce((s, d) => s + (d.byCat[id] || 0), 0),
        finished: fin.length, done,
        accuracy: accuracy(fin, now),
        mood: moodStats(fin),
      };
    }).sort((a, b) => b.focusMs - a.focusMs);

    // foco por hora do dia (total no período)
    const byHour = new Array(24).fill(0);
    for (const t of tasks) {
      for (const s of sessionsOf(t, now)) {
        let a = Math.max(s.start, from);
        const b = Math.min(s.end, to);
        while (a < b) {
          const h = new Date(a);
          const next = new Date(h.getFullYear(), h.getMonth(), h.getDate(), h.getHours() + 1).getTime();
          byHour[h.getHours()] += Math.min(next, b) - a;
          a = next;
        }
      }
    }

    // atraso para começar (agendada → primeiro play), ignorando tarefas reagendadas
    const delays = tasks
      .filter((t) => t.scheduledAt && (t.sessions || []).length && !(t.reschedules || []).length)
      .map((t) => ({ t, first: t.sessions[0].start }))
      .filter(({ first }) => first >= from && first < to)
      .map(({ t, first }) => (first - t.scheduledAt) / MIN);

    const reschedules = tasks.reduce((s, t) => s + (t.reschedules || []).filter((r) => r.at >= from && r.at < to).length, 0);

    const pauses = {};
    for (const t of tasks) {
      for (const p of pausesOf(t)) {
        if (p.start < from || p.start >= to) continue;
        const b = (pauses[p.type] ??= { minutes: 0, count: 0 });
        b.minutes += (p.end - p.start) / MIN;
        b.count += 1;
      }
    }

    // média só nos dias desde que você começou a usar o widget (não dilui o ano inteiro)
    const firstUse = Math.min(...tasks.flatMap((t) => (t.sessions || []).map((x) => x.start)), Infinity);
    const firstKey = Number.isFinite(firstUse) ? dayKey(firstUse) : endKey;
    const elapsedDays = perDay.filter((d) => !d.future && d.key >= firstKey).length || 1;
    const focusMs = perDay.reduce((s, d) => s + d.focusMs, 0);
    const done = finished.filter((t) => t.result.outcome === 'done').length;

    const gran = granularity(days);

    return {
      startKey, endKey, days, from, to,
      gran, buckets: bucketize(perDay, gran),
      perDay, categories, byHour, pauses, reschedules,
      focusMs,
      focusAvgMs: focusMs / elapsedDays,
      elapsedDays,
      sinceFirstUse: firstKey > startKey ? firstKey : null,
      activeDays: perDay.filter((d) => d.focusMs > 0).length,
      finishedN: finished.length,
      doneN: done,
      completion: finished.length ? done / finished.length : null,
      accuracy: accuracy(finished, now),
      mood: moodStats(finished),
      moodByOutcome: {
        done: moodStats(finished.filter((t) => t.result.outcome === 'done')),
        not_done: moodStats(finished.filter((t) => t.result.outcome !== 'done')),
      },
      lost: lostBetween(tasks, from, to),
      startDelay: delays.length ? { n: delays.length, avgMin: delays.reduce((s, x) => s + x, 0) / delays.length } : null,
    };
  }

  const MOOD_EMOJI = { 1: '😫', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
  const api = { MOOD_EMOJI, moodStats, day, range, period, granularity, weekStart, daysBetween, dayKey, addDays, keyToMs, LABELS, PAUSE_TYPES, workedMs, pausesOf, status };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analytics = api;
})(typeof window !== 'undefined' ? window : globalThis);
