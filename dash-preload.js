const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashApi', {
  load: () => ipcRenderer.sendSync('dash:load'),
  isDemo: ipcRenderer.sendSync('app:demo'),
  onData: (cb) => ipcRenderer.on('dash:data', (_e, data) => cb(data)),
  onLang: (cb) => ipcRenderer.on('dash:lang', (_e, lang) => cb(lang)),
  systemLocale: ipcRenderer.sendSync('app:locale'),
});

// tema claro / escuro (usado pelo theme.js de cada janela)
contextBridge.exposeInMainWorld('themeApi', {
  get: () => ipcRenderer.sendSync('theme:get'),
  on: (cb) => ipcRenderer.on('theme:set', (_e, theme) => cb(theme)),
});
