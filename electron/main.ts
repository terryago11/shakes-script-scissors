import { app, BrowserWindow, shell, dialog } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import log from "electron-log";
import path from "path";
import http from "http";
import { spawn, ChildProcess } from "child_process";

autoUpdater.logger = log;
(log as any).transports.file.level = "info";

function stripHtml(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function releaseNotesDetail(info: UpdateInfo): string {
  const notes = info.releaseNotes;
  if (!notes) return "";
  if (typeof notes === "string") return `\n\nWhat's new:\n${stripHtml(notes)}`;
  if (Array.isArray(notes) && notes.length > 0) {
    const latest = notes[0] as { version?: string; note?: string };
    return `\n\nWhat's new in ${latest.version ?? info.version}:\n${stripHtml(latest.note ?? "")}`;
  }
  return "";
}

process.title = "ShakesScriptScissors";

const PORT = 47321;
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

function setupAutoUpdater() {
  const isMac = process.platform === "darwin";

  // macOS: Squirrel.Mac rejects unsigned apps, so we can't auto-install.
  // Instead, notify and send the user to the releases page.
  autoUpdater.autoDownload = !isMac;
  autoUpdater.autoInstallOnAppQuit = !isMac;

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err.message);
  });

  autoUpdater.on("checking-for-update", () => {
    log.info("[updater] checking for update");
  });

  autoUpdater.on("update-not-available", () => {
    log.info("[updater] up to date");
  });

  if (isMac) {
    autoUpdater.on("update-available", (info: UpdateInfo) => {
      if (!mainWindow) return;
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "Update available",
          message: `Version ${info.version} is available.`,
          detail: `Download the latest version from GitHub to update.${releaseNotesDetail(info)}`,
          buttons: ["Download", "Later"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0)
            shell.openExternal(
              "https://github.com/terryago11/shakes-script-scissors/releases/latest"
            );
        });
    });
  } else {
    autoUpdater.on("download-progress", ({ percent }: { percent: number }) => {
      if (mainWindow) {
        mainWindow.setTitle(
          `ShakesScriptScissors — Downloading update ${Math.round(percent)}%`
        );
      }
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      if (!mainWindow) return;
      mainWindow.setTitle("ShakesScriptScissors");
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "Update ready",
          message: `Version ${info.version} downloaded. Restart to install?`,
          detail: `The update will be applied on restart.${releaseNotesDetail(info)}`,
          buttons: ["Restart now", "Later"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
    });
  }

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
