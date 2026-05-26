import { contextBridge, ipcRenderer } from "electron";

import { version } from "../../package.json";

const serviceWorkerContainer = navigator.serviceWorker;

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
