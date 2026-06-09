/**
 * pix.js — DigaReal Cloud
 * Geração de QR Code PIX (padrão Banco Central do Brasil / EMV QRCPS-MPM).
 *
 * Compatível com qualquer app bancário brasileiro que suporte PIX.
 * Não requer API bancária — geração 100% client-side.
 */

const PixQRCode = {

    // ─────────────────────────────────────────────
    // Gerador de Payload PIX (BR Code / EMV)
    // ─────────────────────────────────────────────

    /**
     * Monta o payload EMV para PIX.
     * @param {object} opts
     * @param {string} opts.key         - Chave PIX (e-mail, CPF, celular, chave aleatória)
     * @param {string} opts.name        - Nome do recebedor (até 25 chars)
     * @param {string} opts.city        - Cidade do recebedor (até 15 chars)
     * @param {number} [opts.amount]    - Valor em reais (opcional)
     * @param {string} [opts.txId]      - ID da transação (até 25 chars, opcional)
     * @param {string} [opts.desc]      - Descrição (até 72 chars, opcional)
     * @returns {string} payload string que pode ser transformado em QR Code
     */
    buildPayload({ key, name, city, amount = null, txId = '***', desc = '' }) {
        const pad = (id, val) => {
            const v = String(val);
            return `${id}${String(v.length).padStart(2, '0')}${v}`;
        };

        // Campo 26 — Merchant Account Information
        let mai = pad('00', 'br.gov.bcb.pix') + pad('01', key);
        if (desc) mai += pad('02', desc.substring(0, 72));

        // Campo 62 — Additional Data Field
        const addf = pad('05', (txId || '***').substring(0, 25));

        // Montar payload sem CRC
        let payload =
            pad('00', '01') +              // Payload Format Indicator
            pad('01', '12') +              // Point of Initiation (12 = dinâmico, 11 = estático)
            pad('26', mai) +               // Merchant Account Info
            pad('52', '0000') +            // Merchant Category Code
            pad('53', '986') +             // Moeda (986 = BRL)
            (amount !== null ? pad('54', amount.toFixed(2)) : '') +  // Valor
            pad('58', 'BR') +              // País
            pad('59', name.substring(0, 25)) +   // Nome do recebedor
            pad('60', city.substring(0, 15)) +   // Cidade
            pad('62', addf) +              // Additional Data
            '6304';                        // CRC placeholder (calculado abaixo)

        // Calcular CRC-16/CCITT-FALSE
        const crc = this._crc16(payload);
        return payload + crc;
    },

    /**
     * Calcula CRC-16 (CCITT-FALSE) — algoritmo padrão do Banco Central para PIX.
     * @private
     */
    _crc16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            }
        }
        return ((crc & 0xFFFF).toString(16).toUpperCase()).padStart(4, '0');
    },

    // ─────────────────────────────────────────────
    // Renderizador de QR Code
    // ─────────────────────────────────────────────

    /**
     * Renderiza o QR Code PIX num elemento canvas ou div.
     * Requer a biblioteca qrcode.js carregada no index.html.
     * @param {string} payload - string gerada por buildPayload()
     * @param {HTMLElement} container - elemento onde o QR Code será renderizado
     * @param {number} [size=240] - tamanho em pixels
     */
    render(payload, container, size = 240) {
        // Limpar container
        container.innerHTML = '';

        if (typeof QRCode === 'undefined') {
            container.innerHTML = '<p style="color:red;font-size:0.8rem;">QR Code library não carregada.</p>';
            console.error('[PIX] qrcode.js não encontrado.');
            return;
        }

        new QRCode(container, {
            text: payload,
            width: size,
            height: size,
            colorDark: '#1a365d',   // azul escuro (identidade DigaReal)
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.M
        });
    },

    // ─────────────────────────────────────────────
    // Helper: detectar tipo de chave PIX
    // ─────────────────────────────────────────────

    /**
     * Detecta automaticamente o tipo da chave PIX informada.
     * @param {string} key
     * @returns {'email'|'cpf'|'cnpj'|'phone'|'random'}
     */
    detectKeyType(key) {
        const k = key.trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return 'email';
        const digits = k.replace(/\D/g, '');
        if (digits.length === 11 && !k.startsWith('+')) return 'cpf';
        if (digits.length === 14) return 'cnpj';
        if (digits.length === 11 && k.startsWith('+55')) return 'phone';
        if (digits.length === 10 || digits.length === 11) return 'phone';
        return 'random'; // chave aleatória (UUID-like)
    },

    // ─────────────────────────────────────────────
    // Gerador completo (conveniência)
    // ─────────────────────────────────────────────

    /**
     * Gera e renderiza um QR Code PIX completo.
     * @param {object} opts - mesmos parâmetros de buildPayload()
     * @param {HTMLElement} container - onde renderizar
     * @param {number} [size]
     * @returns {string} o payload gerado (para "Pix Copia e Cola")
     */
    generate(opts, container, size = 240) {
        const payload = this.buildPayload(opts);
        this.render(payload, container, size);
        return payload;  // retorna para "copiar código PIX"
    }
};

console.log('[DigaReal] PixQRCode carregado.');
