const { app, BrowserWindow } = require("electron");
const path = require("path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1512,
    height: 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
  });

  win.loadFile("./excalidraw-app/dist/index.html");
};

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
