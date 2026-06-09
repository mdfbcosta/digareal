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

class VoiceSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.init();
    }

    init() {
        if (!this.synth) {
            console.warn("API de Síntese de Voz (SpeechSynthesis) não suportada neste navegador.");
            return;
        }
        const loadVoice = () => {
            const voices = this.synth.getVoices();
            this.voice = voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith('pt-br')) || null;
        };
        loadVoice();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoice;
        }
    }

    speak(text, onEndCallback = null) {
        if (!this.synth) return;
        this.cancel();
        
        // Limpar qualquer tag HTML que possa ser injetada no texto falado (como os chips/botões)
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'pt-BR';
        if (this.voice) {
            utterance.voice = this.voice;
        }
        utterance.rate = 1.05; // Leve aceleração
        if (onEndCallback) {
            utterance.onend = onEndCallback;
        }
        
        this.synth.speak(utterance);
    }

    cancel() {
        if (this.synth) {
            this.synth.cancel();
        }
    }
}

