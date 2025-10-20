const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getAppVersion: async () => {
        return await ipcRenderer.invoke('get-app-version');
    }
});
