
# Call Assistant (Electron版)

通話内容の文字起こし・要約を支援するデスクトップアプリ（Electron製）

---

## 機能概要

- Google Cloud Speech-to-Text APIによるリアルタイム音声認識
- Google Gemini (Vertex AI) APIによる要約生成
- サービスアカウントJSONアップロード・設定画面
- Windows向けインストーラ生成対応

---

## セットアップ・起動方法

1. **Node.js v18以上**をインストール
2. このリポジトリをクローン
3. `backend` ディレクトリで依存関係をインストール
   ```pwsh
   cd backend
   npm install
   ```
4. Google CloudのサービスアカウントJSONを `backend/google-credentials.json` に配置（またはアプリ設定画面からアップロード）
5. Electronアプリを起動
   ```pwsh
   npm start
   ```

---

## ビルド方法（Windows向けインストーラ作成）

`backend` ディレクトリで以下を実行：

```pwsh
npx electron-builder
```

`dist/` フォルダに `Call Assistant Setup.exe` などのインストーラが生成される。

---

## 主要ディレクトリ構成

- `backend/` ... Electron本体・Nodeサーバ・API
- `frontend/` ... UI（HTML/JS/CSS）

---

## 注意事項

- Google Cloud Speech-to-Text, Gemini APIの利用にはGCPプロジェクト・課金設定が必要
- 利用料金はGoogle公式ドキュメントを参照
- サービスアカウントJSONは厳重に管理すること

---

## 詳細なセットアップ手順

Google CloudのAPI有効化・サービスアカウント作成手順は `frontend/setup.html` を参照

---

## ライセンス

このソフトウェアはMITライセンスで提供されます。