const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const { exec } = require('child_process'); // To run the compiled AHK executable
require('dotenv').config();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8888;

let accessToken = null;
let refreshToken = null;

if (fs.existsSync('spotify-token.json')) {
  const tokenData = JSON.parse(fs.readFileSync('spotify-token.json'));
  accessToken = tokenData.accessToken;
  refreshToken = tokenData.refreshToken;
}

// Enable CORS for all origins
app.use(cors());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect to Spotify for OAuth authorization
app.get('/login', (req, res) => {
  const scopes = 'user-read-playback-state';
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&scope=${scopes}&redirect_uri=${process.env.REDIRECT_URI}`;
  res.redirect(authUrl);
});

// Callback to handle Spotify response after login
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    res.send('Error: No code found');
    return;
  }

  try {
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', qs.stringify({
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
      grant_type: 'authorization_code',
    }), {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    accessToken = tokenResponse.data.access_token;

    // Save token to a file
    fs.writeFileSync('spotify-token.json', JSON.stringify({
      accessToken: tokenResponse.data.access_token,
      refreshToken: tokenResponse.data.refresh_token,
      expiresIn: tokenResponse.data.expires_in,
    }));

    res.redirect('/controls.html');
  } catch (error) {
    console.error('Error during token exchange:', error.response ? error.response.data : error.message);
    res.send('Error during token exchange');
  }
});

// Function to send commands to the compiled AHK executable
function sendCommandToExecutable(command) {
  return new Promise((resolve, reject) => {
    const executablePath = path.join(__dirname, 'spotify_control.exe'); // Ensure the compiled .exe is in the same directory
    exec(`${executablePath} ${command}`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${stderr}`);
        reject(`Failed to execute command: ${command}`);
      } else {
        console.log(`Executable output: ${stdout}`);
        resolve(stdout.trim());
      }
    });
  });
}

// Refresh access token
async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', qs.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }), {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });

    accessToken = tokenResponse.data.access_token;
    console.log('Access token refreshed successfully');
  } catch (error) {
    console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
    throw new Error('Failed to refresh access token');
  }
}

// Middleware to ensure a valid access token
async function ensureValidAccessToken(req, res, next) {
  if (!accessToken) {
    res.status(401).send('Not authorized');
    return;
  }

  try {
    // Test the current access token
    await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    next();
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Token is expired; refresh it
      try {
        await refreshAccessToken();
        next();
      } catch (refreshError) {
        console.error('Error ensuring valid access token:', refreshError.message);
        res.status(500).send('Error refreshing access token');
      }
    } else {
      console.error('Error ensuring valid access token:', error.message);
      res.status(500).send('Error validating access token');
    }
  }
}

// Play/pause music
app.post('/playpause', async (req, res) => {
  try {
    const result = await sendCommandToExecutable('playpause');
    // Fetch the current state immediately
    const playbackInfo = await sendCommandToExecutable('fetch_state'); // Hypothetical command to fetch the current state
    res.json({ result, playbackInfo });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Skip to the next track
app.post('/next', async (req, res) => {
  try {
    const result = await sendCommandToExecutable('next');
    res.send(result);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Skip to the previous track
app.post('/previous', async (req, res) => {
  try {
    const result = await sendCommandToExecutable('previous');
    res.send(result);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Fetch playback state (only for UI updates)
app.get('/playback', async (req, res) => {
  if (!accessToken) {
    res.status(401).send('Not authorized');
    return;
  }

  try {
    const playbackResponse = await axios.get('https://api.spotify.com/v1/me/player', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });
    res.json(playbackResponse.data);
  } catch (error) {
    res.status(500).send('Error fetching playback info');
  }
});

// Check if an access token is available and valid
app.get('/check-token', async (req, res) => {
  if (!accessToken) {
    return res.json({ hasToken: false });
  }

  try {
    // Validate the current access token
    await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    res.json({ hasToken: true });
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Token is expired, try to refresh it
      try {
        await refreshAccessToken();
        res.json({ hasToken: true });
      } catch (refreshError) {
        console.error('Error refreshing access token:', refreshError.message);
        res.json({ hasToken: false });
      }
    } else {
      console.error('Error validating access token:', error.message);
      res.json({ hasToken: false });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
