const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('subApi', {
  list: () => ipcRenderer.invoke('subscription:list'),
  add: (payload) => ipcRenderer.invoke('subscription:add', payload),
  update: (id, name) => ipcRenderer.invoke('subscription:update', { id, name }),
  remove: (id) => ipcRenderer.invoke('subscription:remove', id),
  refresh: (id) => ipcRenderer.invoke('subscription:refresh', id),
  refreshAll: () => ipcRenderer.invoke('subscription:refresh-all')
});

contextBridge.exposeInMainWorld('nodeApi', {
  list: (filters) => ipcRenderer.invoke('node:list', filters),
  start: (payload) => ipcRenderer.invoke('node:start', payload),
  stop: (id) => ipcRenderer.invoke('node:stop', id),
  testIp: (id) => ipcRenderer.invoke('node:test-ip', id),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('node:status', listener);
    return () => ipcRenderer.removeListener('node:status', listener);
  }
});

contextBridge.exposeInMainWorld('coreApi', {
  getStatus: () => ipcRenderer.invoke('core:status'),
  openLog: () => ipcRenderer.invoke('core:open-log'),
  openCoreLog: () => ipcRenderer.invoke('core:open-core-log'),
  cleanup: () => ipcRenderer.invoke('core:cleanup'),
  startDownload: (downloadProxy) => ipcRenderer.invoke('core:download-start', downloadProxy),
  pauseDownload: () => ipcRenderer.invoke('core:download-pause'),
  resumeDownload: () => ipcRenderer.invoke('core:download-resume'),
  cancelDownload: () => ipcRenderer.invoke('core:download-cancel'),
  onDownloadEvent: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('core:download-event', listener);
    return () => ipcRenderer.removeListener('core:download-event', listener);
  }
});

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  setPort: (port) => ipcRenderer.invoke('settings:set-port', port)
});
