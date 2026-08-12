const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coreApi', {
  getStatus: () => ipcRenderer.invoke('core:status'),
  openLog: () => ipcRenderer.invoke('core:open-log'),
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
