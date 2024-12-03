1. Head over to Spotify developer dashboard and make a new app to get Client Id and Client Secret

2. Make .env file in root and include :-
  CLIENT_ID=
  CLIENT_SECRET=
  REDIRECT_URI=http://localhost:8888/callback

3. use "npm install" to install dependencies
4. use "npm start" to run and test
5. use "npx electron-packager . Retrofy --platform=win32 --arch=x64 --out=dist --icon=icon.ico"
 to make executable(.exe) file
