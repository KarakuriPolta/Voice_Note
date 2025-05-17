# Call Assistant (ブラウザ版)

このプロジェクトは、通話対応を補助するソフトウェアのブラウザ版です。

## セットアップ

1.  Node.jsがインストールされていることを確認してください。
2.  プロジェクトをクローンまたはダウンロードします。
3.  `call-assistant/backend` フォルダに移動し、以下のコマンドを実行して依存関係をインストールします。
    ```bash
    cd call-assistant/backend
    npm install
    ```
4.  `call-assistant/backend` フォルダに `.env` ファイルを作成し、Gemini API のキーを設定します。
    ```
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    ```
5.  バックエンドサーバーを起動します。
    ```bash
    npm start
    ```
6.  ブラウザで `http://localhost:3000` にアクセスします。

## 注意事項

* 文字起こしは Google Cloud Speech-to-Text API を使用して行われます。Google Cloud Platform のプロジェクトが必要で、一定以上の利用で課金が発生します。
* 要約機能は Google Gemini API (モデル: gemini-2.0-flash) を利用します。
* エラー処理やUIの改善は今後の課題です。
* APIキーは安全に管理してください。

## 今後の開発

* 設定画面の機能拡充（言語設定など）
* UIの改善とレスポンシブ対応の強化
* エラー処理の追加