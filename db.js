// =====================================================================
//  My Owl Planner Lite — armazenamento em SQLite (node:sqlite, embutido no Electron)
//
//  O resto do app continua trabalhando com o mesmo objeto de sempre
//  ({ version, ui, categories, tasks }). Esta camada converte esse objeto
//  em tabelas e de volta, gravando só as tarefas que mudaram.
// =====================================================================
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 2; // 2: humor antes/depois

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT                      -- JSON
);

CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  color    TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id                TEXT PRIMARY KEY,
  position          INTEGER NOT NULL,   -- ordem na lista do widget
  title             TEXT NOT NULL,
  category_id       TEXT,               -- sem FK: excluir categoria não apaga histórico
  estimate_min      INTEGER NOT NULL,
  planned_date      TEXT,               -- 'AAAA-MM-DD' (tarefa "para o dia")
  scheduled_at      INTEGER,            -- ms
  created_at        INTEGER,
  done              INTEGER NOT NULL DEFAULT 0,
  archived          INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT,               -- 'done' | 'not_done'
  finished_at       INTEGER,
  note              TEXT,
  notified_overdue  INTEGER NOT NULL DEFAULT 0,
  notified_schedule INTEGER NOT NULL DEFAULT 0,
  mood_before       INTEGER,            -- humor ao começar: 1 (esgotado) … 5 (ótimo)
  mood_after        INTEGER             -- humor ao finalizar
);

CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,         -- ordem da sessão dentro da tarefa
  start_at    INTEGER NOT NULL,
  end_at      INTEGER,                  -- NULL = rodando
  pause_type  TEXT,                     -- motivo da pausa que encerrou esta sessão
  pause_desc  TEXT,
  pause_auto  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reschedules (
  id       INTEGER PRIMARY KEY,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  to_time  INTEGER,
  to_day   TEXT
);

CREATE TABLE IF NOT EXISTS reasons (
  id          INTEGER PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,            -- motivos confirmados na finalização
  minutes     INTEGER,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_task  ON sessions(task_id, seq);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_at);
CREATE INDEX IF NOT EXISTS idx_tasks_finished ON tasks(finished_at);
CREATE INDEX IF NOT EXISTS idx_resched_task   ON reschedules(task_id, seq);
CREATE INDEX IF NOT EXISTS idx_reasons_task   ON reasons(task_id, seq);

`;

const b = (v) => (v ? 1 : 0);
const nn = (v) => (v === undefined ? null : v);

class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.migrate();
    this.cache = null; // id -> JSON da última versão gravada (p/ gravar só o que mudou)
    this.prep();
  }

  /** Atualiza bancos criados por versões anteriores. */
  migrate() {
    const cols = new Set(this.db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name));
    for (const [col, type] of [['mood_before', 'INTEGER'], ['mood_after', 'INTEGER']]) {
      if (!cols.has(col)) this.db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${type}`);
    }
    this.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('schema_version', String(SCHEMA_VERSION));
  }

  prep() {
    const p = (sql) => this.db.prepare(sql);
    this.q = {
      upsertTask: p(`INSERT INTO tasks (id, position, title, category_id, estimate_min, planned_date, scheduled_at, created_at,
          done, archived, outcome, finished_at, note, notified_overdue, notified_schedule, mood_before, mood_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET position=excluded.position, title=excluded.title, category_id=excluded.category_id,
          estimate_min=excluded.estimate_min, planned_date=excluded.planned_date, scheduled_at=excluded.scheduled_at,
          created_at=excluded.created_at, done=excluded.done, archived=excluded.archived, outcome=excluded.outcome,
          finished_at=excluded.finished_at, note=excluded.note, notified_overdue=excluded.notified_overdue,
          notified_schedule=excluded.notified_schedule, mood_before=excluded.mood_before, mood_after=excluded.mood_after`),
      setPos: p('UPDATE tasks SET position = ? WHERE id = ?'),
      delTask: p('DELETE FROM tasks WHERE id = ?'),
      delSessions: p('DELETE FROM sessions WHERE task_id = ?'),
      delResched: p('DELETE FROM reschedules WHERE task_id = ?'),
      delReasons: p('DELETE FROM reasons WHERE task_id = ?'),
      insSession: p('INSERT INTO sessions (task_id, seq, start_at, end_at, pause_type, pause_desc, pause_auto) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      insResched: p('INSERT INTO reschedules (task_id, seq, at, to_time, to_day) VALUES (?, ?, ?, ?, ?)'),
      insReason: p('INSERT INTO reasons (task_id, seq, type, minutes, description) VALUES (?, ?, ?, ?, ?)'),
      setSetting: p('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      delCats: p('DELETE FROM categories'),
      insCat: p('INSERT INTO categories (id, name, color, position) VALUES (?, ?, ?, ?)'),
      getSetting: p('SELECT value FROM settings WHERE key = ?'),
    };
  }

  tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  isEmpty() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n === 0
      && this.db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0;
  }

  // ---------- leitura: tabelas → objeto do app ----------
  load() {
    const settings = Object.fromEntries(this.db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, JSON.parse(r.value)]));
    const categories = this.db.prepare('SELECT id, name, color FROM categories ORDER BY position').all().map((r) => ({ ...r }));

    const group = (rows) => {
      const m = new Map();
      for (const r of rows) { if (!m.has(r.task_id)) m.set(r.task_id, []); m.get(r.task_id).push(r); }
      return m;
    };
    const sessions = group(this.db.prepare('SELECT * FROM sessions ORDER BY task_id, seq').all());
    const resched = group(this.db.prepare('SELECT * FROM reschedules ORDER BY task_id, seq').all());
    const reasons = group(this.db.prepare('SELECT * FROM reasons ORDER BY task_id, seq').all());

    const tasks = this.db.prepare('SELECT * FROM tasks ORDER BY position').all().map((r) => {
      const t = {
        id: r.id, title: r.title, categoryId: r.category_id, estimate: r.estimate_min,
        scheduledAt: r.scheduled_at, plannedDate: r.planned_date, createdAt: r.created_at,
        moodBefore: r.mood_before ?? null,
        sessions: (sessions.get(r.id) || []).map((s) => {
          const o = { start: s.start_at, end: s.end_at };
          if (s.pause_type) o.pauseReason = { type: s.pause_type, description: s.pause_desc, ...(s.pause_auto ? { auto: true } : {}) };
          return o;
        }),
        reschedules: (resched.get(r.id) || []).map((x) => ({ at: x.at, toTime: x.to_time, toDay: x.to_day })),
        done: !!r.done, archived: !!r.archived,
        result: r.outcome ? {
          outcome: r.outcome, finishedAt: r.finished_at,
          reasons: (reasons.get(r.id) || []).map((x) => ({ type: x.type, minutes: x.minutes, description: x.description })),
          note: r.note || '',
          moodAfter: r.mood_after ?? null,
        } : null,
        notifiedOverdue: !!r.notified_overdue, notifiedSchedule: !!r.notified_schedule,
      };
      return t;
    });

    const data = { version: 2, ui: settings.ui || {}, categories, tasks };
    if (settings.demo) data.demo = true;
    this.cache = new Map(tasks.map((t) => [t.id, JSON.stringify(t)]));
    this.posCache = new Map(tasks.map((t, i) => [t.id, i]));
    this.catCache = JSON.stringify(categories);
    this.uiCache = JSON.stringify(data.ui);
    return data;
  }

  // ---------- gravação: objeto do app → tabelas (só o que mudou) ----------
  save(data) {
    if (!this.cache) this.load();
    const q = this.q;
    let changed = 0;

    this.tx(() => {
      const ui = JSON.stringify(data.ui || {});
      if (ui !== this.uiCache) { q.setSetting.run('ui', ui); this.uiCache = ui; }
      if (data.demo) q.setSetting.run('demo', 'true');

      const cats = JSON.stringify((data.categories || []).map((c) => ({ id: c.id, name: c.name, color: c.color })));
      if (cats !== this.catCache) {
        q.delCats.run();
        (data.categories || []).forEach((c, i) => q.insCat.run(c.id, c.name, c.color, i));
        this.catCache = cats;
      }

      const seen = new Set();
      (data.tasks || []).forEach((t, pos) => {
        seen.add(t.id);
        const json = JSON.stringify(t);
        if (this.cache.get(t.id) === json) {
          if (this.posCache.get(t.id) !== pos) { q.setPos.run(pos, t.id); this.posCache.set(t.id, pos); }
          return;
        }
        changed++;
        const r = t.result;
        q.upsertTask.run(
          t.id, pos, t.title, nn(t.categoryId), t.estimate, nn(t.plannedDate), nn(t.scheduledAt), nn(t.createdAt),
          b(t.done), b(t.archived), r ? r.outcome : null, r ? nn(r.finishedAt) : null, r ? (r.note || null) : null,
          b(t.notifiedOverdue), b(t.notifiedSchedule), nn(t.moodBefore), r ? nn(r.moodAfter) : null,
        );
        q.delSessions.run(t.id);
        (t.sessions || []).forEach((s, i) => q.insSession.run(
          t.id, i, s.start, nn(s.end), s.pauseReason ? s.pauseReason.type : null,
          s.pauseReason ? nn(s.pauseReason.description) : null, b(s.pauseReason && s.pauseReason.auto),
        ));
        q.delResched.run(t.id);
        (t.reschedules || []).forEach((x, i) => q.insResched.run(t.id, i, x.at, nn(x.toTime), nn(x.toDay)));
        q.delReasons.run(t.id);
        ((r && r.reasons) || []).forEach((x, i) => q.insReason.run(t.id, i, x.type, nn(x.minutes), nn(x.description)));
        this.cache.set(t.id, json);
        this.posCache.set(t.id, pos);
      });

      for (const id of [...this.cache.keys()]) {
        if (!seen.has(id)) { q.delTask.run(id); this.cache.delete(id); this.posCache.delete(id); changed++; }
      }
    });
    return changed;
  }

  // ---------- configurações avulsas ----------
  getSetting(key) { const r = this.q.getSetting.get(key); return r ? JSON.parse(r.value) : undefined; }
  setSetting(key, value) { this.q.setSetting.run(key, JSON.stringify(value)); }

  /** Cópia consistente do banco (para backup). */
  backup(file) {
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }

  close() { this.db.close(); }
}

module.exports = { Store, SCHEMA_VERSION };
