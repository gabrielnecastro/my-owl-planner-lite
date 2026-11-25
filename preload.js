const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  // dados (SQLite no processo principal)
  load: () => ipcRenderer.sendSync('store:load'),
  save: (json) => ipcRenderer.send('store:save', json),

  // janela
  setConfig: (cfg) => ipcRenderer.send('ui:config', cfg), // { mode, side, hoverOpen }
  expand: () => ipcRenderer.send('ui:expand'),
  setBusy: (value) => ipcRenderer.send('ui:busy', value),
  hide: () => ipcRenderer.send('hide'),
  setProgress: (p, mode) => ipcRenderer.send('ui:progress', { p, mode }), // botão na barra de tarefas
  setClickThrough: (on) => ipcRenderer.send('ui:clickthrough', on),     // barra escondida não bloqueia cliques
  onExpanded: (cb) => ipcRenderer.on('ui:expanded', (_e, v) => cb(v)),
  onSet: (cb) => ipcRenderer.on('ui:set', (_e, v) => cb(v)),

  notify: (title, body, kind, day, msg) => ipcRenderer.send('notify', { title, body, kind, day, msg }), // kind: reminder | over | due | done; msg: frase do aviso
  openDashboard: () => ipcRenderer.send('dash:open'),
  reminderMenu: () => ipcRenderer.send('reminder:menu'),
  openSettings: () => ipcRenderer.send('settings:open'),
  systemLocale: ipcRenderer.sendSync('app:locale'),
  isDemo: ipcRenderer.sendSync('app:demo'),
});

// tema claro / escuro (usado pelo theme.js de cada janela)
contextBridge.exposeInMainWorld('themeApi', {
  get: () => ipcRenderer.sendSync('theme:get'),
  on: (cb) => ipcRenderer.on('theme:set', (_e, theme) => cb(theme)),
});
