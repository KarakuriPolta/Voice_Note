const { app, BrowserWindow } = require("electron");
const path = require("path");
const url = require("url");

process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";
// サーバーを起動する
require("./server");

let mainWindow;

function createWindow() {
    // ブラウザウィンドウを作成
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // アプリケーションのメインページを読み込む
    mainWindow.loadURL("http://localhost:3000");

    // 開発ツールを開く場合
    // mainWindow.webContents.openDevTools();

    // ウィンドウが閉じられたときの処理
    mainWindow.on("closed", function () {
        mainWindow = null;
    });
}

// Electronの初期化完了時に実行
app.on("ready", createWindow);

// すべてのウィンドウが閉じられたときの処理
app.on("window-all-closed", function () {
    // macOSの場合はユーザーがCmd + Qで明示的に終了するまでアプリケーションを終了しない
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", function () {
    // macOSの場合、ドックアイコンクリック時にウィンドウがなければ再作成
    if (mainWindow === null) {
        createWindow();
    }
});
