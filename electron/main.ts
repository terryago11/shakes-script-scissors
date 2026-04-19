import { app, BrowserWindow, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import http from "http";
import { spawn, ChildProcess } from "child_process";

process.title = "ShakesScriptScissors";

const PORT = 3000;
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err.message);
  });

  autoUpdater.on("update-downloaded", () => {
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update ready",
        message: "A new update has been downloaded. Restart to install?",
        buttons: ["Restart", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error("[updater] checkForUpdates failed:", err.message);
  });
}

function waitForServer(retries = 60): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (n <= 0) return reject(new Error("Next.js server did not start"));
        setTimeout(() => attempt(n - 1), 500);
      });
      req.end();
    };
    attempt(retries);
  });
}

function startProductionServer() {
  const standaloneDir = path.join(process.resourcesPath, "standalone");
  process.env.PORT = String(PORT);
  process.env.AUTH_DISABLED = "true";
  // server.js uses __dirname to locate .next/static and public; chdir so
  // relative paths inside it resolve correctly.
  process.chdir(standaloneDir);
  // Requiring server.js starts an HTTP server in this same Node.js process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(standaloneDir, "server.js"));
}

function startDevServer() {
  const appRoot = path.join(__dirname, "..");
  const nextBin = path.join(appRoot, "node_modules", ".bin", "next");
  nextProcess = spawn(nextBin, ["dev"], {
    cwd: appRoot,
    env: { ...process.env, AUTH_DISABLED: "true" },
    stdio: "pipe",
  });
  nextProcess.stdout?.pipe(process.stdout);
  nextProcess.stderr?.pipe(process.stderr);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "ShakesScriptScissors",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open <a target="_blank"> links in the system browser, not in Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (isDev) {
    startDevServer();
  } else {
    startProductionServer();
  }

  try {
    await waitForServer();
    createWindow();
    if (!isDev) setupAutoUpdater();
  } catch (err) {
    console.error(err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) nextProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
