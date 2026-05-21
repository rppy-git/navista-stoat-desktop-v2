import { BrowserWindow, Menu, Tray, ipcMain, nativeImage } from "electron";

import trayIconAsset from "../../assets/desktop/icon.png?asset";
import macOsTrayIconAsset from "../../assets/desktop/iconTemplate.png?asset";
import { version } from "../../package.json";

import { DEFAULT_SERVER_URL, config } from "./config";
import { mainWindow, quitApp } from "./window";

// internal tray state
let tray: Tray = null;
let serverSettingsWindow: BrowserWindow | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeServerUrl(value: string) {
  const parsed = new URL(value.trim());

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }

  return parsed.toString().replace(/\/$/, "");
}

function renderRecentServerUrls() {
  return config.recentServerUrls
    .map(
      (url) => `
        <button class="recent-item" type="button" data-url="${escapeHtml(url)}">${escapeHtml(url)}</button>
      `,
    )
    .join("");
}

function openServerSettingsWindow() {
  if (serverSettingsWindow && !serverSettingsWindow.isDestroyed()) {
    serverSettingsWindow.show();
    serverSettingsWindow.focus();
    return;
  }

  serverSettingsWindow = new BrowserWindow({
    width: 640,
    height: 520,
    minWidth: 640,
    minHeight: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: "URL du serveur",
    parent: mainWindow,
    modal: false,
    backgroundColor: "#111827",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  serverSettingsWindow.on("closed", () => {
    serverSettingsWindow = null;
  });

  const currentUrl = escapeHtml(config.serverUrl);
  const page = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>URL du serveur</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #111827;
        --panel: #1f2937;
        --border: #374151;
        --text: #f9fafb;
        --muted: #9ca3af;
        --accent: #2563eb;
        --accent-hover: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #0f172a 0%, var(--bg) 100%);
        color: var(--text);
        min-height: 100vh;
        overflow-x: hidden;
        overflow-y: auto;
      }
      .panel {
        background: color-mix(in srgb, var(--panel) 92%, white 8%);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        min-height: calc(100vh - 48px);
        padding-bottom: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0 0 16px;
        color: var(--muted);
        line-height: 1.45;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: #d1d5db;
      }
      input {
        width: 100%;
        padding: 11px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #0b1220;
        color: var(--text);
        font-size: 14px;
      }
      input:focus {
        outline: 2px solid rgba(37, 99, 235, 0.45);
        border-color: var(--accent);
      }
      .error {
        min-height: 20px;
        margin-top: 8px;
        color: #fca5a5;
        font-size: 12px;
      }
      .hint {
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      .recent {
        margin-top: 18px;
      }
      .recent h2 {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 600;
        color: #d1d5db;
      }
      .recent-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-height: 140px;
        overflow-y: auto;
        padding-right: 4px;
      }
      .recent-item {
        background: #0b1220;
        border: 1px solid var(--border);
        color: var(--text);
      }
      .actions {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 18px;
      }
      .actions-right {
        display: flex;
        gap: 10px;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 14px;
        cursor: pointer;
      }
      .ghost {
        background: transparent;
        color: #d1d5db;
        border: 1px solid var(--border);
      }
      .secondary {
        background: #374151;
        color: var(--text);
      }
      .primary {
        background: var(--accent);
        color: white;
      }
      .primary:hover { background: var(--accent-hover); }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>URL du serveur</h1>
      <p>Changez le serveur Stoat utilise par l'application desktop. La fenetre principale sera rechargee apres l'enregistrement.</p>
      <label for="server-url">Adresse du serveur</label>
      <input id="server-url" value="${currentUrl}" autocomplete="off" spellcheck="false" />
      <div class="error" id="error"></div>
      <div class="hint">Exemple : ${DEFAULT_SERVER_URL}</div>
      <div class="recent">
        <h2>Serveurs recents</h2>
        <div class="recent-list">
          ${renderRecentServerUrls()}
        </div>
      </div>
      <div class="actions">
        <button class="ghost" id="reset" type="button">Reinitialiser</button>
        <div class="actions-right">
          <button class="secondary" id="cancel" type="button">Annuler</button>
          <button class="primary" id="save" type="button">Enregistrer et recharger</button>
        </div>
      </div>
    </div>
    <script>
      const { ipcRenderer } = require("electron");
      const input = document.getElementById("server-url");
      const error = document.getElementById("error");
      const reset = document.getElementById("reset");
      const closeWindow = () => window.close();
      const defaultUrl = ${JSON.stringify(DEFAULT_SERVER_URL)};
      const validateUrl = (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      };
      const save = () => {
        const value = input.value.trim();
        if (!validateUrl(value)) {
          error.textContent = "Saisissez une URL valide en http:// ou https://.";
          input.focus();
          return;
        }
        ipcRenderer.send("set-server-url", value);
        closeWindow();
      };
      reset.addEventListener("click", () => {
        input.value = defaultUrl;
        error.textContent = "";
        input.focus();
      });
      document.getElementById("cancel").addEventListener("click", closeWindow);
      document.getElementById("save").addEventListener("click", save);
      document.querySelectorAll("[data-url]").forEach((button) => {
        button.addEventListener("click", () => {
          input.value = button.getAttribute("data-url");
          error.textContent = "";
          input.focus();
        });
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") save();
        if (event.key === "Escape") closeWindow();
      });
      input.focus();
      input.select();
    </script>
  </body>
</html>`;

  void serverSettingsWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(page)}`,
  );
}

ipcMain.on("set-server-url", (_event, value: string) => {
  try {
    const serverUrl = normalizeServerUrl(value);

    config.serverUrl = serverUrl;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    void mainWindow.loadURL(serverUrl);
  } catch (error) {
    console.warn("Ignoring invalid server URL", error);
  }
});

// Create and resize tray icon for macOS
function createTrayIcon() {
  if (process.platform === "darwin") {
    const image = nativeImage.createFromDataURL(macOsTrayIconAsset);
    const resized = image.resize({ width: 20, height: 20 });
    resized.setTemplateImage(true);
    return resized;
  } else {
    return nativeImage.createFromDataURL(trayIconAsset);
  }
}

export function initTray() {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip("TchatNavista");
  tray.setImage(trayIcon);
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
     mainWindow.hide();
    } else {
     mainWindow.show();
     mainWindow.focus();
    }
  });
}

export function updateTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "TchatNavista", type: "normal", enabled: false },
      {
        label: "Version",
        type: "submenu",
        submenu: Menu.buildFromTemplate([
          {
            label: version,
            type: "normal",
            enabled: false,
          },
        ]),
      },
      {
        label: "URL du serveur",
        type: "normal",
        click() {
          openServerSettingsWindow();
        },
      },
      { type: "separator" },
      {
        label: mainWindow.isVisible() ? "Masquer l'application" : "Afficher l'application",
        type: "normal",
        click() {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
        },
      },
      {
        label: "Quitter l'application",
        type: "normal",
        click: quitApp,
      },
    ]),
  );
}
