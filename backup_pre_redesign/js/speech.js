class VoiceRecognizer {
    constructor(onTranscriptCallback, onStateChangeCallback) {
        this.onTranscript = onTranscriptCallback;
        this.onStateChange = onStateChangeCallback; // Callback to update UI button state
        this.recognition = null;
        this.isListening = false;

        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("API de Reconhecimento de Voz não suportada neste navegador.");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'pt-BR';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.onStateChange) this.onStateChange(true);
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log("Transcrição de Voz:", transcript);
            if (this.onTranscript) {
                this.onTranscript(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Erro no reconhecimento de voz:", event.error);
            this.stop();
        };

        this.recognition.onend = () => {
            this.stop();
        };
    }

    toggle() {
        if (!this.recognition) {
            alert("Desculpe, o reconhecimento de voz não é suportado no seu navegador atual. Experimente usar o Google Chrome ou Microsoft Edge.");
            return;
        }

        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (this.recognition && !this.isListening) {
            try {
                this.recognition.start();
            } catch (e) {
                console.error("Erro ao iniciar gravação de voz", e);
            }
        }
    }

    stop() {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped
            }
        }
    }
}
