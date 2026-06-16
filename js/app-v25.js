document.addEventListener('DOMContentLoaded', () => {
    // Reset any native horizontal scroll offset caused by scrollIntoView bugs
    const appEl = document.getElementById('app');
    if (appEl) appEl.scrollLeft = 0;
    const slideContainerEl = document.getElementById('slide-container');
    if (slideContainerEl) slideContainerEl.scrollLeft = 0;
    document.body.scrollLeft = 0;

    // Detect URL referral code
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        localStorage.setItem('referred_by_temp', refCode.trim());
        // Clean URL to prevent duplicate actions on reload
        const newUrl = window.location.pathname;
        try {
            window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
            console.warn("window.history.replaceState is not supported or failed:", e);
        }
    }

    // 1. Initialise core logic
    const storage = new WalletStorage();
    const parser = new TransactionParser(storage);
    let voice = null;
    let synthesizer = null;
    let isVoiceMuted = localStorage.getItem('voice_muted') === 'true';
    let editingFixedId = null;


    // Active UI states
    let activeTab = 'home';
    let currentTheme = 'ruled';
    let isHandwriting = false;

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

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        } else {
            // Fallback for file:// or non-secure contexts
            return new Promise((resolve, reject) => {
                try {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.top = "0";
                    textArea.style.left = "0";
                    textArea.style.position = "fixed";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    if (successful) {
                        resolve();
                    } else {
                        reject(new Error("document.execCommand failed"));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }
    }

    // Initialize voice helper (unified with chat)
    synthesizer = new VoiceSynthesizer();
    synthesizer.isMuted = isVoiceMuted;
    voice = new VoiceRecognizer(

        // On Speech Transcription
        (text) => {
            const chatOverlay = document.getElementById('chat-screen-overlay');
            if (chatOverlay.classList.contains('active')) {
                const inputField = document.getElementById('chat-input-field');
                if (inputField) inputField.value = text;
                resetChatInactivityTimer();
                sendChatMessage();
            } else {
                if (isVoiceMuted) {
                    // Muted: Open chat overlay on transcription to show chat history and agent replies
                    openChatOverlay();
                    storage.addChatMessage('user', text);
                    renderChatMessages();
                    setTimeout(() => {
                        processChatAssistantReply(text);
                    }, 600);
                } else {
                    // Not Muted: process directly in the background (no chat overlay opened)
                    storage.addChatMessage('user', text);
                    renderChatMessages();
                    processChatAssistantReply(text);
                }
            }
        },
        // On State Change (microphone pulsing)
        (isListening) => {
            const homeMicWrapper = document.getElementById('home-mic-wrapper');
            const chatMicBtn = document.getElementById('chat-mic-btn');
            const btnNavMic = document.getElementById('btn-nav-mic');
            
            if (isListening) {
                if (homeMicWrapper) homeMicWrapper.classList.add('listening');
                if (chatMicBtn) chatMicBtn.classList.add('active-mic');
                if (btnNavMic) btnNavMic.classList.add('active-mic');
            } else {
                if (homeMicWrapper) homeMicWrapper.classList.remove('listening');
                if (chatMicBtn) chatMicBtn.classList.remove('active-mic');
                if (btnNavMic) btnNavMic.classList.remove('active-mic');
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

    // Switch Notebook Screen (Fullscreen Shelf)
    const screenShelf = document.getElementById('screen-shelf');
    const btnCloseShelf = document.getElementById('btn-close-shelf');
    const shelfNotebooksGrid = document.getElementById('shelf-notebooks-grid');
    const newNotebookName = document.getElementById('new-notebook-name');
    const btnCreateNotebook = document.getElementById('btn-create-notebook');

    // Sharing Modal (Google Docs style)
    const modalSharingSettings = document.getElementById('modal-sharing-settings');
    const sharingNotebookTitle = document.getElementById('sharing-notebook-title');
    const shareGuestContact = document.getElementById('share-guest-contact');
    const shareGuestRole = document.getElementById('share-guest-role');
    const btnAddShareAccess = document.getElementById('btn-add-share-access');
    const sharingMembersListDocs = document.getElementById('sharing-members-list-docs');
    const btnCloseSharing = document.getElementById('btn-close-sharing');

    // 3. User Login Check
    let authMode = 'register';

    // ─── Supabase: verificar sessão ao iniciar ───────────────────────
    (async () => {
        try {
            const session = await sync.getSession();
            if (session && session.user) {
                // Usuário já autenticado na nuvem — sincronizar dados
                console.log('[Auth] Sessão ativa:', session.user.email);
                // Garantir que o localStorage reflete o usuário correto
                if (!storage.getCurrentUser()) {
                    // Buscar perfil na nuvem e popular localmente
                    const { data: profile } = await supabaseClient
                        .from('profiles')
                        .select('name, contact')
                        .eq('id', session.user.id)
                        .single();
                    if (profile) {
                        storage.data.currentUserContact = profile.contact;
                        storage.setCurrentUser(profile.name);
                    }
                }
                await sync.fullSyncFromCloud(storage);
                // Iniciar realtime no caderno ativo
                const activeNbId = storage.getActiveNotebook()?.id;
                if (activeNbId) {
                    sync.subscribeNotebook(activeNbId,
                        (newTx) => {
                            // Transação chegou de outro dispositivo
                            const nb = storage.getActiveNotebook();
                            if (nb && !nb.transactions.find(t => t.id === newTx.id)) {
                                nb.transactions.push({
                                    id: newTx.id, item: newTx.item,
                                    value: parseFloat(newTx.value), type: newTx.type,
                                    category: newTx.category || '', date: newTx.date,
                                    time: newTx.time || '', author: newTx.author_name || '',
                                    cofrinhoId: newTx.cofrinho_id || null
                                });
                                storage.save();
                                updateUI();
                            }
                        },
                        (txId) => {
                            const nb = storage.getActiveNotebook();
                            if (nb) {
                                nb.transactions = nb.transactions.filter(t => t.id !== txId);
                                storage.save();
                                updateUI();
                            }
                        }
                    );
                }
            }
        } catch(err) {
            console.warn('[Auth] Erro ao verificar sessão:', err);
        }
    })();
    // ────────────────────────────────────────────────────────────────

    function clearUI() {
        const notebookNameDisplay = document.getElementById('notebook-name-display');
        if (notebookNameDisplay) notebookNameDisplay.innerText = 'Minhas Contas';
        
        const totalBalance = document.getElementById('total-balance');
        if (totalBalance) totalBalance.innerText = 'R$ 0,00';
        
        const totalIncome = document.getElementById('total-income');
        if (totalIncome) totalIncome.innerText = 'R$ 0,00';
        
        const totalExpense = document.getElementById('total-expense');
        if (totalExpense) totalExpense.innerText = 'R$ 0,00';
        
        if (transactionList) {
            transactionList.innerHTML = `
                <div style="font-family: var(--font-handwriting); text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 1.1rem;">
                    Nenhuma movimentação neste mês.
                </div>
            `;
        }
        
        const fixedAccountsList = document.getElementById('fixed-accounts-list');
        if (fixedAccountsList) fixedAccountsList.innerHTML = '';
        
        const chatMessagesContainer = document.getElementById('chat-messages-container');
        if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';

        const cofrinhosListContainer = document.getElementById('cofrinhos-list-container');
        if (cofrinhosListContainer) cofrinhosListContainer.innerHTML = '';
    }

    function checkLogin() {
        const user = storage.getCurrentUser();
        if (!user || user === 'Usuário') {
            modalWelcome.classList.add('active');
            clearUI();
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
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const contactVal = authContact.value.trim().toLowerCase();
            const passwordVal = authPassword.value;

            if (authMode === 'register') {
                const nameVal = authName.value.trim();
                if (!nameVal || !contactVal || !passwordVal) {
                    alert('Por favor, preencha todos os campos!');
                    return false;
                }
                // Desabilitar botão durante processamento
                btnAuthSubmit.disabled = true;
                btnAuthSubmit.innerText = 'Criando conta...';

                const referredByTemp = localStorage.getItem('referred_by_temp') || '';

                // 1) Cadastrar localmente (offline-first)
                const localResult = storage.registerUser(nameVal, contactVal, passwordVal, referredByTemp);
                if (!localResult.success) {
                    alert(localResult.message || 'Erro ao realizar cadastro.');
                    btnAuthSubmit.disabled = false;
                    btnAuthSubmit.innerText = 'Começar Lançamentos';
                    return false;
                }

                // 2) Cadastrar na nuvem (Supabase)
                const cloudResult = await sync.signUp(contactVal, passwordVal, nameVal, referredByTemp);
                if (!cloudResult.success) {
                    // E-mail já existe no Supabase ou outro erro de nuvem
                    // Não bloquear — funcionará offline
                    console.warn('[Auth] Supabase signup falhou:', cloudResult.message);
                }

                // 3) Sincronizar caderno inicial para a nuvem
                const activeNb = storage.getActiveNotebook();
                if (activeNb && cloudResult.success) {
                    await sync.createNotebook(activeNb);
                }

                localStorage.removeItem('referred_by_temp');
                btnAuthSubmit.disabled = false;
                modalWelcome.classList.remove('active');
                updateUserGreeting();
                updateUI();

            } else {
                if (!contactVal || !passwordVal) {
                    alert('Por favor, preencha todos os campos!');
                    return false;
                }
                btnAuthSubmit.disabled = true;
                btnAuthSubmit.innerText = 'Abrindo caderno...';

                // 1) Tentar login na nuvem primeiro
                const cloudLogin = await sync.signIn(contactVal, passwordVal);
                if (cloudLogin.success) {
                    // Login na nuvem OK — sincronizar para local
                    const { data: profile } = await supabaseClient
                        .from('profiles')
                        .select('name, contact')
                        .eq('id', sync.userId)
                        .single();

                    if (profile) {
                        storage.data.currentUserContact = profile.contact;
                        storage.setCurrentUser(profile.name);
                        await sync.fullSyncFromCloud(storage);

                        // Iniciar realtime
                        const activeNbId = storage.getActiveNotebook()?.id;
                        if (activeNbId) {
                            sync.subscribeNotebook(activeNbId,
                                (newTx) => {
                                    const nb = storage.getActiveNotebook();
                                    if (nb && !nb.transactions.find(t => t.id === newTx.id)) {
                                        nb.transactions.push({
                                            id: newTx.id, item: newTx.item,
                                            value: parseFloat(newTx.value), type: newTx.type,
                                            category: newTx.category || '', date: newTx.date,
                                            time: newTx.time || '', author: newTx.author_name || ''
                                        });
                                        storage.save();
                                        updateUI();
                                    }
                                },
                                (txId) => {
                                    const nb = storage.getActiveNotebook();
                                    if (nb) { nb.transactions = nb.transactions.filter(t => t.id !== txId); storage.save(); updateUI(); }
                                }
                            );
                        }
                    }

                    btnAuthSubmit.disabled = false;
                    modalWelcome.classList.remove('active');
                    updateUserGreeting();
                    updateUI();

                } else {
                    // 2) Fallback: login local (offline)
                    const localLogin = storage.loginUser(contactVal, passwordVal);
                    if (localLogin.success) {
                        btnAuthSubmit.disabled = false;
                        modalWelcome.classList.remove('active');
                        updateUserGreeting();
                        updateUI();
                    } else {
                        alert('E-mail/Celular ou Senha incorretos.');
                        btnAuthSubmit.disabled = false;
                        btnAuthSubmit.innerText = 'Abrir Caderno';
                    }
                }
            }
            return false;
        };
    }

    function updateUserGreeting() {
        const user = storage.getCurrentUser();
        const contact = storage.getCurrentUserContact();
        const profile = contact ? storage.getUserProfile(contact) : null;
        const displayName = (profile && profile.fullName) ? profile.fullName.split(' ')[0] : user;
        
        if (doubtsBadgeText) {
            doubtsBadgeText.innerText = `Tenho algumas perguntas, ${displayName}!`;
        }

        // Atualizar saudação e logo no menu dropdown
        const menuGreeting = document.getElementById('menu-user-greeting');
        if (menuGreeting) {
            menuGreeting.innerText = `Olá, ${displayName || 'Visitante'}!`;
        }

        // Mostrar/Ocultar barra de navegação inferior fixa com base no login e aba atual
        const bottomNavBar = document.getElementById('bottom-nav-bar');
        if (bottomNavBar) {
            if (user && user !== 'Usuário' && activeTab !== 'home') {
                bottomNavBar.style.display = 'flex';
            } else {
                bottomNavBar.style.display = 'none';
            }
        }
    }

    // 4. Tab Navigation Implementation (DigaReal layout)
    function switchTab(tabName) {
        activeTab = tabName;
        // Remove active class from all tabs
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to selected tab
        const activeTabBtn = document.querySelector(`.nav-tab-btn[data-tab="${tabName}"]`);
        if (activeTabBtn) {
            activeTabBtn.classList.add('active');
        }

        // Show/hide bottom nav bar based on active tab
        const bottomNavBar = document.getElementById('bottom-nav-bar');
        if (bottomNavBar) {
            const user = storage.getCurrentUser();
            const isLoggedIn = user && user !== 'Usuário';
            if (isLoggedIn && tabName !== 'home') {
                bottomNavBar.style.display = 'flex';
            } else {
                bottomNavBar.style.display = 'none';
            }
        }

        // Shift slide container
        if (slideContainer) {
            if (tabName === 'home') {
                slideContainer.style.transform = 'translateX(0%)';
            } else if (tabName === 'details') {
                slideContainer.style.transform = 'translateX(-25%)';
                updateUI(); // Refresh totals, transactions list, etc.
                setTimeout(() => centerActiveMonthPill(true), 150);
            } else if (tabName === 'mensal') {
                slideContainer.style.transform = 'translateX(-50%)';
                // Trigger render of monthly debts/incomes
                renderFixedAccountsList();
            } else if (tabName === 'shelf') {
                slideContainer.style.transform = 'translateX(-75%)';
                renderShelfList();
            }
        }
    }

    // Tab button click event listeners
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = btn.getAttribute('data-tab');
            if (tabName) {
                switchTab(tabName);
            }
        });
    });

    // Center microphone button in bottom bar
    const btnNavMic = document.getElementById('btn-nav-mic');
    if (btnNavMic) {
        btnNavMic.addEventListener('click', (e) => {
            e.stopPropagation();
            if (synthesizer) {
                synthesizer.cancel();
            }
            if (voice) {
                voice.toggle();
            }
        });
    }

    // Keep legacy helper functions as aliases for compatibility
    function goToHomeScreen() {
        switchTab('home');
    }
    function goToDetailsScreen() {
        switchTab('details');
    }

    // Swipe arrow click
    if (swipeArrowIndicator) {
        swipeArrowIndicator.addEventListener('click', () => {
            switchTab('details');
        });
    }
    
    // Back to home button in details page
    if (btnBackHome) {
        btnBackHome.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchTab('home');
        });
    }

    // Vinculos de Ação da Home (Premium Overhaul)
    const btnHomeProfile = document.getElementById('btn-home-profile');
    if (btnHomeProfile) {
        btnHomeProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            const modalEditProfile = document.getElementById('modal-edit-profile');
            if (modalEditProfile) modalEditProfile.classList.add('active');
        });
    }

    const btnHomeNotifications = document.getElementById('btn-home-notifications');
    if (btnHomeNotifications) {
        btnHomeNotifications.addEventListener('click', (e) => {
            e.stopPropagation();
            const doubtsPanel = document.getElementById('doubts-panel');
            if (doubtsPanel) doubtsPanel.classList.add('active');
        });
    }

    const btnHomeNotebookSelector = document.getElementById('btn-home-notebook-selector');
    if (btnHomeNotebookSelector) {
        btnHomeNotebookSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            switchTab('shelf');
        });
    }

    const homeLastTxCardEl = document.getElementById('home-last-transaction-card');
    if (homeLastTxCardEl) {
        homeLastTxCardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            switchTab('details');
        });
    }


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
    if (btnToggleFont) {
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
    }


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
        if (synthesizer) {
            synthesizer.cancel();
        }
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
    if (chatOverlay) {
        chatOverlay.addEventListener('click', resetChatInactivityTimer);
        chatOverlay.addEventListener('touchstart', resetChatInactivityTimer);
        chatOverlay.addEventListener('scroll', resetChatInactivityTimer);
    }

    const chatInputField = document.getElementById('chat-input-field');
    if (chatInputField) {
        chatInputField.addEventListener('input', () => {
            resetChatInactivityTimer();
            if (synthesizer) synthesizer.cancel();
            if (voice) voice.stop();
        });
        chatInputField.addEventListener('keypress', (e) => {
            resetChatInactivityTimer();
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }

    const btnCloseChat = document.getElementById('btn-close-chat');
    if (btnCloseChat) btnCloseChat.addEventListener('click', closeChatOverlay);
    
    const chatSendBtn = document.getElementById('chat-send-btn');
    if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
    
    const chatMicBtn = document.getElementById('chat-mic-btn');
    if (chatMicBtn) {
        chatMicBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetChatInactivityTimer();
            if (synthesizer) synthesizer.cancel();
            voice.toggle();
        });
    }

    const chatMessagesContainer = document.getElementById('chat-messages-container');
    if (chatMessagesContainer) {
        chatMessagesContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.chat-category-chip');
            const btnCopy = e.target.closest('#btn-copy-pix');
            const btnSimulate = e.target.closest('#btn-simulate-pix-paid');
            
            if (chip) {
                e.stopPropagation();
                resetChatInactivityTimer();
                if (synthesizer) synthesizer.cancel();
                if (voice) voice.stop();
                
                const category = chip.getAttribute('data-category');
                const direction = chip.getAttribute('data-direction');
                const plan = chip.getAttribute('data-subscription-plan');
                
                if (category) {
                    storage.addChatMessage('user', category);
                    renderChatMessages();
                    setTimeout(() => {
                        processChatAssistantReply(category);
                    }, 600);
                } else if (direction) {
                    const text = chip.innerText || chip.textContent;
                    storage.addChatMessage('user', text);
                    renderChatMessages();
                    setTimeout(() => {
                        processChatAssistantReply(text);
                    }, 600);
                } else if (plan) {
                    const text = chip.innerText || chip.textContent;
                    storage.addChatMessage('user', text);
                    renderChatMessages();
                    setTimeout(() => {
                        processPlanSelection(plan);
                    }, 600);
                }
            } else if (btnCopy) {
                e.stopPropagation();
                resetChatInactivityTimer();
                copyToClipboard("00020101021126580014br.gov.bcb.pix0136asaas-pix-key-fictitious-demo-697").then(() => {
                    const originalText = btnCopy.innerHTML;
                    btnCopy.innerHTML = `<i class="fa-solid fa-check"></i> Código Copiado!`;
                    btnCopy.style.backgroundColor = "#15803d";
                    setTimeout(() => {
                        btnCopy.innerHTML = originalText;
                        btnCopy.style.backgroundColor = "";
                    }, 2000);
                }).catch(err => {
                    console.error("Falha ao copiar:", err);
                });
            } else if (btnSimulate) {
                e.stopPropagation();
                resetChatInactivityTimer();
                
                const plan = btnSimulate.getAttribute('data-plan') || 'monthly';
                const isPromo = btnSimulate.getAttribute('data-promo') === 'true';
                const contact = storage.getCurrentUserContact();
                if (contact) {
                    if (isPromo) {
                        storage.consumeReferrals(contact, 5);
                    }
                    storage.renewUserSubscription(contact, plan);
                    triggerConfetti();
                    
                    const welcomeBackMsg = `Obrigada! Pagamento confirmado com sucesso via Asaas. Seu caderno já está 100% liberado! Aproveite.`;
                    addAppMessage(welcomeBackMsg, false);
                    
                    updateHomeAlertDot();
                    
                    setTimeout(() => {
                        closeChatOverlay();
                    }, 4000);
                }
            }
        });
    }

    // Mic click on Home opens chat overlay immediately and starts recording
    btnMic.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Subscription check: if there is a billing alert active, click opens chat directly!
        const contact = storage.getCurrentUserContact();
        const sub = contact ? storage.getUserSubscription(contact) : null;
        const now = Date.now();
        const isBillingAlert = sub && (sub.status === 'expired' || (sub.expiresAt - now <= 7 * 24 * 60 * 60 * 1000));
        
        openChatOverlay();
        if (!isBillingAlert) {
            if (synthesizer) synthesizer.cancel();
            setTimeout(() => {
                if (voice && !voice.isListening) {
                    voice.start();
                }
            }, 300);
        }
    });

    // Keyboard Entry on Home opens chat and focuses input
    const btnKeyboardEntry = document.getElementById('btn-keyboard-entry');
    if (btnKeyboardEntry) {
        btnKeyboardEntry.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatOverlay();
            setTimeout(() => {
                const inputField = document.getElementById('chat-input-field');
                if (inputField) inputField.focus();
            }, 300);
        });
    }

    // Controle de Silenciar Voz
    function updateVoiceMutedUI() {
        const btnHome = document.getElementById('btn-toggle-voice-home');
        const btnChat = document.getElementById('btn-toggle-voice-chat');
        const btnHeader = document.getElementById('btn-toggle-voice-header');

        if (isVoiceMuted) {
            if (btnHome) {
                btnHome.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                btnHome.title = "Ativar som do assistente";
            }
            if (btnChat) {
                btnChat.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                btnChat.title = "Ativar som do assistente";
            }
            if (btnHeader) {
                btnHeader.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                btnHeader.title = "Ativar som do assistente";
            }
        } else {
            if (btnHome) {
                btnHome.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                btnHome.title = "Silenciar assistente";
            }
            if (btnChat) {
                btnChat.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                btnChat.title = "Silenciar assistente";
            }
            if (btnHeader) {
                btnHeader.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                btnHeader.title = "Silenciar assistente";
            }
        }
    }

    function toggleVoiceMute() {
        isVoiceMuted = !isVoiceMuted;
        localStorage.setItem('voice_muted', isVoiceMuted);
        if (synthesizer) {
            synthesizer.isMuted = isVoiceMuted;
            if (isVoiceMuted) {
                synthesizer.cancel();
            }
        }
        updateVoiceMutedUI();
    }

    const btnHomeVoice = document.getElementById('btn-toggle-voice-home');
    const btnChatVoice = document.getElementById('btn-toggle-voice-chat');
    const btnHeaderVoice = document.getElementById('btn-toggle-voice-header');
    if (btnHomeVoice) btnHomeVoice.addEventListener('click', toggleVoiceMute);
    if (btnChatVoice) btnChatVoice.addEventListener('click', toggleVoiceMute);
    if (btnHeaderVoice) btnHeaderVoice.addEventListener('click', toggleVoiceMute);

    // Atualizar UI inicial do botão de som
    updateVoiceMutedUI();


    // Red dot badge click on Home opens chat
    const homeAlertDot = document.getElementById('home-alert-dot');
    if (homeAlertDot) {
        homeAlertDot.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatOverlay();
        });
    }

    function speakMessage(htmlText, autoListen = false) {
        if (!synthesizer) return;
        // Strip html tags
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;
        let cleanText = tempDiv.textContent || tempDiv.innerText || "";
        
        if (autoListen) {
            synthesizer.speak(cleanText, () => {
                const overlay = document.getElementById('chat-screen-overlay');
                if (overlay && overlay.classList.contains('active')) {
                    voice.start();
                }
            });
        } else {
            synthesizer.speak(cleanText);
        }
    }

    function addAppMessage(text, autoListen = false) {
        storage.addChatMessage('app', text);
        renderChatMessages();
        speakMessage(text, autoListen);
    }

    function matchCategory(text) {
        if (!text) return null;
        const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        
        const officialCategories = [
            'Alimentação', 'Moradia', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Vestuário', 'Casa', 'Comunicação', 'Despesas Pessoais', 'Receitas'
        ];
        
        for (const cat of officialCategories) {
            const catNorm = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normalized === catNorm || normalized.includes(catNorm) || catNorm.includes(normalized)) {
                return cat;
            }
        }
        
        const synonyms = {
            'Alimentação': ['comida', 'mercado', 'supermercado', 'padaria', 'restaurante', 'lanche', 'pizza', 'jantar', 'almoco', 'almoço', 'cafe', 'café', 'feira'],
            'Moradia': ['aluguel', 'condominio', 'condomínio', 'luz', 'energia', 'agua', 'água', 'gas', 'gás', 'iptu'],
            'Transporte': ['uber', 'taxi', 'taxista', 'onibus', 'ônibus', 'metro', 'metrô', 'combustivel', 'combustível', 'gasolina', 'estacionamento', 'pedagio', 'pedágio'],
            'Lazer': ['cinema', 'show', 'cerveja', 'bar', 'viagem', 'hotel', 'spotify', 'netflix', 'futebol', 'clube', 'churrasco'],
            'Saúde': ['farmacia', 'farmácia', 'medico', 'médico', 'remedio', 'remédio', 'dentista', 'consulta', 'exame', 'hospital', 'psicologo', 'terapia'],
            'Educação': ['escola', 'faculdade', 'curso', 'livro', 'livros', 'estudo', 'aula', 'mensalidade', 'matricula', 'matrícula'],
            'Vestuário': ['roupa', 'roupas', 'sapato', 'tenis', 'tênis', 'shopping', 'camisa', 'camiseta', 'calca', 'calça', 'vestido', 'casaco'],
            'Casa': ['movel', 'móvel', 'decoracao', 'decoração', 'cama', 'mesa', 'banho', 'geladeira', 'fogao', 'fogão', 'microondas', 'utensilio', 'utensílios'],
            'Comunicação': ['internet', 'celular', 'telefone', 'plano', 'fibra', 'tim', 'claro', 'vivo', 'recarga'],
            'Despesas Pessoais': ['pessoal', 'pessoais', 'cabeleireiro', 'barbearia', 'manicure', 'perfume', 'cosmetico', 'cosméticos', 'maquiagem', 'presente', 'doação', 'doacao', 'tarifa', 'banco'],
            'Receitas': ['receita', 'ganho', 'ganhos', 'salario', 'salário', 'venda', 'freela', 'recebi', 'pagamento']
        };
        
        for (const [cat, words] of Object.entries(synonyms)) {
            for (const word of words) {
                const wordNorm = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (normalized.includes(wordNorm) || wordNorm.includes(normalized)) {
                    return cat;
                }
            }
        }
        return null;
    }

    function sendChatMessage() {
        const text = chatInputField.value.trim();
        if (!text) return;
        
        storage.addChatMessage('user', text);
        chatInputField.value = '';
        renderChatMessages();
        resetChatInactivityTimer();
        
        if (synthesizer) synthesizer.cancel();
        if (voice) voice.stop();
        
        setTimeout(() => {
            processChatAssistantReply(text);
        }, 600);
    }

    function sendChatText(text) {
        if (!text) return;
        storage.addChatMessage('user', text);
        renderChatMessages();
        resetChatInactivityTimer();
        if (synthesizer) synthesizer.cancel();
        if (voice) voice.stop();
        setTimeout(() => {
            processChatAssistantReply(text);
        }, 600);
    }

    async function callGemini(userText) {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            throw new Error("Chave de API do Gemini não configurada.");
        }
        
        const userName = storage.getCurrentUser();
        const cofrinhos = storage.getCofrinhos().map(c => ({
            id: c.id,
            name: c.name,
            goal: c.value,
            balance: storage.getCofrinhoBalance(c.id)
        }));
        
        const currentBalance = storage.getNotebookBalance();
        const recentTx = storage.getActiveNotebook().transactions.slice(-20).map(t => ({
            item: t.item,
            value: t.value,
            category: t.category,
            type: t.type,
            date: t.date,
            time: t.time,
            author: t.author
        }));
        
        const todayStr = new Date().toLocaleDateString('pt-BR');
        const weekdayStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
        
        const systemPrompt = `Você é o assistente virtual inteligente do PWA "Minhas Contas" (antigo DigaReal), um caderno de finanças pessoal.
O usuário atual se chama: ${userName}.
O dia de hoje é: ${todayStr} (dia da semana: ${weekdayStr}).

Categorias oficiais do sistema:
- Alimentação
- Moradia
- Transporte
- Lazer
- Saúde
- Educação
- Vestuário
- Casa
- Comunicação
- Despesas Pessoais
- Receitas (apenas para entradas de dinheiro)

Os cofrinhos existentes são:
${JSON.stringify(cofrinhos)}

O saldo total atual é: R$ ${currentBalance.toFixed(2)}
O extrato de transações recentes é:
${JSON.stringify(recentTx)}

Instruções críticas:
1. Sempre responda no formato JSON seguindo estritamente este esquema:
{
  "action": "record_transaction" | "cofrinho_deposit" | "cofrinho_withdraw" | "add_fixed_account" | "add_fixed_income" | "create_cofrinho" | "update_cofrinho" | "delete_cofrinho" | "chat_reply",
  "item": "nome do item ou descrição curta (ex: 'Supermercado')",
  "value": valor numérico (meta do cofrinho para 'create_cofrinho'/'update_cofrinho', ou valor monetário),
  "category": "categoria oficial",
  "direction": "income" ou "expense",
  "day": dia do mês (1 a 31) para contas/receitas fixas,
  "expiration": "YYYY-MM" (opcional, para contas/receitas fixas),
  "cofrinhoName": "nome do cofrinho",
  "reply": "Sua resposta simpática, natural e bem resumida (até 2 frases) para o usuário por escrito/voz. Se registrar algo, diga exatamente o que registrou, o valor e a categoria."
}
2. Se o usuário quiser registrar uma transação normal, use "action": "record_transaction". Classifique a categoria estritamente em uma das oficiais.
3. Se o usuário quiser guardar/depositar dinheiro em um cofrinho, use "action": "cofrinho_deposit".
4. Se o usuário quiser resgatar/tirar dinheiro de um cofrinho, use "action": "cofrinho_withdraw".
5. Se for uma dúvida ou pergunta sobre finanças (como saldos, cofrinhos, gastos ou receitas), use "action": "chat_reply". Calcule as respostas usando as informações de saldo total, cofrinhos e extrato de transações fornecidas. Caso o usuário queira saber quanto falta para atingir a meta de um ou mais cofrinhos, faça a matemática (meta - saldo) e responda de forma simpática no campo "reply".
6. Se o usuário quiser cadastrar uma dívida mensal/conta fixa (ex: 'cadastrar conta de luz todo dia 10 de R$ 150'), use "action": "add_fixed_account".
7. Se o usuário quiser cadastrar uma receita mensal/salário fixo, use "action": "add_fixed_income".
8. Se o usuário quiser criar um novo cofrinho (caixinha/poupança):
   - Você NÃO deve criá-lo sem saber a meta (valor). Se o usuário não disser a meta e não mencionar que quer decidir depois, use "action": "chat_reply" e pergunte qual será a meta dele.
   - Se o usuário explicitamente disser que não sabe a meta, que prefere decidir depois ou coisas semelhantes, use "action": "create_cofrinho" com "value": 0, e no "reply" explique que o cofrinho foi criado com meta R$ 0 e que ele pode alterar depois nas configurações do cofrinho.
   - Se ele informar a meta, use "action": "create_cofrinho" com o valor da meta em "value".
   - Identifique o nome do cofrinho em 'cofrinhoName'.
9. Se o usuário quiser definir ou alterar a meta de um cofrinho existente (ex: 'mude a meta do cofrinho de viagem para 2000' ou 'defina a meta de Comprar Computador para 5000'), use "action": "update_cofrinho". Identifique o nome do cofrinho em 'cofrinhoName' e o novo valor da meta em 'value'.
10. Se o usuário quiser apagar/excluir um cofrinho existente (ex: 'exclua o cofrinho pc' ou 'apague a caixinha de natal'), use "action": "delete_cofrinho". Identifique o nome do cofrinho em 'cofrinhoName'.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        // Build conversational history for context
        const rawMessages = storage.getActiveWeekChatMessages() || [];
        const cleanHistory = [];
        rawMessages.forEach(msg => {
            if (msg.text && !msg.text.startsWith('⚠️')) {
                const role = msg.sender === 'user' ? 'user' : 'model';
                const text = msg.text.replace(/<[^>]*>/g, ''); // strip HTML tags
                
                if (cleanHistory.length === 0) {
                    cleanHistory.push({ role, text });
                } else {
                    const last = cleanHistory[cleanHistory.length - 1];
                    if (last.role === role) {
                        last.text += "\n" + text;
                    } else {
                        cleanHistory.push({ role, text });
                    }
                }
            }
        });
        
        const limitedHistory = cleanHistory.slice(-8); // last 8 turns
        const contents = limitedHistory.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));
        
        // Ensure the current userText is the final user turn in the contents
        if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
            contents.push({
                role: 'user',
                parts: [{ text: userText }]
            });
        } else {
            contents[contents.length - 1].parts[0].text = userText;
        }

        const requestBody = {
            contents: contents,
            systemInstruction: {
                parts: [
                    { text: systemPrompt }
                ]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            let apiMsg = errText;
            try {
                const apiJson = JSON.parse(errText);
                if (apiJson.error && apiJson.error.message) {
                    apiMsg = apiJson.error.message;
                }
            } catch (e) {}
            console.error("Erro na API do Gemini:", errText);
            throw new Error(`Erro na API: ${apiMsg}`);
        }
        
        const data = await response.json();
        let textResponse = data.candidates[0].content.parts[0].text.trim();
        if (textResponse.startsWith('```')) {
            textResponse = textResponse.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
        }
        return JSON.parse(textResponse);
    }

    async function processChatAssistantReply(userText) {
        const isGeminiActive = localStorage.getItem('gemini_active') === 'true';
        const geminiApiKey = localStorage.getItem('gemini_api_key');
        
        if (isGeminiActive && geminiApiKey) {
            try {
                const result = await callGemini(userText);
                const userName = storage.getCurrentUser();
                
                if (result.action === 'record_transaction') {
                    const txData = {
                        item: result.item,
                        value: parseFloat(result.value) || 0,
                        type: result.direction === 'income' ? 'receita_esporadica' : 'despesa_esporadica',
                        category: result.category || (result.direction === 'income' ? 'Receitas' : 'Despesas Pessoais'),
                        date: new Date().toISOString().split('T')[0],
                        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        author: userName
                    };
                    storage.addTransaction(txData);
                    updateUI();
                } else if (result.action === 'cofrinho_deposit') {
                    const cofrinhos = storage.getCofrinhos();
                    let targetCof = null;
                    if (result.cofrinhoName) {
                        targetCof = cofrinhos.find(c => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(result.cofrinhoName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                    }
                    if (!targetCof && cofrinhos.length > 0) targetCof = cofrinhos[0];
                    
                    if (targetCof) {
                        storage.depositToCofrinho(targetCof.id, result.value);
                        updateUI();
                    } else {
                        addAppMessage("Não encontrei nenhum cofrinho cadastrado para guardar o dinheiro.", false);
                        return;
                    }
                } else if (result.action === 'cofrinho_withdraw') {
                    const cofrinhos = storage.getCofrinhos();
                    let targetCof = null;
                    if (result.cofrinhoName) {
                        targetCof = cofrinhos.find(c => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(result.cofrinhoName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                    }
                    if (!targetCof && cofrinhos.length > 0) targetCof = cofrinhos[0];
                    
                    if (targetCof) {
                        const balance = storage.getCofrinhoBalance(targetCof.id);
                        if (result.value > balance) {
                            addAppMessage(`Desculpe, você não tem saldo suficiente no cofrinho ${targetCof.name} (saldo atual: R$ ${balance.toFixed(2).replace('.', ',')}).`, false);
                            return;
                        } else {
                            storage.withdrawFromCofrinho(targetCof.id, result.value);
                            updateUI();
                        }
                    } else {
                        addAppMessage("Não encontrei nenhum cofrinho cadastrado para resgatar o dinheiro.", false);
                        return;
                    }
                } else if (result.action === 'add_fixed_account') {
                    storage.addFixedAccount(result.item, result.value, result.day || 1, result.expiration || null);
                    updateUI();
                } else if (result.action === 'add_fixed_income') {
                    storage.addFixedIncome(result.item, result.value, result.day || 1, result.expiration || null);
                    updateUI();
                } else if (result.action === 'create_cofrinho') {
                    if (result.cofrinhoName) {
                        const metaValue = parseFloat(result.value) || 0;
                        storage.createCofrinho(result.cofrinhoName, metaValue, 'piggy');
                        updateUI();
                    } else {
                        addAppMessage("Não consegui identificar o nome do cofrinho que você quer criar.", false);
                        return;
                    }
                } else if (result.action === 'update_cofrinho') {
                    if (result.cofrinhoName) {
                        const cofrinhos = storage.getCofrinhos();
                        const targetCof = cofrinhos.find(c => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(result.cofrinhoName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                        if (targetCof) {
                            storage.updateCofrinho(targetCof.id, targetCof.name, parseFloat(result.value) || 0, targetCof.icon);
                            updateUI();
                        } else {
                            addAppMessage(`Não encontrei nenhum cofrinho com o nome "${result.cofrinhoName}" para alterar a meta.`, false);
                            return;
                        }
                    } else {
                        addAppMessage("Não consegui identificar o nome do cofrinho para alterar a meta.", false);
                        return;
                    }
                } else if (result.action === 'delete_cofrinho') {
                    if (result.cofrinhoName) {
                        const cofrinhos = storage.getCofrinhos();
                        const targetCof = cofrinhos.find(c => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(result.cofrinhoName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
                        if (targetCof) {
                            storage.deleteCofrinho(targetCof.id);
                            updateUI();
                        } else {
                            addAppMessage(`Não encontrei nenhum cofrinho com o nome "${result.cofrinhoName}" para excluir.`, false);
                            return;
                        }
                    } else {
                        addAppMessage("Não consegui identificar o nome do cofrinho que você deseja excluir.", false);
                        return;
                    }
                }
                
                addAppMessage(result.reply, false);
            } catch (err) {
                console.error("Gemini falhou:", err);
                addAppMessage(`⚠️ <strong>Assistente Gemini:</strong> Não foi possível responder via IA (${err.message}). Usando analisador local off-line.`, false);
                 processChatAssistantReplyLocal(userText);
            }
        } else {
            processChatAssistantReplyLocal(userText);
        }
    }

    function processChatAssistantReplyLocal(userText) {
        const userName = storage.getCurrentUser();
        const contact = storage.getCurrentUserContact();
        const sub = contact ? storage.getUserSubscription(contact) : null;
        
        // Subscription check: if expired or in pre-billing reminder state, intercept spoken choices
        if (sub) {
            const lowerNormalized = userText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            // Check if they are answering the subscription prompt via voice/text
            if (sub.status === 'expired' || sub.lastReminderSent === '7days' || sub.lastReminderSent === '3days') {
                if (lowerNormalized.includes('mensal') || lowerNormalized.includes('6,97')) {
                    processPlanSelection('monthly');
                    return;
                } else if (lowerNormalized.includes('semestral') || lowerNormalized.includes('6 meses') || lowerNormalized.includes('36')) {
                    processPlanSelection('semiannual');
                    return;
                }
            }
            
            // If strictly expired and they try to input anything else, block it and request payment
            if (sub.status === 'expired') {
                const prog = storage.getReferralProgress(contact);
                const hasPromo = storage.getReferralCampaignActive() && prog.active >= 5;
                const semiannualPriceText = hasPromo ? '6 Meses (Promocional: R$ 26,90)' : '6 Meses (R$ 36,00 - R$ 6,00/mês)';
                const referralHtml = getReferralCardHtml(contact);
                const msgHtml = `Olá! Seu período de uso do <strong>Minhas Contas</strong> expirou.<br><br>` +
                                `Para continuar registrando suas movimentações, por favor escolha uma das opções abaixo para efetuar a assinatura:<br>` +
                                `<div class="chat-category-chips-container">` +
                                `  <button class="chat-category-chip" data-subscription-plan="monthly">Mensal (R$ 6,97)</button>` +
                                `  <button class="chat-category-chip" data-subscription-plan="semiannual">${semiannualPriceText}</button>` +
                                `</div>` +
                                referralHtml;
                addAppMessage(msgHtml, false);
                return;
            }
        }
        
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
            if (synthesizer) synthesizer.cancel();
            if (voice) voice.stop();

            const doubtTx = state.doubtTx;
            const missing = state.missing;

            if (missing === 'cofrinhoId') {
                const cofrinhos = storage.getCofrinhos();
                let matchedCof = null;
                const normText = userText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                cofrinhos.forEach(cof => {
                    const cofNameNorm = cof.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (normText.includes(cofNameNorm)) {
                        matchedCof = cof;
                    }
                });
                
                if (!matchedCof) {
                    cofrinhos.forEach(cof => {
                        const cofNameNorm = cof.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const words = cofNameNorm.split(/\s+/).filter(w => w.length >= 3 && !['dos', 'das', 'com', 'meta'].includes(w));
                        for (const word of words) {
                            if (normText.includes(word)) {
                                matchedCof = cof;
                                break;
                            }
                        }
                    });
                }
                
                if (matchedCof) {
                    if (doubtTx.cofrinhoAction === 'guardar') {
                        storage.depositToCofrinho(matchedCof.id, doubtTx.value);
                        addAppMessage(`Entendido! Guardei <strong>R$ ${doubtTx.value.toFixed(2).replace('.', ',')}</strong> no cofrinho <strong>${matchedCof.name}</strong>. 🐷💰`, false);
                    } else {
                        const balance = storage.getCofrinhoBalance(matchedCof.id);
                        if (doubtTx.value > balance) {
                            addAppMessage(`Desculpe, você não tem saldo suficiente no cofrinho <strong>${matchedCof.name}</strong> (saldo atual: R$ ${balance.toFixed(2).replace('.', ',')}).`, false);
                        } else {
                            storage.withdrawFromCofrinho(matchedCof.id, doubtTx.value);
                            addAppMessage(`Entendido! Resgatei <strong>R$ ${doubtTx.value.toFixed(2).replace('.', ',')}</strong> do cofrinho <strong>${matchedCof.name}</strong>. 🐷💵`, false);
                        }
                    }
                    storage.setActiveConversationState({ status: 'idle' });
                    updateUI();
                } else {
                    let msgHtml = `Não entendi qual cofrinho. Por favor, escolha um dos seguintes:<br>`;
                    msgHtml += `<div class="chat-category-chips-container" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;
                    cofrinhos.forEach(cof => {
                        msgHtml += `<button class="chat-chip" onclick="window.selectVoiceCofrinho('${cof.id}')">${cof.name}</button>`;
                    });
                    msgHtml += `</div>`;
                    addAppMessage(msgHtml, true);
                }
                return;
            }

            if (missing === 'value') {
                let cleaned = userText.replace(/R\$/g, '').replace(/reais/g, '').replace(/real/g, '').trim();
                cleaned = cleaned.replace(',', '.');
                const parsedVal = parseFloat(cleaned.match(/[\d.]+/));
                
                if (!isNaN(parsedVal) && parsedVal > 0) {
                    doubtTx.value = parsedVal;
                    if (doubtTx.isFixedAccountTemplate) {
                        const day = doubtTx.day || 1;
                        const expiration = doubtTx.expiration || null;
                        storage.addFixedAccount(doubtTx.item, parsedVal, day, expiration);
                        
                        let msg = `Entendido! Cadastrei a dívida mensal <strong>"${doubtTx.item}"</strong> no valor de R$ ${parsedVal.toFixed(2).replace('.', ',')} com vencimento todo dia ${day}`;
                        if (expiration) {
                            const [year, month] = expiration.split('-');
                            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                            const idx = parseInt(month, 10) - 1;
                            const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                            msg += ` (válida até ${expFormatted})`;
                        }
                        msg += `. 📌`;
                        storage.setActiveConversationState({ status: 'idle' });
                        addAppMessage(msg, false);
                    } else if (doubtTx.isFixedIncomeTemplate) {
                        const day = doubtTx.day || 1;
                        const expiration = doubtTx.expiration || null;
                        storage.addFixedIncome(doubtTx.item, parsedVal, day, expiration);
                        
                        let msg = `Entendido! Cadastrei a receita mensal <strong>"${doubtTx.item}"</strong> no valor de R$ ${parsedVal.toFixed(2).replace('.', ',')} com recebimento todo dia ${day}`;
                        if (expiration) {
                            const [year, month] = expiration.split('-');
                            const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                            const idx = parseInt(month, 10) - 1;
                            const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                            msg += ` (válida até ${expFormatted})`;
                        }
                        msg += `. 📌`;
                        storage.setActiveConversationState({ status: 'idle' });
                        addAppMessage(msg, false);
                    } else if (doubtTx.isCofrinhoTemplate) {
                        if (!doubtTx.cofrinhoId || doubtTx.cofrinhoId === 'default_cofrinho') {
                            const cofrinhos = storage.getCofrinhos();
                            if (cofrinhos.length > 1) {
                                doubtTx.value = parsedVal;
                                doubtTx.missing = 'cofrinhoId';
                                storage.setActiveConversationState({
                                    status: 'awaiting_info',
                                    missing: 'cofrinhoId',
                                    doubtTx: doubtTx
                                });
                                let msgHtml = `Entendido! Deseja ${doubtTx.cofrinhoAction === 'guardar' ? 'guardar' : 'resgatar'} R$ ${parsedVal.toFixed(2).replace('.', ',')}. Em qual cofrinho?`;
                                msgHtml += `<div class="chat-category-chips-container" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;
                                cofrinhos.forEach(cof => {
                                    msgHtml += `<button class="chat-chip" onclick="window.selectVoiceCofrinho('${cof.id}')">${cof.name}</button>`;
                                });
                                msgHtml += `</div>`;
                                addAppMessage(msgHtml, true);
                                return;
                            }
                        }
                        
                        const targetId = doubtTx.cofrinhoId || 'default_cofrinho';
                        const targetCof = storage.getCofrinho(targetId);
                        const targetName = targetCof ? targetCof.name : 'Geral';
                        
                        if (doubtTx.cofrinhoAction === 'guardar') {
                            storage.depositToCofrinho(targetId, parsedVal);
                            addAppMessage(`Entendido! Guardei <strong>R$ ${parsedVal.toFixed(2).replace('.', ',')}</strong> no cofrinho <strong>${targetName}</strong>. 🐷💰`, false);
                        } else {
                            const balance = storage.getCofrinhoBalance(targetId);
                            if (parsedVal > balance) {
                                addAppMessage(`Desculpe, você não tem saldo suficiente no cofrinho <strong>${targetName}</strong> (saldo atual: R$ ${balance.toFixed(2).replace('.', ',')}).`, false);
                            } else {
                                storage.withdrawFromCofrinho(targetId, parsedVal);
                                addAppMessage(`Entendido! Resgatei <strong>R$ ${parsedVal.toFixed(2).replace('.', ',')}</strong> do cofrinho <strong>${targetName}</strong>. 🐷💵`, false);
                            }
                        }
                        storage.setActiveConversationState({ status: 'idle' });
                    } else {
                        let reconText = "";
                        if (doubtTx.direction === 'income') {
                            reconText = `recebi ${parsedVal} com ${doubtTx.item}`;
                        } else if (doubtTx.direction === 'expense') {
                            reconText = `gastei ${parsedVal} com ${doubtTx.item}`;
                        } else {
                            reconText = `${doubtTx.item} no valor de ${parsedVal}`;
                        }
                        storage.setActiveConversationState({ status: 'idle' });
                        processChatAssistantReply(reconText);
                        return;
                    }
                } else {
                    addAppMessage(`Desculpe, não consegui entender o valor em "${userText}". Pode me dizer apenas o valor em número (ex: 50)?`, true);
                    return;
                }
            } else if (missing === 'item') {
                doubtTx.item = userText.trim();
                let reconText = "";
                if (doubtTx.direction === 'income') {
                    reconText = `recebi ${doubtTx.value} com ${doubtTx.item}`;
                } else if (doubtTx.direction === 'expense') {
                    reconText = `gastei ${doubtTx.value} com ${doubtTx.item}`;
                } else {
                    reconText = `${doubtTx.item} no valor de ${doubtTx.value}`;
                }
                storage.setActiveConversationState({ status: 'idle' });
                processChatAssistantReply(reconText);
                return;
            } else if (missing === 'direction') {
                const lowerText = userText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                let direction = null;
                if (['gasto', 'gastei', 'paguei', 'despesa', 'compra', 'comprei', 'saida', 'debito', 'custou'].some(w => lowerText.includes(w))) {
                    direction = 'expense';
                } else if (['recebido', 'recebi', 'ganhei', 'receita', 'entrada', 'salario', 'salário'].some(w => lowerText.includes(w))) {
                    direction = 'income';
                }

                if (direction) {
                    doubtTx.direction = direction;
                    let reconText = "";
                    if (direction === 'income') {
                        reconText = `recebi ${doubtTx.value} com ${doubtTx.item}`;
                    } else {
                        reconText = `gastei ${doubtTx.value} com ${doubtTx.item}`;
                    }
                    storage.setActiveConversationState({ status: 'idle' });
                    processChatAssistantReply(reconText);
                    return;
                } else {
                    let msgHtml = `Não entendi se foi gasto ou recebido. O valor de R$ ${doubtTx.value.toFixed(2).replace('.', ',')} com <strong>"${doubtTx.item}"</strong> foi recebido ou gasto?<br>`;
                    msgHtml += `<div class="chat-category-chips-container">`;
                    msgHtml += `<button class="chat-category-chip" data-direction="expense">Gasto (Saída)</button>`;
                    msgHtml += `<button class="chat-category-chip" data-direction="income">Recebido (Entrada)</button>`;
                    msgHtml += `</div>`;
                    addAppMessage(msgHtml, true);
                    return;
                }
            } else if (missing === 'category') {
                const matchedCategory = matchCategory(userText);
                if (matchedCategory) {
                    const txData = {
                        item: doubtTx.item,
                        value: parseFloat(doubtTx.value) || 0,
                        type: doubtTx.type || (doubtTx.direction === 'income' ? 'receita_esporadica' : 'despesa_esporadica'),
                        category: matchedCategory,
                        date: doubtTx.date || new Date().toISOString().split('T')[0],
                        time: doubtTx.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        author: userName
                    };
                    
                    const newTx = storage.addTransaction(txData);
                    const cleanItem = doubtTx.item.toLowerCase().trim();
                    storage.learnTerm(cleanItem, matchedCategory, txData.type);
                    
                    storage.setActiveConversationState({ status: 'idle' });
                    addAppMessage(`Entendido! Registrei <strong>${doubtTx.item}</strong> (R$ ${txData.value.toFixed(2).replace('.', ',')}) em <strong>${matchedCategory}</strong>. Registrado, ${userName}! ✍️`, false);
                } else {
                    let msgHtml = `Qual a categoria para <strong>"${doubtTx.item}"</strong>? Escolha na tela ou fale a categoria.<br>`;
                    msgHtml += `<div class="chat-category-chips-container">`;
                    const categories = storage.getCategories().filter(c => c !== 'Receitas');
                    categories.forEach(cat => {
                        msgHtml += `<button class="chat-category-chip" data-category="${cat}">${cat}</button>`;
                    });
                    msgHtml += `</div>`;
                    addAppMessage(msgHtml, true);
                    return;
                }
            }

            updateHomeAlertDot();
            updateUI();
        } else {
            const result = parser.parseText(userText);
            
            if (result.hasDoubt) {
                storage.setActiveConversationState({
                    status: 'awaiting_info',
                    missing: result.missing,
                    doubtTx: result
                });
                
                let msgHtml = "";
                let speakPrompt = "";
                
                if (result.missing === 'value') {
                    msgHtml = result.reason || `Qual foi o valor da movimentação?`;
                    speakPrompt = msgHtml;
                } else if (result.missing === 'item') {
                    msgHtml = result.reason || `Com o que foi o valor de R$ ${result.value.toFixed(2).replace('.', ',')}?`;
                    speakPrompt = msgHtml;
                } else if (result.missing === 'direction') {
                    msgHtml = `O valor de R$ ${result.value.toFixed(2).replace('.', ',')} com <strong>"${result.item}"</strong> foi recebido ou gasto?<br>`;
                    msgHtml += `<div class="chat-category-chips-container">`;
                    msgHtml += `<button class="chat-category-chip" data-direction="expense">Gasto (Saída)</button>`;
                    msgHtml += `<button class="chat-category-chip" data-direction="income">Recebido (Entrada)</button>`;
                    msgHtml += `</div>`;
                    speakPrompt = `O valor de R$ ${result.value.toFixed(2).replace('.', ',')} com ${result.item} foi recebido ou gasto?`;
                } else if (result.missing === 'category') {
                    msgHtml = `Qual a categoria para <strong>"${result.item}"</strong> (R$ ${result.value.toFixed(2).replace('.', ',')})? Escolha na tela ou fale a categoria.<br>`;
                    msgHtml += `<div class="chat-category-chips-container">`;
                    const categories = storage.getCategories().filter(c => c !== 'Receitas');
                    categories.forEach(cat => {
                        msgHtml += `<button class="chat-category-chip" data-category="${cat}">${cat}</button>`;
                    });
                    msgHtml += `</div>`;
                    speakPrompt = `Qual a categoria para "${result.item}"? Escolha na tela ou fale a categoria.`;
                } else if (result.missing === 'cofrinhoId') {
                    msgHtml = result.reason;
                    const cofrinhos = storage.getCofrinhos();
                    msgHtml += `<div class="chat-category-chips-container" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">`;
                    cofrinhos.forEach(cof => {
                        msgHtml += `<button class="chat-chip" onclick="window.selectVoiceCofrinho('${cof.id}')">${cof.name}</button>`;
                    });
                    msgHtml += `</div>`;
                    speakPrompt = result.reason;
                }
                
                updateHomeAlertDot();
                addAppMessage(msgHtml, true);
            } else {
                if (result.isFixedAccountTemplate) {
                    storage.addFixedAccount(result.item, result.value, result.day, result.expiration);
                    let msg = `Entendido! Cadastrei a dívida mensal <strong>"${result.item}"</strong> no valor de R$ ${result.value.toFixed(2).replace('.', ',')} com vencimento todo dia ${result.day}`;
                    if (result.expiration) {
                        const [year, month] = result.expiration.split('-');
                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                        const idx = parseInt(month, 10) - 1;
                        const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                        msg += ` (válida até ${expFormatted})`;
                    }
                    msg += `. 📌`;
                    addAppMessage(msg, false);
                } else if (result.isFixedIncomeTemplate) {
                    storage.addFixedIncome(result.item, result.value, result.day, result.expiration);
                    let msg = `Entendido! Cadastrei a receita mensal <strong>"${result.item}"</strong> no valor de R$ ${result.value.toFixed(2).replace('.', ',')} com recebimento todo dia ${result.day}`;
                    if (result.expiration) {
                        const [year, month] = result.expiration.split('-');
                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                        const idx = parseInt(month, 10) - 1;
                        const expFormatted = (idx >= 0 && idx < 12) ? `${monthNames[idx]} de ${year}` : `${month}/${year}`;
                        msg += ` (válida até ${expFormatted})`;
                    }
                    msg += `. 📌`;
                    addAppMessage(msg, false);
                } else if (result.isCofrinhoTemplate) {
                    const targetId = result.cofrinhoId || 'default_cofrinho';
                    const targetCof = storage.getCofrinho(targetId);
                    const targetName = targetCof ? targetCof.name : 'Geral';
                    
                    if (result.cofrinhoAction === 'guardar') {
                        storage.depositToCofrinho(targetId, result.value);
                        addAppMessage(`Entendido! Guardei <strong>R$ ${result.value.toFixed(2).replace('.', ',')}</strong> no cofrinho <strong>${targetName}</strong>. 🐷💰`, false);
                    } else if (result.cofrinhoAction === 'resgatar') {
                        const balance = storage.getCofrinhoBalance(targetId);
                        if (result.value > balance) {
                            addAppMessage(`Desculpe, você não tem saldo suficiente no cofrinho <strong>${targetName}</strong> (saldo atual: R$ ${balance.toFixed(2).replace('.', ',')}).`, false);
                        } else {
                            storage.withdrawFromCofrinho(targetId, result.value);
                            addAppMessage(`Entendido! Resgatei <strong>R$ ${result.value.toFixed(2).replace('.', ',')}</strong> do cofrinho <strong>${targetName}</strong>. 🐷💵`, false);
                        }
                    }
                } else {
                    storage.addTransaction(result);
                    const cleanItem = result.item.toLowerCase().trim();
                    storage.learnTerm(cleanItem, result.category, result.type);
                    addAppMessage(`Registrado, ${userName}! <strong>${result.item}</strong> no valor de R$ ${result.value.toFixed(2).replace('.', ',')} em <strong>${result.category}</strong>. ✍️`, false);
                }
            }
            
            updateUI();
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
        
        // Subscription check
        const contact = storage.getCurrentUserContact();
        const sub = contact ? storage.getUserSubscription(contact) : null;
        const now = Date.now();
        const isBillingAlert = sub && (sub.status === 'expired' || (sub.expiresAt - now <= 7 * 24 * 60 * 60 * 1000));
        
        if (isBillingAlert) {
            if (alertDot) {
                alertDot.style.display = 'block';
                alertDot.classList.add('billing-alert');
            }
            if (homeMicWrapper) homeMicWrapper.classList.add('glowing');
        } else if (state && state.status === 'awaiting_info') {
            if (alertDot) {
                alertDot.style.display = 'block';
                alertDot.classList.remove('billing-alert');
            }
            if (homeMicWrapper) homeMicWrapper.classList.add('glowing');
        } else {
            if (alertDot) {
                alertDot.style.display = 'none';
                alertDot.classList.remove('billing-alert');
            }
            if (homeMicWrapper) homeMicWrapper.classList.remove('glowing');
        }
    }

    function getReferralCardHtml(contact) {
        if (!storage.getReferralCampaignActive()) return '';
        
        const prog = storage.getReferralProgress(contact);
        const activeCount = prog.active;
        const pct = Math.min(100, Math.round((activeCount / 5) * 100));
        
        const urlBase = window.location.href.split('?')[0];
        const referralLink = `${urlBase}?ref=${encodeURIComponent(contact)}`;
        
        const shareText = `Estou usando o aplicativo Minhas Contas para controlar meus gastos e receitas por voz! É muito simples e prático. Teste grátis por 30 dias usando meu link: ${referralLink}`;
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        
        return `<div class="referral-progress-card">` +
               `  <div class="referral-progress-title">` +
               `    <i class="fa-solid fa-gift" style="color: #25d366;"></i> Indique e Ganhe` +
               `  </div>` +
               `  <div class="referral-progress-desc">` +
               `    Obtendo 5 novos cadastros usando seu link, você paga menos na assinatura semestral (<strong>R$ 26,90</strong> em vez de R$ 36,00)!` +
               `  </div>` +
               `  <div class="referral-doodle-progress-wrapper">` +
               `    <div class="referral-doodle-progress-fill" style="width: ${pct}%;"></div>` +
               `    <span class="referral-doodle-progress-pct">${activeCount}/5 indicações</span>` +
               `  </div>` +
               `  <a href="${whatsappUrl}" target="_blank" class="btn-whatsapp-share pulse-whatsapp" id="btn-share-whatsapp-referral">` +
               `    <i class="fa-brands fa-whatsapp"></i> Compartilhar no WhatsApp` +
               `  </a>` +
               `</div>`;
    }

    function checkSubscriptionStatus() {
        const contact = storage.getCurrentUserContact();
        if (!contact) return;
        
        const sub = storage.getUserSubscription(contact);
        if (!sub) return;
        
        const now = Date.now();
        const diffTime = sub.expiresAt - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const prog = storage.getReferralProgress(contact);
        const hasPromo = storage.getReferralCampaignActive() && prog.active >= 5;
        const semiannualPriceText = hasPromo ? '6 Meses (Promocional: R$ 26,90)' : '6 Meses (R$ 36,00 - R$ 6,00/mês)';
        
        if (sub.status !== 'expired' && now >= sub.expiresAt) {
            // Subscription expired!
            storage.updateUserSubscription(contact, { status: 'expired', lastReminderSent: 'expired' });
            updateHomeAlertDot();
            
            const referralHtml = getReferralCardHtml(contact);
            
            // Add app message for immediate billing
            const msgHtml = `Olá! Seu período de uso do <strong>Minhas Contas</strong> expirou.<br><br>` +
                            `Para continuar registrando suas despesas e receitas por voz de forma ultra rápida, escolha uma das opções abaixo para assinar:<br>` +
                            `<div class="chat-category-chips-container">` +
                            `  <button class="chat-category-chip" data-subscription-plan="monthly">Mensal (R$ 6,97)</button>` +
                            `  <button class="chat-category-chip" data-subscription-plan="semiannual">${semiannualPriceText}</button>` +
                            `</div>` +
                            referralHtml;
            addAppMessage(msgHtml, false);
            return;
        }
        
        // Check pre-billing notifications (7 days and 3 days before)
        if (sub.status !== 'expired') {
            const semiannualShortText = hasPromo ? '6 Meses (Promocional: R$ 26,90)' : '6 Meses (R$ 36,00)';
            if (diffDays <= 7 && diffDays > 3 && sub.lastReminderSent === 'none') {
                // 7 days reminder
                storage.updateUserSubscription(contact, { lastReminderSent: '7days' });
                updateHomeAlertDot();
                
                const referralHtml = getReferralCardHtml(contact);
                
                const msgHtml = `Oi! Passando para te lembrar que seu período gratuito termina em <strong>7 dias</strong>. 🍃<br>` +
                                `Se quiser garantir o acesso e renovar agora mesmo, escolha uma opção abaixo. Caso contrário, pode deixar para o dia do vencimento!<br>` +
                                `<div class="chat-category-chips-container">` +
                                `  <button class="chat-category-chip" data-subscription-plan="monthly">Mensal (R$ 6,97)</button>` +
                                `  <button class="chat-category-chip" data-subscription-plan="semiannual">${semiannualShortText}</button>` +
                                `</div>` +
                                referralHtml;
                addAppMessage(msgHtml, false);
            } else if (diffDays <= 3 && diffDays > 0 && (sub.lastReminderSent === '7days' || sub.lastReminderSent === 'none')) {
                // 3 days reminder
                storage.updateUserSubscription(contact, { lastReminderSent: '3days' });
                updateHomeAlertDot();
                
                const referralHtml = getReferralCardHtml(contact);
                
                const msgHtml = `Oi! Faltam apenas <strong>3 dias</strong> para vencer seu período do aplicativo. 🕒<br>` +
                                `Deseja efetuar a assinatura hoje para não precisar se preocupar no vencimento?<br>` +
                                `<div class="chat-category-chips-container">` +
                                `  <button class="chat-category-chip" data-subscription-plan="monthly">Mensal (R$ 6,97)</button>` +
                                `  <button class="chat-category-chip" data-subscription-plan="semiannual">${semiannualShortText}</button>` +
                                `</div>` +
                                referralHtml;
                addAppMessage(msgHtml, false);
            }
        }
    }

    function processPlanSelection(plan) {
        const contact = storage.getCurrentUserContact();
        const prog = contact ? storage.getReferralProgress(contact) : { active: 0 };
        const hasPromo = plan === 'semiannual' && storage.getReferralCampaignActive() && prog.active >= 5;
        
        const price = hasPromo ? 'R$ 26,90' : (plan === 'semiannual' ? 'R$ 36,00' : 'R$ 6,97');
        const planName = plan === 'semiannual' ? (hasPromo ? 'Semestral (Promocional Indicação)' : 'Semestral') : 'Mensal';
        
        let msgHtml = `Ótima escolha! Você selecionou o plano <strong>${planName} (${price})</strong>.<br>`;
        if (hasPromo) {
            msgHtml += `🎉 <strong>Desconto de indicação aplicado!</strong> 5 indicações qualificadas foram utilizadas. Ao confirmar, elas serão consumidas do seu saldo.<br><br>`;
        }
        msgHtml += `Escaneie o QR Code abaixo no aplicativo do seu banco ou copie a chave Pix Copia e Cola para realizar o pagamento.`;
                      
        msgHtml += `<div class="chat-pix-card">` +
                   `  <div class="chat-pix-title">Chave Pix Asaas</div>` +
                   `  <div class="chat-pix-price">${price}</div>` +
                   `  <div class="chat-pix-qrcode-placeholder">` +
                   `    <i class="fa-solid fa-qrcode"></i>` +
                   `  </div>` +
                   `  <button class="chat-pix-btn chat-pix-btn-copy" id="btn-copy-pix">` +
                   `    <i class="fa-solid fa-copy"></i> Copiar Código PIX` +
                   `  </button>` +
                   `  <button class="chat-pix-btn chat-pix-btn-simulate" id="btn-simulate-pix-paid" data-plan="${plan}" data-promo="${hasPromo ? 'true' : 'false'}">` +
                   `    <i class="fa-solid fa-flask"></i> Simular Confirmação do Banco` +
                   `  </button>` +
                   `</div>`;
        
        addAppMessage(msgHtml, false);
    }

    function triggerConfetti() {
        const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
        const overlay = document.getElementById('chat-screen-overlay');
        if (!overlay) return;
        
        for (let i = 0; i < 60; i++) {
            const confettiPiece = document.createElement('div');
            confettiPiece.className = 'confetti';
            confettiPiece.style.left = Math.random() * 100 + '%';
            confettiPiece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confettiPiece.style.animationDelay = Math.random() * 2 + 's';
            confettiPiece.style.transform = `scale(${Math.random() * 0.8 + 0.5})`;
            
            overlay.appendChild(confettiPiece);
            
            setTimeout(() => {
                confettiPiece.remove();
            }, 3000);
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
    const btnAddCategoryQuick = document.getElementById('btn-add-category-quick');
    if (btnAddCategoryQuick) {
        btnAddCategoryQuick.addEventListener('click', () => {
            if (modalNewCategory) modalNewCategory.classList.add('active');
        });
    }

    if (btnCancelNewCategory) {
        btnCancelNewCategory.addEventListener('click', () => {
            if (modalNewCategory) modalNewCategory.classList.remove('active');
            if (newCategoryName) newCategoryName.value = '';
        });
    }

    if (btnSaveNewCategory) {
        btnSaveNewCategory.addEventListener('click', () => {
            if (!newCategoryName) return;
            const cat = newCategoryName.value.trim();
            if (cat) {
                if (storage.addCategory(cat)) {
                    // Re-populate selects
                    if (editCategory) populateCategorySelect(editCategory, cat);
                    if (modalNewCategory) modalNewCategory.classList.remove('active');
                    newCategoryName.value = '';
                } else {
                    alert("Categoria já existe!");
                }
            }
        });
    }

    // 13. Switch Notebook Shelf Modal (Fullscreen Shelf)
    btnSwitchNotebook.addEventListener('click', () => {
        openNotebookShelf();
    });

    if (btnCloseShelf) {
        btnCloseShelf.addEventListener('click', () => {
            switchTab('details');
        });
    }

    function openNotebookShelf() {
        switchTab('shelf');
    }


    function renderShelfList() {
        if (!shelfNotebooksGrid) return;
        shelfNotebooksGrid.innerHTML = '';
        
        const books = storage.getNotebooks();
        const activeNb = storage.getActiveNotebook();
        const activeId = activeNb ? activeNb.id : null;
        const currentContact = storage.getCurrentUserContact().toLowerCase();

        books.forEach(b => {
            const isOwner = b.ownerContact && b.ownerContact.toLowerCase() === currentContact;
            const isGuest = !isOwner;
            const isActive = b.id === activeId;
            
            const card = document.createElement('div');
            card.className = `notebook-cover-card ${isActive ? 'active-nb' : ''}`;
            
            card.innerHTML = `
                <div class="notebook-cover-title">${b.name}</div>
                <div class="notebook-cover-owner">Por: ${b.owner || 'Proprietário'}</div>
                <div class="notebook-cover-badge ${isGuest ? 'guest' : ''}">${isGuest ? 'Convidado' : 'Dono'}</div>
                
                <div class="notebook-cover-actions">
                    ${isOwner ? `<button class="notebook-action-btn share-btn" title="Compartilhar"><i class="fa-regular fa-share-from-square"></i></button>` : ''}
                    <button class="notebook-action-btn rename-btn" title="Renomear"><i class="fa-solid fa-pen"></i></button>
                    ${books.length > 1 ? `<button class="notebook-action-btn delete-btn delete" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                </div>
            `;

            // Click on the card spine/body to switch
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                storage.setActiveNotebook(b.id);
                screenShelf.classList.remove('active');
                updateUI();
            });

            // Action: Rename
            const btnRename = card.querySelector('.rename-btn');
            if (btnRename) {
                btnRename.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newName = prompt(`Digite o novo nome para o caderno "${b.name}":`, b.name);
                    if (newName !== null) {
                        const cleanName = newName.trim();
                        if (cleanName) {
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
            }

            // Action: Delete
            const btnDelete = card.querySelector('.delete-btn');
            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Deseja realmente excluir permanentemente o caderno "${b.name}"? Todos os lançamentos, dívidas, receitas e histórico serão apagados.`)) {
                        const res = storage.deleteNotebook(b.id);
                        if (res.success) {
                            renderShelfList();
                            updateUI();
                        } else {
                            alert(res.message);
                        }
                    }
                });
            }

            // Action: Share
            const btnShare = card.querySelector('.share-btn');
            if (btnShare) {
                btnShare.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openSharingModal(b.id);
                });
            }

            shelfNotebooksGrid.appendChild(card);
        });
    }

    if (btnCreateNotebook) {
        btnCreateNotebook.addEventListener('click', () => {
            const name = newNotebookName.value.trim();
            if (name) {
                storage.createNotebook(name);
                newNotebookName.value = '';
                renderShelfList();
                updateUI();
            }
        });
    }

    // 14. Sharing Modal (Google Docs style)
    let sharingNotebookId = null;

    if (btnShareSettings) {
        btnShareSettings.addEventListener('click', () => {
            const activeNb = storage.getActiveNotebook();
            if (activeNb) {
                const currentContact = storage.getCurrentUserContact().toLowerCase();
                const isOwner = activeNb.ownerContact && activeNb.ownerContact.toLowerCase() === currentContact;
                if (isOwner) {
                    openSharingModal(activeNb.id);
                } else {
                    alert("Apenas o proprietário pode gerenciar o compartilhamento deste caderno.");
                }
            }
        });
    }

    if (btnCloseSharing) {
        btnCloseSharing.addEventListener('click', () => {
            modalSharingSettings.classList.remove('active');
        });
    }

    if (btnAddShareAccess) {
        btnAddShareAccess.addEventListener('click', () => {
            if (!sharingNotebookId) return;
            const contact = shareGuestContact.value.trim();
            const role = shareGuestRole.value.trim() || 'Convidado';

            if (!contact) {
                alert("Por favor, digite o e-mail ou celular do convidado.");
                return;
            }

            const res = storage.addNotebookShare(sharingNotebookId, contact, role);
            if (res.success) {
                shareGuestContact.value = '';
                shareGuestRole.value = '';
                renderSharingMembers(sharingNotebookId);
                renderShelfList();
            } else {
                alert(res.message);
            }
        });
    }

    function openSharingModal(notebookId) {
        sharingNotebookId = notebookId;
        const nb = storage.getNotebook(notebookId);
        if (!nb) return;

        if (sharingNotebookTitle) sharingNotebookTitle.innerText = `Compartilhar "${nb.name}"`;
        if (shareGuestContact) shareGuestContact.value = '';
        if (shareGuestRole) shareGuestRole.value = '';
        
        renderSharingMembers(notebookId);
        modalSharingSettings.classList.add('active');
    }

    function renderSharingMembers(notebookId) {
        const list = sharingMembersListDocs;
        if (!list) return;
        list.innerHTML = '';

        const nb = storage.getNotebook(notebookId);
        if (!nb) return;

        // 1. Proprietário (Dono)
        const ownerRow = document.createElement('div');
        ownerRow.className = 'share-member-row';
        ownerRow.innerHTML = `
            <div class="share-member-info">
                <div class="share-member-name">
                    ${nb.owner || 'Proprietário'} 
                    <span class="share-member-role-badge">Dono</span>
                </div>
                <div class="share-member-contact">${nb.ownerContact || ''}</div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; padding: 4px 8px;">Dono</div>
        `;
        list.appendChild(ownerRow);

        // 2. Convidados
        const shared = nb.sharedWith || [];
        shared.forEach(sh => {
            const member = nb.members ? nb.members.find(m => m.contact && m.contact.toLowerCase() === sh.contact.toLowerCase()) : null;
            const displayName = member ? member.name : 'Pendente (Ainda não entrou)';

            const row = document.createElement('div');
            row.className = 'share-member-row';
            row.innerHTML = `
                <div class="share-member-info">
                    <div class="share-member-name">
                        ${displayName}
                        <span class="share-member-role-badge">${sh.role || 'Convidado'}</span>
                    </div>
                    <div class="share-member-contact">${sh.contact}</div>
                </div>
                <button class="share-member-revoke-btn">Revogar</button>
            `;

            const revokeBtn = row.querySelector('.share-member-revoke-btn');
            revokeBtn.addEventListener('click', () => {
                if (confirm(`Revogar o acesso de "${displayName !== 'Pendente (Ainda não entrou)' ? displayName : sh.contact}" a este caderno?`)) {
                    storage.removeNotebookShare(notebookId, sh.contact);
                    renderSharingMembers(notebookId);
                    renderShelfList();
                }
            });

            list.appendChild(row);
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
            editingFixedId = null;
            const btnSaveText = document.getElementById('btn-save-fixed-text');
            if (btnSaveText) btnSaveText.innerText = "Cadastrar";
        }
    }

    function switchSegmentedMode(mode) {
        // Reset all pills
        const pills = document.querySelectorAll('.segmented-pill');
        pills.forEach(p => p.classList.remove('active'));
        
        // Hide both main KPI and fixed KPI by default
        const mainKpi = document.getElementById('main-kpi-card');
        const fixedKpi = document.getElementById('fixed-budget-summary-card');
        const txList = document.getElementById('transaction-list');
        const fixedWrapper = document.getElementById('fixed-content-wrapper');
        const doodleBox = document.getElementById('doodle-chart-box');

        const fixedNameLabel = document.getElementById('label-fixed-name');
        const fixedNameInput = document.getElementById('fixed-name');
        const fixedDayLabel = document.getElementById('label-fixed-day');
        const fixedListSubtitle = document.getElementById('fixed-list-subtitle');
        const btnToggleAdd = document.getElementById('btn-toggle-add-fixed');

        showFixedForm(false);

        if (mode === 'dia-a-dia') {
            const pillDia = document.getElementById('pill-dia-a-dia');
            if (pillDia) pillDia.classList.add('active');
            
            if (mainKpi) mainKpi.style.display = 'flex';
            if (fixedKpi) fixedKpi.style.display = 'none';
            if (txList) txList.style.display = 'block';
            if (fixedWrapper) fixedWrapper.style.display = 'none';
            if (doodleBox && !document.getElementById('search-transactions').value) doodleBox.style.display = 'block';
        } else if (mode === 'a-pagar') {
            const pillPagar = document.getElementById('pill-a-pagar');
            if (pillPagar) pillPagar.classList.add('active');
            
            currentFixedTab = 'debts';
            if (mainKpi) mainKpi.style.display = 'none';
            if (fixedKpi) fixedKpi.style.display = 'flex';
            if (txList) txList.style.display = 'none';
            if (fixedWrapper) fixedWrapper.style.display = 'block';
            if (doodleBox) doodleBox.style.display = 'none';

            if (btnToggleAdd) btnToggleAdd.innerHTML = '<i class="fa-solid fa-plus"></i> Dívida';
            if (fixedNameLabel) fixedNameLabel.innerText = 'Nome da Dívida';
            if (fixedNameInput) fixedNameInput.placeholder = 'Ex: Colégio José';
            if (fixedDayLabel) fixedDayLabel.innerText = 'Dia do Vencimento';
            if (fixedListSubtitle) fixedListSubtitle.innerText = 'Minhas Dívidas Mensais';
            
            renderFixedAccountsList();
        } else if (mode === 'a-receber') {
            const pillReceber = document.getElementById('pill-a-receber');
            if (pillReceber) pillReceber.classList.add('active');
            
            currentFixedTab = 'incomes';
            if (mainKpi) mainKpi.style.display = 'none';
            if (fixedKpi) fixedKpi.style.display = 'flex';
            if (txList) txList.style.display = 'none';
            if (fixedWrapper) fixedWrapper.style.display = 'block';
            if (doodleBox) doodleBox.style.display = 'none';

            if (btnToggleAdd) btnToggleAdd.innerHTML = '<i class="fa-solid fa-plus"></i> Receita';
            if (fixedNameLabel) fixedNameLabel.innerText = 'Nome da Receita';
            if (fixedNameInput) fixedNameInput.placeholder = 'Ex: Salário Mensal';
            if (fixedDayLabel) fixedDayLabel.innerText = 'Dia do Recebimento';
            if (fixedListSubtitle) fixedListSubtitle.innerText = 'Minhas Receitas Mensais';

            renderFixedAccountsList();
        }
    }

    // Event listeners for segmented pills
    document.querySelectorAll('.segmented-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            if (target) switchSegmentedMode(target);
        });
    });

    // Replace openFixedAccountsModal for legacy buttons
    function openFixedAccountsModal(tab = 'debts') {
        if (notebookDropdown) notebookDropdown.classList.remove('active');
        switchTab('details');
        switchSegmentedMode(tab === 'incomes' ? 'a-receber' : 'a-pagar');
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
                if (editingFixedId) {
                    if (currentFixedTab === 'incomes') {
                        storage.updateFixedIncome(editingFixedId, name, val, day, expiration);
                    } else {
                        storage.updateFixedAccount(editingFixedId, name, val, day, expiration);
                    }
                    editingFixedId = null;
                    const btnSaveText = document.getElementById('btn-save-fixed-text');
                    if (btnSaveText) btnSaveText.innerText = "Cadastrar";
                } else {
                    // Subscription check before creating a NEW fixed account/income
                    const contact = storage.getCurrentUserContact();
                    const sub = contact ? storage.getUserSubscription(contact) : null;
                    if (sub && sub.status === 'expired') {
                        alert("Sua assinatura expirou. Efetue o pagamento via assistente no chat para registrar novos lançamentos!");
                        showFixedForm(false);
                        openChatOverlay();
                        return;
                    }
                    
                    if (currentFixedTab === 'incomes') {
                        storage.addFixedIncome(name, val, day, expiration);
                    } else {
                        storage.addFixedAccount(name, val, day, expiration);
                    }
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
                        ${!isPaid ? `<button class="btn-edit-fixed" data-id="${acc.id}" title="Editar"><i class="fa-solid fa-pencil"></i></button>` : ''}
                        <button class="btn-delete-fixed" data-id="${acc.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                
                if (!isPaid) {
                    item.querySelector('.btn-pay-fixed').addEventListener('click', () => {
                        // Subscription check
                        const contact = storage.getCurrentUserContact();
                        const sub = contact ? storage.getUserSubscription(contact) : null;
                        if (sub && sub.status === 'expired') {
                            alert("Sua assinatura expirou. Efetue o pagamento via assistente no chat para registrar novos pagamentos!");
                            openChatOverlay();
                            return;
                        }
                        
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
                    
                    item.querySelector('.btn-edit-fixed').addEventListener('click', () => {
                        editingFixedId = acc.id;
                        fixedName.value = acc.name;
                        fixedValue.value = acc.value;
                        fixedDay.value = acc.day;
                        fixedExpiration.value = acc.expiration || '';
                        
                        const btnSaveText = document.getElementById('btn-save-fixed-text');
                        if (btnSaveText) btnSaveText.innerText = "Salvar";
                        
                        showFixedForm(true);
                        
                        // Add highlight animation
                        fixedFormCollapsible.classList.remove('flashHighlight');
                        void fixedFormCollapsible.offsetWidth; // trigger reflow
                        fixedFormCollapsible.classList.add('flashHighlight');
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
                        ${!isReceived ? `<button class="btn-edit-fixed" data-id="${inc.id}" title="Editar"><i class="fa-solid fa-pencil"></i></button>` : ''}
                        <button class="btn-delete-fixed" data-id="${inc.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                
                if (!isReceived) {
                    item.querySelector('.btn-pay-fixed').addEventListener('click', () => {
                        // Subscription check
                        const contact = storage.getCurrentUserContact();
                        const sub = contact ? storage.getUserSubscription(contact) : null;
                        if (sub && sub.status === 'expired') {
                            alert("Sua assinatura expirou. Efetue o pagamento via assistente no chat para registrar novos recebimentos!");
                            openChatOverlay();
                            return;
                        }
                        
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
                    
                    item.querySelector('.btn-edit-fixed').addEventListener('click', () => {
                        editingFixedId = inc.id;
                        fixedName.value = inc.name;
                        fixedValue.value = inc.value;
                        fixedDay.value = inc.day;
                        fixedExpiration.value = inc.expiration || '';
                        
                        const btnSaveText = document.getElementById('btn-save-fixed-text');
                        if (btnSaveText) btnSaveText.innerText = "Salvar";
                        
                        showFixedForm(true);
                        
                        // Add highlight animation
                        fixedFormCollapsible.classList.remove('flashHighlight');
                        void fixedFormCollapsible.offsetWidth; // trigger reflow
                        fixedFormCollapsible.classList.add('flashHighlight');
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

    // 14.6. Cofrinho Logic and Bindings (Múltiplos Cofrinhos)
    const btnFloatingPiggy = document.getElementById('btn-floating-piggy');
    const modalCofrinho = document.getElementById('modal-cofrinho');
    const cofrinhoCard = modalCofrinho ? modalCofrinho.querySelector('.cofrinho-card') : null;

    // Elementos das Sub-Vistas
    const listView = document.getElementById('cofrinho-list-view');
    const formView = document.getElementById('cofrinho-form-view');
    const detailView = document.getElementById('cofrinho-detail-view');

    // Elementos da Lista
    const btnCloseCofrinho = document.getElementById('btn-close-cofrinho');
    const cofrinhosListContainer = document.getElementById('cofrinhos-list-container');
    const btnNewCofrinho = document.getElementById('btn-new-cofrinho');

    // Elementos do Formulário
    const btnCancelCofrinho = document.getElementById('btn-cancel-cofrinho');
    const cofrinhoFormTitle = document.getElementById('cofrinho-form-title');
    const cofrinhoFormName = document.getElementById('cofrinho-form-name');
    const cofrinhoFormTarget = document.getElementById('cofrinho-form-target');
    const btnSaveCofrinho = document.getElementById('btn-save-cofrinho');
    const cofrinhoFormIcons = document.getElementById('cofrinho-form-icons');

    // Elementos do Detalhe
    const btnBackToList = document.getElementById('btn-back-to-list');
    const btnDeleteCofrinho = document.getElementById('btn-delete-cofrinho');
    const cofrinhoDetailName = document.getElementById('cofrinho-detail-name');
    const cofrinhoDetailMeta = document.getElementById('cofrinho-detail-meta');
    const btnEditCofrinhoMeta = document.getElementById('btn-edit-cofrinho-meta');
    const cofrinhoDetailIconContainer = document.getElementById('cofrinho-detail-icon-container');
    const cofrinhoDetailBalanceVal = document.getElementById('cofrinho-detail-balance-val');
    const cofrinhoDetailProgressFill = document.getElementById('cofrinho-detail-progress-fill');
    const cofrinhoDetailProgressPct = document.getElementById('cofrinho-detail-progress-pct');
    const cofrinhoDetailProgressDesc = document.getElementById('cofrinho-detail-progress-desc');
    const cofrinhoDetailRemainingDesc = document.getElementById('cofrinho-detail-remaining-desc');
    const cofrinhoDetailHistoryList = document.getElementById('cofrinho-detail-history-list');
    const btnToggleDetailHistory = document.getElementById('btn-toggle-detail-history');
    
    // Elementos de Ação do Detalhe
    const cofrinhoActionBoxTitle = document.getElementById('cofrinho-action-box-title');
    const btnCloseCofrinhoDetail = document.getElementById('btn-close-cofrinho-detail');
    const cofrinhoDetailAmountInput = document.getElementById('cofrinho-detail-amount-input');
    const btnDetailDeposit = document.getElementById('btn-detail-deposit');
    const btnDetailWithdraw = document.getElementById('btn-detail-withdraw');
    const cofrinhoVoiceTipText = document.getElementById('cofrinho-voice-tip-text');

    // Estados locais do modal
    let activeCofrinhoId = null;
    let editingCofrinhoId = null;
    let selectedIcon = 'piggy';
    let showAllHistory = false;

    // Temas por Ícone
    const COFRINHO_THEMES = {
        piggy: { icon: 'fa-piggy-bank', bg: '#fdf2f8', color: '#db2777', track: '#fbcfe8' },
        plane: { icon: 'fa-plane', bg: '#ffe4e6', color: '#f43f5e', track: '#fbcfe8' },
        child: { icon: 'fa-child', bg: '#e0f2fe', color: '#0284c7', track: '#bae6fd' },
        shield: { icon: 'fa-shield-halved', bg: '#dcfce7', color: '#15803d', track: '#bbf7d0' },
        home: { icon: 'fa-house', bg: '#ffedd5', color: '#ea580c', track: '#fed7aa' },
        gift: { icon: 'fa-gift', bg: '#f3e8ff', color: '#9333ea', track: '#e9d5ff' }
    };

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

    // Navegação
    function showCofrinhoList() {
        if (listView) listView.style.display = 'block';
        if (formView) formView.style.display = 'none';
        if (detailView) detailView.style.display = 'none';
        activeCofrinhoId = null;
        editingCofrinhoId = null;
        resetCofrinhoPosition();
        renderCofrinhosList();
    }

    function showCofrinhoForm(id = null) {
        if (listView) listView.style.display = 'none';
        if (formView) formView.style.display = 'block';
        if (detailView) detailView.style.display = 'none';
        resetCofrinhoPosition();

        if (id) {
            editingCofrinhoId = id;
            if (cofrinhoFormTitle) cofrinhoFormTitle.innerText = "Editar cofrinho";
            const cof = storage.getCofrinho(id);
            if (cof) {
                if (cofrinhoFormName) cofrinhoFormName.value = cof.name;
                if (cofrinhoFormTarget) cofrinhoFormTarget.value = cof.value;
                selectedIcon = cof.icon || 'piggy';
            }
        } else {
            editingCofrinhoId = null;
            if (cofrinhoFormTitle) cofrinhoFormTitle.innerText = "Novo cofrinho";
            if (cofrinhoFormName) cofrinhoFormName.value = '';
            if (cofrinhoFormTarget) cofrinhoFormTarget.value = '';
            selectedIcon = 'piggy';
        }

        updateIconPickerUI();
    }

    function showCofrinhoDetail(id) {
        if (listView) listView.style.display = 'none';
        if (formView) formView.style.display = 'none';
        if (detailView) detailView.style.display = 'block';
        activeCofrinhoId = id;
        showAllHistory = false;
        resetCofrinhoPosition();
        renderCofrinhoDetail(id);
    }

    function updateIconPickerUI() {
        if (!cofrinhoFormIcons) return;
        cofrinhoFormIcons.querySelectorAll('.icon-picker-btn').forEach(btn => {
            const iconName = btn.getAttribute('data-icon');
            if (iconName === selectedIcon) {
                btn.classList.add('active');
                const theme = COFRINHO_THEMES[iconName] || COFRINHO_THEMES.piggy;
                btn.style.borderColor = theme.color;
            } else {
                btn.classList.remove('active');
                btn.style.borderColor = 'transparent';
            }
        });
    }

    // Renderização
    function renderCofrinhosList() {
        if (!cofrinhosListContainer) return;
        cofrinhosListContainer.innerHTML = '';
        
        const cofrinhos = storage.getCofrinhos();
        if (cofrinhos.length === 0) {
            cofrinhosListContainer.innerHTML = `
                <div style="font-family: var(--font-handwriting); text-align: center; padding: 30px 10px; color: var(--text-muted); font-size: 1rem; line-height: 1.4;">
                    Nenhum cofrinho criado ainda.<br>Clique em "+ Novo cofrinho" para começar!
                </div>
            `;
            return;
        }
        
        cofrinhos.forEach(cof => {
            const balance = storage.getCofrinhoBalance(cof.id);
            const theme = COFRINHO_THEMES[cof.icon] || COFRINHO_THEMES.piggy;
            const pct = cof.value > 0 ? Math.min(100, Math.round((balance / cof.value) * 100)) : 0;
            
            const div = document.createElement('div');
            div.className = 'cofrinho-list-item';
            div.addEventListener('click', () => {
                showCofrinhoDetail(cof.id);
            });
            
            div.innerHTML = `
                <div class="cofrinho-icon-badge" style="background-color: ${theme.bg}; color: ${theme.color};">
                    <i class="fa-solid ${theme.icon}"></i>
                </div>
                <div class="cofrinho-progress-container">
                    <h4 class="cofrinho-list-title">${cof.name}</h4>
                    <span class="cofrinho-list-meta-text">Meta: R$ ${cof.value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    <div class="cofrinho-list-bar-track">
                        <div class="cofrinho-list-bar-fill" style="width: ${pct}%; background-color: ${theme.color};"></div>
                    </div>
                </div>
                <div class="cofrinho-list-right">
                    <span class="cofrinho-list-val" style="color: ${theme.color};">R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    <span class="cofrinho-list-pct">${pct}%</span>
                </div>
            `;
            cofrinhosListContainer.appendChild(div);
        });
    }

    function renderCofrinhoDetail(id) {
        const cof = storage.getCofrinho(id);
        if (!cof) {
            showCofrinhoList();
            return;
        }
        
        const balance = storage.getCofrinhoBalance(id);
        const theme = COFRINHO_THEMES[cof.icon] || COFRINHO_THEMES.piggy;
        const pct = cof.value > 0 ? Math.round((balance / cof.value) * 100) : 0;
        const remaining = Math.max(0, cof.value - balance);
        
        cofrinhoDetailName.innerText = cof.name;
        cofrinhoDetailMeta.innerText = `Meta: R$ ${cof.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        cofrinhoDetailIconContainer.innerHTML = `<i class="fa-solid ${theme.icon}"></i>`;
        cofrinhoDetailIconContainer.style.backgroundColor = theme.bg;
        cofrinhoDetailIconContainer.style.color = theme.color;
        
        cofrinhoDetailBalanceVal.innerText = formatCurrency(balance);
        cofrinhoDetailBalanceVal.style.color = theme.color;
        
        cofrinhoDetailProgressFill.style.width = `${Math.min(100, pct)}%`;
        cofrinhoDetailProgressFill.style.backgroundColor = theme.color;
        cofrinhoDetailProgressPct.innerText = `${pct}%`;
        
        const wrapper = document.getElementById('cofrinho-detail-progress-wrapper');
        if (wrapper) wrapper.style.backgroundColor = theme.track;
        
        cofrinhoDetailProgressDesc.innerText = `${pct}% da meta`;
        cofrinhoDetailRemainingDesc.innerText = remaining > 0 ? `Faltam R$ ${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Meta batida! 🎉';
        
        cofrinhoActionBoxTitle.innerText = `Guardar dinheiro em ${cof.name}`;
        cofrinhoDetailAmountInput.style.color = theme.color;
        btnDetailDeposit.style.backgroundColor = theme.color;
        btnDetailWithdraw.style.color = theme.color;
        btnDetailWithdraw.style.borderColor = theme.track;
        btnDetailWithdraw.style.backgroundColor = theme.bg;
        
        cofrinhoVoiceTipText.innerText = `Você também pode falar: "Guardar 50 reais no cofrinho ${cof.name.split(' ')[0]}"`;
        
        renderDetailHistory(id);

        const chips = document.querySelectorAll('.cofrinho-chip-btn');
        chips.forEach(c => c.classList.remove('active'));
        cofrinhoDetailAmountInput.value = (0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function renderDetailHistory(id) {
        if (!cofrinhoDetailHistoryList) return;
        cofrinhoDetailHistoryList.innerHTML = '';
        
        const txs = storage.getTransactions();
        const cofrinhoTxs = txs.filter(t => (t.type === 'cofrinho_guardar' || t.type === 'cofrinho_resgatar') && 
                                           (t.cofrinhoId === id || (!t.cofrinhoId && id === 'default_cofrinho')));
        
        cofrinhoTxs.sort((a, b) => {
            const dateA = (a.date || '') + 'T' + (a.time || '00:00');
            const dateB = (b.date || '') + 'T' + (b.time || '00:00');
            const cmp = dateB.localeCompare(dateA);
            if (cmp !== 0) return cmp;
            return (b.id || '').localeCompare(a.id || '');
        });
        
        if (cofrinhoTxs.length === 0) {
            cofrinhoDetailHistoryList.innerHTML = `<div style="font-family: var(--font-handwriting); text-align: center; padding: 10px; color: var(--text-muted); font-size: 0.9rem;">Nenhuma transação neste cofrinho.</div>`;
            if (btnToggleDetailHistory) btnToggleDetailHistory.style.display = 'none';
            return;
        }
        
        const displayLimit = showAllHistory ? cofrinhoTxs.length : 3;
        if (cofrinhoTxs.length > 3) {
            if (btnToggleDetailHistory) {
                btnToggleDetailHistory.style.display = 'flex';
                btnToggleDetailHistory.querySelector('span').innerText = showAllHistory ? 'Ver menos' : 'Ver tudo';
                btnToggleDetailHistory.querySelector('i').className = showAllHistory ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
            }
        } else {
            if (btnToggleDetailHistory) btnToggleDetailHistory.style.display = 'none';
        }
        
        const displayedTxs = cofrinhoTxs.slice(0, displayLimit);
        
        displayedTxs.forEach(t => {
            const isDeposit = t.type === 'cofrinho_guardar';
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.padding = '8px 10px';
            div.style.borderBottom = '1px dotted #EAD8C0';
            div.style.fontSize = '0.82rem';
            div.style.backgroundColor = 'white';
            div.style.borderRadius = '8px';
            
            const dateFormatted = (t.date && typeof t.date === 'string') ? t.date.split('-').reverse().slice(0, 2).join('/') : '';
            const timeFormatted = t.time || '';
            const timeStr = timeFormatted ? ` às ${timeFormatted}` : '';
            
            const circleColor = isDeposit ? '#FFF0F2' : '#E8F5E9';
            const arrowColor = isDeposit ? '#f43f5e' : '#2e7d32';
            const arrowIcon = isDeposit ? 'fa-arrow-down' : 'fa-arrow-up';
            
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background-color: ${circleColor}; color: ${arrowColor}; font-size: 0.75rem;">
                        <i class="fa-solid ${arrowIcon}"></i>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; color: #333;">${isDeposit ? 'Guardado' : 'Resgate'}</span>
                        <span style="font-size: 0.65rem; color: #999;">${dateFormatted}${timeStr}</span>
                    </div>
                </div>
                <strong style="color: ${isDeposit ? '#f43f5e' : '#2e7d32'}; font-family: var(--font-title); font-size: 0.9rem;">
                    ${isDeposit ? '' : '-'} R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
            `;
            cofrinhoDetailHistoryList.appendChild(div);
        });
    }

    function getNumericAmount() {
        if (!cofrinhoDetailAmountInput) return 0;
        let valStr = cofrinhoDetailAmountInput.value.replace(/[^\d.,]/g, '');
        if (valStr.includes('.') && valStr.includes(',')) {
            valStr = valStr.replace(/\./g, '').replace(',', '.');
        } else if (valStr.includes(',')) {
            valStr = valStr.replace(',', '.');
        }
        return parseFloat(valStr) || 0;
    }

    // Eventos de Abertura / Fechamento
    if (btnFloatingPiggy) {
        btnFloatingPiggy.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modalCofrinho) {
                resetCofrinhoPosition();
                modalCofrinho.classList.add('active');
                showCofrinhoList();
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

    if (btnCloseCofrinhoDetail) {
        btnCloseCofrinhoDetail.addEventListener('click', () => {
            if (modalCofrinho) {
                modalCofrinho.classList.remove('active');
                resetCofrinhoPosition();
            }
        });
    }

    // Eventos de Ação e Criação
    if (btnNewCofrinho) {
        btnNewCofrinho.addEventListener('click', () => {
            showCofrinhoForm();
        });
    }

    if (btnCancelCofrinho) {
        btnCancelCofrinho.addEventListener('click', () => {
            showCofrinhoList();
        });
    }

    if (btnBackToList) {
        btnBackToList.addEventListener('click', () => {
            showCofrinhoList();
        });
    }

    // Picker de Ícone do Form
    if (cofrinhoFormIcons) {
        cofrinhoFormIcons.querySelectorAll('.icon-picker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedIcon = btn.getAttribute('data-icon');
                updateIconPickerUI();
            });
        });
    }

    // Salvar Cofrinho
    if (btnSaveCofrinho) {
        btnSaveCofrinho.addEventListener('click', () => {
            const name = cofrinhoFormName ? cofrinhoFormName.value.trim() : '';
            const target = cofrinhoFormTarget ? parseFloat(cofrinhoFormTarget.value) : 0;
            
            if (!name) {
                alert("Por favor, digite o nome do cofrinho!");
                return;
            }
            if (isNaN(target) || target <= 0) {
                alert("Por favor, digite uma meta válida (maior que zero)!");
                return;
            }

            if (editingCofrinhoId) {
                storage.updateCofrinho(editingCofrinhoId, name, target, selectedIcon);
            } else {
                storage.createCofrinho(name, target, selectedIcon);
            }

            showCofrinhoList();
            updateUI();
        });
    }

    // Editar Cofrinho
    if (btnEditCofrinhoMeta) {
        btnEditCofrinhoMeta.addEventListener('click', () => {
            if (activeCofrinhoId) {
                showCofrinhoForm(activeCofrinhoId);
            }
        });
    }

    // Excluir Cofrinho
    if (btnDeleteCofrinho) {
        btnDeleteCofrinho.addEventListener('click', () => {
            if (activeCofrinhoId) {
                const cof = storage.getCofrinho(activeCofrinhoId);
                const name = cof ? cof.name : 'este cofrinho';
                if (confirm(`Deseja mesmo excluir o cofrinho "${name}"? Todo o histórico de economias dele será apagado permanentemente!`)) {
                    storage.deleteCofrinho(activeCofrinhoId);
                    showCofrinhoList();
                    updateUI();
                }
            }
        });
    }

    // Toggle Histórico Completo
    if (btnToggleDetailHistory) {
        btnToggleDetailHistory.addEventListener('click', () => {
            showAllHistory = !showAllHistory;
            if (activeCofrinhoId) renderDetailHistory(activeCofrinhoId);
        });
    }

    // Chips Rápidos de Valor
    document.querySelectorAll('.cofrinho-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cofrinho-chip-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const val = btn.getAttribute('data-value');
            if (val === 'outro') {
                if (cofrinhoDetailAmountInput) {
                    cofrinhoDetailAmountInput.value = (0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    cofrinhoDetailAmountInput.focus();
                }
            } else {
                const numericVal = parseFloat(val);
                if (cofrinhoDetailAmountInput) {
                    cofrinhoDetailAmountInput.value = numericVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                }
            }
        });
    });

    // Formatação em Tempo Real do Input Monetário
    if (cofrinhoDetailAmountInput) {
        cofrinhoDetailAmountInput.addEventListener('input', (e) => {
            document.querySelectorAll('.cofrinho-chip-btn').forEach(btn => btn.classList.remove('active'));
            const btnOutro = document.getElementById('btn-chip-outro');
            if (btnOutro) btnOutro.classList.add('active');
            
            let value = e.target.value.replace(/\D/g, '');
            if (!value) {
                e.target.value = 'R$ 0,00';
                return;
            }
            let cents = parseInt(value, 10);
            let numberValue = cents / 100;
            e.target.value = numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        });
        
        cofrinhoDetailAmountInput.addEventListener('focus', (e) => {
            setTimeout(() => {
                e.target.setSelectionRange(0, e.target.value.length);
            }, 50);
        });
    }

    // Depósito (Guardar)
    if (btnDetailDeposit) {
        btnDetailDeposit.addEventListener('click', () => {
            if (!activeCofrinhoId) return;
            const amount = getNumericAmount();
            if (isNaN(amount) || amount <= 0) {
                alert("Por favor, digite um valor válido para guardar!");
                return;
            }
            storage.depositToCofrinho(activeCofrinhoId, amount);
            updateUI();
        });
    }

    // Saque (Resgatar)
    if (btnDetailWithdraw) {
        btnDetailWithdraw.addEventListener('click', () => {
            if (!activeCofrinhoId) return;
            const amount = getNumericAmount();
            if (isNaN(amount) || amount <= 0) {
                alert("Por favor, digite um valor válido para resgatar!");
                return;
            }
            const currentBalance = storage.getCofrinhoBalance(activeCofrinhoId);
            if (amount > currentBalance) {
                alert("Você não tem saldo suficiente neste cofrinho!");
                return;
            }
            storage.withdrawFromCofrinho(activeCofrinhoId, amount);
            updateUI();
        });
    }

    // Atualização Geral da UI do Cofrinho
    function updateCofrinhoUI() {
        const balance = storage.getTotalCofrinhoBalance();
        const badge = document.getElementById('piggy-balance-badge');
        if (badge) {
            badge.innerText = `R$ ${balance.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
        }

        if (listView && listView.style.display === 'block') {
            renderCofrinhosList();
        }
        if (activeCofrinhoId) {
            renderCofrinhoDetail(activeCofrinhoId);
        }
    }

    // Draggable para o modal
    if (cofrinhoCard && modalCofrinho) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onDragStart = (e) => {
            if (e.target.closest('input, button, select, textarea, .cofrinho-list-item, .chat-chip, .icon-picker-btn, .cofrinho-chip-btn, #cofrinho-detail-history-list')) {
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

    // Expor função global de escolha de cofrinho via chat
    window.selectVoiceCofrinho = function(cofrinhoId) {
        const state = storage.getActiveConversationState();
        if (state && state.status === 'awaiting_info' && state.missing === 'cofrinhoId') {
            const doubtTx = state.doubtTx;
            const cofrinho = storage.getCofrinho(cofrinhoId);
            if (cofrinho) {
                if (doubtTx.cofrinhoAction === 'guardar') {
                    storage.depositToCofrinho(cofrinhoId, doubtTx.value);
                    addAppMessage(`Entendido! Guardei <strong>R$ ${doubtTx.value.toFixed(2).replace('.', ',')}</strong> no cofrinho <strong>${cofrinho.name}</strong>. 🐷💰`, false);
                } else {
                    const balance = storage.getCofrinhoBalance(cofrinhoId);
                    if (doubtTx.value > balance) {
                        addAppMessage(`Desculpe, você não tem saldo suficiente no cofrinho <strong>${cofrinho.name}</strong> (saldo atual: R$ ${balance.toFixed(2).replace('.', ',')}).`, false);
                    } else {
                        storage.withdrawFromCofrinho(cofrinhoId, doubtTx.value);
                        addAppMessage(`Entendido! Resgatei <strong>R$ ${doubtTx.value.toFixed(2).replace('.', ',')}</strong> do cofrinho <strong>${cofrinho.name}</strong>. 🐷💵`, false);
                    }
                }
                storage.setActiveConversationState({ status: 'idle' });
                updateUI();
            }
        }
    };

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
    const searchTxInput = document.getElementById('search-transactions');
    if (searchTxInput) {
        searchTxInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value;
            renderTransactions();
        });
    }

    // Novo Dropdown de Filtros
    const btnFilterDropdown = document.getElementById('btn-filter-dropdown');
    const filterDropdownMenu = document.getElementById('filter-dropdown-menu');
    if (btnFilterDropdown && filterDropdownMenu) {
        btnFilterDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            btnFilterDropdown.classList.toggle('active');
            filterDropdownMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!filterDropdownMenu.contains(e.target) && e.target !== btnFilterDropdown) {
                btnFilterDropdown.classList.remove('active');
                filterDropdownMenu.classList.remove('active');
            }
        });

        document.querySelectorAll('.filter-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.getAttribute('data-type') || 'all';
                currentFilters.type = type;

                document.querySelectorAll('.filter-dropdown-item').forEach(i => {
                    if (i.getAttribute('data-type') === type) {
                        i.classList.add('active');
                    } else {
                        i.classList.remove('active');
                    }
                });

                // Atualizar o texto do botão do dropdown
                const span = btnFilterDropdown.querySelector('span');
                if (span) {
                    const textMap = {
                        'all': 'Todos',
                        'income': 'Entradas',
                        'expense': 'Saídas',
                        'recurring': 'Fixos',
                        'sporadic': 'Esporádicos'
                    };
                    span.innerText = textMap[type] || 'Filtros';
                }

                btnFilterDropdown.classList.remove('active');
                filterDropdownMenu.classList.remove('active');
                updateUI();
            });
        });
    }

    // Seletor de Meses através de Calendário
    const btnMonthsPicker = document.getElementById('btn-months-picker');
    const monthsCarouselPicker = document.getElementById('months-carousel-picker');
    if (btnMonthsPicker && monthsCarouselPicker) {
        btnMonthsPicker.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof monthsCarouselPicker.showPicker === 'function') {
                monthsCarouselPicker.showPicker();
            } else {
                monthsCarouselPicker.click();
            }
        });

        monthsCarouselPicker.addEventListener('change', (e) => {
            const val = e.target.value; // Formato: YYYY-MM
            if (val) {
                currentFilters.selectedMonthYear = val;
                populateMonthsCarousel();
                updateUI();
                centerActiveMonthPill(true);
            }
        });
    }

    // Modal Editar Perfil Logic
    const btnEditProfile = document.getElementById('btn-edit-profile');
    const modalEditProfile = document.getElementById('modal-edit-profile');
    const btnCancelProfile = document.getElementById('btn-cancel-profile');
    const btnSaveProfile = document.getElementById('btn-save-profile');
    const profileName = document.getElementById('profile-name');
    const profileBirthdate = document.getElementById('profile-birthdate');
    const profileEmail = document.getElementById('profile-email');
    const profileWhatsapp = document.getElementById('profile-whatsapp');
    const profilePassword = document.getElementById('profile-password');
    const btnToggleProfilePass = document.getElementById('btn-toggle-profile-pass');
    const profilePicInput = document.getElementById('profile-pic-input');
    const profilePicPreview = document.getElementById('profile-pic-preview');
    const profilePicPlaceholder = document.getElementById('profile-pic-placeholder');

    let uploadedProfilePhotoBase64 = '';

    if (btnEditProfile) {
        btnEditProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notebookDropdown) notebookDropdown.classList.remove('active');
            
            const contact = storage.getCurrentUserContact();
            const profile = contact ? storage.getUserProfile(contact) : null;
            
            if (profile) {
                profileName.value = profile.fullName || '';
                profileBirthdate.value = profile.birthdate || '';
                profileEmail.value = profile.contact || '';
                profileWhatsapp.value = profile.whatsapp || '';
                profilePassword.value = profile.password || '';
                
                if (profile.photo) {
                    profilePicPreview.src = profile.photo;
                    profilePicPreview.style.display = 'block';
                    profilePicPlaceholder.style.display = 'none';
                    uploadedProfilePhotoBase64 = profile.photo;
                } else {
                    profilePicPreview.style.display = 'none';
                    profilePicPlaceholder.style.display = 'block';
                    uploadedProfilePhotoBase64 = '';
                }
                
                modalEditProfile.classList.add('active');
            }
        });
    }

    if (btnCancelProfile) {
        btnCancelProfile.addEventListener('click', () => {
            modalEditProfile.classList.remove('active');
        });
    }

    if (btnToggleProfilePass) {
        btnToggleProfilePass.addEventListener('click', () => {
            const icon = btnToggleProfilePass.querySelector('i');
            if (profilePassword.type === 'password') {
                profilePassword.type = 'text';
                icon.className = 'fa-regular fa-eye';
            } else {
                profilePassword.type = 'password';
                icon.className = 'fa-regular fa-eye-slash';
            }
        });
    }

    if (profilePicInput) {
        profilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target.result;
                    profilePicPreview.src = base64;
                    profilePicPreview.style.display = 'block';
                    profilePicPlaceholder.style.display = 'none';
                    uploadedProfilePhotoBase64 = base64;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', () => {
            const contact = storage.getCurrentUserContact();
            if (!contact) return;
            
            const fullNameVal = profileName.value.trim();
            const birthdateVal = profileBirthdate.value;
            const whatsappVal = profileWhatsapp.value.trim();
            const passwordVal = profilePassword.value;
            
            const firstWord = fullNameVal.split(' ')[0] || storage.getCurrentUser();
            
            const updates = {
                name: firstWord,
                fullName: fullNameVal,
                birthdate: birthdateVal,
                whatsapp: whatsappVal,
                password: passwordVal,
                photo: uploadedProfilePhotoBase64
            };
            
            const result = storage.updateUserProfile(contact, updates);
            if (result.success) {
                storage.setCurrentUser(firstWord);
                updateUserGreeting();
                updateUI();
                modalEditProfile.classList.remove('active');
            } else {
                alert(result.message || "Erro ao salvar perfil.");
            }
        });
    }

    // Modal Gemini Settings Logic
    const btnGeminiSettings = document.getElementById('btn-gemini-settings');
    const modalGeminiSettings = document.getElementById('modal-gemini-settings');
    const btnCancelGemini = document.getElementById('btn-cancel-gemini');
    const btnSaveGemini = document.getElementById('btn-save-gemini');
    const geminiActive = document.getElementById('gemini-active');
    const geminiApiKey = document.getElementById('gemini-api-key');
    const geminiKeyContainer = document.getElementById('gemini-key-container');

    if (btnGeminiSettings && modalGeminiSettings) {
        btnGeminiSettings.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notebookDropdown) notebookDropdown.classList.remove('active');
            
            const isActive = localStorage.getItem('gemini_active') === 'true';
            const apiKey = localStorage.getItem('gemini_api_key') || '';
            
            if (geminiActive) geminiActive.checked = isActive;
            if (geminiApiKey) geminiApiKey.value = apiKey;
            
            if (geminiKeyContainer) {
                geminiKeyContainer.style.display = isActive ? 'flex' : 'none';
            }
            
            modalGeminiSettings.classList.add('active');
        });
    }

    if (geminiActive && geminiKeyContainer) {
        geminiActive.addEventListener('change', () => {
            geminiKeyContainer.style.display = geminiActive.checked ? 'flex' : 'none';
        });
    }

    if (btnCancelGemini && modalGeminiSettings) {
        btnCancelGemini.addEventListener('click', () => {
            modalGeminiSettings.classList.remove('active');
        });
    }

    if (btnSaveGemini && modalGeminiSettings) {
        btnSaveGemini.addEventListener('click', () => {
            const activeVal = geminiActive ? geminiActive.checked : false;
            const keyVal = geminiApiKey ? geminiApiKey.value.trim() : '';
            
            if (activeVal && !keyVal) {
                alert("Por favor, informe a Chave de API para poder ativar o Gemini!");
                return;
            }
            
            localStorage.setItem('gemini_active', activeVal);
            localStorage.setItem('gemini_api_key', keyVal);
            modalGeminiSettings.classList.remove('active');
        });
    }

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

    const btnDevSimulateBilling = document.getElementById('btn-dev-simulate-billing');
    if (btnDevSimulateBilling) {
        btnDevSimulateBilling.addEventListener('click', () => {
            const contact = storage.getCurrentUserContact();
            if (contact) {
                if (notebookDropdown) notebookDropdown.classList.remove('active');
                alert("Simulação Iniciada!\n\n1. Primeiro veremos o aviso de 7 dias restantes (ativo agora).\n2. Daqui a 6 segundos veremos o aviso de 3 dias.\n3. Daqui a 12 segundos veremos o vencimento completo.");
                
                const now = Date.now();
                
                // --- PASSO 1: Lembrete de 7 dias restantes (imediato) ---
                storage.updateUserSubscription(contact, {
                    status: 'trial',
                    expiresAt: now + (7 * 24 * 60 * 60 * 1000) - 10000, // 7 dias - 10s
                    lastReminderSent: 'none'
                });
                checkSubscriptionStatus();
                updateUI();
                
                // --- PASSO 2: Lembrete de 3 dias restantes (após 6 segundos) ---
                setTimeout(() => {
                    const sub = storage.getUserSubscription(contact);
                    if (sub && sub.status === 'trial') {
                        const nowStep2 = Date.now();
                        storage.updateUserSubscription(contact, {
                            expiresAt: nowStep2 + (3 * 24 * 60 * 60 * 1000) - 10000, // 3 dias - 10s
                            lastReminderSent: '7days'
                        });
                        checkSubscriptionStatus();
                        updateUI();
                    }
                }, 6000);
                
                // --- PASSO 3: Vencimento Total (após 12 segundos) ---
                setTimeout(() => {
                    const sub = storage.getUserSubscription(contact);
                    if (sub && sub.status === 'trial') {
                        const nowStep3 = Date.now();
                        storage.updateUserSubscription(contact, {
                            expiresAt: nowStep3 - 5000, // Expirado há 5 segundos
                            lastReminderSent: '3days'
                        });
                        checkSubscriptionStatus();
                        updateUI();
                    }
                }, 12000);
            }
        });
    }

    const btnDevAddReferral = document.getElementById('btn-dev-add-referral');
    if (btnDevAddReferral) {
        btnDevAddReferral.addEventListener('click', () => {
            const contact = storage.getCurrentUserContact();
            if (!contact) {
                alert("Nenhum usuário logado!");
                return;
            }
            if (notebookDropdown) notebookDropdown.classList.remove('active');
            
            // Add referral point
            storage.addReferralPoint(contact);
            const prog = storage.getReferralProgress(contact);
            
            alert(`Sucesso! Simulação de Indicação efetuada (+1 amigo).\n\nSaldo de Indicações Ativas: ${prog.active}/5`);
            
            if (prog.active >= 5) {
                openChatOverlay();
                const msgHtml = `🎉 <strong>Parabéns!</strong> Você atingiu a meta de 5 indicações qualificadas!<br>` +
                                `Seu desconto especial para o plano <strong>Semestral</strong> foi liberado! Ao assinar o plano semestral, você pagará apenas <strong>R$ 26,90</strong>.<br><br>` +
                                `Escolha uma das opções abaixo para assinar:<br>` +
                                `<div class="chat-category-chips-container">` +
                                `  <button class="chat-category-chip" data-subscription-plan="monthly">Mensal (R$ 6,97)</button>` +
                                `  <button class="chat-category-chip" data-subscription-plan="semiannual">6 Meses (Promocional: R$ 26,90)</button>` +
                                `</div>`;
                addAppMessage(msgHtml, false);
            } else {
                const overlay = document.getElementById('chat-screen-overlay');
                if (overlay && overlay.classList.contains('active')) {
                    renderChatMessages();
                }
            }
            updateUI();
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
        const currentYear = new Date().getFullYear();
        
        if (year !== currentYear) {
            return `${day} de ${monthName}, ${year}, ${dayName}`;
        } else {
            return `${day} de ${monthName}, ${dayName}`;
        }
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
        
        const valBalanceEl = document.getElementById('val-balance');
        if (valBalanceEl) {
            valBalanceEl.innerText = formatCurrency(balance);
            if (balance < 0) {
                valBalanceEl.style.color = 'var(--red-ink)';
            } else {
                valBalanceEl.style.color = 'var(--blue-ink)';
            }
        }

        // Calculate Unpaid Debts (Agendado até)
        const selectedMonth = currentFilters.selectedMonthYear;
        const accounts = storage.getFixedAccounts();
        const activeDebts = accounts.filter(acc => !acc.expiration || selectedMonth <= acc.expiration);
        
        let totalUnpaidDebts = 0;
        let maxDayUnpaid = 0;
        activeDebts.forEach(acc => {
            const isPaid = txs.some(t => 
                t.item === acc.name && 
                (t.type === 'despesa_recorrente' || t.type === 'despesa_esporadica') && 
                t.date && typeof t.date === 'string' && t.date.startsWith(selectedMonth)
            );
            if (!isPaid) {
                totalUnpaidDebts += acc.value;
                if (acc.day > maxDayUnpaid) maxDayUnpaid = acc.day;
            }
        });

        const valAgendadoEl = document.getElementById('val-agendado');
        const agendadoLabelEl = document.getElementById('agendado-label');
        
        if (valAgendadoEl) {
            valAgendadoEl.innerText = '- ' + formatCurrency(totalUnpaidDebts);
        }
        if (agendadoLabelEl) {
            if (maxDayUnpaid > 0) {
                const parts = selectedMonth.split('-');
                const monthStr = parts.length === 2 ? parts[1] : '';
                const dayStr = String(maxDayUnpaid).padStart(2, '0');
                agendadoLabelEl.innerText = `Agendado até ${dayStr}/${monthStr}`;
            } else {
                agendadoLabelEl.innerText = 'Agendado';
            }
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
                dayDivider.innerHTML = `<span class="day-divider-text">${dayStr}</span>`;
                transactionList.appendChild(dayDivider);
                lastDay = dayStr;
            }

            const itemRow = document.createElement('div');
            itemRow.className = `transaction-item ${isInc ? 'income-item' : 'expense-item'}`;
            itemRow.id = `tx-row-${t.id}`;
            if (isHandwriting) itemRow.classList.add('handwriting-mode');

            itemRow.innerHTML = `
                <div class="transaction-icon ${isInc ? 'income' : 'expense'}">
                    <i class="fa-solid ${isInc ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                </div>
                <div class="transaction-info">
                    <span class="transaction-title">${t.item}</span>
                    <div class="transaction-meta">
                        <span class="transaction-time">${t.time || ''}</span>
                        <span class="transaction-sep">•</span>
                        <span class="transaction-category">${t.category}</span>
                    </div>
                </div>
                <div class="transaction-amount ${isInc ? 'income' : 'expense'}">
                    <span>${isInc ? '+' : '-'} R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            `;

            itemRow.addEventListener('click', () => {
                openEditModal(t.id);
            });

            transactionList.appendChild(itemRow);
        });

        renderDoodleCharts(filtered);
    }

    // Populate dynamic months carousel (5 months centered on selected month)
    function populateMonthsCarousel() {
        const carousel = document.getElementById('months-carousel');
        const fixedCarousel = document.getElementById('fixed-months-carousel');
        if (!carousel) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Center months carousel around the currently selected month
        let centerYear = currentYear;
        let centerMonth = currentMonth;
        if (currentFilters.selectedMonthYear) {
            const parts = currentFilters.selectedMonthYear.split('-');
            if (parts.length === 2) {
                centerYear = parseInt(parts[0], 10);
                centerMonth = parseInt(parts[1], 10) - 1;
            }
        }

        const monthsData = [];
        for (let i = -2; i <= 2; i++) {
            const d = new Date(centerYear, centerMonth + i, 1);
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
                if (carouselWidth === 0) return; // Prevent scroll calculation when invisible
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

    function updateHomeUI() {
        const activeNb = storage.getActiveNotebook();
        
        // 1. Nome do caderno
        const homeNotebookName = document.getElementById('home-notebook-name');
        if (homeNotebookName) {
            homeNotebookName.innerText = activeNb.name;
        }

        // 2. Saldo ativo
        const txs = storage.getTransactions();
        let income = 0;
        let expense = 0;
        txs.forEach(t => {
            const isInc = t.type === 'salario' || (t.type && typeof t.type === 'string' && t.type.startsWith('receita')) || t.type === 'cofrinho_resgatar';
            if (isInc) {
                income += t.value;
            } else {
                expense += t.value;
            }
        });
        const balance = income - expense;

        const homeBalanceVal = document.getElementById('home-balance-val');
        if (homeBalanceVal) {
            homeBalanceVal.innerText = formatCurrency(balance);
            if (balance < 0) {
                homeBalanceVal.classList.add('negative');
            } else {
                homeBalanceVal.classList.remove('negative');
            }
        }

        // 3. Card de última movimentação
        const homeLastTxCard = document.getElementById('home-last-transaction-card');
        if (homeLastTxCard) {
            if (txs.length === 0) {
                homeLastTxCard.style.display = 'none';
            } else {
                // Obter última transação ordenada por data e hora decrescente
                const sortedTxs = [...txs].sort((a, b) => {
                    const dateA = (a.date || '') + 'T' + (a.time || '00:00');
                    const dateB = (b.date || '') + 'T' + (b.time || '00:00');
                    return dateB.localeCompare(dateA);
                });
                const lastTx = sortedTxs[0];

                const lastTxValue = document.getElementById('last-tx-value');
                const lastTxDesc = document.getElementById('last-tx-desc');
                const lastTxTime = document.getElementById('last-tx-time');
                const lastTxIcon = document.getElementById('last-tx-icon');
                const lastTxIconWrapper = document.getElementById('last-tx-icon-wrapper');

                if (lastTxValue && lastTxDesc && lastTxTime) {
                    const isInc = lastTx.type === 'salario' || (lastTx.type && typeof lastTx.type === 'string' && lastTx.type.startsWith('receita')) || lastTx.type === 'cofrinho_resgatar';
                    
                    lastTxValue.innerText = (isInc ? '+ ' : '- ') + formatCurrency(lastTx.value);
                    if (isInc) {
                        lastTxValue.className = 'last-tx-value income';
                        if (lastTxIconWrapper) lastTxIconWrapper.className = 'last-tx-icon-wrapper income';
                        if (lastTxIcon) lastTxIcon.className = 'fa-solid fa-arrow-up';
                    } else {
                        lastTxValue.className = 'last-tx-value expense';
                        if (lastTxIconWrapper) lastTxIconWrapper.className = 'last-tx-icon-wrapper expense';
                        if (lastTxIcon) lastTxIcon.className = 'fa-solid fa-arrow-down';
                    }

                    lastTxDesc.innerText = lastTx.item || 'Sem descrição';

                    if (lastTx.date && typeof lastTx.date === 'string') {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = yesterday.toISOString().slice(0, 10);
                        
                        let dayLabel = '';
                        if (lastTx.date === todayStr) {
                            dayLabel = 'Hoje';
                        } else if (lastTx.date === yesterdayStr) {
                            dayLabel = 'Ontem';
                        } else {
                            const parts = lastTx.date.split('-');
                            if (parts.length === 3) {
                                dayLabel = `${parts[2]}/${parts[1]}`;
                            } else {
                                dayLabel = lastTx.date;
                            }
                        }
                        const timeStr = lastTx.time || '00:00';
                        lastTxTime.innerText = `${dayLabel}, ${timeStr}`;
                    } else {
                        lastTxTime.innerText = 'Agora mesmo';
                    }

                    homeLastTxCard.style.display = 'flex';
                }
            }
        }
    }

    // 17. Master update UI function
    function updateUI() {
        const activeNb = storage.getActiveNotebook();
        const nbNameDisplay = document.getElementById('notebook-name-display');
        if (nbNameDisplay) {
            nbNameDisplay.innerText = activeNb.name;
        }
        
        renderBalances();
        renderTransactions();
        updateHomeAlertDot();
        renderFixedAccountsList();
        updateCofrinhoUI();
        checkHomeFixedDebtsAlert();
        renderChatMessages();
        updateHomeUI();
    }

    // 18. App Start
    checkLogin();
    checkSubscriptionStatus();
    
    // Set a recurring interval to check billing status
    setInterval(() => {
        checkSubscriptionStatus();
    }, 10000);

    renderShortcuts();
    setPaperTheme('chamex');
    populateMonthsCarousel();
    updateHomeAlertDot();
    checkHomeFixedDebtsAlert();

    // 18.5. PWA Install Prompt Banner Logic
    const pwaBanner = document.getElementById('pwa-install-banner');
    const pwaInstructions = document.getElementById('pwa-install-instructions');
    const btnPwaInstall = document.getElementById('btn-pwa-install');
    const btnPwaClose = document.getElementById('btn-pwa-close');

    let deferredPrompt = null;

    // Detect if already installed / running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // Detect OS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    function initPwaInstallPrompt() {
        // If already installed or user dismissed it in this session, do nothing
        if (isStandalone || sessionStorage.getItem('pwa-dismissed') === 'true') {
            return;
        }

        if (isIOS) {
            // iOS Custom Guide (Safari doesn't support beforeinstallprompt)
            pwaInstructions.innerHTML = 'Toque em <i class="fa-regular fa-share-from-square" style="color:#8C6239;"></i> e depois em <strong>"Adicionar à Tela de Início"</strong>.';
            if (btnPwaInstall) btnPwaInstall.style.display = 'none'; // hide install button, instructions are text-only
            
            // Show banner after a short delay so it feels premium
            setTimeout(() => {
                pwaBanner.classList.add('active');
            }, 3000);
        } else {
            // Android / Desktop Chrome / Edge
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                
                pwaInstructions.innerText = 'Adicione o atalho na sua tela inicial para acessar como um app nativo.';
                if (btnPwaInstall) btnPwaInstall.style.display = 'block';

                setTimeout(() => {
                    pwaBanner.classList.add('active');
                }, 3000);
            });
        }
    }

    if (btnPwaInstall) {
        btnPwaInstall.addEventListener('click', () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuário aceitou a instalação do PWA');
                        pwaBanner.classList.remove('active');
                    }
                    deferredPrompt = null;
                });
            }
        });
    }

    if (btnPwaClose) {
        btnPwaClose.addEventListener('click', () => {
            pwaBanner.classList.remove('active');
            // Store dismiss in sessionStorage so they aren't nagged in the same session
            sessionStorage.setItem('pwa-dismissed', 'true');
        });
    }

    // Call PWA prompt init
    initPwaInstallPrompt();

    // ─────────────────────────────────────────────────────────────────────
    // 20. PIX QR CODE MODAL
    // ─────────────────────────────────────────────────────────────────────

    let _pixPayloadCache = '';  // guarda o último payload para "copiar código"
    let _pixConfirmCallback = null; // callback após confirmar pagamento

    /**
     * Exibe o modal de QR Code PIX.
     * @param {object} opts - { key, name, city, amount, txId, desc }
     * @param {function} [onConfirm] - callback quando usuário confirma que pagou
     */
    function showPixModal(opts, onConfirm) {
        const modal = document.getElementById('modal-pix-qrcode');
        const container = document.getElementById('pix-qrcode-container');
        const recipientEl = document.getElementById('pix-modal-recipient');
        const amountEl = document.getElementById('pix-modal-amount');

        if (!modal || !container) return;

        // Preencher dados
        recipientEl.textContent = opts.name ? `Para: ${opts.name}` : 'PIX';
        amountEl.textContent = opts.amount != null
            ? `R$ ${opts.amount.toFixed(2).replace('.', ',')}`
            : 'Valor livre';

        // Gerar QR Code
        _pixPayloadCache = PixQRCode.generate({
            key: opts.key,
            name: opts.name || 'Recebedor',
            city: opts.city || 'Brasil',
            amount: opts.amount || null,
            txId: opts.txId || '***',
            desc: opts.desc || ''
        }, container, 220);

        _pixConfirmCallback = onConfirm || null;

        modal.classList.add('active');
    }

    // Fechar modal PIX
    const btnClosePixModal = document.getElementById('btn-close-pix-modal');
    if (btnClosePixModal) {
        btnClosePixModal.addEventListener('click', () => {
            document.getElementById('modal-pix-qrcode').classList.remove('active');
        });
    }

    // Copiar código PIX (Pix Copia e Cola)
    const btnCopyPix = document.getElementById('btn-copy-pix');
    if (btnCopyPix) {
        btnCopyPix.addEventListener('click', () => {
            copyToClipboard(_pixPayloadCache).then(() => {
                btnCopyPix.innerText = '✓ Copiado!';
                setTimeout(() => { btnCopyPix.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar código PIX'; }, 2000);
            });
        });
    }

    // Confirmar pagamento
    const btnConfirmPix = document.getElementById('btn-confirm-pix');
    if (btnConfirmPix) {
        btnConfirmPix.addEventListener('click', () => {
            document.getElementById('modal-pix-qrcode').classList.remove('active');
            if (typeof _pixConfirmCallback === 'function') {
                _pixConfirmCallback();
                _pixConfirmCallback = null;
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 21. AGENDA PIX MODAL
    // ─────────────────────────────────────────────────────────────────────

    function renderPixAgendaList() {
        const list = document.getElementById('pix-agenda-list');
        if (!list) return;
        const contacts = PixAgenda.getAll();

        if (contacts.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;text-align:center;padding:12px 0;">Nenhum contato PIX cadastrado ainda.</p>';
            return;
        }

        list.innerHTML = contacts.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-radius:10px;padding:10px 14px;border:1px solid #e2e8f0;">
                <div>
                    <p style="font-weight:600;font-size:0.88rem;color:#1a365d;margin:0;">${c.label}</p>
                    <p style="font-size:0.75rem;color:#64748b;margin:2px 0 0;">${c.recipientName || ''} &bull; ${c.pixKey}</p>
                </div>
                <button onclick="PixAgenda.delete('${c.id}'); renderPixAgendaList();" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;" title="Remover"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    }

    // Abrir modal agenda PIX (acessível de outros lugares do app)
    window.openPixAgenda = function() {
        renderPixAgendaList();
        document.getElementById('modal-pix-agenda').classList.add('active');
    };

    const btnClosePixAgenda = document.getElementById('btn-close-pix-agenda');
    if (btnClosePixAgenda) {
        btnClosePixAgenda.addEventListener('click', () => {
            document.getElementById('modal-pix-agenda').classList.remove('active');
        });
    }

    const btnAddPixContact = document.getElementById('btn-add-pix-contact');
    if (btnAddPixContact) {
        btnAddPixContact.addEventListener('click', () => {
            const label = document.getElementById('pix-form-label').value.trim();
            const key = document.getElementById('pix-form-key').value.trim();
            const name = document.getElementById('pix-form-name').value.trim();
            const desc = document.getElementById('pix-form-desc').value.trim();

            if (!label || !key) {
                alert('Label e chave PIX são obrigatórios!');
                return;
            }

            PixAgenda.add({
                label,
                pixKey: key,
                pixKeyType: PixQRCode.detectKeyType(key),
                recipientName: name,
                description: desc
            });

            // Limpar formulário
            ['pix-form-label', 'pix-form-key', 'pix-form-name', 'pix-form-desc']
                .forEach(id => { document.getElementById(id).value = ''; });

            renderPixAgendaList();
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // 22. HOOK: sincronizar transações com Supabase após addTransaction
    // ─────────────────────────────────────────────────────────────────────

    // Monkey-patch no storage para adicionar sync async a cada nova transação
    const _origAddTransaction = storage.addTransaction.bind(storage);
    storage.addTransaction = function(txData) {
        const newTx = _origAddTransaction(txData);
        if (newTx && sync.userId) {
            const nb = storage.getActiveNotebook();
            if (nb) {
                sync.insertTransaction(newTx, nb.id).catch(err =>
                    console.warn('[Sync] Falha ao sync transação:', err)
                );
            }
        }
        return newTx;
    };

    // ─────────────────────────────────────────────────────────────────────
    // 23. HOOK: QR Code PIX no cofrinho (ao guardar)
    // ─────────────────────────────────────────────────────────────────────

    // Escutar evento customizado disparado pela UI do cofrinho
    document.addEventListener('cofrinho:guardar', (e) => {
        const { cofrinhoId, amount } = e.detail;
        const cof = storage.getCofrinho(cofrinhoId);
        if (!cof || !cof.pixKey) return;

        showPixModal({
            key: cof.pixKey,
            name: cof.pixName || cof.name,
            city: 'Brasil',
            amount: amount,
            txId: `COF${Date.now()}`.substring(0, 25),
            desc: `Cofrinho: ${cof.name}`
        }, () => {
            // Após confirmar pagamento: registrar depósito no cofrinho
            storage.depositToCofrinho(cofrinhoId, amount);
            updateUI();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 24. HOOK: Pagamento por voz ("Real, pagar aluguel")
    // Integração com o assistente de chat — detecta intent de pagamento PIX
    // ─────────────────────────────────────────────────────────────────────

    // Este hook é chamado pelo processador de chat quando o Gemini retorna
    // action === 'pix_payment' (precisará ser configurado no parser)
    window.handlePixPaymentVoice = function(label, amount) {
        const contact = PixAgenda.findByLabel(label);
        if (!contact) {
            return { found: false };
        }

        showPixModal({
            key: contact.pixKey,
            name: contact.recipientName || label,
            city: 'Brasil',
            amount: amount || null,
            txId: `PAG${Date.now()}`.substring(0, 25),
            desc: contact.description || label
        }, () => {
            // Confirmar: registrar como despesa
            if (amount) {
                storage.addTransaction({
                    item: `PIX: ${contact.recipientName || label}`,
                    value: amount,
                    type: 'despesa_esporadica',
                    category: 'Despesas Pessoais',
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    author: storage.getCurrentUser()
                });
                updateUI();
            }
        });

        return { found: true, contact };
    };

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

