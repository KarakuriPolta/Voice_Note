require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');
const fs = require('fs');
const speech = require('@google-cloud/speech');
const WebSocket = require('ws');

const app = express();
const port = 3000;

// Google Cloud Speech-to-Text クライアント
const speechClient = new speech.SpeechClient();

app.use(cors());
app.use(express.json());

// ルートパス ('/') にアクセスがあったら index.html または credential-required.html を送信
app.get('/', (req, res) => {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) {
        // 認証情報ファイルのパスが設定されていなければ credential-required.html を返す
        return res.sendFile(path.join(__dirname, '../frontend/credential-required.html'));
    }
    if (!fs.existsSync(credPath)) {
        // 認証情報ファイルがなければ credential-required.html を返す
        return res.sendFile(path.join(__dirname, '../frontend/credential-required.html'));
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 静的ファイル配信はルートハンドラの後ろに置く
app.use(express.static(path.join(__dirname, '../frontend')));

function credentialPath() {
    const isPackaged = process.env.ELECTRON_IS_PACKAGED === "1";
    return isPackaged
        ? path.join(process.resourcesPath, 'google-credentials.json')
        : path.resolve(__dirname, './google-credentials.json');
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // 認証情報ファイルのパスを環境変数に設定
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath();
}

// サービスアカウントJSONアップロードAPI
app.post('/api/upload-credentials', (req, res) => {
    console.log('Google Cloud 認証情報ファイルのアップロードリクエストを受信');
    try {
        const json = req.body;
        console.log('アップロードされたJSON:', json);
        if (!json || typeof json !== 'object') {
            return res.status(400).json({ error: 'JSONパースエラー' });
        }
        fs.writeFileSync(credentialPath(), JSON.stringify(json, null, 2), { mode: 0o600 });
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('認証情報アップロード処理エラー:', e);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// /microphone-check にアクセスがあったら microphone-check.html を送信
app.get('/microphone-check', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/microphone-check.html'));
});

// Vertex AIのクライアント初期化を関数化
function getVertexAIClient() {
    let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath || !fs.existsSync(credPath)) {
        credPath = path.resolve(__dirname, './google-credentials.json');
        if (!fs.existsSync(credPath)) {
            throw new Error('認証情報ファイルが存在しません。設定画面からアップロードしてください。');
        }
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    }
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const vertexAI = new VertexAI({
        project: serviceAccount.project_id,
        location: location,
        googleAuthOptions: { credentials: serviceAccount },
    });
    return vertexAI;
}

app.post('/api/summarize', async (req, res) => {
    const transcript = req.body.transcript;
    const instruction = req.body.instruction;
    const highAccuracy = req.body.highAccuracy || false;
    console.log('Gemini 要約リクエストを受信:', transcript);
    if(instruction){
        console.log('追加の指定:', instruction);
    }
    if(highAccuracy){
        console.log('高精度モード: 有効');
    }

    if (!transcript) {
        return res.status(400).json({ error: '要約するテキストがありません。' });
    }

    let prompt = 'userプロンプトは音声を文字起こししたテキストです。この文章を、元の文章と同じ言語で要約してください。デフォルトの指定は以下のとおりです。\n箇条書きで出力する。また、出力は要約後の文のみにする。\n\n';
    if (instruction) {
        prompt += '以下は追加の指定です。デフォルトの指定と競合する場合、追加の指定を優先してください。\n' + instruction + '\n\n';
    }

    try {
        // Vertex AI Generative Language API で推論
        let vertexAI, generativeModel;
        try {
            vertexAI = getVertexAIClient();
            const modelName = highAccuracy ? 'gemini-2.5-pro' : 'gemini-2.5-flash-lite';
            console.log('使用モデル:', modelName);
            generativeModel = vertexAI.getGenerativeModel({
                model: modelName,
                systemInstruction: {
                    parts: [
                        {text: prompt}
                    ],
                },
            });
        } catch (e) {
            return res.status(500).json({ error: '認証情報ファイルが存在しません。設定画面からアップロードしてください。' });
        }
        const request = {
            contents: [{role: 'user', parts: [{text: transcript}]}],
        };
        console.log('Request: ', JSON.stringify(request));
        const result = await generativeModel.generateContent(request);
        const response = result.response;
        
        console.log('Response: ', JSON.stringify(response));

        const summary = response.candidates?.[0]?.content?.parts?.[0]?.text;

        if (summary) {
            res.json({ summary: summary });
        } else {
            console.error('Vertex AI からの要約結果がありません:', result);
            res.status(500).json({ error: '要約に失敗しました。' });
        }
    } catch (error) {
        console.error('Vertex AI API エラー:', error);
        res.status(500).json({ error: 'Vertex AI APIとの通信中にエラーが発生しました: ' + error.message });
    }
});

// WebSocket サーバーを作成
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (ws) => {
    console.log('WebSocket クライアントが接続しました');
    let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath || !fs.existsSync(credPath)) {
        credPath = path.resolve(__dirname, './google-credentials.json');
        if (!fs.existsSync(credPath)) {
            ws.send(JSON.stringify({ error: '認証情報ファイルが存在しません。設定画面からアップロードしてください。' }));
            ws.close();
            return;
        }
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    }

    // ストリーミング音声認識の設定
    const request = {
        config: {
            encoding: 'WEBM_OPUS', // クライアント側と統一
            sampleRateHertz: 16000,
            languageCode: 'ja-JP',
            enableAutomaticPunctuation: true,
        },
        interimResults: true, // 部分的な認識結果をリアルタイム送信
    };

    const recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
            console.error('音声認識エラー:', error);
            ws.send(JSON.stringify({ error: '音声認識エラーが発生しました' + error.message }));
        })
        .on('data', (data) => {
            const transcript = data.results
                .map((result) => result.alternatives[0].transcript)
                .join('\n');

            // 無音によるテキストリセットを検知
            if (data.results[0].isFinal) {
                ws.send(JSON.stringify({ reset: true }));
            }else{
                console.log('音声認識結果:', transcript);
                ws.send(JSON.stringify({ transcript }));
            }

        });

    // クライアントから音声データを受信
    ws.on('message', (message) => {
        recognizeStream.write(message);
    });

    ws.on('close', () => {
        console.log('WebSocket 接続が終了しました');
        recognizeStream.end();
    });
});

// サーバーの起動
app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log(`WebSocket server listening at ws://localhost:3001`);
});
