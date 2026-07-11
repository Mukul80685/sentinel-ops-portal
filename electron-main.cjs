const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { ipcMain } = require('electron');
const ATTACH_DIR = path.join(app.getPath('userData'), 'ssacc-attachments');
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });
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

function showStartupError(title, message) {
  console.error(title, message);
  dialog.showErrorBox(title, message);
  app.quit();
}

function serveStatic(req, res) {
  const filePath = path.join(CLIENT_DIST, req.url.split('?')[0]);
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

async function startServer() {
  let serverEntry;
  try {
    serverEntry = await import('./dist/server/server.js');
  } catch (err) {
    throw new Error(
      `Could not load the application server bundle.\n\n` +
        `Expected file: ${path.join(__dirname, 'dist/server/server.js')}\n\n` +
        `${err?.message ?? err}`,
    );
  }

  const handler = serverEntry.default;
  if (!handler?.fetch) {
    throw new Error('The application server bundle is missing its fetch handler.');
  }

  let activePort = PREFERRED_PORT;

  server = http.createServer(async (req, res) => {
    // Serve static assets directly from dist/client
    if (req.url && (req.url.startsWith('/assets/') || req.url.startsWith('/home/'))) {
      if (serveStatic(req, res)) return;
    }

    // Also serve ssacc-logo.png and other root client files
    if (req.url && !req.url.startsWith('/api')) {
      if (serveStatic(req, res)) return;
    }

    // Everything else goes to the SSR handler
    const url = `http://127.0.0.1:${activePort}${req.url}`;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers[key] = Array.isArray(value) ? value.join(',') : value;
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, {
          method: req.method,
          headers,
          body: body && body.length > 0 ? body : undefined,
        });

        const response = await handler.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        const buffer = await response.arrayBuffer();
        res.end(Buffer.from(buffer));
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end('Server error');
      }
    });
  });

  const port = await listenOnAvailablePort(server, PREFERRED_PORT);
  activePort = port;
  console.log(`Server listening on port ${port}`);
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
  const dest = path.join(ATTACH_DIR, filePath.replace(/[/\\]/g, '_'));
  fs.writeFileSync(dest, Buffer.from(base64Data, 'base64'));
  return dest;
});
ipcMain.handle('attachment-load', async (_, filePath) => {
  const dest = path.join(ATTACH_DIR, filePath.replace(/[/\\]/g, '_'));
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest).toString('base64');
});
ipcMain.handle('attachment-delete', async (_, filePath) => {
  const dest = path.join(ATTACH_DIR, filePath.replace(/[/\\]/g, '_'));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    try {
      const port = await startServer();
      createWindow(port);
    } catch (err) {
      showStartupError(
        'SSACC failed to start',
        `${err?.message ?? err}\n\nIf another copy of SSACC is already running, close it and try again.`,
      );
    }
  });
}

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});