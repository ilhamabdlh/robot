const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("robotDesktop", {
  isDesktop: true,
  platform: process.platform,
  openOverlay: (sessionId) => ipcRenderer.invoke("overlay:open", sessionId),
  focusMain: () => ipcRenderer.invoke("main:focus"),
  listCaptureSources: () => ipcRenderer.invoke("capture:listSources"),
  setCaptureSource: (sourceId) => ipcRenderer.invoke("capture:setSource", sourceId),
  getCaptureAccessStatus: () => ipcRenderer.invoke("capture:accessStatus"),
  openScreenPrivacySettings: () => ipcRenderer.invoke("capture:openScreenPrivacy"),
  onCommand: (handler) => {
    const listener = (_event, command) => {
      handler(command);
    };
    ipcRenderer.on("desktop:command", listener);
    return () => {
      ipcRenderer.removeListener("desktop:command", listener);
    };
  },
});
