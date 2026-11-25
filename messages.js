// =====================================================================
//  My Owl Planner — mensagens dos avisos ("Keep it up!")
//  Cada momento tem mensagens motivadoras (m) e bem-humoradas (f); as da
//  coruja entram junto com as bem-humoradas. Variáveis: {tarefa}/{task},
//  {tempo}/{time} (quanto falta ou quanto passou).
//  Tom: 'all' (todas) | 'motivating' | 'fun' | 'off'.
// =====================================================================
(function (root) {
  const M = {
    pt: {
      'run.start': {
        m: ['Bom começo. O mais difícil era começar.', 'Foco ligado. Uma coisa de cada vez.', 'Começou, agora é só manter.', 'Um passo de cada vez, sem pressa.'],
        f: ['Modo foco: ativado. Notificações do mundo: ignoradas.', 'Começar já é metade do caminho. A outra metade é não abrir o YouTube.'],
      },
      'run.mid': {
        m: ['Metade do caminho. Segue firme.', 'Tá indo bem, continua assim.', 'Respira e segue.', 'Keep it up! 💪', 'Constância vence pressa.'],
        f: ['Você está mandando bem. Até a coruja ficou impressionada.', 'Se distrair agora seria um desperdício de todo esse foco bonito.'],
      },
      'run.end': {
        m: ['Reta final! Faltam {tempo}.', 'Quase lá, fecha com chave de ouro.', 'Último gás, falta pouco.', 'Faltam {tempo}. Você consegue.'],
        f: ['A linha de chegada já está na tela. Literalmente.', 'Faltam {tempo}. A coruja já está preparando a comemoração.'],
      },
      over: {
        m: ['Passou do estimado, tudo bem. Termina agora ou reagenda?', 'Estimativa é palpite, não promessa.', 'Hora de decidir: mais 15 minutos ou uma pausa?', 'Tá demorando mais que o previsto. Vale anotar o porquê depois.'],
        f: ['O relógio ganhou essa rodada. A próxima é sua.', 'Tarefa teimosa, hein? Decide: insiste ou reagenda.'],
      },
      due: {
        m: ['Bora? {tarefa} começa agora.', 'O você do passado marcou isso pra agora. Confia nele.', 'Só 5 minutos. Depois você decide se continua.'],
        f: ['{tarefa} está esperando. E ela é paciente, mas nem tanto.', 'Agenda falou, coruja repassa: é hora.'],
      },
      done: {
        m: ['Feito! Mais uma riscada da lista. ✓', 'Mandou bem. Aproveita o embalo ou faz uma pausa merecida.', 'Concluída. Isso é progresso de verdade.'],
        f: ['Tarefa abatida. A coruja aprova.', 'Risca da lista e sente o gostinho.'],
      },
      owl: ['A coruja está de olho no relógio.', 'Olhos abertos, foco ligado.', 'Sábio é quem termina o que começa.', 'Coruja não pisca, e você também não vai desistir agora.'],
    },
    en: {
      'run.start': {
        m: ['Good start. Getting going was the hardest part.', 'Focus on. One thing at a time.', 'You started, now just keep going.', 'One step at a time, no rush.'],
        f: ['Focus mode: on. The rest of the world: muted.', 'Starting is half the job. The other half is not opening YouTube.'],
      },
      'run.mid': {
        m: ['Halfway there. Keep going.', 'You are doing great, keep it up.', 'Breathe and keep going.', 'Keep it up! 💪', 'Steady beats speedy.'],
        f: ['You are crushing it. Even the owl is impressed.', 'Getting distracted now would waste all this lovely focus.'],
      },
      'run.end': {
        m: ['Final stretch! {time} to go.', 'Almost there, finish strong.', 'Last push, almost done.', '{time} left. You have got this.'],
        f: ['The finish line is on screen. Literally.', '{time} left. The owl is already planning the party.'],
      },
      over: {
        m: ['Past the estimate, that is fine. Finish now or reschedule?', 'An estimate is a guess, not a promise.', 'Time to decide: 15 more minutes or a break?', 'Taking longer than planned. Worth noting why later.'],
        f: ['The clock won this round. The next one is yours.', 'Stubborn task, huh? Decide: push on or reschedule.'],
      },
      due: {
        m: ['Ready? {task} starts now.', 'Past you scheduled this for now. Trust them.', 'Just 5 minutes. Then decide if you keep going.'],
        f: ['{task} is waiting. It is patient, but not that patient.', 'The calendar spoke, the owl delivers: it is time.'],
      },
      done: {
        m: ['Done! One more off the list. ✓', 'Nice work. Ride the momentum or take a well-earned break.', 'Finished. That is real progress.'],
        f: ['Task defeated. The owl approves.', 'Cross it off and enjoy the feeling.'],
      },
      owl: ['The owl is watching the clock.', 'Eyes open, focus on.', 'Wise is who finishes what they start.', 'Owls do not blink, and you will not give up now.'],
    },
    es: {
      'run.start': {
        m: ['Buen comienzo. Lo más difícil era empezar.', 'Foco encendido. Una cosa a la vez.', 'Empezaste, ahora solo hay que mantener.', 'Paso a paso, sin prisa.'],
        f: ['Modo foco: activado. El resto del mundo: en silencio.', 'Empezar es la mitad. La otra mitad es no abrir YouTube.'],
      },
      'run.mid': {
        m: ['Mitad del camino. Sigue firme.', 'Vas muy bien, sigue así.', 'Respira y sigue.', '¡Sigue así! 💪', 'La constancia le gana a la prisa.'],
        f: ['Lo estás haciendo genial. Hasta el búho está impresionado.', 'Distraerse ahora sería desperdiciar todo este foco tan bonito.'],
      },
      'run.end': {
        m: ['¡Recta final! Faltan {tiempo}.', 'Casi listo, cierra con broche de oro.', 'Último empujón, falta poco.', 'Faltan {tiempo}. Tú puedes.'],
        f: ['La meta ya está en la pantalla. Literalmente.', 'Faltan {tiempo}. El búho ya prepara la celebración.'],
      },
      over: {
        m: ['Pasaste lo estimado, no pasa nada. ¿Terminas ahora o reprogramas?', 'Una estimación es una suposición, no una promesa.', 'Hora de decidir: ¿15 minutos más o un descanso?', 'Está tardando más de lo previsto. Vale anotar por qué después.'],
        f: ['El reloj ganó esta ronda. La próxima es tuya.', 'Tarea terca, ¿eh? Decide: insistir o reprogramar.'],
      },
      due: {
        m: ['¿Vamos? {tarea} empieza ahora.', 'Tu yo del pasado lo agendó para ahora. Confía en él.', 'Solo 5 minutos. Después decides si sigues.'],
        f: ['{tarea} te espera. Es paciente, pero no tanto.', 'La agenda habló y el búho lo repite: es la hora.'],
      },
      done: {
        m: ['¡Hecho! Una menos en la lista. ✓', 'Bien hecho. Aprovecha el impulso o tómate un descanso merecido.', 'Terminada. Eso es progreso de verdad.'],
        f: ['Tarea derrotada. El búho aprueba.', 'Táchala de la lista y disfruta.'],
      },
      owl: ['El búho vigila el reloj.', 'Ojos abiertos, foco encendido.', 'Sabio es quien termina lo que empieza.', 'El búho no parpadea, y tú no te rendirás ahora.'],
    },
  };

  const recent = []; // últimas mensagens usadas (evita repetir em seguida)

  /** Troca {tarefa}/{task}/{tarea} e {tempo}/{time}/{tiempo} e quaisquer outras chaves. */
  function fill(text, vars = {}) {
    const alias = { tarefa: vars.task, task: vars.task, tarea: vars.task, tempo: vars.time, time: vars.time, tiempo: vars.time };
    return String(text).replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars[k] ?? alias[k];
      return v == null ? m : String(v);
    });
  }

  // Etiqueta opcional no começo da linha para escolher o momento (em qualquer um dos 3 idiomas).
  // Sem etiqueta: vale para os avisos durante a tarefa.
  const TAGS = {
    run: ['tarefa', 'durante', 'task', 'during', 'tarea'],
    over: ['esgotado', 'tempo esgotado', 'passou', 'over', 'time up', 'agotado', 'tiempo agotado'],
    due: ['comecar', 'inicio', 'start', 'empezar', 'agendada', 'scheduled'],
    done: ['concluida', 'feito', 'done', 'terminada', 'hecho'],
  };
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  /** Mensagens personalizadas: uma por linha, com etiqueta opcional "[concluída] …". Linhas com # são ignoradas. */
  function parseCustom(text) {
    return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).slice(0, 200).map((line) => {
      const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!m) return { when: 'run', text: line };
      const tag = norm(m[1]);
      const when = Object.keys(TAGS).find((k) => TAGS[k].includes(tag));
      return when && m[2] ? { when, text: m[2] } : { when: 'run', text: line };
    });
  }

  /**
   * Escolhe uma mensagem.
   * @param pool 'run.start' | 'run.mid' | 'run.end' | 'over' | 'due' | 'done'
   * @param o { lang, tone, vars, custom (texto) }
   */
  function pick(pool, o = {}) {
    const tone = o.tone || 'all';
    if (tone === 'off') return null;
    const L = M[o.lang] || M.pt;
    const p = L[pool] || { m: [], f: [] };
    const builtIn = [
      ...(tone === 'fun' ? [] : p.m),
      ...(tone === 'motivating' ? [] : [...p.f, ...(['done', 'run.end'].includes(pool) ? [] : L.owl)]), // na reta final, frases com o tempo que falta
    ];
    const moment = pool.startsWith('run.') ? 'run' : pool;
    const custom = parseCustom(o.custom).filter((c) => c.when === moment).map((c) => c.text);
    const rnd = o.random || Math.random;
    const fresh = (arr) => { const f = arr.filter((x) => !recent.includes(x)); return f.length ? f : arr; };
    const choose = (arr) => { const a = fresh(arr); return a[Math.floor(rnd() * a.length)]; };

    let msg;
    if (custom.length && (!builtIn.length || rnd() < 0.5)) msg = choose(custom); // as suas aparecem bastante
    else if (builtIn.length) msg = choose(builtIn);
    if (!msg) return null;
    recent.push(msg);
    if (recent.length > 8) recent.shift();
    return fill(msg, o.vars);
  }

  const api = { MESSAGES: M, pick, fill, parseCustom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OwlMessages = api;
})(typeof window !== 'undefined' ? window : globalThis);
