import { contextBridge, ipcRenderer } from "electron";

const defaultConfig: DesktopConfig = {
  firstLaunch: true,
  serverUrl: "https://stoat.navista.fr",
  lastValidServerUrl: "https://stoat.navista.fr",
  recentServerUrls: ["https://stoat.navista.fr"],
  customFrame: true,
  minimiseToTray: true,
  startMinimisedToTray: false,
  spellchecker: true,
  hardwareAcceleration: true,
  discordRpc: true,
  windowState: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isMaximised: false,
  },
};

let config: DesktopConfig = defaultConfig;

ipcRenderer.on("config", (_, data) => (config = data));

contextBridge.exposeInMainWorld("desktopConfig", {
  get: () => config,
  set: (config: DesktopConfig) => ipcRenderer.send("config", config),
  getAutostart() {
    return ipcRenderer.invoke("getAutostart") as Promise<boolean>;
  },
  setAutostart(value: boolean) {
    return ipcRenderer.invoke("setAutostart", value) as Promise<boolean>;
  },
});
