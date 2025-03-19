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
    const speechApiKeyInput = document.getElementById('speechApiKey');
    const summaryApiKeyInput = document.getElementById('summaryApiKey');
    const languageSelect = document.getElementById('language');
    const microphoneSelect = document.getElementById('microphone');
    const audioLevelDiv = document.getElementById('audioLevel');

    let audioContext;
    let analyser;
    let microphoneStream;
    let recognition;
    let transcribedText = '';
    let selectedMicrophoneId = '';
    let microphoneListPopulated = false; // マイクロフォンリストが作成されたかどうかを追跡

    // マイクデバイスのリストを取得してプルダウンメニューに追加する関数
    async function populateMicrophoneList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log('利用可能なデバイス:', devices); // デバイス一覧をログ出力

            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            console.log('オーディオ入力デバイス:', audioInputDevices); // オーディオ入力デバイス一覧をログ出力

            microphoneSelect.innerHTML = '<option value="">既定のマイク</option>'; // Clear existing options

            audioInputDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `マイク ${microphoneSelect.options.length}`;
                microphoneSelect.appendChild(option);
            });

            // 保存されているマイク設定を読み込む
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

    // 設定モーダルの表示/非表示
    settingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'block';
        // 設定画面を開くたびにマイクリストを更新 (念のため)
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
        const speechApiKey = speechApiKeyInput.value;
        const summaryApiKey = summaryApiKeyInput.value;
        const language = languageSelect.value;
        selectedMicrophoneId = microphoneSelect.value;
        localStorage.setItem('selectedMicrophoneId', selectedMicrophoneId);

        console.log('APIキー (要約):', summaryApiKey);
        console.log('言語:', language);
        console.log('選択されたマイク ID:', selectedMicrophoneId);
        statusMessage.textContent = '設定を保存しました';
        settingsModal.style.display = 'none';
    });

    startButton.addEventListener('click', () => {
        const constraints = {
            audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true,
            video: false
        };

        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.lang = languageSelect.value;
            recognition.continuous = true; // 連続的な認識を有効にする
            recognition.interimResults = true; // 中間的な結果も表示する

            transcribedText = '';
            transcriptionArea.textContent = '';
            summaryArea.textContent = '';
            statusMessage.textContent = '録音中...';
            startButton.disabled = true;
            stopButton.disabled = false;
            summarizeButton.disabled = true;

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                transcriptionArea.textContent = transcribedText + finalTranscript + interimTranscript;
                // 最終的な結果が出た場合、transcribedTextに追記
                if (finalTranscript) {
                    transcribedText += finalTranscript + '\n';
                }
            };

            recognition.onerror = (event) => {
                console.error('音声認識エラー:', event.error);
                statusMessage.textContent = '音声認識エラーが発生しました: ' + event.error;
                startButton.disabled = false;
                stopButton.disabled = true;
                summarizeButton.disabled = true;
            };

            recognition.onend = () => {
                statusMessage.textContent = '録音終了';
                stopButton.disabled = true;
                summarizeButton.disabled = false;
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
                    audioLevelDiv.style.backgroundColor = '#eee';
                    audioLevelDiv.style.width = '100%';
                    audioLevelDiv.style.height = '20px';
                    audioLevelDiv.innerHTML = '<div style="height: 100%; width: 0%; background-color: #007bff;"></div>';
                }
            };

            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    console.log('getUserMedia 成功:', stream);
                    // ストリーム取得成功後にマイクリストを更新
                    if (!microphoneListPopulated) {
                        populateMicrophoneList();
                    }
                    recognition.start();

                    // 音声レベルの監視を開始
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
                        const level = Math.max(0, Math.min(1, rms * 2)); // 音量レベルを 0〜1 の範囲に調整

                        if (audioLevelDiv) {
                            audioLevelDiv.style.setProperty('--level-width', `${level * 100}%`);
                        }

                        if (recognition && recognition.state === 'recording') {
                            requestAnimationFrame(updateAudioLevel);
                        }
                    }

                    updateAudioLevel();

                })
                .catch(error => {
                    console.error('マイクへのアクセスエラー:', error);
                    statusMessage.textContent = 'マイクへのアクセスが拒否されました。設定で許可されているか確認してください。';
                    startButton.disabled = false;
                    stopButton.disabled = true;
                    summarizeButton.disabled = true;
                });
        } else {
            statusMessage.textContent = 'このブラウザは音声認識に対応していません。';
        }
    });

    stopButton.addEventListener('click', () => {
        if (recognition) {
            recognition.stop();
        }
    });

    summarizeButton.addEventListener('click', async () => {
        if (transcribedText) {
            statusMessage.textContent = '要約処理中...';
            try {
                const response = await fetch('/backend/summarize', { // パスを調整
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ transcript: transcribedText }),
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
});