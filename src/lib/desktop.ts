import type { LiveCommand } from "./live-sync";

export type CaptureSourceInfo = {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
};

export type CaptureAccessStatus = {
  screen: string;
  microphone: string;
};

export type RobotDesktopBridge = {
  isDesktop: true;
  platform: string;
  openOverlay: (sessionId: string) => Promise<void>;
  focusMain: () => Promise<void>;
  listCaptureSources: () => Promise<CaptureSourceInfo[]>;
  setCaptureSource: (sourceId: string) => Promise<string | null>;
  getCaptureAccessStatus: () => Promise<CaptureAccessStatus>;
  openScreenPrivacySettings: () => Promise<void>;
  onCommand: (handler: (command: LiveCommand) => void) => () => void;
};

declare global {
  interface Window {
    robotDesktop?: RobotDesktopBridge;
  }
}

export function getDesktop(): RobotDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.robotDesktop ?? null;
}

export function isDesktopApp() {
  return Boolean(getDesktop()?.isDesktop);
}
