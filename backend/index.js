const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const axios = require("axios");
const path = require("path");
const url = require("url");

process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";
const packageJson = require("./package.json");
// サーバーを起動する
require("./server");

let mainWindow;


async function checkForUpdates() {
    try {
        const res = await axios.get(
            "https://api.github.com/repos/KarakuriPolta/Call_Assistant/releases/latest",
            { headers: { 'Accept': 'application/vnd.github+json' } }
        );
        const latest = res.data.tag_name || res.data.name;
        const current = packageJson.version;
        // v1.2.3 → 1.2.3
        const normalize = v => v.replace(/^v/, '');
        if (normalize(latest) !== normalize(current)) {
            return { update: true, latest, url: res.data.html_url };
        }
    } catch (e) {
        // 失敗時は何もしない
    }
    return { update: false };
}

async function createWindow() {
    // ブラウザウィンドウを作成
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
// バージョン情報をRendererに渡すipc
ipcMain.handle('get-app-version', () => {
    return packageJson.version;
});

    // アプリケーションのメインページを読み込む
    mainWindow.loadURL("http://localhost:3000");

    // 開発ツールを開く場合
    // mainWindow.webContents.openDevTools();

    // ウィンドウが閉じられたときの処理
    mainWindow.on("closed", function () {
        mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // 起動時にGitHubリリースを確認
    const updateInfo = await checkForUpdates();
    if (updateInfo.update) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'アップデートのお知らせ',
            message: `新しいバージョン(${updateInfo.latest})が利用可能です。\n最新版をGitHub Releasesからダウンロードしてください。`,
            detail: updateInfo.url,
            buttons: ['ダウンロードページを開く', '閉じる'],
            defaultId: 0,
            cancelId: 1
        }).then(result => {
            if (result.response === 0) {
                shell.openExternal(updateInfo.url);
            }
        });
    }
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
