import { contextBridge, ipcRenderer } from "electron";

import { version } from "../../package.json";

type DesktopVoiceShortcutConfig = {
  toggleMute: string;
  toggleDeafen: string;
};

const serviceWorkerContainer = navigator.serviceWorker;
const desktopVoiceShortcutConfigListeners = new Set<
  (config: DesktopVoiceShortcutConfig) => void
>();
let desktopVoiceShortcutConfig: DesktopVoiceShortcutConfig = {
  toggleMute: "",
  toggleDeafen: "",
};

if (serviceWorkerContainer) {
  void serviceWorkerContainer
    .getRegistrations()
    .then((registrations) =>
      Promise.allSettled(
        registrations.map((registration) => registration.unregister()),
      ),
    )
    .catch(() => {
      // Ignore service worker cleanup failures in desktop mode.
    });
}

try {
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    get() {
      return undefined;
    },
  });
} catch {
  try {
    Object.defineProperty(Navigator.prototype, "serviceWorker", {
      configurable: true,
      get() {
        return undefined;
      },
    });
  } catch {
    // Ignore failures: the app will still keep explicit refresh fallbacks.
  }
}

ipcRenderer.on(
  "voice-shortcuts:config",
  (_event, nextConfig: DesktopVoiceShortcutConfig) => {
    desktopVoiceShortcutConfig = nextConfig;
    desktopVoiceShortcutConfigListeners.forEach((listener) => {
      listener(nextConfig);
    });
  },
);

contextBridge.exposeInMainWorld("native", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    desktop: () => version,
  },

  minimise: () => ipcRenderer.send("minimise"),
  maximise: () => ipcRenderer.send("maximise"),
  close: () => ipcRenderer.send("close"),

  setBadgeCount: (count: number) => ipcRenderer.send("setBadgeCount", count),
  notifyDesktopMessage: (payload: {
    title: string;
    body?: string;
    icon?: string;
    image?: string;
    path?: string;
    silent?: boolean;
  }) => ipcRenderer.send("notify-message", payload),
});

contextBridge.exposeInMainWorld("desktopVoiceShortcuts", {
  getConfig: () => desktopVoiceShortcutConfig,
  updateSettings: (settings: Partial<DesktopVoiceShortcutConfig>) =>
    ipcRenderer.send("voice-shortcuts:update", settings),
  onConfigChange: (callback: (config: DesktopVoiceShortcutConfig) => void) => {
    desktopVoiceShortcutConfigListeners.add(callback);
  },
  offConfigChange: (
    callback: (config: DesktopVoiceShortcutConfig) => void,
  ) => {
    desktopVoiceShortcutConfigListeners.delete(callback);
  },
});