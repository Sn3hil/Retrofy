const { app, BrowserWindow } = require('electron');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process'); // For running the server

let mainWindow;
let serverProcess; // Store server process

app.on('ready', () => {
  // Start the server when the app is ready
  startServer();

  // Create the Electron window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    zoomfactor:1.5,
    frame: false, // Removes the title bar and window borders
    titleBarStyle: 'hidden', // Hides the title bar completely
    autoHideMenuBar: true, // Hides the menu bar (File, Edit, etc.)
    transparent: false, // Make the background transparent if desired
    resizable: true, // Allow resizing the window
    fullscreen: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Disable web security (CORS)
    },
  });

  checkAccessToken();
  
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.setZoomFactor(1.5);
    mainWindow.webContents.insertCSS(`
      body {
        -webkit-app-region: drag; /* Enable dragging for the entire window */
        overflow: hidden; /* Prevent scrollbars from appearing */
      }
      button, a, input, select, textarea {
        -webkit-app-region: no-drag; /* These elements won't be draggable */
      }
      html, body {
        height: 100%;
        width: 100%;
        overflow: hidden;
        margin: 0;
        padding: 0;
      }
    `);
  });
});

async function checkAccessToken() {
  try {
    const response = await axios.get('http://localhost:8888/check-token');
    if (response.data.hasToken) {
      mainWindow.loadURL(`file://${path.join(__dirname, 'controls.html')}`);
    } else {
      mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
    }
  } catch (error) {
    console.error('Error checking token:', error.message);
    mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
  }
}

function startServer() {
  if (serverProcess) return; // Prevent starting multiple instances of the server

  // Start the server process
  try {
    serverProcess = spawn('node', ['server.js'], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(__dirname),
      shell: false,
    });

    // Listen for when the server process exits
    serverProcess.on('close', (code) => {
      console.log(`Server stopped with code ${code}`);
      serverProcess = null; // Reset serverProcess after it stops
    });

    // Listen for any error in the server process
    serverProcess.on('error', (err) => {
      console.error('Error starting the server:', err);
      serverProcess = null;
    });
  } catch (error) {
    console.error('Error starting server process:', error);
    serverProcess = null; // Reset in case of error
  }

  serverProcess.unref(); // Ensure the parent process doesn’t wait for the server process to exit

}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Kill the server process when the app is closed
    if (serverProcess) {
      serverProcess.kill();
    }
    app.quit();
  }
});
