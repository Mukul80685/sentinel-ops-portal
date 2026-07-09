const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

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
  const serverEntry = await import('./dist/server/server.js');
  const handler = serverEntry.default;

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
    const url = `http://localhost:3737${req.url}`;
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

  await new Promise((resolve) => server.listen(3737, resolve));
  console.log('Server listening on port 3737');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3737');
    mainWindow.webContents.openDevTools();
  }, 3000);

  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start server:', err);
  }
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});