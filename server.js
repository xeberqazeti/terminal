const http = require('http');
const crypto = require('crypto');
const ws = require('ws');
const pty = require('node-pty');

// Configuration
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
// Generate a cryptographically secure token or use one provided by environment
const ACCESS_TOKEN = process.env.TERMINAL_TOKEN || crypto.randomBytes(16).toString('hex');

// Create standard HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Web Terminal Gateway Backend is Running.\n');
});

// Attach WebSocket server
const wss = new ws.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (wsConnection) => {
    wss.emit('connection', wsConnection, request);
  });
});

// Startup Banner
function printStartupBanner() {
  const line = '='.repeat(60);
  console.log('\n' + line);
  console.log('      🚀 WEB-BASED TERMINAL GATEWAY BACKEND IS READY 🚀      ');
  console.log(line);
  console.log(`  Listening on    : ws://${HOST}:${PORT}`);
  console.log(`  Access Token    : ${ACCESS_TOKEN}`);
  console.log(line);
  console.log('\n  👉 HOW TO CONNECT:');
  console.log('  1. Open your terminal page hosted on GitHub Pages.');
  console.log(`  2. Set Connection URL to: ws://127.0.0.1:${PORT} (or your tunnel URL)`);
  console.log(`  3. Paste the Access Token above into the configuration.`);
  console.log('  4. Click "Connect" to start.');
  console.log('\n  🔒 SECURITY NOTICE:');
  console.log('  Keep this Access Token private. Anyone with this token can');
  console.log('  execute arbitrary shell commands on this Mac account.');
  console.log(line + '\n');
}

// Handle WebSocket connections
wss.on('connection', (socket, request) => {
  const ip = request.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] New connection attempt from ${ip}`);

  let isAuthenticated = false;
  let ptyProcess = null;

  // Enforce an authentication timeout of 5 seconds
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log(`[${new Date().toISOString()}] Authentication timeout for ${ip}`);
      socket.send(JSON.stringify({ type: 'error', message: 'Authentication timeout' }));
      socket.close();
    }
  }, 5000);

  socket.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);

      // Handle Authentication
      if (parsed.type === 'auth') {
        if (parsed.token === ACCESS_TOKEN) {
          isAuthenticated = true;
          clearTimeout(authTimeout);
          console.log(`[${new Date().toISOString()}] Client successfully authenticated from ${ip}`);
          socket.send(JSON.stringify({ type: 'auth_success' }));

          // Spawn the pseudo-terminal shell (zsh -l for login shell to inherit all path variables)
          const shell = process.env.SHELL || '/bin/zsh';
          const args = shell.includes('zsh') ? ['-l'] : [];

          ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-256color',
            cols: parsed.cols || 80,
            rows: parsed.rows || 24,
            cwd: process.env.HOME || '/Users/ssh',
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor'
            }
          });

          // Pipe PTY output to WebSocket
          ptyProcess.onData((data) => {
            if (socket.readyState === ws.OPEN) {
              socket.send(JSON.stringify({ type: 'data', data }));
            }
          });

          // Handle PTY termination
          ptyProcess.onExit(({ exitCode, signal }) => {
            console.log(`[${new Date().toISOString()}] Shell process exited with code ${exitCode}, signal ${signal}`);
            socket.send(JSON.stringify({ type: 'system', message: `Shell exited with code ${exitCode}` }));
            socket.close();
          });

        } else {
          console.log(`[${new Date().toISOString()}] Invalid token attempt from ${ip}`);
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid Access Token' }));
          socket.close();
        }
        return;
      }

      // Beyond this point, require authentication
      if (!isAuthenticated) {
        socket.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        socket.close();
        return;
      }

      // Handle Terminal Data (Keystrokes/Commands)
      if (parsed.type === 'data' && ptyProcess) {
        ptyProcess.write(parsed.data);
      }

      // Handle Terminal Resizing
      if (parsed.type === 'resize' && ptyProcess) {
        const { cols, rows } = parsed;
        if (cols && rows) {
          ptyProcess.resize(cols, rows);
        }
      }

    } catch (err) {
      console.error('Error handling message:', err);
      socket.send(JSON.stringify({ type: 'error', message: 'Malformed message' }));
    }
  });

  socket.on('close', () => {
    console.log(`[${new Date().toISOString()}] Connection closed for ${ip}`);
    clearTimeout(authTimeout);
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (err) {
        // Process might already be dead
      }
    }
  });

  socket.on('error', (err) => {
    console.error(`Socket error for ${ip}:`, err);
  });
});

// Start Server
server.listen(PORT, HOST, () => {
  printStartupBanner();
});
