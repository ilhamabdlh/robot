const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  session,
  shell,
  systemPreferences,
} = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");

// Aktifkan loopback audio macOS untuk getDisplayMedia (audio lawan).
app.commandLine.appendSwitch(
  "enable-features",
  "MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride",
);

const isDev = !app.isPackaged;
/** @type {string | null} */
let pendingCaptureSourceId = null;
const DEV_URL = process.env.ROBOT_DEV_URL || "http://127.0.0.1:3000";
const PROD_PORT = Number(process.env.ROBOT_PORT || 4310);
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let overlayWindow = null;
/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;
let activeSessionId = "";

function preloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function appUrl(pathname = "/") {
  const base = isDev ? DEV_URL : PROD_URL;
  if (!pathname.startsWith("/")) return `${base}/${pathname}`;
  return `${base}${pathname}`;
}

function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(undefined);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server tidak siap: ${url}`));
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function standaloneDir() {
  if (isDev) {
    return path.join(__dirname, "..", ".next", "standalone");
  }
  return path.join(process.resourcesPath, "app-server");
}

function startProductionServer() {
  const dir = standaloneDir();
  const serverJs = path.join(dir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Standalone Next.js belum ada di ${serverJs}. Jalankan npm run build:next dulu.`,
    );
  }

  const envFiles = [
    path.join(app.getPath("userData"), ".env"),
    path.join(process.resourcesPath, ".env"),
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ];
  let fileEnv = {};
  for (const candidate of envFiles) {
    if (fs.existsSync(candidate)) {
      fileEnv = loadEnvFile(candidate);
      break;
    }
  }

  nextProcess = spawn(process.execPath, [serverJs], {
    cwd: dir,
    env: {
      ...process.env,
      ...fileEnv,
      PORT: String(PROD_PORT),
      HOSTNAME: "127.0.0.1",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });

  nextProcess.on("exit", (code) => {
    nextProcess = null;
    if (code && code !== 0) {
      console.error("Next.js server exit", code);
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Robot",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(appUrl("/"));
}

function placeOverlay(win) {
  const display = require("electron").screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = 480;
  const x = Math.max(display.x + 16, display.x + display.width - width - 24);
  const y = display.y + 48;
  win.setBounds({ x, y, width, height });
}

function createOrFocusOverlay(sessionId) {
  activeSessionId = sessionId || activeSessionId;
  if (!activeSessionId) {
    throw new Error("Belum ada sessionId untuk overlay");
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    void overlayWindow.loadURL(appUrl(`/overlay/${activeSessionId}`));
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  overlayWindow = new BrowserWindow({
    width: 380,
    height: 480,
    minWidth: 300,
    minHeight: 320,
    title: "Robot Overlay",
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: false,
    ...(process.platform === "darwin"
      ? {
          vibrancy: "under-window",
          visualEffectState: "active",
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {
          frame: true,
        }),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  placeOverlay(overlayWindow);
  overlayWindow.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setBackgroundColor("#00000000");
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  void overlayWindow.loadURL(appUrl(`/overlay/${activeSessionId}`));
}

function broadcastCommand(command) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("desktop:command", command);
    }
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();

  const okSolve = globalShortcut.register("CommandOrControl+9", () => {
    broadcastCommand("solve");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:command", "solve");
    }
  });
  if (!okSolve) console.warn("Gagal register shortcut CommandOrControl+9");

  const okAnswer = globalShortcut.register("CommandOrControl+Shift+A", () => {
    broadcastCommand("answer");
  });
  if (!okAnswer) console.warn("Gagal register shortcut CommandOrControl+Shift+A");

  const okClear = globalShortcut.register("CommandOrControl+Shift+C", () => {
    broadcastCommand("clear");
  });
  if (!okClear) console.warn("Gagal register shortcut CommandOrControl+Shift+C");
}

function setupCapturePermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(
      permission === "media" ||
        permission === "display-capture" ||
        permission === "mediaKeySystem",
    );
  });

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return (
      permission === "media" ||
      permission === "display-capture" ||
      permission === "mediaKeySystem"
    );
  });

  // Tanpa handler ini, getDisplayMedia di Electron hampir selalu gagal.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });

      let selected =
        (pendingCaptureSourceId &&
          sources.find((source) => source.id === pendingCaptureSourceId)) ||
        null;

      if (!selected) {
        selected =
          sources.find((source) =>
            /zoom|meet|teams|webex|discord|chrome|edge|safari|firefox/i.test(
              source.name,
            ),
          ) ||
          sources.find((source) => source.id.startsWith("screen:")) ||
          sources[0];
      }

      pendingCaptureSourceId = null;

      if (!selected) {
        callback({});
        return;
      }

      if (request.audioRequested) {
        callback({ video: selected, audio: "loopback" });
      } else {
        callback({ video: selected });
      }
    } catch (error) {
      console.error("display media handler failed", error);
      pendingCaptureSourceId = null;
      callback({});
    }
  });
}

function setupIpc() {
  ipcMain.handle("overlay:open", (_event, sessionId) => {
    createOrFocusOverlay(String(sessionId || ""));
  });

  ipcMain.handle("main:focus", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle("capture:listSources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 180, height: 112 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      isScreen: source.id.startsWith("screen:"),
    }));
  });

  ipcMain.handle("capture:setSource", (_event, sourceId) => {
    pendingCaptureSourceId = String(sourceId || "") || null;
    return pendingCaptureSourceId;
  });

  ipcMain.handle("capture:accessStatus", () => {
    return {
      screen:
        process.platform === "darwin"
          ? systemPreferences.getMediaAccessStatus("screen")
          : "granted",
      microphone:
        process.platform === "darwin"
          ? systemPreferences.getMediaAccessStatus("microphone")
          : "granted",
    };
  });

  ipcMain.handle("capture:openScreenPrivacy", async () => {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
    }
  });
}

async function boot() {
  setupCapturePermissions();
  setupIpc();

  if (process.platform === "darwin") {
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch {
      /* ignore */
    }
  }

  if (isDev) {
    await waitForServer(DEV_URL);
  } else {
    startProductionServer();
    await waitForServer(PROD_URL);
  }

  createMainWindow();
  registerShortcuts();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void boot().catch((error) => {
      console.error(error);
      app.quit();
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (nextProcess && !nextProcess.killed) {
      nextProcess.kill();
      nextProcess = null;
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
