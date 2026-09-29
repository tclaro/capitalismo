export const APP_VERSION = "0.1.0";

// Identifies our UDP/WS messages; bump PROTOCOL_VERSION on incompatible changes.
export const PROTO = "poc-rede";
export const PROTOCOL_VERSION = 1;

export interface Options {
  roomPort: number;
  udpPort: number;
  candidatePorts: number[];
  launcherPort: number;
  studentPort: number;
  roomName: string | null;
  openBrowser: boolean;
}

export const DEFAULTS: Options = {
  roomPort: 47800,
  udpPort: 47801,
  candidatePorts: [8080, 8000, 3000, 5000, 80],
  launcherPort: 47809,
  studentPort: 47802,
  roomName: null,
  openBrowser: true,
};

export const TIMEOUTS = {
  httpMs: 5000,
  portProbeMs: 3000,
  wsOpenMs: 5000,
  loadOpenMs: 10000,
  sysCommandMs: 20000,
};

export const AUTOSAVE_MS = 60_000;
export const HOST_PING_MS = 2000;
