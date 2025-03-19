document.addEventListener('DOMContentLoaded', () => {
    const microphoneLevelDiv = document.getElementById('audioLevel');
    const microphoneSelect = document.getElementById('microphone');
    let audioContext;
    let analyser;
    let microphoneStream;
    let selectedMicrophoneId = '';

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

            // 保存されているマイク設定を読み込む (もしあれば)
            const savedMicrophoneId = localStorage.getItem('selectedMicrophoneId'); // メインページの設定を流用するかどうか検討
            if (savedMicrophoneId) {
                microphoneSelect.value = savedMicrophoneId;
                selectedMicrophoneId = savedMicrophoneId;
                startMicrophone(selectedMicrophoneId);
            } else {
                startMicrophone(); // 既定のマイクで開始
            }

        } catch (error) {
            console.error('マイクデバイスの列挙エラー:', error);
            if (microphoneLevelDiv) {
                microphoneLevelDiv.textContent = 'マイクデバイスの取得に失敗しました。';
            }
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
            console.log('マイクストリームを取得:', stream);
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
                const level = Math.max(0, Math.min(1, rms * 2)); // 音量レベルを 0〜1 の範囲に調整

                if (microphoneLevelDiv) {
                    microphoneLevelDiv.style.setProperty('--level-width', `${level * 100}%`);
                }
                requestAnimationFrame(updateAudioLevel);
            }

            updateAudioLevel();

        } catch (error) {
            console.error('マイクへのアクセスエラー:', error);
            if (microphoneLevelDiv) {
                microphoneLevelDiv.textContent = 'マイクへのアクセスが拒否されました。設定で許可されているか確認してください。';
            }
        }
    }

    // ページ読み込み時にマイクリストを初期化
    populateMicrophoneList();

    // マイクの選択が変更されたときのイベントリスナー
    microphoneSelect.addEventListener('change', (event) => {
        selectedMicrophoneId = event.target.value;
        startMicrophone(selectedMicrophoneId);
    });
});