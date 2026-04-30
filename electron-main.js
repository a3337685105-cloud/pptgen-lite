const { app: electronApp, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");

let mainWindow = null;
let localServer = null;

function resolveIconPath() {
  return path.join(__dirname, "public", "v2", "assets", "pptgen-icon.png");
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: "PPTGEN",
    backgroundColor: "#eef3fb",
    icon: resolveIconPath(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith("http://localhost:") || targetUrl.startsWith("http://127.0.0.1:")) {
      return { action: "allow" };
    }
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);
}

async function closeLocalServer() {
  if (!localServer) return;
  await new Promise((resolve) => {
    localServer.close(() => resolve());
  });
  localServer = null;
}

async function boot() {
  try {
    process.env.PPTGEN_NO_BROWSER = "1";
    process.env.PPTGEN_RUNTIME_DIR ||= electronApp.isPackaged ? process.resourcesPath : __dirname;
    const { startServer } = require("./server");
    const started = await startServer(Number(process.env.PORT) || 3000, { openBrowser: false });
    localServer = started.server;
    createWindow(`${started.url}/v2/index.html`);
  } catch (error) {
    dialog.showErrorBox("PPTGEN 启动失败", error?.message || String(error));
    electronApp.quit();
  }
}

const gotLock = electronApp.requestSingleInstanceLock();

if (!gotLock) {
  electronApp.quit();
} else {
  electronApp.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  electronApp.whenReady().then(boot);

  electronApp.on("window-all-closed", () => {
    electronApp.quit();
  });

  electronApp.on("before-quit", (event) => {
    if (!localServer) return;
    event.preventDefault();
    closeLocalServer().finally(() => {
      electronApp.exit(0);
    });
  });
}
