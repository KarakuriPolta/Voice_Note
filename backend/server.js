require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const { v1p1beta1 } = require('@google-cloud/speech');
const WebSocket = require('ws');

const app = express();
const port = 3000;

// Google Cloud Speech-to-Text クライアント
const speechClient = new v1p1beta1.SpeechClient();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ルートパス ('/') にアクセスがあったら index.html を送信
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// /microphone-check にアクセスがあったら microphone-check.html を送信
app.get('/microphone-check', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/microphone-check.html'));
});

// Gemini API クライアントを初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

app.post('/api/summarize', async (req, res) => {
    const transcript = req.body.transcript;
    const instruction = req.body.instruction;
    console.log('Gemini 要約リクエストを受信:', transcript);
    if(instruction){
        console.log('追加の指定:', instruction);
    }

    if (!transcript) {
        return res.status(400).json({ error: '要約するテキストがありません。' });
    }

    let prompt = '音声を文字起こししたテキストを要約してください。デフォルトの指定は以下のとおりです。\n箇条書きで出力する。また、出力は要約後の文のみにする。\n\n';
    if (instruction) {
        prompt += '以下は追加の指定です。デフォルトの指定と競合する場合、追加の指定を優先してください。\n' + instruction + '\n\n';
    }
    prompt += '以降がテキスト本文です。要約してください。' + transcript;

    try {
        const result = await model.generateContent([prompt]);
        const response = await result.response;
        const summary = response.candidates?.[0]?.content?.parts?.[0]?.text;

        if (summary) {
            res.json({ summary: summary });
        } else {
            console.error('Gemini からの要約結果がありません:', response);
            res.status(500).json({ error: '要約に失敗しました。' });
        }
    } catch (error) {
        console.error('Gemini API エラー:', error);
        res.status(500).json({ error: 'Gemini APIとの通信中にエラーが発生しました: ' + error.message });
    }
});

// WebSocket サーバーを作成
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (ws) => {
    console.log('WebSocket クライアントが接続しました');
    const isPackaged = process.env.ELECTRON_IS_PACKAGED === "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = isPackaged 
    ? path.join(process.resourcesPath, 'google-credentials.json')
    : path.resolve(__dirname, './google-credentials.json');

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
