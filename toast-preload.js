const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastApi', {
  onShow: (cb) => ipcRenderer.on('toast:show', (_e, payload) => cb(payload)),
  done: () => ipcRenderer.send('toast:done'),
  click: () => ipcRenderer.send('toast:click'),
  size: (h) => ipcRenderer.send('toast:size', h), // altura real do cartão
});

// tema claro / escuro (usado pelo theme.js de cada janela)
contextBridge.exposeInMainWorld('themeApi', {
  get: () => ipcRenderer.sendSync('theme:get'),
  on: (cb) => ipcRenderer.on('theme:set', (_e, theme) => cb(theme)),
});
