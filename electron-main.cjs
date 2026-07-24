const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { ipcMain } = require('electron');
const OPERATIONAL_STORE_KEY = 'ssacc_operational_store_v2';
/** Legacy app ports only — never probe 3737 (reserved for the live server). */
const LEGACY_PORTS = [3738, 3739, 3740, 3741, 3742, 3743, 3744, 3745, 3746];
let attachDir;
let persistFile;

function initUserDataPaths() {
  attachDir = path.join(app.getPath('userData'), 'ssacc-attachments');
  persistFile = path.join(app.getPath('userData'), 'ssacc-local-storage.json');
  if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });
}
let mainWindow;
let server;

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

const CLIENT_DIST = path.join(__dirname, 'dist/client');
const PREFERRED_PORT = 3737;
const PORT_ATTEMPTS = 10;

async function listenStrictPortWithRetry(server, port, attempts = 5) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await listenStrictPort(server, port);
    } catch (err) {
      lastError = err;
      if (err?.code !== 'EADDRINUSE' || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError;
}

function listenStrictPort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function listenOnAvailablePort(server, startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    const tryListen = () => {
      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && port < startPort + PORT_ATTEMPTS - 1) {
          port += 1;
          tryListen();
          return;
        }
        reject(err);
      };

      const onListening = () => {
        server.off('error', onError);
        resolve(port);
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };

    tryListen();
  });
}

function readPersistEnvelope() {
  try {
    if (!fs.existsSync(persistFile)) return null;
    const raw = fs.readFileSync(persistFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch (err) {
    console.error('[persist-read-file]', err);
    return null;
  }
}

function writePersistEnvelope(data) {
  const savedAt = new Date().toISOString();
  const payload = { savedAt, data };
  const tmp = `${persistFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, persistFile);
  return payload;
}

function persistHasUserManagedStore(envelope) {
  if (!envelope?.data?.[OPERATIONAL_STORE_KEY]) return false;
  try {
    const ds = JSON.parse(envelope.data[OPERATIONAL_STORE_KEY]);
    return !!ds.userManaged;
  } catch {
    return false;
  }
}

function scoreLocalStorageSnapshot(data) {
  if (!data || typeof data !== 'object') return 0;
  let score = Object.keys(data).length;
  const raw = data[OPERATIONAL_STORE_KEY];
  if (!raw) return score;
  try {
    const ds = JSON.parse(raw);
    if (ds.userManaged) score += 10_000;
    if (Array.isArray(ds.units) && ds.units.length > 0) score += ds.units.length * 10;
    if (Array.isArray(ds.equipment)) score += ds.equipment.length;
  } catch {
    /* ignore */
  }
  return score;
}

function listenOnce(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function readLegacyLocalStorageFromPort(port) {
  const probeServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>SSACC migrate</title></head><body></body></html>');
  });

  let probeWindow;
  try {
    await listenOnce(probeServer, port);
    probeWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    await Promise.race([
      probeWindow.loadURL(`http://127.0.0.1:${port}/`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('legacy probe timeout')), 4000)),
    ]);
    const snapshot = await probeWindow.webContents.executeJavaScript(`(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
      return data;
    })()`);

    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch (err) {
    console.warn(`[legacy-migrate] port ${port}:`, err?.message ?? err);
    return null;
  } finally {
    if (probeWindow && !probeWindow.isDestroyed()) probeWindow.destroy();
    await new Promise((resolve) => probeServer.close(resolve));
  }
}

async function migrateLegacyLocalStorageIfNeeded() {
  if (!app.isPackaged) return;

  const existing = readPersistEnvelope();
  // Never overwrite an on-disk snapshot once operational data exists (seed, user edits, or restore flush).
  if (existing?.data?.[OPERATIONAL_STORE_KEY]) return;
  if (persistHasUserManagedStore(existing)) return;

  let bestSnapshot = existing?.data ?? null;
  let bestScore = scoreLocalStorageSnapshot(bestSnapshot);

  for (const port of LEGACY_PORTS) {
    const snapshot = await readLegacyLocalStorageFromPort(port);
    const score = scoreLocalStorageSnapshot(snapshot);
    if (score > bestScore) {
      bestSnapshot = snapshot;
      bestScore = score;
    }
  }

  if (!bestSnapshot || bestScore === 0) return;

  try {
    writePersistEnvelope(bestSnapshot);
    console.log(`[legacy-migrate] Copied ${Object.keys(bestSnapshot).length} localStorage keys to ${persistFile}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  } catch (err) {
    console.error('[legacy-migrate]', err);
  }
}

function scheduleLegacyMigration() {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void migrateLegacyLocalStorageIfNeeded();
  }, 2500);
}

function showStartupError(title, message) {
  console.error(title, message);
  dialog.showErrorBox(title, message);
  app.quit();
}

function resolveClientFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relativePath = decoded.replace(/^\/+/, '');
  const filePath = path.join(CLIENT_DIST, relativePath);
  if (!filePath.startsWith(CLIENT_DIST)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  return null;
}

async function startStaticServer() {
  const spaShell = path.join(CLIENT_DIST, '_shell.html');
  if (!fs.existsSync(spaShell)) {
    throw new Error(
      `Missing SPA shell at ${spaShell}.\n\nRun "npm run build" before launching or packaging the EXE.`,
    );
  }

  server = http.createServer((req, res) => {
    const staticFile = resolveClientFile(req.url);
    if (staticFile) {
      const ext = path.extname(staticFile);
      const mime =
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(staticFile).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(spaShell).pipe(res);
  });

  const port = app.isPackaged
    ? await listenStrictPortWithRetry(server, PREFERRED_PORT)
    : await listenOnAvailablePort(server, PREFERRED_PORT);
  console.log(`Static server listening on port ${port}`);
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    scheduleLegacyMigration();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === `http://127.0.0.1:${port}/` || validatedURL === `http://localhost:${port}/`) {
      showStartupError(
        'SSACC failed to load',
        `The local application server could not be reached on port ${port}.\n\n${errorDescription} (${errorCode})`,
      );
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => (mainWindow = null));
}
ipcMain.handle('attachment-save', async (_, filePath, base64Data) => {
  const dest = path.join(attachDir, filePath.replace(/[/\\]/g, '_'));
  fs.writeFileSync(dest, Buffer.from(base64Data, 'base64'));
  return dest;
});
ipcMain.handle('attachment-load', async (_, filePath) => {
  const dest = path.join(attachDir, filePath.replace(/[/\\]/g, '_'));
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest).toString('base64');
});
ipcMain.handle('attachment-delete', async (_, filePath) => {
  const dest = path.join(attachDir, filePath.replace(/[/\\]/g, '_'));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
});

ipcMain.handle('persist-read', async () => {
  return readPersistEnvelope();
});

ipcMain.handle('persist-write', async (_, payload) => {
  try {
    if (!payload || typeof payload !== 'object' || !payload.data) return false;
    const tmp = `${persistFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmp, persistFile);
    return true;
  } catch (err) {
    console.error('[persist-write]', err);
    return false;
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  dialog.showErrorBox(
    'SSACC already running',
    'Another SSACC window is already open. Close it and try again.',
  );
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    initUserDataPaths();
    try {
      const port = await startStaticServer();
      createWindow(port);
    } catch (err) {
      const message =
        err?.code === 'EADDRINUSE'
          ? `Port ${PREFERRED_PORT} is already in use.\n\nClose any other SSACC window and try again. Running multiple copies can cause data to appear missing.`
          : `${err?.message ?? err}\n\nIf another copy of SSACC is already running, close it and try again.`;
      showStartupError('SSACC failed to start', message);
    }
  });
}

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});