const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.sendSync('settings:get'),
  set: (patch) => ipcRenderer.send('settings:set', patch),
  action: (name, arg) => ipcRenderer.invoke('settings:action', name, arg),
  onState: (cb) => ipcRenderer.on('settings:state', (_e, state) => cb(state)),
});

// tema claro / escuro (usado pelo theme.js de cada janela)
contextBridge.exposeInMainWorld('themeApi', {
  get: () => ipcRenderer.sendSync('theme:get'),
  on: (cb) => ipcRenderer.on('theme:set', (_e, theme) => cb(theme)),
});
