document.addEventListener('DOMContentLoaded', () => {
    // Reset any native horizontal scroll offset caused by scrollIntoView bugs
    const appEl = document.getElementById('app');
    if (appEl) appEl.scrollLeft = 0;
    const slideContainerEl = document.getElementById('slide-container');
    if (slideContainerEl) slideContainerEl.scrollLeft = 0;
    document.body.scrollLeft = 0;

    // 1. Initialise core logic
    const storage = new WalletStorage();
    const parser = new TransactionParser(storage);
    let voice = null;

    // Active UI states
    let currentTheme = 'ruled';
    let isHandwriting = true;
    let editingTxId = null;
    let chatInactivityTimer = null;
    const nowObj = new Date();
    const currentYearStr = nowObj.getFullYear();
    const currentMonthStr = String(nowObj.getMonth() + 1).padStart(2, '0');
    let currentFilters = {
        time: 'month', // 'day', 'week', 'month', 'year', 'all'
        type: 'all',  // 'all', 'income', 'expense'
        search: '',
        selectedMonthYear: `${currentYearStr}-${currentMonthStr}` // Format YYYY-MM
    };
    let currentFixedTab = 'debts';

    // Pre-populate some dummy entries on first run if transactions are empty
    const activeNb = storage.getActiveNotebook();
    if (activeNb && activeNb.transactions.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        
        storage.addTransaction({
            item: 'Salário Principal',
            value: 4500.00,
            type: 'salario',
            category: 'Receitas',
            date: today,
            time: '08:00',
            author: 'Rosil'
        });

        storage.addTransaction({
            item: 'Aluguel do Mês',
            value: 1200.00,
            type: 'despesa_recorrente',
            category: 'Moradia',
            date: today,
            time: '09:00',
            author: 'Rosil'
        });

        storage.addTransaction({
            item: 'Supermercado Mensal',
            value: 350.00,
            type: 'despesa_recorrente',
            category: 'Alimentação',
            date: today,
            time: '14:30',
            author: 'Rosil'
        });

        storage.addTransaction({
            item: 'Combustível Posto Ipiranga',
            value: 150.00,
            type: 'despesa_esporadica',
            category: 'Transporte',
            date: today,
            time: '18:15',
            author: 'Rosil'
        });
    }

    // Initialize voice helper (unified with chat)
    voice = new VoiceRecognizer(
        // On Speech Transcription
        (text) => {
            const chatOverlay = document.getElementById('chat-screen-overlay');
            if (chatOverlay.classList.contains('active')) {
                const inputField = document.getElementById('chat-input-field');
                inputField.value = text;
                resetChatInactivityTimer();
                sendChatMessage();
            } else {
                openChatOverlay();
                const inputField = document.getElementById('chat-input-field');
                inputField.value = text;
                sendChatMessage();
            }
        },
        // On State Change (microphone pulsing)
        (isListening) => {
            const homeMicWrapper = document.getElementById('home-mic-wrapper');
            const chatMicBtn = document.getElementById('chat-mic-btn');
            
            if (isListening) {
                if (homeMicWrapper) homeMicWrapper.classList.add('listening');
                if (chatMicBtn) chatMicBtn.classList.add('active-mic');
            } else {
                if (homeMicWrapper) homeMicWrapper.classList.remove('listening');
                if (chatMicBtn) chatMicBtn.classList.remove('active-mic');
            }
        }
    );

    // 2. DOM Elements
    const slideContainer = document.getElementById('slide-container');
    const screenHome = document.getElementById('screen-home');
    const screenDetails = document.getElementById('screen-details');
    
    const btnMic = document.getElementById('btn-mic');
    const swipeArrowIndicator = document.getElementById('swipe-arrow-indicator');
    const btnBackHome = document.getElementById('btn-back-home');
    
    const btnToggleFont = document.getElementById('btn-toggle-font');
    const fontBtnText = document.getElementById('font-btn-text');
    const btnShareSettings = document.getElementById('btn-share-settings');
    const btnSwitchNotebook = document.getElementById('btn-switch-notebook');
    
    const notebookPageBody = document.getElementById('notebook-page-body');
    const transactionList = document.getElementById('transaction-list');
    const doubtsNotificationBadge = document.getElementById('doubts-notification-badge');
    const doubtsBadgeText = document.getElementById('doubts-badge-text');
    
    // Auth / Login Cover
    const modalWelcome = document.getElementById('modal-welcome');
    const authForm = document.getElementById('auth-form');
    const authNameField = document.getElementById('field-auth-name');
    const authName = document.getElementById('auth-name');
    const authContact = document.getElementById('auth-contact');
    const authPassword = document.getElementById('auth-password');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const toggleAuthRegister = document.getElementById('toggle-auth-register');
    const toggleAuthLogin = document.getElementById('toggle-auth-login');

    // Edit Transaction Modal
    const modalEditTransaction = document.getElementById('modal-edit-transaction');
    const editModalTitle = document.getElementById('edit-modal-title');
    const editItem = document.getElementById('edit-item');
    const editValue = document.getElementById('edit-value');
    const editType = document.getElementById('edit-type');
    const editCategory = document.getElementById('edit-category');
    const editDate = document.getElementById('edit-date');
    const editTime = document.getElementById('edit-time');
    const editAuthor = document.getElementById('edit-author');
    const btnSaveTransaction = document.getElementById('btn-save-transaction');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnDeleteTransaction = document.getElementById('btn-delete-transaction');

    // New Category Modal
    const modalNewCategory = document.getElementById('modal-new-category');
    const newCategoryName = document.getElementById('new-category-name');
    const btnSaveNewCategory = document.getElementById('btn-save-new-category');
    const btnCancelNewCategory = document.getElementById('btn-cancel-new-category');

    // Switch Notebook Modal
    const modalSwitchNotebook = document.getElementById('modal-switch-notebook');
    const notebooksShelfList = document.getElementById('notebooks-shelf-list');
    const newNotebookName = document.getElementById('new-notebook-name');
    const btnCreateNotebook = document.getElementById('btn-create-notebook');
    const inviteCodeInput = document.getElementById('invite-code-input');
    const btnRedeemInvite = document.getElementById('btn-redeem-invite');
    const btnCloseSwitchNotebook = document.getElementById('btn-close-switch-notebook');

    // Sharing Modal
    const modalSharingDetails = document.getElementById('modal-sharing-details');
    const displayInviteCode = document.getElementById('display-invite-code');
    const btnShareInviteNative = document.getElementById('btn-share-invite-native');
    const shareNewName = document.getElementById('share-new-name');
    const shareNewRole = document.getElementById('share-new-role');
    const sharingMembersList = document.getElementById('sharing-members-list');
    const btnCloseSharing = document.getElementById('btn-close-sharing');

    // 3. User Login Check
    let authMode = 'register';
    
    function checkLogin() {
        const user = storage.getCurrentUser();
        if (!user || user === 'Usuário') {
            modalWelcome.classList.add('active');
        } else {
            modalWelcome.classList.remove('active');
            updateUserGreeting();
            updateUI();
        }
    }

    if (toggleAuthRegister) {
        toggleAuthRegister.addEventListener('click', () => {
            authMode = 'register';
            toggleAuthRegister.classList.add('active');
            toggleAuthLogin.classList.remove('active');
            authNameField.style.display = 'flex';
            authName.setAttribute('required', 'true');
            btnAuthSubmit.innerText = 'Começar Lançamentos';
        });
    }

    if (toggleAuthLogin) {
        toggleAuthLogin.addEventListener('click', () => {
            authMode = 'login';
            toggleAuthLogin.classList.add('active');
            toggleAuthRegister.classList.remove('active');
            authNameField.style.display = 'none';
            authName.removeAttribute('required');
            btnAuthSubmit.innerText = 'Abrir Caderno';
        });
    }

    if (authForm) {
        authForm.onsubmit = (e) => {
            e.preventDefault();
            const contactVal = authContact.value.trim();
            const passwordVal = authPassword.value;
            
            if (authMode === 'register') {
                const nameVal = authName.value.trim();
                if (!nameVal || !contactVal || !passwordVal) {
                    alert("Por favor, preencha todos os campos!");
                    return false;
                }
                const result = storage.registerUser(nameVal, contactVal, passwordVal);
                if (result.success) {
                    modalWelcome.classList.remove('active');
                    updateUserGreeting();
                    updateUI();
                } else {
                    alert(result.message || "Erro ao realizar cadastro.");
                }
            } else {
                if (!contactVal || !passwordVal) {
                    alert("Por favor, preencha todos os campos!");
                    return false;
                }
                const result = storage.loginUser(contactVal, passwordVal);
                if (result.success) {
                    modalWelcome.classList.remove('active');
                    updateUserGreeting();
                    updateUI();
                } else {
                    alert(result.message || "E-mail/Celular ou Senha incorretos.");
                }
            }
            return false;
        };
    }

    function updateUserGreeting() {
        const user = storage.getCurrentUser();
        if (doubtsBadgeText) {
            doubtsBadgeText.innerText = `Tenho algumas perguntas, ${user}!`;
        }
    }

    // 4. Swipe Gestures Implementation
    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;

    function handleGesture() {
        const swipeThreshold = 80;
        const deltaX = touchEndX - touchStartX;

        // If swipe left, go to Details
        if (deltaX < -swipeThreshold) {
            goToDetailsScreen();
        }
        // If swipe right, go to Home
        else if (deltaX > swipeThreshold) {
            goToHomeScreen();
        }
    }

    // Add swipe detection listeners to slides
    screenHome.addEventListener('touchstart', (e) => {
        // Prevent swipe if chat overlay is open
        const chatOverlay = document.getElementById('chat-screen-overlay');
        if (chatOverlay.classList.contains('active')) return;
        touchStartX = e.changedTouches[0].clientX;
    }, {passive: true});

    screenHome.addEventListener('touchend', (e) => {
        const chatOverlay = document.getElementById('chat-screen-overlay');
        if (chatOverlay.classList.contains('active')) return;
        touchEndX = e.changedTouches[0].clientX;
        handleGesture();
    }, {passive: true});

    screenDetails.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].clientX;
    }, {passive: true});

    screenDetails.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].clientX;
        // Don't swipe back if scrolling a scrollable area or clicking list items
        if (e.target.closest('.notebook-page') && e.target.closest('.notebook-page').scrollTop > 10) return;
        if (e.target.closest('.transaction-list')) return;
        handleGesture();
    }, {passive: true});

    function goToDetailsScreen() {
        slideContainer.style.transform = 'translateX(-50%)';
        document.getElementById('dot-home').classList.remove('active');
        document.getElementById('dot-details').classList.add('active');
        updateUI();
    }

    function goToHomeScreen() {
        slideContainer.style.transform = 'translateX(0%)';
        document.getElementById('dot-home').classList.add('active');
        document.getElementById('dot-details').classList.remove('active');
    }

    if (swipeArrowIndicator) {
        swipeArrowIndicator.addEventListener('click', goToDetailsScreen);
    }
    
    // Configura botão de voltar com prevenção de propagação para evitar conflitos com gestos
    btnBackHome.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToHomeScreen();
    });
    
    btnBackHome.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToHomeScreen();
    }, {passive: false});

    document.getElementById('dot-home').addEventListener('click', goToHomeScreen);
    document.getElementById('dot-details').addEventListener('click', goToDetailsScreen);

    // 5. Themes Selection
    document.querySelectorAll('.btn-theme-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const theme = tab.getAttribute('data-theme');
            setPaperTheme(theme);
        });
    });

    function setPaperTheme(theme) {
        notebookPageBody.className = `notebook-page theme-${theme}`;
        if (isHandwriting) {
            notebookPageBody.classList.add('handwriting-mode');
        }
        currentTheme = theme;
    }

    // Caligrafia Mode
    btnToggleFont.addEventListener('click', () => {
        isHandwriting = !isHandwriting;
        if (isHandwriting) {
            notebookPageBody.classList.add('handwriting-mode');
            fontBtnText.innerText = "Caligrafia Imprensa";
            btnToggleFont.querySelector('i').className = "fa-solid fa-font";
        } else {
            notebookPageBody.classList.remove('handwriting-mode');
            fontBtnText.innerText = "Caligrafia Cursiva";
            btnToggleFont.querySelector('i').className = "fa-solid fa-pen-nib";
        }
    });

    // 💬 6. Conversational Assistant (Chat Overlay Screen)
    function openChatOverlay() {
        const overlay = document.getElementById('chat-screen-overlay');
        overlay.classList.add('active');
        renderChatMessages();
        resetChatInactivityTimer();
    }

    function closeChatOverlay() {
        const overlay = document.getElementById('chat-screen-overlay');
        overlay.classList.remove('active');
        voice.stop();
        clearTimeout(chatInactivityTimer);
    }

    function resetChatInactivityTimer() {
        clearTimeout(chatInactivityTimer);
        chatInactivityTimer = setTimeout(() => {
            closeChatOverlay();
        }, 30000); // Aumentado para 30 segundos para dar tempo do usuário pensar, ler e interagir sem pressa
    }

    // Bind Inactivity events
    const chatOverlay = document.getElementById('chat-screen-overlay');
    chatOverlay.addEventListener('click', resetChatInactivityTimer);
    chatOverlay.addEventListener('touchstart', resetChatInactivityTimer);
    chatOverlay.addEventListener('scroll', resetChatInactivityTimer);

    const chatInputField = document.getElementById('chat-input-field');
    chatInputField.addEventListener('input', resetChatInactivityTimer);
    chatInputField.addEventListener('keypress', (e) => {
        resetChatInactivityTimer();
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    document.getElementById('btn-close-chat').addEventListener('click', closeChatOverlay);
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-mic-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        resetChatInactivityTimer();
        voice.toggle();
    });

    // Mic click on Home opens chat (não inicia a gravação automaticamente, estilo WhatsApp)
    btnMic.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatOverlay();
    });

    // Red dot badge click on Home opens chat
    document.getElementById('home-alert-dot').addEventListener('click', (e) => {
        e.stopPropagation();
        openChatOverlay();
    });

    function sendChatMessage() {
        const text = chatInputField.value.trim();
        if (!text) return;
        
        storage.addChatMessage('user', text);
        chatInputField.value = '';
        renderChatMessages();
        resetChatInactivityTimer();
        
        setTimeout(() => {
            processChatAssistantReply(text);
        }, 600);
    }

    function processChatAssistantReply(userText) {
        const userName = storage.getCurrentUser();
        
        // Context-swallowing bug fix: pre-parse to detect new commands
        const preParsed = parser.parseText(userText);
        const lowerNormalized = userText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const explicitKeywords = ['gastei', 'recebi', 'paguei', 'cofrinho', 'divida', 'dívida', 'conta fixa', 'conta mensal', 'receita mensal', 'receita fixa', 'guardar', 'resgatar', 'poupar', 'sacar'];
        const isNewCommand = preParsed.isFixedAccountTemplate || 
                             preParsed.isFixedIncomeTemplate || 
                             preParsed.isCofrinhoTemplate || 
                             explicitKeywords.some(keyword => lowerNormalized.includes(keyword)) ||
                             (!preParsed.hasDoubt && preParsed.value && preParsed.item);

        if (isNewCommand) {
            storage.setActiveConversationState({ status: 'idle' });
        }

        const state = storage.getActiveConversationState();
        
        if (state && state.status === 'awaiting_info') {
            if (state.missing === 'category') {
                const category = userText.trim();
                storage.addCategory(category);
                
                const txData = {
                    item: state.doubtTx.item,
                    value: parseFloat(state.doubtTx.value) || 0,
                    type: state.doubtTx.type || 'despesa_esporadica',
                    category: category,
                    date: state.doubtTx.date,
                    time: state.doubtTx.time,
                    author: userName
                };
                
                const newTx = storage.addTransaction(txData);
                const cleanItem = state.doubtTx.item.toLowerCase().trim();
                storage.learnTerm(cleanItem, category, state.doubtTx.type || 'despesa_esporadica');
                
                storage.setActiveConversationState({ status: 'idle' });
                storage.addChatMessage('app', `Entendido! Registrei <strong>${state.doubtTx.item}</strong> (R$ ${txData.value.toFixed(2)}) em <strong>${category}</strong>. Registrado, ${userName}! ✍️`);
                
            } else if (state.missing === 'value') {
                let cleaned = userText.replace(/R\$/g, '').replace(/reais/g, '').replace(/real/g, '').trim();
                cleaned = cleaned.replace(',', '.');
                const parsedVal = parseFloat(cleaned.match(/[\d.]+/));
                
                if (!isNaN(parsedVal) && parsedVal > 0) {
                    if (state.doubtTx.isFixedAccountTemplate) {
                        const day = state.doubtTx.day || 1;
                        const expiration = state.doubtTx.expiration || null;
                        storage.addFixedAccount(state.doubtTx.item, parsedVal, day, expiration);
                        
                        let msg = `Entendido! Cadastrei a dívida mensal <strong>"${state.doubtTx.item}"</strong> no valor de R$ ${parsedVal.toFixed(2)} com vencimento todo dia ${day}`;
                        if (expiration) {
                            const [year, month] = expiration.split('-');
                            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                            const idx = parseInt(month, 10) - 1;
                            const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                            msg += ` (válida até ${expFormatted})`;
                        }
                        msg += `. 📌`;
                        storage.addChatMessage('app', msg);
                        storage.setActiveConversationState({ status: 'idle' });
                    } else if (state.doubtTx.isFixedIncomeTemplate) {
                        const day = state.doubtTx.day || 1;
                        const expiration = state.doubtTx.expiration || null;
                        storage.addFixedIncome(state.doubtTx.item, parsedVal, day, expiration);
                        
                        let msg = `Entendido! Cadastrei a receita mensal <strong>"${state.doubtTx.item}"</strong> no valor de R$ ${parsedVal.toFixed(2)} com recebimento todo dia ${day}`;
                        if (expiration) {
                            const [year, month] = expiration.split('-');
                            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                            const idx = parseInt(month, 10) - 1;
                            const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                            msg += ` (válida até ${expFormatted})`;
                        }
                        msg += `. 📌`;
                        storage.addChatMessage('app', msg);
                        storage.setActiveConversationState({ status: 'idle' });
                    } else if (state.doubtTx.isCofrinhoTemplate) {
                        if (state.doubtTx.cofrinhoAction === 'guardar') {
                            storage.depositToCofrinho(parsedVal);
                            storage.addChatMessage('app', `Entendido! Guardei <strong>R$ ${parsedVal.toFixed(2)}</strong> no seu cofrinho. 🐷💰`);
                        } else {
                            storage.withdrawFromCofrinho(parsedVal);
                            storage.addChatMessage('app', `Entendido! Resgatei <strong>R$ ${parsedVal.toFixed(2)}</strong> do seu cofrinho. 🐷💵`);
                        }
                        storage.setActiveConversationState({ status: 'idle' });
                    } else {
                        const category = state.doubtTx.category || 'Alimentação';
                        const txData = {
                            item: state.doubtTx.item,
                            value: parsedVal,
                            type: state.doubtTx.type || 'despesa_esporadica',
                            category: category,
                            date: state.doubtTx.date,
                            time: state.doubtTx.time,
                            author: userName
                        };
                        
                        const newTx = storage.addTransaction(txData);
                        storage.setActiveConversationState({ status: 'idle' });
                        storage.addChatMessage('app', `Perfeito! Valor de R$ ${parsedVal.toFixed(2)} anotado. Registrado, ${userName}! ✍️`);
                    }
                } else {
                    storage.addChatMessage('app', `Desculpe, não consegui entender o valor em "${userText}". Pode me dizer apenas o valor em número (ex: 50)?`);
                    renderChatMessages();
                    return;
                }
            }
            
            updateHomeAlertDot();
            updateUI();
            renderChatMessages();
            
        } else {
            const result = parser.parseText(userText);
            
            if (result.hasDoubt) {
                if (!result.value) {
                    storage.setActiveConversationState({
                        status: 'awaiting_info',
                        missing: 'value',
                        doubtTx: result
                    });
                    const doubtMsg = result.reason || `Entendi que você lançou <strong>"${result.item || userText}"</strong>, mas de quanto foi o valor, ${userName}?`;
                    storage.addChatMessage('app', doubtMsg);
                } else {
                    storage.setActiveConversationState({
                        status: 'awaiting_info',
                        missing: 'category',
                        doubtTx: result
                    });
                    storage.addChatMessage('app', `Qual é a categoria ou tipo de gasto para <strong>"${result.item}"</strong> (R$ ${result.value.toFixed(2)}), ${userName}?`);
                }
                updateHomeAlertDot();
            } else {
                if (result.isFixedAccountTemplate) {
                    storage.addFixedAccount(result.item, result.value, result.day, result.expiration);
                    let msg = `Entendido! Cadastrei a dívida mensal <strong>"${result.item}"</strong> no valor de R$ ${result.value.toFixed(2)} com vencimento todo dia ${result.day}`;
                    if (result.expiration) {
                        const [year, month] = result.expiration.split('-');
                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                        const idx = parseInt(month, 10) - 1;
                        const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                        msg += ` (válida até ${expFormatted})`;
                    }
                    msg += `. 📌`;
                    storage.addChatMessage('app', msg);
                } else if (result.isFixedIncomeTemplate) {
                    storage.addFixedIncome(result.item, result.value, result.day, result.expiration);
                    let msg = `Entendido! Cadastrei a receita mensal <strong>"${result.item}"</strong> no valor de R$ ${result.value.toFixed(2)} com recebimento todo dia ${result.day}`;
                    if (result.expiration) {
                        const [year, month] = result.expiration.split('-');
                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                        const idx = parseInt(month, 10) - 1;
                        const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                        msg += ` (válida até ${expFormatted})`;
                    }
                    msg += `. 📌`;
                    storage.addChatMessage('app', msg);
                } else if (result.isCofrinhoTemplate) {
                    if (result.cofrinhoAction === 'guardar') {
                        storage.depositToCofrinho(result.value);
                        storage.addChatMessage('app', `Entendido! Guardei <strong>R$ ${result.value.toFixed(2)}</strong> no seu cofrinho. 🐷💰`);
                    } else if (result.cofrinhoAction === 'resgatar') {
                        storage.withdrawFromCofrinho(result.value);
                        storage.addChatMessage('app', `Entendido! Resgatei <strong>R$ ${result.value.toFixed(2)}</strong> do seu cofrinho. 🐷💵`);
                    }
                } else {
                    storage.addTransaction(result);
                    storage.addChatMessage('app', `Registrado, ${userName}! ✍️`);
                }
            }
            
            updateUI();
            renderChatMessages();
        }
    }

    function renderChatMessages() {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;
        container.innerHTML = '';
        
        let messages = storage.getActiveWeekChatMessages();
        
        if (messages.length === 0) {
            const user = storage.getCurrentUser();
            const hour = new Date().getHours();
            let greeting = "Olá";
            if (hour >= 6 && hour < 12) greeting = "Bom dia";
            else if (hour >= 12 && hour < 18) greeting = "Boa tarde";
            else greeting = "Boa noite";
            
            storage.addChatMessage('app', `${greeting}, ${user}! Pode dizer...`);
            messages = storage.getActiveWeekChatMessages();
        }
        
        messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${msg.sender === 'user' ? 'user-bubble' : 'app-bubble'}`;
            bubble.innerHTML = msg.text;
            container.appendChild(bubble);
        });
        
        container.scrollTop = container.scrollHeight;
    }

    function updateHomeAlertDot() {
        const state = storage.getActiveConversationState();
        const alertDot = document.getElementById('home-alert-dot');
        const homeMicWrapper = document.getElementById('home-mic-wrapper');
        
        if (state && state.status === 'awaiting_info') {
            if (alertDot) alertDot.style.display = 'block';
            if (homeMicWrapper) homeMicWrapper.classList.add('glowing');
        } else {
            if (alertDot) alertDot.style.display = 'none';
            if (homeMicWrapper) homeMicWrapper.classList.remove('glowing');
        }
    }



    // 9. Doodle Charts Render
    function renderDoodleCharts(filteredTxs) {
        const chartBox = document.getElementById('doodle-chart-box');
        const barsContainer = document.getElementById('doodle-bars-container');
        
        // Group expenses by category
        const categoriesData = {};
        let totalExpenses = 0;

        filteredTxs.forEach(t => {
            const isInc = t.type === 'salario' || (t.type && typeof t.type === 'string' && t.type.startsWith('receita')) || t.type === 'cofrinho_resgatar';
            if (!isInc) {
                if (t.category !== 'Cofrinho') {
                    categoriesData[t.category] = (categoriesData[t.category] || 0) + t.value;
                    totalExpenses += t.value;
                }
            }
        });

        const catArray = Object.keys(categoriesData).map(cat => ({
            name: cat,
            val: categoriesData[cat]
        }));

        if (catArray.length === 0) {
            chartBox.style.display = 'none';
            return;
        }

        chartBox.style.display = 'block';
        barsContainer.innerHTML = '';

        // Sort descending
        catArray.sort((a,b) => b.val - a.val);

        const maxVal = catArray[0].val;

        catArray.forEach(cat => {
            const percentage = maxVal > 0 ? (cat.val / maxVal) * 100 : 0;
            const barRow = document.createElement('div');
            barRow.className = 'doodle-bar-row';
            if (isHandwriting) barRow.classList.add('handwriting-mode');

            barRow.innerHTML = `
                <span class="doodle-bar-label">${cat.name}</span>
                <div class="doodle-bar-track">
                    <div class="doodle-bar-fill expense" style="width: 0%;"></div>
                </div>
                <span class="doodle-bar-val">R$ ${cat.val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
            `;

            barsContainer.appendChild(barRow);

            // Animate width draw
            setTimeout(() => {
                barRow.querySelector('.doodle-bar-fill').style.width = `${percentage}%`;
            }, 100);
        });
    }

    // 10. Diário de Conversas (Archived Chat Logs)
    function renderArchivedChatLogs() {
        const list = document.getElementById('chat-logs-archive-list');
        if (!list) return;
        list.innerHTML = '';
        
        const archived = storage.getArchivedChatMessages();
        
        if (archived.length === 0) {
            list.innerHTML = `<div style="font-family: var(--font-handwriting); text-align: center; padding: 20px; color: var(--text-muted); font-size: 1rem;">Nenhuma conversa arquivada de semanas anteriores.</div>`;
            return;
        }
        
        // Group by day
        const grouped = {};
        archived.forEach(msg => {
            const date = new Date(msg.timestamp);
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            if (!grouped[dateStr]) {
                grouped[dateStr] = [];
            }
            grouped[dateStr].push(msg);
        });
        
        Object.keys(grouped).forEach(day => {
            const dayContainer = document.createElement('div');
            dayContainer.style.display = 'flex';
            dayContainer.style.flexDirection = 'column';
            dayContainer.style.gap = '8px';
            
            const dayHeader = document.createElement('div');
            dayHeader.style.fontSize = '0.75rem';
            dayHeader.style.fontWeight = '600';
            dayHeader.style.color = 'var(--text-muted)';
            dayHeader.style.borderBottom = '1px dotted var(--line-color)';
            dayHeader.style.paddingBottom = '4px';
            dayHeader.style.marginTop = '10px';
            dayHeader.innerText = day;
            dayContainer.appendChild(dayHeader);
            
            grouped[day].forEach(msg => {
                const bubble = document.createElement('div');
                bubble.style.padding = '8px 12px';
                bubble.style.borderRadius = '8px';
                bubble.style.fontSize = '0.8rem';
                bubble.style.maxWidth = '85%';
                bubble.style.lineHeight = '1.3';
                
                if (msg.sender === 'user') {
                    bubble.style.alignSelf = 'flex-end';
                    bubble.style.background = '#E6EEF8';
                    bubble.style.color = 'var(--blue-ink)';
                    bubble.style.border = '1px solid #C5D7F0';
                } else {
                    bubble.style.alignSelf = 'flex-start';
                    bubble.style.background = 'white';
                    bubble.style.color = 'var(--text-primary)';
                    bubble.style.border = '1px dashed var(--line-color)';
                    bubble.style.fontFamily = 'var(--font-handwriting)';
                    bubble.style.fontSize = '0.95rem';
                }
                
                bubble.innerHTML = msg.text;
                dayContainer.appendChild(bubble);
            });
            
            list.appendChild(dayContainer);
        });
    }

    const btnShowChatLogs = document.getElementById('btn-show-chat-logs');
    if (btnShowChatLogs) {
        btnShowChatLogs.addEventListener('click', () => {
            document.getElementById('modal-chat-logs').classList.add('active');
            renderArchivedChatLogs();
        });
    }
    
    const btnCloseChatLogs = document.getElementById('btn-close-chat-logs');
    if (btnCloseChatLogs) {
        btnCloseChatLogs.addEventListener('click', () => {
            document.getElementById('modal-chat-logs').classList.remove('active');
        });
    }

    // 11. Transaction Edit Modal
    function openEditModal(txId) {
        editingTxId = txId;
        const nb = storage.getActiveNotebook();
        const tx = nb.transactions.find(t => t.id === txId);
        
        if (!tx) return;

        editModalTitle.innerText = "Editar Transação";
        editItem.value = tx.item;
        editValue.value = tx.value;
        editDate.value = tx.date;
        editTime.value = tx.time;
        
        // Populate Categories
        populateCategorySelect(editCategory, tx.category);

        // Populate Members
        populateMembersSelect(editAuthor, tx.author);

        const isCofrinhoTx = tx.type === 'cofrinho_guardar' || tx.type === 'cofrinho_resgatar';
        if (isCofrinhoTx) {
            editType.innerHTML = `
                <option value="cofrinho_guardar" ${tx.type === 'cofrinho_guardar' ? 'selected' : ''}>Cofrinho: Guardar</option>
                <option value="cofrinho_resgatar" ${tx.type === 'cofrinho_resgatar' ? 'selected' : ''}>Cofrinho: Resgatar</option>
            `;
            editType.disabled = true;
            editCategory.disabled = true;
        } else {
            editType.disabled = false;
            editCategory.disabled = false;
            editType.innerHTML = `
                <option value="salario" ${tx.type === 'salario' ? 'selected' : ''}>Entrada: Salário</option>
                <option value="receita_esporadica" ${tx.type === 'receita_esporadica' ? 'selected' : ''}>Entrada: Receita Esporádica</option>
                <option value="receita_recorrente" ${tx.type === 'receita_recorrente' ? 'selected' : ''}>Entrada: Receita Recorrente</option>
                <option value="despesa_esporadica" ${tx.type === 'despesa_esporadica' ? 'selected' : ''}>Saída: Despesa Esporádica</option>
                <option value="despesa_recorrente" ${tx.type === 'despesa_recorrente' ? 'selected' : ''}>Saída: Despesa Recorrente</option>
            `;
        }

        btnDeleteTransaction.style.display = 'block';
        modalEditTransaction.classList.add('active');
    }

    function populateCategorySelect(selectEl, selectedVal) {
        selectEl.innerHTML = '';
        storage.getCategories().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            if (c === selectedVal) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    function populateMembersSelect(selectEl, selectedVal) {
        selectEl.innerHTML = '';
        
        // Ensure current user is in list
        const members = storage.getMembers(storage.data.activeNotebookId);
        if (members.length === 0) {
            const opt = document.createElement('option');
            opt.value = storage.getCurrentUser();
            opt.innerText = storage.getCurrentUser();
            selectEl.appendChild(opt);
        } else {
            members.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.innerText = `${m.name} (${m.role})`;
                if (m.name === selectedVal) opt.selected = true;
                selectEl.appendChild(opt);
            });
        }
    }

    btnCancelEdit.addEventListener('click', () => {
        modalEditTransaction.classList.remove('active');
        editingTxId = null;
    });

    btnSaveTransaction.addEventListener('click', () => {
        if (!editItem.value.trim() || !editValue.value) {
            alert("Preencha item e valor!");
            return;
        }

        const data = {
            item: editItem.value.trim(),
            value: parseFloat(editValue.value),
            type: editType.value,
            category: editCategory.value,
            date: editDate.value,
            time: editTime.value,
            author: editAuthor.value
        };

        if (editingTxId) {
            // Update existing
            storage.updateTransaction(editingTxId, data);
            
            // If the name changed, verify if we can learn this association
            const cleanName = editItem.value.toLowerCase().trim();
            storage.learnTerm(cleanName, editCategory.value, editType.value);
        }

        modalEditTransaction.classList.remove('active');
        editingTxId = null;
        updateUI();
    });

    btnDeleteTransaction.addEventListener('click', () => {
        if (editingTxId) {
            const element = document.getElementById(`tx-row-${editingTxId}`);
            
            if (element) {
                // Play erase eraser animation
                element.className = 'transaction-item erasing-line-anim';
                setTimeout(() => {
                    storage.deleteTransaction(editingTxId);
                    modalEditTransaction.classList.remove('active');
                    editingTxId = null;
                    updateUI();
                }, 400);
            } else {
                storage.deleteTransaction(editingTxId);
                modalEditTransaction.classList.remove('active');
                editingTxId = null;
                updateUI();
            }
        }
    });

    // 12. Add Category Modal
    document.getElementById('btn-add-category-quick').addEventListener('click', () => {
        modalNewCategory.classList.add('active');
    });

    btnCancelNewCategory.addEventListener('click', () => {
        modalNewCategory.classList.remove('active');
        newCategoryName.value = '';
    });

    btnSaveNewCategory.addEventListener('click', () => {
        const cat = newCategoryName.value.trim();
        if (cat) {
            if (storage.addCategory(cat)) {
                // Re-populate selects
                populateCategorySelect(editCategory, cat);
                modalNewCategory.classList.remove('active');
                newCategoryName.value = '';
            } else {
                alert("Categoria já existe!");
            }
        }
    });

    // 13. Switch Notebook Shelf Modal
    btnSwitchNotebook.addEventListener('click', () => {
        openNotebookShelf();
    });

    btnCloseSwitchNotebook.addEventListener('click', () => {
        modalSwitchNotebook.classList.remove('active');
    });

    function openNotebookShelf() {
        modalSwitchNotebook.classList.add('active');
        renderShelfList();
    }

    function renderShelfList() {
        const list = notebooksShelfList;
        list.innerHTML = '';
        
        const books = storage.getNotebooks();
        const activeId = storage.getActiveNotebook().id;

        books.forEach(b => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '8px 12px';
            row.style.border = '1px dashed var(--line-color)';
            row.style.borderRadius = '8px';
            row.style.cursor = 'pointer';
            if (b.id === activeId) {
                row.style.background = '#f0fdf4';
                row.style.borderColor = '#bbf7d0';
            }

            const titleSpan = document.createElement('span');
            titleSpan.innerHTML = `<i class="fa-solid fa-book" style="margin-right:6px; color:#b45309;"></i> <strong>${b.name}</strong> (${b.members.length} pessoas)`;
            
            row.appendChild(titleSpan);

            // Container para as ações do caderno
            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.alignItems = 'center';
            actionsDiv.style.gap = '4px';

            // Botão de editar nome (lápis)
            const btnRename = document.createElement('button');
            btnRename.className = 'btn-delete-fixed'; // re-use button styling for consistency
            btnRename.innerHTML = '<i class="fa-solid fa-pen" style="font-size: 0.8rem;"></i>';
            btnRename.style.background = 'transparent';
            btnRename.style.border = 'none';
            btnRename.style.color = 'var(--text-muted)';
            btnRename.style.cursor = 'pointer';
            btnRename.style.padding = '4px 8px';
            btnRename.style.borderRadius = '4px';
            btnRename.style.transition = 'all 0.2s';
            
            btnRename.addEventListener('mouseenter', () => {
                btnRename.style.color = 'var(--accent-color)';
                btnRename.style.background = 'rgba(59, 130, 246, 0.05)';
            });
            btnRename.addEventListener('mouseleave', () => {
                btnRename.style.color = 'var(--text-muted)';
                btnRename.style.background = 'transparent';
            });
            
            btnRename.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt(`Digite o novo nome para o caderno "${b.name}":`, b.name);
                if (newName !== null) {
                    const cleanName = newName.trim();
                    if (cleanName) {
                        const res = storage.renameNotebook(cleanName ? b.id : '', cleanName);
                        // wait, storage.renameNotebook parameters are: renameNotebook(id, newName)
                        const response = storage.renameNotebook(b.id, cleanName);
                        if (response.success) {
                            renderShelfList();
                            updateUI();
                        } else {
                            alert(response.message);
                        }
                    }
                }
            });
            actionsDiv.appendChild(btnRename);

            // Botão de deletar caderno (se houver mais de um)
            if (books.length > 1) {
                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn-delete-fixed';
                btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';
                btnDelete.style.background = 'transparent';
                btnDelete.style.border = 'none';
                btnDelete.style.color = 'var(--text-muted)';
                btnDelete.style.cursor = 'pointer';
                btnDelete.style.padding = '4px 8px';
                btnDelete.style.borderRadius = '4px';
                btnDelete.style.transition = 'all 0.2s';
                
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Deseja realmente excluir permanentemente o caderno "${b.name}"? Todos os lançamentos, dívidas, receitas e histórico de chat deste caderno serão apagados para sempre.`)) {
                        const res = storage.deleteNotebook(b.id);
                        if (res.success) {
                            renderShelfList();
                            updateUI();
                        } else {
                            alert(res.message);
                        }
                    }
                });
                
                actionsDiv.appendChild(btnDelete);
            }
            
            row.appendChild(actionsDiv);
            
            // Clicking card switches notebook
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return; // ignore if clicking action button
                storage.setActiveNotebook(b.id);
                modalSwitchNotebook.classList.remove('active');
                updateUI();
            });

            list.appendChild(row);
        });
    }

    btnCreateNotebook.addEventListener('click', () => {
        const name = newNotebookName.value.trim();
        if (name) {
            storage.createNotebook(name);
            newNotebookName.value = '';
            modalSwitchNotebook.classList.remove('active');
            updateUI();
        }
    });

    btnRedeemInvite.addEventListener('click', () => {
        const code = inviteCodeInput.value.trim();
        if (code) {
            storage.joinNotebookByCode(code);
            inviteCodeInput.value = '';
            modalSwitchNotebook.classList.remove('active');
            updateUI();
        }
    });

    // 14. Sharing Modal
    btnShareSettings.addEventListener('click', () => {
        openSharingModal();
    });

    btnCloseSharing.addEventListener('click', () => {
        modalSharingDetails.classList.remove('active');
    });

    function openSharingModal() {
        modalSharingDetails.classList.add('active');
        const activeNb = storage.getActiveNotebook();
        displayInviteCode.innerText = activeNb.inviteCode;
        renderSharingMembers();
    }

    // Native Share / Clipboard Fallback for Invitation Code
    btnShareInviteNative.addEventListener('click', () => {
        const guestName = shareNewName.value.trim();
        const guestRole = shareNewRole.value.trim() || 'Convidado';
        const activeNb = storage.getActiveNotebook();
        const code = activeNb.inviteCode;

        if (!guestName) {
            alert("Por favor, preencha o nome do convidado antes de enviar.");
            return;
        }

        // Add guest to members list locally
        storage.addMember(activeNb.id, guestName, guestRole);
        renderSharingMembers();

        const inviteMessage = `Olá, ${guestName}! Estou te convidando para compartilhar meu caderno financeiro no Minhas Contas como meu(minha) ${guestRole}. Crie sua conta e use o código de convite: ${code}`;

        if (navigator.share) {
            navigator.share({
                title: 'Compartilhar Caderno',
                text: inviteMessage
            })
            .then(() => {
                shareNewName.value = '';
                shareNewRole.value = '';
            })
            .catch(err => console.log('Erro ao compartilhar:', err));
        } else {
            navigator.clipboard.writeText(inviteMessage).then(() => {
                alert(`Mensagem de convite copiada! Cole no WhatsApp para enviar para ${guestName}.\n\nMensagem: "${inviteMessage}"`);
                shareNewName.value = '';
                shareNewRole.value = '';
            }).catch(err => console.error('Erro ao copiar convite:', err));
        }
    });

    function renderSharingMembers() {
        const list = sharingMembersList;
        list.innerHTML = '';
        
        const activeNb = storage.getActiveNotebook();
        const members = activeNb.members;

        members.forEach(m => {
            const card = document.createElement('div');
            card.style.display = 'flex';
            card.style.justifyContent = 'space-between';
            card.style.alignItems = 'center';
            card.style.padding = '6px 10px';
            card.style.background = '#f8fafc';
            card.style.borderRadius = '6px';
            card.style.fontSize = '0.8rem';

            card.innerHTML = `
                <span><strong>${m.name}</strong> - ${m.role}</span>
                ${m.role !== 'Proprietário' ? `<button class="btn-danger" style="padding:2px 6px; font-size:0.7rem; border-radius:4px;">Revogar</button>` : ''}
            `;

            const revBtn = card.querySelector('button');
            if (revBtn) {
                revBtn.addEventListener('click', () => {
                    if (confirm(`Deseja revogar o acesso de ${m.name}?`)) {
                        storage.removeMember(activeNb.id, m.name);
                        renderSharingMembers();
                    }
                });
            }

            list.appendChild(card);
        });
    }

    // 14.5. Dívidas Mensais & Receitas Mensais Modal Logic (Agenda Mensal)
    const btnOpenFixedAccounts = document.getElementById('btn-open-fixed-accounts');
    const btnOpenFixedIncomes = document.getElementById('btn-open-fixed-incomes');
    const btnMenuFixedAccounts = document.getElementById('btn-menu-fixed-accounts');
    const btnMenuFixedIncomes = document.getElementById('btn-menu-fixed-incomes');
    const modalFixedAccounts = document.getElementById('modal-fixed-accounts');
    const btnBackFixedAccounts = document.getElementById('btn-back-fixed-accounts');
    const formFixedAccount = document.getElementById('form-fixed-account');
    const fixedName = document.getElementById('fixed-name');
    const fixedValue = document.getElementById('fixed-value');
    const fixedDay = document.getElementById('fixed-day');
    const fixedExpiration = document.getElementById('fixed-expiration');
    const fixedAccountsList = document.getElementById('fixed-accounts-list');
    const btnToggleAddFixed = document.getElementById('btn-toggle-add-fixed');
    const fixedFormCollapsible = document.getElementById('fixed-form-collapsible');
    const btnCancelFixedAccount = document.getElementById('btn-cancel-fixed-account');

    function showFixedForm(show) {
        if (!fixedFormCollapsible || !btnToggleAddFixed) return;
        if (show) {
            fixedFormCollapsible.classList.add('active');
            btnToggleAddFixed.classList.add('active');
        } else {
            fixedFormCollapsible.classList.remove('active');
            btnToggleAddFixed.classList.remove('active');
            if (formFixedAccount) formFixedAccount.reset();
        }
    }

    function openFixedAccountsModal(tab = 'debts') {
        if (notebookDropdown) notebookDropdown.classList.remove('active');
        modalFixedAccounts.classList.add('active');
        
        const debtsTabBtn = document.getElementById('fixed-tab-debts');
        const incomesTabBtn = document.getElementById('fixed-tab-incomes');
        const contentPanel = modalFixedAccounts.querySelector('.fixed-accounts-page-content');
        
        currentFixedTab = tab;
        
        const fixedNameLabel = document.getElementById('label-fixed-name');
        const fixedNameInput = document.getElementById('fixed-name');
        const fixedDayLabel = document.getElementById('label-fixed-day');
        const fixedListSubtitle = document.getElementById('fixed-list-subtitle');
        const btnToggleAdd = document.getElementById('btn-toggle-add-fixed');
        
        showFixedForm(false);
        
        if (tab === 'incomes') {
            if (debtsTabBtn) debtsTabBtn.classList.remove('active');
            if (incomesTabBtn) incomesTabBtn.classList.add('active');
            if (contentPanel) {
                contentPanel.classList.add('theme-soft-teal');
                contentPanel.classList.remove('theme-soft-red');
            }
            
            if (btnToggleAdd) btnToggleAdd.innerHTML = '<i class="fa-solid fa-plus"></i> Receita';
            if (fixedNameLabel) fixedNameLabel.innerText = 'Nome da Receita';
            if (fixedNameInput) fixedNameInput.placeholder = 'Ex: Salário Mensal';
            if (fixedDayLabel) fixedDayLabel.innerText = 'Dia do Recebimento';
            if (fixedListSubtitle) fixedListSubtitle.innerText = 'Minhas Receitas Mensais';
        } else {
            if (debtsTabBtn) debtsTabBtn.classList.add('active');
            if (incomesTabBtn) incomesTabBtn.classList.remove('active');
            if (contentPanel) {
                contentPanel.classList.add('theme-soft-red');
                contentPanel.classList.remove('theme-soft-teal');
            }
            
            if (btnToggleAdd) btnToggleAdd.innerHTML = '<i class="fa-solid fa-plus"></i> Dívida';
            if (fixedNameLabel) fixedNameLabel.innerText = 'Nome da Dívida';
            if (fixedNameInput) fixedNameInput.placeholder = 'Ex: Colégio José';
            if (fixedDayLabel) fixedDayLabel.innerText = 'Dia do Vencimento';
            if (fixedListSubtitle) fixedListSubtitle.innerText = 'Minhas Dívidas Mensais';
        }
        
        renderFixedAccountsList();
    }

    if (btnOpenFixedAccounts) {
        btnOpenFixedAccounts.addEventListener('click', (e) => {
            e.stopPropagation();
            openFixedAccountsModal('debts');
        });
    }

    if (btnOpenFixedIncomes) {
        btnOpenFixedIncomes.addEventListener('click', (e) => {
            e.stopPropagation();
            openFixedAccountsModal('incomes');
        });
    }

    if (btnMenuFixedAccounts) {
        btnMenuFixedAccounts.addEventListener('click', (e) => {
            e.stopPropagation();
            openFixedAccountsModal('debts');
        });
    }

    if (btnMenuFixedIncomes) {
        btnMenuFixedIncomes.addEventListener('click', (e) => {
            e.stopPropagation();
            openFixedAccountsModal('incomes');
        });
    }

    const debtsTabBtn = document.getElementById('fixed-tab-debts');
    const incomesTabBtn = document.getElementById('fixed-tab-incomes');
    if (debtsTabBtn) {
        debtsTabBtn.addEventListener('click', () => {
            openFixedAccountsModal('debts');
        });
    }
    if (incomesTabBtn) {
        incomesTabBtn.addEventListener('click', () => {
            openFixedAccountsModal('incomes');
        });
    }

    if (btnBackFixedAccounts) {
        btnBackFixedAccounts.addEventListener('click', () => {
            modalFixedAccounts.classList.remove('active');
        });
    }

    if (btnToggleAddFixed) {
        btnToggleAddFixed.addEventListener('click', () => {
            const isOpen = fixedFormCollapsible.classList.contains('active');
            showFixedForm(!isOpen);
        });
    }

    if (btnCancelFixedAccount) {
        btnCancelFixedAccount.addEventListener('click', () => {
            showFixedForm(false);
        });
    }

    if (formFixedAccount) {
        formFixedAccount.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = fixedName.value.trim();
            const val = parseFloat(fixedValue.value) || 0;
            const day = parseInt(fixedDay.value, 10) || 1;
            const expiration = fixedExpiration && fixedExpiration.value ? fixedExpiration.value.trim() : null;

            if (name && val > 0 && day >= 1 && day <= 31) {
                if (currentFixedTab === 'incomes') {
                    storage.addFixedIncome(name, val, day, expiration);
                } else {
                    storage.addFixedAccount(name, val, day, expiration);
                }
                renderFixedAccountsList();
                updateUI();
                showFixedForm(false);
            } else {
                alert("Preencha todos os campos corretamente!");
            }
        });
    }

    function renderFixedAccountsList() {
        if (!fixedAccountsList) return;
        fixedAccountsList.innerHTML = '';
        
        const accounts = storage.getFixedAccounts();
        const incomes = storage.getFixedIncomes();
        const selectedMonth = currentFilters.selectedMonthYear; // YYYY-MM
        const transactions = storage.getTransactions();

        // Calculate active items based on expiration
        const activeAccounts = accounts.filter(acc => !acc.expiration || selectedMonth <= acc.expiration);
        const activeIncomes = incomes.filter(inc => !inc.expiration || selectedMonth <= inc.expiration);
        
        const totalDebtsVal = activeAccounts.reduce((sum, acc) => sum + acc.value, 0);
        const totalIncomesVal = activeIncomes.reduce((sum, inc) => sum + inc.value, 0);

        // Render Premium Adaptive KPI Card
        const summaryCardEl = document.getElementById('fixed-budget-summary-card');
        if (summaryCardEl) {
            summaryCardEl.className = 'fixed-budget-summary-card'; // reset classes
            
            function formatMonthYear(ymString) {
                if (!ymString || !ymString.includes('-')) return ymString;
                const [year, month] = ymString.split('-');
                const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                const idx = parseInt(month, 10) - 1;
                return (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
            }

            if (currentFixedTab === 'debts') {
                summaryCardEl.classList.add('theme-debts');
                
                // Calculate paid debts and count
                let paidDebtsVal = 0;
                let paidCount = 0;
                activeAccounts.forEach(acc => {
                    const paymentTx = transactions.find(t => 
                        t.item === acc.name && 
                        (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                        t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                    );
                    if (paymentTx) {
                        paidDebtsVal += paymentTx.value;
                        paidCount++;
                    }
                });
                
                const pendingDebtsVal = activeAccounts.reduce((sum, acc) => {
                    const paymentTx = transactions.find(t => 
                        t.item === acc.name && 
                        (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                        t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                    );
                    return sum + (paymentTx ? 0 : acc.value);
                }, 0);
                
                const totalCount = activeAccounts.length;
                const pct = totalDebtsVal > 0 ? Math.min(100, Math.round((paidDebtsVal / totalDebtsVal) * 100)) : 0;
                const statusText = totalCount > 0 ? `${paidCount} de ${totalCount} pagas` : 'Nenhuma dívida';
                
                summaryCardEl.innerHTML = `
                    <div class="kpi-card-header">
                        <span class="kpi-card-title">Resumo de Dívidas • ${formatMonthYear(selectedMonth)}</span>
                        <span class="kpi-card-badge">${statusText}</span>
                    </div>
                    <div class="kpi-card-body">
                        <div class="kpi-main-val-wrapper">
                            <span class="kpi-label">Total Planejado</span>
                            <span class="kpi-val-big">${formatCurrency(totalDebtsVal)}</span>
                        </div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #d14d72;">
                            ${pct}% pago
                        </div>
                    </div>
                    <div class="kpi-progress-container">
                        <div class="kpi-progress-bar">
                            <div class="kpi-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-details-row">
                        <div class="kpi-detail-item">
                            <span class="kpi-detail-label">Confirmado Pago</span>
                            <span class="kpi-detail-val pago">${formatCurrency(paidDebtsVal)}</span>
                        </div>
                        <div class="kpi-detail-item" style="text-align: right;">
                            <span class="kpi-detail-label">Ainda Pendente</span>
                            <span class="kpi-detail-val pendente">${formatCurrency(pendingDebtsVal)}</span>
                        </div>
                    </div>
                `;
            } else {
                summaryCardEl.classList.add('theme-incomes');
                
                // Calculate received incomes and count
                let receivedIncomesVal = 0;
                let receivedCount = 0;
                activeIncomes.forEach(inc => {
                    const receiveTx = transactions.find(t => 
                        t.item === inc.name && 
                        (t.type === 'receita_recorrente' || t.type === 'receita_esporadica' || t.type === 'salario') && 
                        t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                    );
                    if (receiveTx) {
                        receivedIncomesVal += receiveTx.value;
                        receivedCount++;
                    }
                });
                
                const pendingIncomesVal = activeIncomes.reduce((sum, inc) => {
                    const receiveTx = transactions.find(t => 
                        t.item === inc.name && 
                        (t.type === 'receita_recorrente' || t.type === 'receita_esporadica' || t.type === 'salario') && 
                        t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                    );
                    return sum + (receiveTx ? 0 : inc.value);
                }, 0);
                
                const totalCount = activeIncomes.length;
                const pct = totalIncomesVal > 0 ? Math.min(100, Math.round((receivedIncomesVal / totalIncomesVal) * 100)) : 0;
                const statusText = totalCount > 0 ? `${receivedCount} de ${totalCount} recebidas` : 'Nenhuma receita';
                
                summaryCardEl.innerHTML = `
                    <div class="kpi-card-header">
                        <span class="kpi-card-title">Resumo de Receitas • ${formatMonthYear(selectedMonth)}</span>
                        <span class="kpi-card-badge">${statusText}</span>
                    </div>
                    <div class="kpi-card-body">
                        <div class="kpi-main-val-wrapper">
                            <span class="kpi-label">Total Planejado</span>
                            <span class="kpi-val-big">${formatCurrency(totalIncomesVal)}</span>
                        </div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #0d9488;">
                            ${pct}% recebido
                        </div>
                    </div>
                    <div class="kpi-progress-container">
                        <div class="kpi-progress-bar">
                            <div class="kpi-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-details-row">
                        <div class="kpi-detail-item">
                            <span class="kpi-detail-label">Confirmado Recebido</span>
                            <span class="kpi-detail-val recebido">${formatCurrency(receivedIncomesVal)}</span>
                        </div>
                        <div class="kpi-detail-item" style="text-align: right;">
                            <span class="kpi-detail-label">Ainda Pendente</span>
                            <span class="kpi-detail-val pendente">${formatCurrency(pendingIncomesVal)}</span>
                        </div>
                    </div>
                `;
            }
        }

        // 2. Render List Based on Tab
        if (currentFixedTab === 'debts') {
            if (activeAccounts.length === 0) {
                fixedAccountsList.innerHTML = `
                    <div style="font-family: var(--font-handwriting); text-align: center; padding: 20px; color: var(--text-muted); font-size: 1rem;">
                        Nenhuma dívida mensal ativa para este mês.
                    </div>
                `;
                return;
            }
            
            const sorted = [...activeAccounts].sort((a, b) => a.day - b.day);
            sorted.forEach(acc => {
                const item = document.createElement('div');
                item.className = 'fixed-account-item';
                if (isHandwriting) item.classList.add('handwriting-mode');
                
                let expMeta = '';
                if (acc.expiration) {
                    const [year, month] = acc.expiration.split('-');
                    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    const idx = parseInt(month, 10) - 1;
                    const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]}/${year}` : `${month}/${year}`;
                    expMeta = ` • Válido até ${expFormatted}`;
                }
                
                const paymentTx = transactions.find(t => 
                    t.item === acc.name && 
                    (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                    t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                );
                const isPaid = !!paymentTx;
                
                // Overdue logic
                const today = new Date();
                const todayYearStr = today.getFullYear();
                const todayMonthStr = String(today.getMonth() + 1).padStart(2, '0');
                const todayDay = today.getDate();
                const todayMonthYear = `${todayYearStr}-${todayMonthStr}`;
                
                let isOverdue = false;
                if (!isPaid) {
                    if (selectedMonth < todayMonthYear) {
                        isOverdue = true;
                    } else if (selectedMonth === todayMonthYear && acc.day < todayDay) {
                        isOverdue = true;
                    }
                }
                
                if (isOverdue) {
                    item.classList.add('overdue-item');
                }
                
                let actionHtml = '';
                if (isPaid) {
                    const parts = (paymentTx.date && typeof paymentTx.date === 'string') ? paymentTx.date.split('-') : [];
                    const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}` : '';
                    actionHtml = `<span class="paid-badge" title="Valor Pago: R$ ${paymentTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"><i class="fa-solid fa-circle-check"></i> Pago (${dateFormatted})</span>`;
                } else {
                    actionHtml = `<button class="btn-pay-fixed" data-id="${acc.id}">Paguei</button>`;
                }
                
                let valueHtml = `R$ ${acc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (isPaid && paymentTx.value !== acc.value) {
                    const diff = paymentTx.value - acc.value;
                    const diffAbs = Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const isSaving = diff < 0;
                    const diffClass = isSaving ? 'val-diff-saving' : 'val-diff-spending';
                    const diffSign = diff > 0 ? '+' : '-';
                    const diffLabel = isSaving ? 'Economia' : 'Acréscimo';
                    valueHtml = `
                        <span class="val-planned-struck" title="Valor planejado: R$ ${acc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">${acc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="val-actual-paid ${diffClass}" title="Valor pago real: R$ ${paymentTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">R$ ${paymentTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="diff-badge ${diffClass}" title="${diffLabel} de R$ ${diffAbs}">${diffSign} R$ ${diffAbs}</span>
                    `;
                }
                
                item.innerHTML = `
                    <div class="fixed-acc-info">
                        <span class="fixed-acc-name">${acc.name}</span>
                        <span class="fixed-acc-meta">Todo dia ${acc.day} • ${valueHtml}${expMeta}</span>
                        ${isOverdue ? `<span class="overdue-tag">⚠️ Atrasada (Venceu dia ${acc.day})</span>` : ''}
                    </div>
                    <div class="fixed-acc-actions">
                        ${actionHtml}
                        <button class="btn-delete-fixed" data-id="${acc.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                
                if (!isPaid) {
                    item.querySelector('.btn-pay-fixed').addEventListener('click', () => {
                        const promptValue = prompt(`Confirmar ou alterar o valor do pagamento para "${acc.name}":`, acc.value.toFixed(2).replace('.', ','));
                        if (promptValue === null) return;
                        
                        const cleanedValue = promptValue.replace(/\s/g, '').replace(',', '.');
                        const parsedValue = parseFloat(cleanedValue);
                        if (isNaN(parsedValue) || parsedValue < 0) {
                            alert("Valor inválido!");
                            return;
                        }
                        
                        const newTx = storage.payFixedAccount(acc.id, parsedValue, selectedMonth);
                        if (newTx) {
                            updateUI();
                            setTimeout(() => {
                                const el = document.getElementById(`tx-row-${newTx.id}`);
                                if (el) el.classList.add('writing-line-anim');
                            }, 100);
                        }
                    });
                }
                
                item.querySelector('.btn-delete-fixed').addEventListener('click', () => {
                    if (confirm(`Deseja excluir a dívida mensal "${acc.name}"?`)) {
                        storage.deleteFixedAccount(acc.id);
                        updateUI();
                    }
                });
                
                fixedAccountsList.appendChild(item);
            });
        } else if (currentFixedTab === 'incomes') {
            if (activeIncomes.length === 0) {
                fixedAccountsList.innerHTML = `
                    <div style="font-family: var(--font-handwriting); text-align: center; padding: 20px; color: var(--text-muted); font-size: 1rem;">
                        Nenhuma receita mensal ativa para este mês.
                    </div>
                `;
                return;
            }
            
            const sorted = [...activeIncomes].sort((a, b) => a.day - b.day);
            sorted.forEach(inc => {
                const item = document.createElement('div');
                item.className = 'fixed-account-item';
                if (isHandwriting) item.classList.add('handwriting-mode');
                
                let expMeta = '';
                if (inc.expiration) {
                    const [year, month] = inc.expiration.split('-');
                    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    const idx = parseInt(month, 10) - 1;
                    const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]}/${year}` : `${month}/${year}`;
                    expMeta = ` • Válido até ${expFormatted}`;
                }
                
                const receiveTx = transactions.find(t => 
                    t.item === inc.name && 
                    (t.type === 'receita_recorrente' || t.type === 'receita_esporadica' || t.type === 'salario') && 
                    t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
                );
                const isReceived = !!receiveTx;
                
                let actionHtml = '';
                if (isReceived) {
                    const parts = (receiveTx.date && typeof receiveTx.date === 'string') ? receiveTx.date.split('-') : [];
                    const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}` : '';
                    actionHtml = `<span class="paid-badge" style="background-color: #e0f2fe; color: #0369a1; border-color: #bae6fd;" title="Valor Recebido: R$ ${receiveTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"><i class="fa-solid fa-circle-check" style="color: #0284c7;"></i> Recebido (${dateFormatted})</span>`;
                } else {
                    actionHtml = `<button class="btn-pay-fixed" style="background: #0d9488; border-color: #0d9488; color: white;" data-id="${inc.id}">Recebi</button>`;
                }
                
                let valueHtml = `R$ ${inc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (isReceived && receiveTx.value !== inc.value) {
                    const diff = receiveTx.value - inc.value;
                    const diffAbs = Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const isExtra = diff > 0;
                    const diffClass = isExtra ? 'val-diff-saving' : 'val-diff-spending'; // green for extra, red for lower income
                    const diffSign = diff > 0 ? '+' : '-';
                    const diffLabel = isExtra ? 'Rendimento Extra' : 'Menor Rendimento';
                    valueHtml = `
                        <span class="val-planned-struck" title="Valor planejado: R$ ${inc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">${inc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="val-actual-paid ${diffClass}" title="Valor recebido real: R$ ${receiveTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">R$ ${receiveTx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="diff-badge ${diffClass}" title="${diffLabel} de R$ ${diffAbs}">${diffSign} R$ ${diffAbs}</span>
                    `;
                }
                
                item.innerHTML = `
                    <div class="fixed-acc-info">
                        <span class="fixed-acc-name">${inc.name}</span>
                        <span class="fixed-acc-meta">Todo dia ${inc.day} • ${valueHtml}${expMeta}</span>
                    </div>
                    <div class="fixed-acc-actions">
                        ${actionHtml}
                        <button class="btn-delete-fixed" data-id="${inc.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                
                if (!isReceived) {
                    item.querySelector('.btn-pay-fixed').addEventListener('click', () => {
                        const promptValue = prompt(`Confirmar ou alterar o valor do recebimento para "${inc.name}":`, inc.value.toFixed(2).replace('.', ','));
                        if (promptValue === null) return;
                        
                        const cleanedValue = promptValue.replace(/\s/g, '').replace(',', '.');
                        const parsedValue = parseFloat(cleanedValue);
                        if (isNaN(parsedValue) || parsedValue < 0) {
                            alert("Valor inválido!");
                            return;
                        }
                        
                        const newTx = storage.receiveFixedIncome(inc.id, parsedValue, selectedMonth);
                        if (newTx) {
                            updateUI();
                            setTimeout(() => {
                                const el = document.getElementById(`tx-row-${newTx.id}`);
                                if (el) el.classList.add('writing-line-anim');
                            }, 100);
                        }
                    });
                }
                
                item.querySelector('.btn-delete-fixed').addEventListener('click', () => {
                    if (confirm(`Deseja excluir a receita mensal "${inc.name}"?`)) {
                        storage.deleteFixedIncome(inc.id);
                        updateUI();
                    }
                });
                
                fixedAccountsList.appendChild(item);
            });
        }
    }

    // 14.6. Cofrinho Logic and Bindings
    const btnFloatingPiggy = document.getElementById('btn-floating-piggy');
    const modalCofrinho = document.getElementById('modal-cofrinho');
    const btnCloseCofrinho = document.getElementById('btn-close-cofrinho');
    const btnCofrinhoDeposit = document.getElementById('btn-cofrinho-deposit');
    const btnCofrinhoWithdraw = document.getElementById('btn-cofrinho-withdraw');
    const cofrinhoAmountInput = document.getElementById('cofrinho-amount');
    const cofrinhoCard = modalCofrinho ? modalCofrinho.querySelector('.cofrinho-card') : null;

    function resetCofrinhoPosition() {
        if (cofrinhoCard) {
            cofrinhoCard.style.position = '';
            cofrinhoCard.style.left = '';
            cofrinhoCard.style.top = '';
            cofrinhoCard.style.margin = '';
            cofrinhoCard.style.transform = '';
            cofrinhoCard.classList.remove('dragging');
        }
    }

    if (btnFloatingPiggy) {
        btnFloatingPiggy.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modalCofrinho) {
                resetCofrinhoPosition();
                modalCofrinho.classList.add('active');
                updateCofrinhoUI();
            }
        });
    }

    if (btnCloseCofrinho) {
        btnCloseCofrinho.addEventListener('click', () => {
            if (modalCofrinho) {
                modalCofrinho.classList.remove('active');
                resetCofrinhoPosition();
            }
        });
    }

    // Draggable functionality for Cofrinho Modal
    if (cofrinhoCard && modalCofrinho) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onDragStart = (e) => {
            // Se clicar em elementos interativos, não inicia o arraste
            if (e.target.closest('input, button, select, textarea, #cofrinho-history-container, #cofrinho-history-list')) {
                return;
            }

            isDragging = true;
            cofrinhoCard.classList.add('dragging');

            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            const rect = cofrinhoCard.getBoundingClientRect();
            const parentRect = modalCofrinho.getBoundingClientRect();

            startLeft = rect.left - parentRect.left;
            startTop = rect.top - parentRect.top;

            startX = clientX;
            startY = clientY;

            cofrinhoCard.style.position = 'absolute';
            cofrinhoCard.style.margin = '0';
            cofrinhoCard.style.left = `${startLeft}px`;
            cofrinhoCard.style.top = `${startTop}px`;
            cofrinhoCard.style.transform = 'none';

            document.addEventListener('mousemove', onDragMove, { passive: false });
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);

            if (e.cancelable) e.preventDefault();
        };

        const onDragMove = (e) => {
            if (!isDragging) return;

            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            let newLeft = startLeft + dx;
            let newTop = startTop + dy;

            const parentWidth = modalCofrinho.clientWidth;
            const parentHeight = modalCofrinho.clientHeight;
            const cardWidth = cofrinhoCard.offsetWidth;
            const cardHeight = cofrinhoCard.offsetHeight;

            const finalLeft = Math.max(0, Math.min(newLeft, parentWidth - cardWidth));
            const finalTop = Math.max(0, Math.min(newTop, parentHeight - cardHeight));

            cofrinhoCard.style.left = `${finalLeft}px`;
            cofrinhoCard.style.top = `${finalTop}px`;

            if (e.cancelable) e.preventDefault();
        };

        const onDragEnd = () => {
            if (isDragging) {
                isDragging = false;
                cofrinhoCard.classList.remove('dragging');
            }
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);
        };

        cofrinhoCard.addEventListener('mousedown', onDragStart);
        cofrinhoCard.addEventListener('touchstart', onDragStart, { passive: false });
    }

    if (btnCofrinhoDeposit) {
        btnCofrinhoDeposit.addEventListener('click', () => {
            if (!cofrinhoAmountInput) return;
            const amount = parseFloat(cofrinhoAmountInput.value);
            if (isNaN(amount) || amount <= 0) {
                alert("Por favor, digite um valor válido para guardar!");
                return;
            }
            storage.depositToCofrinho(amount);
            cofrinhoAmountInput.value = '';
            updateUI();
        });
    }

    if (btnCofrinhoWithdraw) {
        btnCofrinhoWithdraw.addEventListener('click', () => {
            if (!cofrinhoAmountInput) return;
            const amount = parseFloat(cofrinhoAmountInput.value);
            if (isNaN(amount) || amount <= 0) {
                alert("Por favor, digite um valor válido para resgatar!");
                return;
            }
            const currentBalance = storage.getCofrinhoBalance();
            if (amount > currentBalance) {
                alert("Você não tem saldo suficiente no cofrinho!");
                return;
            }
            storage.withdrawFromCofrinho(amount);
            cofrinhoAmountInput.value = '';
            updateUI();
        });
    }

    // Cofrinho Meta Event Listeners
    const btnShowMetaForm = document.getElementById('btn-show-meta-form');
    const btnCancelMeta = document.getElementById('btn-cancel-meta');
    const btnSaveMeta = document.getElementById('btn-save-meta');
    const btnEditMeta = document.getElementById('btn-edit-meta');
    const btnDeleteMeta = document.getElementById('btn-delete-meta');
    
    const metaNameInput = document.getElementById('cofrinho-meta-name-input');
    const metaValInput = document.getElementById('cofrinho-meta-val-input');
    const cofrinhoMetaEmpty = document.getElementById('cofrinho-meta-empty');
    const cofrinhoMetaForm = document.getElementById('cofrinho-meta-form');
    const cofrinhoMetaActive = document.getElementById('cofrinho-meta-active');

    if (btnShowMetaForm) {
        btnShowMetaForm.addEventListener('click', () => {
            if (cofrinhoMetaEmpty) cofrinhoMetaEmpty.style.display = 'none';
            if (cofrinhoMetaForm) cofrinhoMetaForm.style.display = 'block';
            if (metaNameInput) metaNameInput.focus();
        });
    }

    if (btnCancelMeta) {
        btnCancelMeta.addEventListener('click', () => {
            if (cofrinhoMetaForm) cofrinhoMetaForm.style.display = 'none';
            if (metaNameInput) metaNameInput.value = '';
            if (metaValInput) metaValInput.value = '';
            updateCofrinhoUI();
        });
    }

    if (btnSaveMeta) {
        btnSaveMeta.addEventListener('click', () => {
            const name = metaNameInput ? metaNameInput.value.trim() : '';
            const val = metaValInput ? parseFloat(metaValInput.value) : 0;
            
            if (!name) {
                alert("Por favor, digite o nome da meta!");
                return;
            }
            if (isNaN(val) || val <= 0) {
                alert("Por favor, digite um valor de meta válido!");
                return;
            }
            
            storage.setCofrinhoMeta(name, val);
            if (metaNameInput) metaNameInput.value = '';
            if (metaValInput) metaValInput.value = '';
            if (cofrinhoMetaForm) cofrinhoMetaForm.style.display = 'none';
            updateCofrinhoUI();
        });
    }

    if (btnEditMeta) {
        btnEditMeta.addEventListener('click', () => {
            const meta = storage.getCofrinhoMeta();
            if (metaNameInput) metaNameInput.value = meta.name;
            if (metaValInput) metaValInput.value = meta.value;
            if (cofrinhoMetaActive) cofrinhoMetaActive.style.display = 'none';
            if (cofrinhoMetaForm) cofrinhoMetaForm.style.display = 'block';
        });
    }

    if (btnDeleteMeta) {
        btnDeleteMeta.addEventListener('click', () => {
            if (confirm("Deseja mesmo excluir esta meta?")) {
                storage.deleteCofrinhoMeta();
                updateCofrinhoUI();
            }
        });
    }

    function updateCofrinhoUI() {
        const balance = storage.getCofrinhoBalance();
        const badge = document.getElementById('piggy-balance-badge');
        if (badge) {
            badge.innerText = `R$ ${balance.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
        }
        const totalVal = document.getElementById('cofrinho-total-balance');
        if (totalVal) {
            totalVal.innerText = formatCurrency(balance);
        }

        // Render Cofrinho Meta
        const meta = storage.getCofrinhoMeta();
        const metaEmptyEl = document.getElementById('cofrinho-meta-empty');
        const metaFormEl = document.getElementById('cofrinho-meta-form');
        const metaActiveEl = document.getElementById('cofrinho-meta-active');
        
        if (meta && meta.value > 0) {
            if (metaEmptyEl) metaEmptyEl.style.display = 'none';
            if (metaFormEl) metaFormEl.style.display = 'none';
            if (metaActiveEl) {
                metaActiveEl.style.display = 'block';
                
                const displayNameEl = document.getElementById('cofrinho-meta-display-name');
                const displayValuesEl = document.getElementById('cofrinho-meta-display-values');
                const progressFillEl = document.getElementById('cofrinho-meta-progress-fill');
                const progressPctEl = document.getElementById('cofrinho-meta-progress-pct');
                
                if (displayNameEl) displayNameEl.innerText = `Meta: ${meta.name}`;
                if (displayValuesEl) {
                    displayValuesEl.innerText = `R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / R$ ${meta.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
                
                const pct = Math.min(100, Math.round((balance / meta.value) * 100)) || 0;
                if (progressFillEl) progressFillEl.style.width = `${pct}%`;
                if (progressPctEl) progressPctEl.innerText = `${pct}%`;
            }
        } else {
            if (metaActiveEl) metaActiveEl.style.display = 'none';
            if (metaFormEl && metaFormEl.style.display === 'block') {
                if (metaEmptyEl) metaEmptyEl.style.display = 'none';
            } else {
                if (metaEmptyEl) metaEmptyEl.style.display = 'block';
                if (metaFormEl) metaFormEl.style.display = 'none';
            }
        }

        // Render history
        const historyList = document.getElementById('cofrinho-history-list');
        if (historyList) {
            historyList.innerHTML = '';
            const txs = storage.getTransactions();
            const cofrinhoTxs = txs.filter(t => t.type === 'cofrinho_guardar' || t.type === 'cofrinho_resgatar');
            cofrinhoTxs.sort((a, b) => {
                const dateA = (a.date || '') + 'T' + (a.time || '00:00');
                const dateB = (b.date || '') + 'T' + (b.time || '00:00');
                const cmp = dateB.localeCompare(dateA);
                if (cmp !== 0) return cmp;
                return (b.id || '').localeCompare(a.id || '');
            });

            if (cofrinhoTxs.length === 0) {
                historyList.innerHTML = `<div style="font-family: var(--font-handwriting); text-align: center; padding: 10px; color: var(--text-muted); font-size: 0.9rem;">Nenhuma transação no cofrinho.</div>`;
            } else {
                cofrinhoTxs.forEach(t => {
                    const isDeposit = t.type === 'cofrinho_guardar';
                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.style.padding = '6px 8px';
                    div.style.borderBottom = '1px dotted #FFD1DC';
                    div.style.fontSize = '0.85rem';
                    
                    const dateFormatted = (t.date && typeof t.date === 'string') ? t.date.split('-').reverse().slice(0, 2).join('/') : '';
                    const timeFormatted = t.time || '';
                    const timeStr = timeFormatted ? ` às ${timeFormatted}` : '';
                    div.innerHTML = `
                        <span>${isDeposit ? '💰 Guardado' : '💵 Resgatado'} (${dateFormatted}${timeStr})</span>
                        <strong style="color: ${isDeposit ? '#D14D72' : '#2e7d32'};">${isDeposit ? '+' : '-'} R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    `;
                    historyList.appendChild(div);
                });
            }
        }
    }

    // 15. Shortcuts Setup
    function renderShortcuts() {
        const container = document.getElementById('shortcuts-container');
        if (!container) return;
        container.innerHTML = '';

        const items = [
            { item: 'Café da Tarde', value: 6.50 },
            { item: 'Uber para Casa', value: 24.90 },
            { item: 'Padaria de Manhã', value: 12.00 },
            { item: 'Mercado Express', value: 85.00 },
            { item: 'Farmácia', value: 45.90 }
        ];

        items.forEach(sh => {
            const card = document.createElement('div');
            card.className = 'shortcut-card';
            card.innerHTML = `
                <span class="shortcut-item">${sh.item}</span>
                <span class="shortcut-value">R$ ${sh.value.toFixed(2)}</span>
            `;

            card.addEventListener('click', () => {
                // Auto create transaction with default rules
                const parsed = parser.parseText(`gastei ${sh.value} com ${sh.item}`);
                if (parsed.hasDoubt) {
                    // Try to guess category based on keyword
                    let guessCat = 'Lazer';
                    const cleanItem = sh.item.toLowerCase();
                    if (cleanItem.includes('padaria') || cleanItem.includes('café') || cleanItem.includes('mercado')) guessCat = 'Alimentação';
                    if (cleanItem.includes('uber')) guessCat = 'Transporte';
                    if (cleanItem.includes('farmácia')) guessCat = 'Saúde';

                    const newTx = storage.addTransaction({
                        item: sh.item,
                        value: sh.value,
                        category: guessCat,
                        type: 'despesa_esporadica',
                        author: storage.getCurrentUser()
                    });

                    goToDetailsScreen();
                    setTimeout(() => {
                        const el = document.getElementById(`tx-row-${newTx.id}`);
                        if (el) el.classList.add('writing-line-anim');
                    }, 100);
                } else {
                    const newTx = storage.addTransaction(parsed);
                    goToDetailsScreen();
                    setTimeout(() => {
                        const el = document.getElementById(`tx-row-${newTx.id}`);
                        if (el) el.classList.add('writing-line-anim');
                    }, 100);
                }
                updateUI();
            });

            container.appendChild(card);
        });
    }

    // 16. Search Box & Filter listeners
    document.getElementById('search-transactions').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        renderTransactions();
    });

    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const timeFilter = pill.getAttribute('data-time');
            const typeFilter = pill.getAttribute('data-type');

            if (timeFilter) {
                // Reset other time filters active state
                document.querySelectorAll('.filter-pill[data-time]').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentFilters.time = timeFilter;
            }

            if (typeFilter) {
                // Toggle active state
                if (pill.classList.contains('active') && typeFilter !== 'all') {
                    pill.classList.remove('active');
                    currentFilters.type = 'all';
                    document.querySelectorAll('.filter-pill[data-type]').forEach(p => {
                        if (p.getAttribute('data-type') === 'all') p.classList.add('active');
                        else p.classList.remove('active');
                    });
                } else {
                    document.querySelectorAll('.filter-pill[data-type]').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    currentFilters.type = typeFilter;
                }
            }

            renderTransactions();
        });
    });

    // 16.5 Menu Dropdown & Filter Collapsible Toggle Setup
    const btnNotebookMenu = document.getElementById('btn-notebook-menu');
    const notebookDropdown = document.getElementById('notebook-dropdown');
    if (btnNotebookMenu && notebookDropdown) {
        btnNotebookMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            notebookDropdown.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!notebookDropdown.contains(e.target) && e.target !== btnNotebookMenu) {
                notebookDropdown.classList.remove('active');
            }
        });
    }

    const btnToggleFiltersArrow = document.getElementById('btn-toggle-filters-arrow');
    const collapsibleFilters = document.getElementById('collapsible-filters');
    if (btnToggleFiltersArrow && collapsibleFilters) {
        btnToggleFiltersArrow.addEventListener('click', () => {
            const isActive = collapsibleFilters.classList.toggle('active');
            const icon = btnToggleFiltersArrow.querySelector('i');
            if (icon) {
                if (isActive) {
                    icon.className = 'fa-solid fa-chevron-up';
                    btnToggleFiltersArrow.title = 'Recolher Filtros';
                } else {
                    icon.className = 'fa-solid fa-chevron-down';
                    btnToggleFiltersArrow.title = 'Expandir Filtros';
                }
            }
        });
    }

    const btnToggleThemeOpt = document.getElementById('btn-toggle-theme-opt');
    const themeBtnText = document.getElementById('theme-btn-text');
    if (btnToggleThemeOpt) {
        btnToggleThemeOpt.addEventListener('click', () => {
            if (currentTheme === 'ruled') {
                setPaperTheme('chamex');
                if (themeBtnText) themeBtnText.innerHTML = '<i class="fa-solid fa-paste"></i> Papel: Pautado';
            } else {
                setPaperTheme('ruled');
                if (themeBtnText) themeBtnText.innerHTML = '<i class="fa-solid fa-paste"></i> Papel: Chamex';
            }
            // Close dropdown after select
            if (notebookDropdown) notebookDropdown.classList.remove('active');
        });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("Deseja mesmo sair do caderno?")) {
                storage.logoutUser();
                checkLogin();
                if (notebookDropdown) notebookDropdown.classList.remove('active');
            }
        });
    }

    // Fechar modais ao clicar fora (no overlay de fundo)
    const modalOverlays = document.querySelectorAll('.modal-overlay, .doubts-overlay');
    modalOverlays.forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            // Apenas fecha se o clique foi diretamente no elemento de overlay (fundo semi-transparente)
            if (e.target === overlay) {
                // Impedir fechar o modal de boas-vindas se o usuário não estiver logado
                if (overlay.id === 'modal-welcome') {
                    const user = storage.getCurrentUser();
                    if (!user || user === 'Usuário') {
                        return;
                    }
                }
                overlay.classList.remove('active');
                
                // Se for o modal de edição de transação, reseta o ID de edição
                if (overlay.id === 'modal-edit-transaction') {
                    editingTxId = null;
                }
                if (overlay.id === 'modal-cofrinho') {
                    resetCofrinhoPosition();
                }
            }
        });
    });

    // Currency Formatting Helper
    function formatCurrency(value) {
        return "R$ " + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Extended Date Formatting Helper (Ex: "20 de Maio, Quarta-feira")
    function formatExtendedDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dateObj = new Date(year, month, day);
        
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        const weekdays = [
            'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
            'Quinta-feira', 'Sexta-feira', 'Sábado'
        ];
        
        const dayName = weekdays[dateObj.getDay()];
        const monthName = months[dateObj.getMonth()];
        
        return `${day} de ${monthName}, ${dayName}`;
    }

    // Render Balances Summary Tape (Fita compacta)
    function renderBalances() {
        const txs = storage.getTransactions();
        const filteredByMonth = txs.filter(t => {
            if (!t.date || typeof t.date !== 'string') return false;
            return t.date.startsWith(currentFilters.selectedMonthYear);
        });

        let income = 0;
        let expense = 0;
        
        filteredByMonth.forEach(t => {
            const isInc = t.type === 'salario' || (t.type && typeof t.type === 'string' && t.type.startsWith('receita')) || t.type === 'cofrinho_resgatar';
            if (isInc) {
                income += t.value;
            } else {
                expense += t.value;
            }
        });
        
        const balance = income - expense;
        
        const valIncomeEl = document.getElementById('val-income');
        const valExpenseEl = document.getElementById('val-expense');
        const valBalanceEl = document.getElementById('val-balance');
        
        if (valIncomeEl) valIncomeEl.innerText = formatCurrency(income);
        if (valExpenseEl) valExpenseEl.innerText = formatCurrency(expense);
        if (valBalanceEl) valBalanceEl.innerText = formatCurrency(balance);

        // Calculate Saldo Livre Projetado
        const selectedMonth = currentFilters.selectedMonthYear;
        const accounts = storage.getFixedAccounts();
        const activeDebts = accounts.filter(acc => !acc.expiration || selectedMonth <= acc.expiration);
        
        let totalUnpaidDebts = 0;
        activeDebts.forEach(acc => {
            const isPaid = txs.some(t => 
                t.item === acc.name && 
                (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
            );
            if (!isPaid) {
                totalUnpaidDebts += acc.value;
            }
        });
        
        const projectedBalance = balance - totalUnpaidDebts;
        const valProjectedBalanceEl = document.getElementById('val-projected-balance');
        if (valProjectedBalanceEl) {
            valProjectedBalanceEl.innerText = formatCurrency(projectedBalance);
        }
    }

    // Render Extrato (Banco do Brasil style)
    function renderTransactions() {
        const txs = storage.getTransactions();
        
        let filtered = txs.filter(t => {
            if (!t.date || typeof t.date !== 'string') return false;
            return t.date.startsWith(currentFilters.selectedMonthYear);
        });

        if (currentFilters.type !== 'all') {
            filtered = filtered.filter(t => {
                const isInc = t.type === 'salario' || (t.type && typeof t.type === 'string' && t.type.startsWith('receita'));
                if (currentFilters.type === 'income') return isInc;
                if (currentFilters.type === 'expense') return !isInc;
                if (currentFilters.type === 'recurring') {
                    return t.type === 'despesa_recorrente' || t.type === 'receita_recorrente' || t.type === 'salario';
                }
                if (currentFilters.type === 'sporadic') {
                    return t.type === 'despesa_esporadica' || t.type === 'receita_esporadica';
                }
                return true;
            });
        }

        if (currentFilters.search.trim() !== '') {
            const query = currentFilters.search.toLowerCase().trim();
            filtered = filtered.filter(t => {
                return (t.item && t.item.toLowerCase().includes(query)) ||
                       (t.category && t.category.toLowerCase().includes(query));
            });
        }

        // Sort descending: most recent date/time first
        filtered.sort((a, b) => {
            const dateA = a.date + 'T' + (a.time || '00:00');
            const dateB = b.date + 'T' + (b.time || '00:00');
            return dateB.localeCompare(dateA);
        });

        transactionList.innerHTML = '';

        if (filtered.length === 0) {
            transactionList.innerHTML = `
                <div style="font-family: var(--font-handwriting); text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 1.1rem;">
                    Nenhuma movimentação neste mês.
                </div>
            `;
            renderDoodleCharts([]);
            return;
        }

        let lastDay = '';
        
        filtered.forEach(t => {
            const isInc = t.type === 'salario' || (t.type && typeof t.type === 'string' && t.type.startsWith('receita')) || t.type === 'cofrinho_resgatar';
            const dayStr = formatExtendedDate(t.date);
            
            if (dayStr !== lastDay) {
                const dayDivider = document.createElement('div');
                dayDivider.className = 'day-divider';
                dayDivider.innerHTML = `<span class="day-divider-text"><i class="fa-regular fa-calendar" style="color: var(--accent-color); font-size: 0.75rem;"></i> ${dayStr}</span>`;
                transactionList.appendChild(dayDivider);
                lastDay = dayStr;
            }

            const itemRow = document.createElement('div');
            itemRow.className = `transaction-item ${isInc ? 'income-item' : 'expense-item'}`;
            itemRow.id = `tx-row-${t.id}`;
            if (isHandwriting) itemRow.classList.add('handwriting-mode');

            itemRow.innerHTML = `
                <div class="item-left">
                    <span class="item-title">${t.item}</span>
                    <div class="item-meta">
                        <span class="item-time">${t.time || ''}</span>
                        <span class="item-category">${t.category}</span>
                    </div>
                </div>
                <div class="item-right">
                    <span class="item-value">${isInc ? '+' : '-'} R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span class="item-chevron"><i class="fa-solid fa-chevron-right"></i></span>
                </div>
            `;

            itemRow.addEventListener('click', () => {
                openEditModal(t.id);
            });

            transactionList.appendChild(itemRow);
        });

        renderDoodleCharts(filtered);
    }

    // Populate dynamic months carousel (12 months: 9 before, actual, 2 future)
    function populateMonthsCarousel() {
        const carousel = document.getElementById('months-carousel');
        const fixedCarousel = document.getElementById('fixed-months-carousel');
        if (!carousel) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const monthsData = [];
        for (let i = -9; i <= 2; i++) {
            const d = new Date(currentYear, currentMonth + i, 1);
            monthsData.push({
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
                yearLabel: d.getFullYear()
            });
        }

        const buildCarousel = (el) => {
            if (!el) return;
            el.innerHTML = '';
            monthsData.forEach(item => {
                const monthVal = `${item.year}-${String(item.month).padStart(2, '0')}`;
                const pill = document.createElement('div');
                pill.className = 'carousel-month-item';
                pill.setAttribute('data-month-val', monthVal);
                
                let displayLabel = item.label;
                if (item.year !== currentYear) {
                    const shortYear = String(item.year).slice(-2);
                    displayLabel = `${item.label}/${shortYear}`;
                }
                
                pill.innerText = displayLabel;
                
                if (monthVal === currentFilters.selectedMonthYear) {
                    pill.classList.add('active');
                }

                pill.addEventListener('click', () => {
                    currentFilters.selectedMonthYear = monthVal;
                    // Sincroniza todos os carrosséis
                    document.querySelectorAll('.months-carousel').forEach(c => {
                        c.querySelectorAll('.carousel-month-item').forEach(p => {
                            if (p.getAttribute('data-month-val') === monthVal) {
                                p.classList.add('active');
                            } else {
                                p.classList.remove('active');
                            }
                        });
                    });
                    updateUI();
                    centerActiveMonthPill(true);
                });

                el.appendChild(pill);
            });
        };

        buildCarousel(carousel);
        buildCarousel(fixedCarousel);

        // Center active month pill at startup without triggering parent horizontal scroll
        setTimeout(() => {
            centerActiveMonthPill(false);
        }, 100);
    }

    // Helper function to safely center the active month pill without using scrollIntoView (which shifts the main slide)
    function centerActiveMonthPill(smooth = false) {
        const carousels = [document.getElementById('months-carousel'), document.getElementById('fixed-months-carousel')];
        carousels.forEach(carousel => {
            if (!carousel) return;
            const activePill = carousel.querySelector('.carousel-month-item.active');
            if (activePill) {
                const carouselWidth = carousel.clientWidth;
                const pillOffsetLeft = activePill.offsetLeft;
                const pillWidth = activePill.clientWidth;
                const targetScroll = pillOffsetLeft - (carouselWidth / 2) + (pillWidth / 2);
                carousel.scrollTo({
                    left: targetScroll,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }
        });
    }

    // Overdue debts alert checking (Screen 1 Red Pin)
    function checkHomeFixedDebtsAlert() {
        const today = new Date();
        const currentYearStr = today.getFullYear();
        const currentMonthStr = String(today.getMonth() + 1).padStart(2, '0');
        const currentMonthYear = `${currentYearStr}-${currentMonthStr}`;
        const todayDay = today.getDate();
        
        const accounts = storage.getFixedAccounts();
        const transactions = storage.getTransactions();
        
        const activeDebts = accounts.filter(acc => !acc.expiration || currentMonthYear <= acc.expiration);
        
        let hasOverdue = false;
        for (const acc of activeDebts) {
            if (acc.day < todayDay) {
                const isPaid = transactions.some(t => 
                    t.item === acc.name && 
                    (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                    t.date && typeof t.date === 'string' && t.date.startsWith(currentMonthYear)
                );
                if (!isPaid) {
                    hasOverdue = true;
                    break;
                }
            }
        }
        
        const alertBtn = document.getElementById('home-fixed-debts-alert');
        if (alertBtn) {
            if (hasOverdue) {
                alertBtn.style.display = 'flex';
            } else {
                alertBtn.style.display = 'none';
            }
        }
    }

    const homeAlertBtn = document.getElementById('home-fixed-debts-alert');
    if (homeAlertBtn) {
        homeAlertBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            goToDetailsScreen();
            openFixedAccountsModal('debts');
        });
    }

    // CSV Offline Export Event
    const btnExportCSV = document.getElementById('btn-export-csv');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            let csvContent = "\uFEFF"; // UTF-8 BOM
            csvContent += "Data;Hora;Item;Valor;Tipo;Categoria;Autor\n";
            
            const txs = storage.getTransactions();
            txs.forEach(t => {
                const date = t.date || '';
                const time = t.time || '';
                const item = (t.item || '').replace(/;/g, ',');
                const val = (t.value || 0).toFixed(2).replace('.', ',');
                const type = t.type || '';
                const cat = t.category || '';
                const author = t.author || '';
                csvContent += `${date};${time};${item};${val};${type};${cat};${author}\n`;
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            
            const nbName = storage.getActiveNotebook().name.replace(/\s+/g, '_').toLowerCase();
            const dateStr = new Date().toISOString().slice(0, 10);
            link.setAttribute("download", `caderno_${nbName}_${dateStr}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            if (notebookDropdown) {
                notebookDropdown.classList.remove('active');
            }
        });
    }

    // 17. Master update UI function
    function updateUI() {
        const activeNb = storage.getActiveNotebook();
        document.getElementById('notebook-name-display').innerText = activeNb.name;
        
        renderBalances();
        renderTransactions();
        updateHomeAlertDot();
        renderFixedAccountsList();
        updateCofrinhoUI();
        checkHomeFixedDebtsAlert();
        renderChatMessages();
    }

    // 18. App Start
    checkLogin();
    renderShortcuts();
    setPaperTheme('ruled');
    populateMonthsCarousel();
    updateHomeAlertDot();
    checkHomeFixedDebtsAlert();

    // 19. Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('Service Worker registrado com sucesso:', reg.scope);
                    
                    // Listen for updates and force page reload if service worker updated
                    reg.onupdatefound = () => {
                        const installingWorker = reg.installing;
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('Novo conteúdo disponível; recarregando a página...');
                                    window.location.reload();
                                }
                            }
                        };
                    };
                })
                .catch(err => console.warn('Falha ao registrar Service Worker:', err));
        });
    }
});
