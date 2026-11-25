// Tema claro (padrão) ou escuro. Roda no <head> de cada janela, antes do CSS desenhar,
// para não piscar a cor errada. O processo principal avisa quando o tema muda.
(function () {
  var api = window.themeApi;
  function apply(theme) { document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'; }
  var start = 'light';
  try { start = api ? api.get() : (new URLSearchParams(location.search).get('theme') || 'light'); } catch (e) { /* ok */ }
  apply(start);
  if (api) api.on(apply);
})();
