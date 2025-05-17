document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const summarizeButton = document.getElementById('summarizeButton');
    const transcriptionArea = document.getElementById('transcriptionArea');
    const summaryArea = document.getElementById('summaryArea');
    const statusMessage = document.getElementById('statusMessage');
    const settingsButton = document.getElementById('settingsButton');
    const settingsModal = document.getElementById('settingsModal');
    const closeButton = document.querySelector('.close-button');
    const saveSettingsButton = document.getElementById('saveSettings');
    const languageSelect = document.getElementById('language');
    const microphoneSelect = document.getElementById('microphone');
    const audioLevelDiv = document.getElementById('audioLevel');
    const apiDescription = document.getElementById('apiDescription');
    const summaryInstructionArea = document.getElementById('summaryInstructionArea');

    let audioContext;
    let analyser;
    let microphoneStream;
    let recognition;
    let mediaRecorder;
    let recordedChunks = [];
    let transcribedText = '';
    let selectedMicrophoneId = '';
    let microphoneListPopulated = false;
    let socket;
    let transcribedBuffer = '';
    let resetted = false;
    let summarizeInstrustion = localStorage.getItem('summarizeInstrustion') || '';

    let interimTranscript = '';
    let finalTranscript = '';

    audioLevelDiv.style.setProperty('--level-width', '0');

    async function populateMicrophoneList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            microphoneSelect.innerHTML = '<option value="">既定のマイク</option>';

            audioInputDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `マイク ${microphoneSelect.options.length}`;
                microphoneSelect.appendChild(option);
            });

            const savedMicrophoneId = localStorage.getItem('selectedMicrophoneId');
            if (savedMicrophoneId) {
                microphoneSelect.value = savedMicrophoneId;
                selectedMicrophoneId = savedMicrophoneId;
            }
            microphoneListPopulated = true;

        } catch (error) {
            console.error('マイクデバイスの列挙エラー:', error);
            statusMessage.textContent = 'マイクデバイスの取得に失敗しました。';
        }
    }

    async function startMicrophone(deviceId) {
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
            analyser = null;
        }

        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            microphoneStream = stream;

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 2048;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function updateAudioLevel() {
                if (!analyser) return;
                analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0 - 1.0;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / bufferLength);
                const level = Math.max(0, Math.min(1, rms * 2));

                if (audioLevelDiv) {
                    audioLevelDiv.style.setProperty('--level-width', `${level * 100}%`);
                }
                requestAnimationFrame(updateAudioLevel);
            }

            updateAudioLevel();

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(event.data);
                }
            };

        } catch (error) {
            console.error('マイクへのアクセスエラー:', error);
            statusMessage.textContent = 'マイクへのアクセスが拒否されました。設定で許可されているか確認してください。';
        }
    }

    settingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
        populateMicrophoneList();
    });

    closeButton.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    saveSettingsButton.addEventListener('click', () => {
        selectedMicrophoneId = microphoneSelect.value;
        localStorage.setItem('selectedMicrophoneId', selectedMicrophoneId);

        summarizeInstrustion = summaryInstructionArea.value;
        localStorage.setItem('summarizeInstrustion', summarizeInstrustion);

        statusMessage.textContent = '設定を保存しました';
        settingsModal.style.display = 'none';
    });

    startButton.addEventListener('click', async () => {
        const constraints = {
            audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true,
            video: false
        };
        recordedChunks = [];
        await startMicrophone(selectedMicrophoneId);
        resetted = false;
        socket = new WebSocket('ws://localhost:3001');
        socket.onopen = () => {
            mediaRecorder.start(100); // 100msごとにデータを送信
            statusMessage.textContent = '録音中...';
            startButton.disabled = true;
            stopButton.disabled = false;
            summarizeButton.disabled = true;
        };
        socket.onmessage = (event) => {
            console.log('WebSocketメッセージ:', event.data);
            const data = JSON.parse(event.data);
            if(data.reset){
                resetted = true;
                transcribedBuffer += transcribedText + '\n';
                transcriptionArea.textContent = transcribedBuffer;
            }else if (data.transcript) {
                // リセット後に全く同じ内容で送られることがある。その場合は無視する
                if(transcribedText !== data.transcript){
                    resetted = false;
                    transcriptionArea.textContent = transcribedBuffer + data.transcript;
                    transcribedText = data.transcript;
                }
            }
        };
        socket.onerror = (error) => {
            console.error('WebSocketエラー:', error);
            statusMessage.textContent = 'WebSocketエラーが発生しました。';
        };
        socket.onclose = () => {
            statusMessage.textContent = 'WebSocket接続が閉じられました。';
        };
    });
    stopButton.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }
        // 無音によるテキストリセットが入っていない場合、残っているtranscribedTextはBufferに書き込まれていないので、ここで書き込む
        if(transcribedText && !resetted){
            transcribedBuffer += transcribedText + '\n';
            transcribedText = '';
            transcriptionArea.textContent = transcribedBuffer;
        }
        // マイクの受取を停止
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
            analyser = null;
        }
        if (audioLevelDiv) {
            audioLevelDiv.style.setProperty('--level-width', '0');
        }
        statusMessage.textContent = '録音終了';
        startButton.disabled = false;
        stopButton.disabled = true;
        summarizeButton.disabled = false;
    });

    summarizeButton.addEventListener('click', async () => {
        if (transcribedBuffer) {
            statusMessage.textContent = '要約処理中...';
            try {
                let body = { transcript: transcribedBuffer };
                if(summarizeInstrustion && summarizeInstrustion !== ''){
                    body.instruction = summarizeInstrustion;
                }
                const response = await fetch('/api/summarize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });
                const data = await response.json();
                if (data.summary) {
                    summaryArea.textContent = data.summary;
                    statusMessage.textContent = '要約完了';
                } else if (data.error) {
                    summaryArea.textContent = '要約に失敗しました: ' + data.error;
                    statusMessage.textContent = '要約エラー';
                }
            } catch (error) {
                console.error('要約APIエラー:', error);
                summaryArea.textContent = '要約に失敗しました。';
                statusMessage.textContent = '要約エラー';
            }
        } else {
            summaryArea.textContent = '文字起こしテキストがありません。';
            statusMessage.textContent = '要約エラー';
        }
    });

    populateMicrophoneList();
});