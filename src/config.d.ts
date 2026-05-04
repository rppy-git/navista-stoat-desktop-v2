declare type DesktopConfig = {
  firstLaunch: boolean;
  customFrame: boolean;
  minimiseToTray: boolean;
  spellchecker: boolean;
  hardwareAcceleration: boolean;
  discordRpc: boolean;
  windowState: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximised: boolean;
  };
};

declare type DesktopNotificationPayload = {
  title: string;
  body?: string;
  icon?: string;
  image?: string;
  tag?: string;
  timestamp?: number;
  path?: string;
};
