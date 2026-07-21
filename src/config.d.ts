declare type DesktopConfig = {
  firstLaunch: boolean;
  serverUrl: string;
  lastValidServerUrl: string;
  recentServerUrls: string[];
  customFrame: boolean;
  minimiseToTray: boolean;
  startMinimisedToTray: boolean;
  spellchecker: boolean;
  hardwareAcceleration: boolean;
  discordRpc: boolean;
  voiceShortcuts: {
    toggleMute: string;
    toggleDeafen: string;
  };
  windowState: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximised: boolean;
  };
};
