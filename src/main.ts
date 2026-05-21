import { IUpdateInfo, updateElectronApp } from "update-electron-app";

import {
  BrowserWindow,
  Notification,
  app,
  desktopCapturer,
  ipcMain,
  session,
  shell,
} from "electron";
import started from "electron-squirrel-startup";

import { autoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import { initDiscordRpc } from "./native/discordRpc";
import { initTray } from "./native/tray";
import { createMainWindow, getBuildUrl, mainWindow } from "./native/window";

const APP_USER_MODEL_ID = "com.squirrel.TchatNavista.TchatNavista";

type DesktopNotificationPayload = {
  title: string;
  body?: string;
  icon?: string;
  image?: string;
  path?: string;
  silent?: boolean;
};

type DisplaySource = Awaited<
  ReturnType<typeof desktopCapturer.getSources>
>[number];

type DisplaySourcePreview = {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnailDataUrl: string;
};

function restoreMainWindow() {
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

function openNotificationPath(path?: string) {
  if (!path) return;

  const targetUrl = new URL(path, getBuildUrl()).toString();

  if (mainWindow.webContents.getURL() !== targetUrl) {
    void mainWindow.loadURL(targetUrl);
  }
}

function canUseConfiguredOrigin(origin: string) {
  try {
    return new URL(origin).origin === getBuildUrl().origin;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function selectDisplaySource(sources: DisplaySource[]) {
  if (sources.length === 0) {
    return null;
  }

  if (sources.length === 1) {
    return sources[0];
  }

  const selectChannel = `display-source-select-${Date.now()}`;
  const cancelChannel = `display-source-cancel-${Date.now()}`;
  const initChannel = `display-source-init-${Date.now()}`;

  return await new Promise<DisplaySource | null>((resolve) => {
    let pickerWindow: BrowserWindow | null = new BrowserWindow({
      width: 820,
      height: 560,
      title: "Choisir ce que vous partagez",
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: "#0f172a",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const cleanup = () => {
      ipcMain.removeAllListeners(selectChannel);
      ipcMain.removeAllListeners(cancelChannel);
      ipcMain.removeAllListeners(initChannel);
      if (pickerWindow && !pickerWindow.isDestroyed()) {
        pickerWindow.close();
      }
      pickerWindow = null;
    };

    ipcMain.once(selectChannel, (_event, selectedId: string) => {
      const selectedSource =
        sources.find((source) => source.id === selectedId) ?? null;
      cleanup();
      resolve(selectedSource);
    });

    ipcMain.once(cancelChannel, () => {
      cleanup();
      resolve(null);
    });

    pickerWindow.on("closed", () => {
      ipcMain.removeAllListeners(selectChannel);
      ipcMain.removeAllListeners(cancelChannel);
      ipcMain.removeAllListeners(initChannel);
      pickerWindow = null;
      resolve(null);
    });

    const previewSources: DisplaySourcePreview[] = sources.map((source) => ({
      id: source.id,
      name: source.name || "Source sans nom",
      kind: source.id.startsWith("screen:") ? "screen" : "window",
      thumbnailDataUrl: source.thumbnail.isEmpty()
        ? ""
        : source.thumbnail.toDataURL(),
    }));

    const page = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Choisir une source</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f172a;
        --panel: #111827;
        --card: #1f2937;
        --border: #334155;
        --text: #f8fafc;
        --muted: #94a3b8;
        --accent: #4f46e5;
        --accent-hover: #4338ca;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px;
        font-family: "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #1e293b 0%, var(--bg) 55%);
        color: var(--text);
        height: 100vh;
        overflow: hidden;
      }
      .panel {
        background: color-mix(in srgb, var(--panel) 92%, white 8%);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
        height: calc(100vh - 32px);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 20px;
      }
      p {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.35;
        font-size: 14px;
      }
      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .tab {
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
      }
      .tab.active {
        background: rgba(79, 70, 229, 0.22);
        color: white;
      }
      .picker {
        display: grid;
        grid-template-columns: minmax(220px, 250px) 1fr;
        gap: 12px;
        min-height: 0;
        flex: 1;
        overflow: hidden;
      }
      .list {
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 8px;
        overflow-y: auto;
        overflow-x: hidden;
        min-height: 0;
      }
      .panel-preview {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid var(--border);
        border-radius: 12px;
        min-height: 0;
        color: var(--text);
        overflow: hidden;
      }
      .panel-preview.empty {
        background: rgba(31, 41, 55, 0.8);
        color: var(--muted);
      }
      .preview-label {
        padding: 16px;
        text-align: center;
        font-size: 16px;
        line-height: 1.4;
      }
      .preview-media {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        min-height: 0;
      }
      .preview-frame {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(180deg, #312e81 0%, #1e1b4b 100%);
        border-radius: 10px;
        overflow: hidden;
      }
      .preview-frame.empty {
        background: rgba(31, 41, 55, 0.8);
      }
      .preview-frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .preview-caption {
        font-size: 14px;
        line-height: 1.2;
        color: var(--text);
        word-break: break-word;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .source:hover {
        border-color: var(--accent);
        background: #243045;
      }
      .source-name {
        font-size: 12px;
        line-height: 1.2;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .source {
        width: 100%;
        text-align: left;
        background: transparent;
        color: var(--text);
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 8px 9px;
        cursor: pointer;
        margin-bottom: 6px;
      }
      .source.selected {
        background: rgba(79, 70, 229, 0.2);
        border-color: #818cf8;
      }
      .panel {
        background: color-mix(in srgb, var(--panel) 92%, white 8%);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
        min-height: calc(100vh - 32px);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }
      .actions {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        gap: 10px;
      }
      .action-group {
        display: flex;
        gap: 10px;
        margin-left: auto;
      }
      .cancel, .share {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 13px;
      }
      .cancel {
        background: transparent;
        color: var(--text);
      }
      .cancel:hover {
        background: #1f2937;
      }
      .share {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }
      .share:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>Choisissez ce qui doit être partagé</h1>
      <p>Le site pourra voir le contenu de la source que vous sélectionnez.</p>
      <div class="tabs">
        <button class="tab" id="tab-windows" type="button">Fenêtre</button>
        <button class="tab" id="tab-screens" type="button">Tout l'écran</button>
      </div>
      <div class="picker">
        <div class="list" id="list-windows"></div>
        <div class="list hidden" id="list-screens"></div>
        <div class="panel-preview" id="preview">
          <div class="preview-label" id="preview-label"></div>
        </div>
      </div>
      <div class="actions">
        <div></div>
        <div class="action-group">
          <button class="cancel" id="cancel" type="button">Annuler</button>
          <button class="share" id="share" type="button">Partager</button>
        </div>
      </div>
    </div>
    <script>
      const { ipcRenderer } = require("electron");
      const tabWindows = document.getElementById("tab-windows");
      const tabScreens = document.getElementById("tab-screens");
      const listWindows = document.getElementById("list-windows");
      const listScreens = document.getElementById("list-screens");
      const preview = document.getElementById("preview");
      const share = document.getElementById("share");
      const sourceMap = new Map();
      let windowSources = [];
      let screenSources = [];
      let selectedId = null;

      const escapeHtml = (value) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");

      const renderSourceButtons = (entries) =>
        entries
          .map(
            (source, index) => \`
              <button
                class="source \${index === 0 ? "selected" : ""}"
                type="button"
                data-id="\${escapeHtml(source.id)}"
              >
                <div class="source-name">\${escapeHtml(source.name || "Source sans nom")}</div>
              </button>
            \`,
          )
          .join("");

      const updatePreview = (button) => {
        if (!button) {
          preview.classList.add("empty");
          preview.innerHTML = '<div class="preview-label">Sélectionnez une source à partager</div>';
          share.disabled = true;
          return;
        }
        const source = sourceMap.get(button.getAttribute("data-id"));
        preview.classList.remove("empty");
        preview.innerHTML = source && source.thumbnailDataUrl
          ? \`
            <div class="preview-media">
              <div class="preview-frame">
                <img src="\${source.thumbnailDataUrl}" alt="" />
              </div>
              <div class="preview-caption">\${source.name}</div>
            </div>
          \`
          : \`
            <div class="preview-media">
              <div class="preview-frame empty">
                <div class="preview-label">Aucune miniature disponible</div>
              </div>
              <div class="preview-caption">\${source ? source.name : button.textContent.trim()}</div>
            </div>
          \`;
        share.disabled = false;
      };

      const bindSourceButtons = () => {
        document.querySelectorAll(".source").forEach((button) => {
          button.addEventListener("click", () => selectButton(button));
        });
      };

      const selectButton = (button) => {
        document.querySelectorAll(".source").forEach((entry) => {
          entry.classList.remove("selected");
        });
        if (!button) {
          selectedId = null;
          updatePreview(null);
          return;
        }
        button.classList.add("selected");
        selectedId = button.getAttribute("data-id");
        updatePreview(button);
      };

      const activateTab = (kind) => {
        const showWindows = kind === "windows";
        tabWindows.classList.toggle("active", showWindows);
        tabScreens.classList.toggle("active", !showWindows);
        listWindows.classList.toggle("hidden", !showWindows);
        listScreens.classList.toggle("hidden", showWindows);
        const visibleList = showWindows ? listWindows : listScreens;
        selectButton(visibleList.querySelector(".source"));
      };

      ipcRenderer.on(${JSON.stringify(initChannel)}, (_event, payload) => {
        windowSources = payload.windowSources;
        screenSources = payload.screenSources;

        payload.sources.forEach((source) => {
          sourceMap.set(source.id, source);
        });

        listWindows.innerHTML = renderSourceButtons(windowSources);
        listScreens.innerHTML = renderSourceButtons(screenSources);
        bindSourceButtons();

        const initialTab = windowSources.length > 0 ? "windows" : "screens";
        activateTab(initialTab);
      });

      share.addEventListener("click", () => {
        if (selectedId) {
          ipcRenderer.send(${JSON.stringify(selectChannel)}, selectedId);
        }
      });
      document.getElementById("cancel").addEventListener("click", () => {
        ipcRenderer.send(${JSON.stringify(cancelChannel)});
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          ipcRenderer.send(${JSON.stringify(cancelChannel)});
        }
        if (event.key === "Enter" && selectedId) {
          ipcRenderer.send(${JSON.stringify(selectChannel)}, selectedId);
        }
      });
      tabWindows.addEventListener("click", () => activateTab("windows"));
      tabScreens.addEventListener("click", () => activateTab("screens"));
    </script>
  </body>
</html>`;

    pickerWindow.webContents.once("did-finish-load", () => {
      const windowSources = previewSources.filter((source) => source.kind === "window");
      const screenSources = previewSources.filter((source) => source.kind === "screen");

      pickerWindow?.webContents.send(initChannel, {
        sources: previewSources,
        windowSources,
        screenSources,
      });
    });

    void pickerWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(page)}`,
    );
  });
}

function setupDisplayMediaSupport() {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) => {
      if (permission === "display-capture" || permission === "media") {
        return canUseConfiguredOrigin(requestingOrigin);
      }

      return false;
    },
  );

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      if (permission === "display-capture" || permission === "media") {
        callback(canUseConfiguredOrigin(details.requestingUrl ?? ""));
        return;
      }

      callback(false);
    },
  );

  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!canUseConfiguredOrigin(request.securityOrigin)) {
        callback({});
        return;
      }

      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 1280, height: 720 },
      });

      const selectedSource = await selectDisplaySource(sources);

      if (!selectedSource) {
        callback({});
        return;
      }

      callback({
        video: selectedSource,
        audio:
          process.platform === "win32" && request.audioRequested
            ? "loopback"
            : undefined,
      });
    },
    { useSystemPicker: true },
  );
}

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

const onNotifyUser = (_info: IUpdateInfo) => {
  const notification = new Notification({
    title: "Update Available",
    body: "Restart the app to install the update.",
    silent: true,
  });

  notification.show();
};

if (acquiredLock) {
  // start auto update logic
  updateElectronApp({ onNotifyUser });

  // create and configure the app when electron is ready
  app.on("ready", () => {
    setupDisplayMediaSupport();

    // create window and application contexts
    createMainWindow();

    ipcMain.on("notify-message", (_event, payload: DesktopNotificationPayload) => {
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        silent: payload.silent ?? true,
      });

      notification.on("click", () => {
        restoreMainWindow();
        openNotificationPath(payload.path);
      });

      notification.show();
    });

    // enable auto start on Windows and MacOS
    if (config.firstLaunch) {
      if (process.platform === "win32" || process.platform === "darwin") {
        autoLaunch.enable();
      }
      config.firstLaunch = false;
    }

    initTray();
    initDiscordRpc();
  });

  // focus the window if we try to launch again
  app.on("second-instance", () => {
    restoreMainWindow();
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      restoreMainWindow();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // prevent navigation out of build URL origin
    contents.on("will-navigate", (event, navigationUrl) => {
      if (new URL(navigationUrl).origin !== getBuildUrl().origin) {
        event.preventDefault();
      }
    });

    // handle links externally
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith("http:") ||
        url.startsWith("https:") ||
        url.startsWith("mailto:")
      ) {
        setImmediate(() => {
          shell.openExternal(url);
        });
      }

      return { action: "deny" };
    });
  });
} else {
  app.quit();
}
