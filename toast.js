// =====================================================================
//  My Owl Planner — aviso que sai da barra (substitui a notificação do Windows)
//  Some sozinho depois de alguns segundos; parar o mouse em cima segura.
//  Clicar abre o widget; × fecha.
// =====================================================================
const api = window.toastApi || { onShow() {}, done() {}, click() {}, size() {} };
const $ = (s) => document.querySelector(s);
const DURATION = 7000;

let remaining = 0, startedAt = 0, timer = null, raf = null, active = false;

function show({ title, body, msg, kind = 'reminder', from = 'bottom', sound = true }) {
  document.body.className = `from-${from}`;
  const el = $('#toast');
  el.className = `toast ${kind}`;
  $('#title').textContent = title;
  $('#body').textContent = body || '';
  $('#body').style.display = body ? '' : 'none';
  $('#msg').textContent = msg || '';
  $('#msg').style.display = msg ? '' : 'none';
  el.classList.toggle('has-msg', !!msg); // com frase: ela vem em cima, maior; a tarefa desce
  void el.offsetWidth;            // reinicia a animação
  api.size?.(el.offsetHeight + 12); // a janela fica do tamanho exato do cartão (+ margem)
  el.classList.add('in');
  active = true;

  if (sound) {
    const a = $('#hoot');
    a.currentTime = 0;
    a.volume = 0.6;
    a.play().catch(() => {});
  }
  remaining = DURATION;
  resume();
}

function tick() {
  const left = Math.max(0, remaining - (Date.now() - startedAt));
  $('#timerFill').style.transform = `scaleX(${left / DURATION})`;
  if (active && startedAt) raf = requestAnimationFrame(tick);
}

function resume() {
  startedAt = Date.now();
  $('#toast').classList.remove('paused');
  clearTimeout(timer);
  timer = setTimeout(() => hide('done'), remaining);
  cancelAnimationFrame(raf);
  tick();
}

function pause() {
  if (!active || !startedAt) return;
  remaining = Math.max(500, remaining - (Date.now() - startedAt));
  startedAt = 0;
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  $('#toast').classList.add('paused');
}

function hide(reason) {
  if (!active) return;
  active = false;
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  const el = $('#toast');
  el.classList.add('out');
  el.classList.remove('in');
  setTimeout(() => {
    el.classList.remove('out');
    if (reason === 'click') api.click(); else api.done();
  }, 280);
}

$('#toast').addEventListener('mouseenter', pause);
$('#toast').addEventListener('mouseleave', () => active && resume());
$('#toast').addEventListener('click', (e) => { if (e.target.id !== 'close') hide('click'); });
$('#close').addEventListener('click', (e) => { e.stopPropagation(); hide('done'); });

api.onShow(show);
window.__show = show; // testes
