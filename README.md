# Web-based Terminal Gateway

A secure, high-fidelity Web Terminal Gateway that lets you access your macOS terminal directly from a premium glassmorphic webpage hosted on GitHub Pages. It runs a lightweight Node.js backend using native macOS pseudo-terminals (`node-pty`) to bridge your shell (e.g. `zsh`) over WebSockets.

---

## Key Features

- 💎 **Premium Glassmorphic Design:** Glowing indicators, smooth transition micro-animations, and full-screen terminal scaling.
- 🎨 **Dynamic Color Themes:** Choose between Monokai Obsidian, Cyberpunk Neon, Retro Amber, Matrix Green, and Sleek Chalk.
- 🔒 **Token-Based Authentication:** An auto-generated cryptographically secure token prevents unauthorized shell access.
- 🐚 **Native macOS PTY:** Spawns a full `/bin/zsh` login shell, ensuring your environment paths, active command-line tools (such as the Antigravity CLI), and homebrew configurations are fully loaded.
- 📐 **Dynamic Window Resizing:** Adjusts the rows and columns of your terminal session dynamically when you resize your browser.

---

## 🛠️ Backend Setup & Startup

To run the backend terminal server on your Mac user account:

1. **Open your local terminal and navigate to the project directory:**
   ```bash
   cd /Users/ssh/.gemini/antigravity-ide/scratch/web-terminal-gateway
   ```

2. **Install the dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```

   When started, the server will output a secure random access token and connection URLs:
   ```text
   ============================================================
         🚀 WEB-BASED TERMINAL GATEWAY BACKEND IS READY 🚀      
   ============================================================
     Listening on    : ws://0.0.0.0:8080
     Access Token    : 4b3d84f9a0c12e88a38b1d92723c4aef
   ============================================================
   ```

---

## 🌐 Frontend Deployment on GitHub Pages

Because the frontend is a single, self-contained `index.html` file, hosting it on GitHub Pages is incredibly simple:

1. **Create a new GitHub repository:**
   - Log in to your GitHub account and create a new repository (e.g. named `terminal` or `terminal-gateway`). Make it **Public** or **Private** (GitHub Pages supports private repositories on paid plans, but a public repository works instantly for standard accounts).

2. **Upload the `index.html` file:**
   - Push or upload `/Users/ssh/.gemini/antigravity-ide/scratch/web-terminal-gateway/index.html` as the main `index.html` in your new repository's root.
   - Alternatively, use the command line:
     ```bash
     git init
     git add index.html
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/your-username/your-repo-name.git
     git push -u origin main
     ```

3. **Enable GitHub Pages:**
   - Go to your repository settings in GitHub.
   - Scroll down to the **Pages** section on the left sidebar.
   - Under **Build and deployment**, set the source to **Deploy from a branch**.
   - Under **Branch**, select `main` (or whichever branch you pushed to) and `/ (root)` folder, then click **Save**.
   - After a minute, GitHub will publish your site to:
     `https://<your-username>.github.io/<your-repo-name>/`

---

## 🔌 Connection Modes

### 1. Same-Mac Access (Local Connection)
If you are opening your GitHub Pages site from the *same* Mac that is running the backend server:
- **Host URL:** `ws://127.0.0.1:8080`
- **Access Token:** Paste the token printed by the server on startup.
- Click **Connect**.

> [!NOTE]
> Modern web browsers allow HTTPS websites (like GitHub Pages) to connect to `ws://127.0.0.1` or `ws://localhost` directly because localhost is treated as a secure context, bypassing standard mixed-content restrictions.

---

### 2. Remote Access (Connect from iPad, Phone, or another Computer)
If you want to access your Mac terminal from outside your local network (e.g., while traveling, using an iPad, or behind a home router/NAT):
The browser will block unencrypted `ws://` connections to external IPs from an HTTPS site. You must use a secure public tunnel that provides a `wss://` (WebSocket Secure) connection.

#### Option A: Using `ngrok` (Recommended & Simple)
1. Install ngrok on your Mac:
   ```bash
   brew install ngrok/ngrok/ngrok
   ```
2. Authenticate your ngrok account (follow the instructions on [ngrok.com](https://ngrok.com)).
3. Start the secure tunnel pointing to your terminal server's port (`8080`):
   ```bash
   ngrok http 8080
   ```
4. ngrok will display a public secure forwarding address:
   `https://xxxx-xx-xx-xx.ngrok-free.app`
5. In your GitHub Pages page:
   - Set **Host** to: `wss://xxxx-xx-xx-xx.ngrok-free.app` (Notice the **`wss://`** protocol).
   - Paste the Access Token.
   - Click **Connect**.

#### Option B: Using `Cloudflare Tunnel` (Highly Secure & Free)
1. Install Cloudflare tunnel client (`cloudflared`):
   ```bash
   brew install cloudflared
   ```
2. Start a quick tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
3. Cloudflare will print a secure URL:
   `https://your-unique-subdomain.trycloudflare.com`
4. In your GitHub Pages page:
   - Set **Host** to: `wss://your-unique-subdomain.trycloudflare.com` (Notice the **`wss://`** protocol).
   - Paste the Access Token.
   - Click **Connect**.

---

## 🔒 Security Best Practices

- **Never share your access token:** Anyone with access to your active token and socket server has full access to your Mac user account, including command execution, file system control, and SSH keys.
- **Stop the server when not in use:** Simply press `Ctrl + C` in your Mac's terminal to terminate the server.
- **Run inside a dedicated user space:** It is highly recommended to run this on your newly created separate user account (as you did), which limits access to your main account's private files.
