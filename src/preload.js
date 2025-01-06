const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botAPI', {
    startBot: (username, password, mediaShortCode, accountCount = 1, isFirstAccount = false) =>
        ipcRenderer.invoke('start-bot', { username, password, mediaShortCode, accountCount, isFirstAccount }),

    setProxy: (address, username, password, port) =>
        ipcRenderer.invoke('set-proxy', { address, username, password, port }),

    getProxy: () => ipcRenderer.invoke('get-proxy'),

    onBotLog: (callback) => ipcRenderer.on('bot-log', (_, log) => callback(log)),

    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    closeWindow: () => ipcRenderer.send('window:close')
});
