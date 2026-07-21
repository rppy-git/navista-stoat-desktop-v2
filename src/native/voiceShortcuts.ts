import { app, globalShortcut, ipcMain } from "electron";

import { config } from "./config";
import { mainWindow } from "./window";

type VoiceShortcutAction = "toggleMute" | "toggleDeafen";
type VoiceShortcutConfig = DesktopConfig["voiceShortcuts"];

let initialized = false;
const registeredAccelerators = new Set<string>();

function getVoiceShortcutConfig(): VoiceShortcutConfig {
  return config.voiceShortcuts ?? {
    toggleMute: "",
    toggleDeafen: "",
  };
}

function toElectronAccelerator(keybind: string) {
  const trimmed = keybind.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();

      switch (lower) {
        case "ctrl":
        case "control":
          return "CommandOrControl";
        case "alt":
          return "Alt";
        case "shift":
          return "Shift";
        case "meta":
        case "super":
        case "cmd":
        case "command":
          return "Super";
        case "arrowup":
          return "Up";
        case "arrowdown":
          return "Down";
        case "arrowleft":
          return "Left";
        case "arrowright":
          return "Right";
        case "space":
          return "Space";
        default:
          if (/^f\d{1,2}$/i.test(part)) {
            return part.toUpperCase();
          }

          return part.length === 1 ? part.toUpperCase() : part;
      }
    });

  const modifiers = ["CommandOrControl", "Alt", "Shift", "Super"];
  const hasModifier = parts.some((part) => modifiers.includes(part));

  if (
    parts.length === 0 ||
    !hasModifier ||
    parts.every((part) => modifiers.includes(part))
  ) {
    return undefined;
  }

  return parts.join("+");
}

function clearRegisteredVoiceShortcuts() {
  registeredAccelerators.forEach((accelerator) => {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator);
    }
  });
  registeredAccelerators.clear();
}

function syncVoiceShortcutConfig() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(
    "voice-shortcuts:config",
    getVoiceShortcutConfig(),
  );
}

function dispatchVoiceShortcutAction(action: VoiceShortcutAction) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  void mainWindow.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent("stoat-global-voice-shortcut", { detail: { action: ${JSON.stringify(action)} } }));`,
      true,
    )
    .catch(() => {
      // Ignore shortcut dispatch failures if the renderer is reloading.
    });
}

function registerVoiceShortcut(
  keybind: string,
  action: VoiceShortcutAction,
) {
  const accelerator = toElectronAccelerator(keybind);
  if (!accelerator) {
    return;
  }

  try {
    if (
      globalShortcut.register(accelerator, () =>
        dispatchVoiceShortcutAction(action),
      )
    ) {
      registeredAccelerators.add(accelerator);
    }
  } catch {
    // Invalid shortcuts should not break the app.
  }
}

function refreshVoiceShortcuts() {
  if (!app.isReady()) {
    return;
  }

  clearRegisteredVoiceShortcuts();

  const currentConfig = getVoiceShortcutConfig();
  registerVoiceShortcut(currentConfig.toggleMute, "toggleMute");
  registerVoiceShortcut(currentConfig.toggleDeafen, "toggleDeafen");
  syncVoiceShortcutConfig();
}

function updateVoiceShortcutConfig(nextConfig: Partial<VoiceShortcutConfig>) {
  config.voiceShortcuts = {
    ...getVoiceShortcutConfig(),
    ...nextConfig,
  };

  refreshVoiceShortcuts();
}

export function initVoiceShortcuts() {
  if (!app.isReady()) {
    return;
  }

  if (!initialized) {
    initialized = true;

    ipcMain.on(
      "voice-shortcuts:update",
      (_event, nextConfig: Partial<VoiceShortcutConfig>) => {
        updateVoiceShortcutConfig(nextConfig);
      },
    );

    app.on("will-quit", () => {
      clearRegisteredVoiceShortcuts();
    });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once("did-finish-load", () => {
      syncVoiceShortcutConfig();
    });

    if (!mainWindow.webContents.isLoading()) {
      syncVoiceShortcutConfig();
    }
  }

  refreshVoiceShortcuts();
}
