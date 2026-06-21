const http = require('http');
const crypto = require('crypto');
const ws = require('ws');
const pty = require('node-pty');

// Configuration
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
// Generate a cryptographically secure token or use one provided by environment
const ACCESS_TOKEN = process.env.TERMINAL_TOKEN || crypto.randomBytes(16).toString('hex');
const PIN = process.env.PIN || '1234';
const GITHUB_PAT = process.env.GITHUB_PAT || '';
const GIST_ID = process.env.GIST_ID || '';
const START_TUNNEL = process.env.START_TUNNEL !== 'false';

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
  if (GITHUB_PAT && GIST_ID) {
    console.log('  Gist Sync       : Enabled (Auto-syncing to GitHub Gist)');
  }
  console.log(line);
  console.log('\n  👉 HOW TO CONNECT:');
  console.log('  1. Open your terminal page hosted on GitHub Pages.');
  console.log(`  2. Enter your PIN: ${PIN}`);
  console.log('  3. The page will auto-fetch credentials and connect.');
  console.log('\n  🔒 SECURITY NOTICE:');
  console.log('  Keep your PIN and GITHUB_PAT private.');
  console.log(line + '\n');
}

// Encryption function
function encryptConfig(url, token, pin) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const text = JSON.stringify({ url, token });
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag,
    encrypted: encrypted
  }, null, 2);
}

// Gist Upload Function
async function uploadToGist(encryptedData) {
  if (!GITHUB_PAT) {
    console.log('[Auto-Sync] GITHUB_PAT not set. Skipping Gist upload.');
    return;
  }
  
  const gistContent = {
    description: "Web Terminal Gateway Auto-Config",
    files: {
      "gateway-config.json": {
        content: encryptedData
      }
    }
  };

  try {
    let endpoint = 'https://api.github.com/gists';
    let method = 'POST';
    if (GIST_ID) {
      endpoint += '/' + GIST_ID;
      method = 'PATCH';
    }

    const response = await fetch(endpoint, {
      method: method,
      headers: {
        'Authorization': `token ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gistContent)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ [Auto-Sync] Successfully synced encrypted config to Gist!`);
      if (!GIST_ID) {
        console.log(`\n❗ IMPORTANT: A new Gist was created. Add this to your environment variables:`);
        console.log(`   GIST_ID=${data.id}\n`);
      }
    } else {
      console.error(`❌ [Auto-Sync] Failed to sync to Gist: ${response.status} ${response.statusText}`);
      console.error(await response.text());
    }
  } catch (err) {
    console.error(`❌ [Auto-Sync] Error uploading to Gist:`, err.message);
  }
}

// Tunnel Runner
function startTunnel() {
  const { spawn } = require('child_process');
  console.log(`[Tunnel] Starting Cloudflare tunnel on port ${PORT}...`);
  const cloudflared = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`]);

  cloudflared.stderr.on('data', (data) => {
    const output = data.toString();
    // process.stdout.write(output); // Uncomment to debug cloudflared
    
    // Look for the trycloudflare URL
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const httpsUrl = match[0];
      const wssUrl = httpsUrl.replace('https://', 'wss://');
      console.log(`\n🌐 [Tunnel] Cloudflare Tunnel Ready: ${wssUrl}`);
      
      // Auto-sync
      console.log(`[Auto-Sync] Encrypting connection details with PIN...`);
      const encryptedData = encryptConfig(wssUrl, ACCESS_TOKEN, PIN);
      uploadToGist(encryptedData);
    }
  });

  cloudflared.on('close', (code) => {
    console.log(`[Tunnel] Cloudflare tunnel exited with code ${code}`);
  });
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
          const fs = require('fs');
          let shell = process.env.SHELL || '/bin/zsh';
          if (!fs.existsSync(shell)) {
            shell = '/bin/zsh';
          }
          if (!fs.existsSync(shell)) {
            shell = '/bin/bash';
          }
          if (!fs.existsSync(shell)) {
            shell = 'sh';
          }

          const args = shell.includes('zsh') ? ['-l'] : [];

          let cwd = process.env.HOME || '/Users/ssh';
          if (!fs.existsSync(cwd)) {
            cwd = '/';
          }

          ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-256color',
            cols: parsed.cols || 80,
            rows: parsed.rows || 24,
            cwd: cwd,
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
  if (START_TUNNEL) {
    startTunnel();
  }
});
