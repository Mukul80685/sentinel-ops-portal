const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
});

contextBridge.exposeInMainWorld('ssaccPersist', {
  read: () => ipcRenderer.invoke('persist-read'),
  write: (payload) => ipcRenderer.invoke('persist-write', payload),
});
