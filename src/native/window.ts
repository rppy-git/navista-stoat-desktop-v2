import { join } from "node:path";

import {
  BrowserWindow,
  dialog,
  Menu,
  MenuItem,
  app,
  ipcMain,
  nativeImage,
} from "electron";

import windowIconAsset from "../../assets/desktop/icon.png?asset";

import { config } from "./config";
import { updateTrayMenu } from "./tray";

// global reference to main window
export let mainWindow: BrowserWindow;

export function getBuildUrl() {
  return new URL(
    app.commandLine.hasSwitch("force-server")
      ? app.commandLine.getSwitchValue("force-server")
      : config.serverUrl,
  );
}

// internal window state
let shouldQuit = false;
let recoveringServerUrl = false;

// load the window icon
const windowIcon = nativeImage.createFromDataURL(windowIconAsset);

// windowIcon.setTemplateImage(true);

/**
 * Create the main application window
 */
export function createMainWindow() {
  // (CLI arg --hidden or config)
  const startHidden =
    app.commandLine.hasSwitch("hidden") || config.startMinimisedToTray;

  // create the window
  mainWindow = new BrowserWindow({
    minWidth: 300,
    minHeight: 300,
    width: 1280,
    height: 720,
    backgroundColor: "#191919",
    frame: !config.customFrame,
    icon: windowIcon,
    show: !startHidden,
    webPreferences: {
      // relative to `.vite/build`
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // hide the options
  mainWindow.setMenu(null);

  // restore last position if it was moved previously
  if (config.windowState.x > 0 || config.windowState.y > 0) {
    mainWindow.setPosition(
      config.windowState.x ?? 0,
      config.windowState.y ?? 0,
    );
  }

  // restore last size if it was resized previously
  if (config.windowState.width > 0 && config.windowState.height > 0) {
    mainWindow.setSize(
      config.windowState.width ?? 1280,
      config.windowState.height ?? 720,
    );
  }

  // maximise the window if it was maximised before
  if (config.windowState.isMaximised) {
    mainWindow.maximize();
  }

  // load the entrypoint
  void mainWindow.loadURL(getBuildUrl().toString());

  // minimise window to tray
  mainWindow.on("close", (event) => {
    if (!shouldQuit && config.minimiseToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // update tray menu when window is shown/hidden
  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);

  // keep track of window state
  function generateState() {
    config.windowState = {
      x: mainWindow.getPosition()[0],
      y: mainWindow.getPosition()[1],
      width: mainWindow.getSize()[0],
      height: mainWindow.getSize()[1],
      isMaximised: mainWindow.isMaximized(),
    };
  }

  mainWindow.on("maximize", generateState);
  mainWindow.on("unmaximize", generateState);
  mainWindow.on("moved", generateState);
  mainWindow.on("resized", generateState);

  // rebind zoom controls to be more sensible
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && (input.key === "=" || input.key === "+")) {
      // zoom in (+)
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() + 1,
      );
    } else if (input.control && input.key === "-") {
      // zoom out (-)
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() - 1,
      );
    } else if (input.control && input.key === "0") {
      // reset zoom to default.
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
    } else if (
      input.key === "F5" ||
      ((input.control || input.meta) && input.key.toLowerCase() === "r")
    ) {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });

  // send the config
  mainWindow.webContents.on("did-finish-load", () => {
    recoveringServerUrl = false;
    config.lastValidServerUrl = config.serverUrl;

    const recentUrls = [
      config.serverUrl,
      ...config.recentServerUrls.filter((url) => url !== config.serverUrl),
    ].slice(0, 5);
    config.recentServerUrls = recentUrls;

    config.sync();
  });

  void mainWindow.webContents.executeJavaScript(`
    (() => {
      if (window.__tchatElementFullscreenInstalled) return;
      window.__tchatElementFullscreenInstalled = true;

      let fullscreenElement = null;
      let fullscreenHost = null;
      let fullscreenPlaceholder = null;
      let previousBodyOverflow = "";
      let previousElementStyle = null;

      const dispatchFullscreenChange = () => {
        document.dispatchEvent(new Event("fullscreenchange"));
        if (fullscreenElement instanceof Element) {
          fullscreenElement.dispatchEvent(new Event("fullscreenchange"));
        }
      };

      const restoreFullscreenElement = () => {
        if (!(fullscreenElement instanceof Element) || !fullscreenPlaceholder) {
          fullscreenElement = null;
          return;
        }

        fullscreenElement.setAttribute("style", previousElementStyle ?? "");
        fullscreenPlaceholder.replaceWith(fullscreenElement);
        fullscreenHost?.remove();
        fullscreenHost = null;
        fullscreenPlaceholder = null;
        previousElementStyle = null;
        document.body.style.overflow = previousBodyOverflow;
        fullscreenElement = null;
        dispatchFullscreenChange();
      };

      const applyFullscreenElement = (element) => {
        if (!(element instanceof Element)) return;

        if (fullscreenElement && fullscreenElement !== element) {
          restoreFullscreenElement();
        }

        if (fullscreenElement === element) {
          return;
        }

        previousBodyOverflow = document.body.style.overflow;
        previousElementStyle = element.getAttribute("style");

        fullscreenPlaceholder = document.createElement("div");
        fullscreenPlaceholder.style.display = "none";
        element.parentElement?.insertBefore(fullscreenPlaceholder, element);

        fullscreenHost = document.createElement("div");
        fullscreenHost.setAttribute("data-tchat-fullscreen-host", "true");
        Object.assign(fullscreenHost.style, {
          position: "fixed",
          inset: "0",
          zIndex: "2147483647",
          background: "#4b4f67",
          display: "grid",
          placeItems: "center",
          padding: "8px",
          overflow: "auto",
        });

        document.body.appendChild(fullscreenHost);
        fullscreenHost.appendChild(element);
        document.body.style.overflow = "hidden";

        element.setAttribute(
          "style",
          [
            previousElementStyle ?? "",
            "width: min(98vw, 1800px) !important",
            "height: min(96vh, 1200px) !important",
            "max-width: 98vw !important",
            "max-height: 96vh !important",
            "margin: 0 auto !important",
          ].join("; "),
        );

        fullscreenElement = element;
        dispatchFullscreenChange();
      };

      try {
        Object.defineProperty(Document.prototype, "fullscreenElement", {
          configurable: true,
          get() {
            return fullscreenElement;
          },
        });
      } catch {}

      try {
        Object.defineProperty(Document.prototype, "fullscreenEnabled", {
          configurable: true,
          get() {
            return true;
          },
        });
      } catch {}

      Element.prototype.requestFullscreen = function requestFullscreen() {
        applyFullscreenElement(this);
        return Promise.resolve();
      };

      Document.prototype.exitFullscreen = function exitFullscreen() {
        restoreFullscreenElement();
        return Promise.resolve();
      };

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && fullscreenElement) {
          event.preventDefault();

          const exitButton = [
            ...document.querySelectorAll("button"),
          ].find((button) =>
            button.querySelector("span.material-symbols-outlined")?.textContent?.trim() ===
            "fullscreen_exit",
          );

          if (exitButton instanceof HTMLButtonElement) {
            exitButton.click();
            return;
          }

          restoreFullscreenElement();
        }
      });
    })();
  `);

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || recoveringServerUrl) {
        return;
      }

      const targetUrl = getBuildUrl().toString();
      if (validatedUrl !== targetUrl) {
        return;
      }

      const fallbackUrl = config.lastValidServerUrl;
      if (!fallbackUrl || fallbackUrl === config.serverUrl) {
        void dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Connexion impossible",
          message: "Le serveur est inaccessible.",
          detail: `${errorDescription} (${errorCode})`,
        });
        return;
      }

      recoveringServerUrl = true;
      config.serverUrl = fallbackUrl;

      void dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Retour au dernier serveur valide",
        message:
          "Le serveur configure n'a pas pu etre charge. Retour au dernier serveur valide.",
        detail: `${validatedUrl}\n\nErreur: ${errorDescription} (${errorCode})`,
      });

      void mainWindow.loadURL(fallbackUrl);
    },
  );

  // configure spellchecker context menu
  mainWindow.webContents.on("context-menu", (_, params) => {
    const menu = new Menu();

    // add all suggestions
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion),
        }),
      );
    }

    // allow users to add the misspelled word to the dictionary
    if (params.misspelledWord) {
      menu.append(
        new MenuItem({
          label: "Add to dictionary",
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        }),
      );
    }

    // add an option to toggle spellchecker
    menu.append(
      new MenuItem({
        label: "Toggle spellcheck",
        click() {
          config.spellchecker = !config.spellchecker;
        },
      }),
    );

    // show menu if we've generated enough entries
    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  // push world events to the window
  ipcMain.on("minimise", () => mainWindow.minimize());
  ipcMain.on("maximise", () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
  );
  ipcMain.on("close", () => mainWindow.close());

  // mainWindow.webContents.openDevTools();

  // let i = 0;
  // setInterval(() => setBadgeCount((++i % 30) + 1), 1000);
}

/**
 * Quit the entire app
 */
export function quitApp() {
  shouldQuit = true;
  mainWindow.close();
}

// Ensure global app quit works properly
app.on("before-quit", () => {
  shouldQuit = true;
});
