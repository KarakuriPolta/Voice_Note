require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path'); // path モジュールを追加
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// フロントエンドの静的ファイルを配信
app.use(express.static(path.join(__dirname, '../frontend')));

// ルートパス('/') にアクセスがあったら index.html を送信
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

app.post('/backend/summarize', async (req, res) => {
    const transcript = req.body.transcript;
    console.log('Gemini 要約リクエストを受信:', transcript);

    if (!transcript) {
        return res.status(400).json({ error: '要約するテキストがありません。' });
    }

    const prompt = `以下のテキストを要約してください。\n\n${transcript}`;

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

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});