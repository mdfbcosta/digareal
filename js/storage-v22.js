class WalletStorage {
    constructor() {
        this.STORAGE_KEY = 'minhas_contas_data_v1';
        this.data = {
            currentUser: '',
            currentUserContact: '',
            users: [], // { name, contact, password, synced }
            referralCampaignActive: true,
            activeNotebookId: 'default',
            notebooks: [
                {
                    id: 'default',
                    name: 'Meu Caderno',
                    inviteCode: 'MC-8923',
                    owner: '',
                    ownerContact: '',
                    members: [], // { name: '', role: '', contact: '' }
                    sharedWith: [],
                    transactions: [], // { id, item, value, type, category, date, time, author }
                    chatMessages: [],
                    fixedAccounts: [],
                    fixedIncomes: [],
                    cofrinhos: [],
                    cofrinhoMeta: { name: '', value: 0 }
                }
            ],
            categories: ['Alimentação', 'Moradia', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Vestuário', 'Casa', 'Comunicação', 'Despesas Pessoais', 'Receitas'],
            dicionarioAprendizado: {}, // keyword: { category, type }
            doubts: [], // pending transactions (legacy)
            activeConversationState: { status: 'idle' } // active assistant status
        };
        
        this.load();
    }

    load() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                this.data = JSON.parse(stored);
                // Backwards compatibility / integrity check
                if (!this.data.users) {
                    this.data.users = [];
                }
                if (this.data.referralCampaignActive === undefined) {
                    this.data.referralCampaignActive = true;
                }
                if (!this.data.currentUserContact) {
                    this.data.currentUserContact = '';
                }
                if (!this.data.categories || this.data.categories.length < 11 || !this.data.categories.includes('Educação')) {
                    this.data.categories = ['Alimentação', 'Moradia', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Vestuário', 'Casa', 'Comunicação', 'Despesas Pessoais', 'Receitas'];
                }
                if (!this.data.dicionarioAprendizado) {
                    this.data.dicionarioAprendizado = {};
                }
                if (!this.data.doubts) {
                    this.data.doubts = [];
                }
                if (!this.data.activeConversationState) {
                    this.data.activeConversationState = { status: 'idle' };
                }

                // Initialize collections on notebooks if they are missing
                if (this.data.notebooks) {
                    this.data.notebooks.forEach(nb => {
                        if (!nb.chatMessages) nb.chatMessages = [];
                        if (!nb.fixedAccounts) nb.fixedAccounts = [];
                        if (!nb.fixedIncomes) nb.fixedIncomes = [];
                        if (!nb.cofrinhos) nb.cofrinhos = [];
                        if (!nb.cofrinhoMeta) nb.cofrinhoMeta = { name: '', value: 0 };
                        if (!nb.sharedWith) nb.sharedWith = [];
                        if (!nb.ownerContact) nb.ownerContact = '';
                        
                        // Migrar membros sem contato
                        if (nb.members) {
                            nb.members.forEach(m => {
                                if (!m.contact) {
                                    const u = this.data.users.find(usr => usr.name.toLowerCase() === m.name.toLowerCase());
                                    if (u) m.contact = u.contact;
                                }
                            });
                        }
                        
                        // Migrar dono do caderno
                        if (!nb.ownerContact && nb.owner) {
                            const u = this.data.users.find(usr => usr.name.toLowerCase() === nb.owner.toLowerCase());
                            if (u) nb.ownerContact = u.contact;
                        }

                        // Migração de dados de cofrinho legado se existirem
                        const hasCofrinhoTxs = nb.transactions && nb.transactions.some(t => t.type === 'cofrinho_guardar' || t.type === 'cofrinho_resgatar');
                        if (nb.cofrinhos.length === 0 && ((nb.cofrinhoMeta && nb.cofrinhoMeta.name) || hasCofrinhoTxs)) {
                            nb.cofrinhos.push({
                                id: 'default_cofrinho',
                                name: (nb.cofrinhoMeta && nb.cofrinhoMeta.name) ? nb.cofrinhoMeta.name : 'Geral',
                                value: (nb.cofrinhoMeta && nb.cofrinhoMeta.value) ? nb.cofrinhoMeta.value : 0,
                                icon: 'piggy'
                            });
                        }
                    });

                    // Migrate global legacy data to the first/default notebook if it has empty arrays
                    const defaultNotebook = this.data.notebooks.find(n => n.id === 'default') || this.data.notebooks[0];
                    if (defaultNotebook) {
                        if (this.data.chatMessages && this.data.chatMessages.length > 0 && defaultNotebook.chatMessages.length === 0) {
                            defaultNotebook.chatMessages = this.data.chatMessages;
                        }
                        if (this.data.fixedAccounts && this.data.fixedAccounts.length > 0 && defaultNotebook.fixedAccounts.length === 0) {
                            defaultNotebook.fixedAccounts = this.data.fixedAccounts;
                        }
                        if (this.data.fixedIncomes && this.data.fixedIncomes.length > 0 && defaultNotebook.fixedIncomes.length === 0) {
                            defaultNotebook.fixedIncomes = this.data.fixedIncomes;
                        }
                        if (defaultNotebook.cofrinhoMeta.name === '') {
                            const legacyName = localStorage.getItem('cofrinho_meta_name');
                            const legacyVal = parseFloat(localStorage.getItem('cofrinho_meta_val'));
                            if (legacyName || legacyVal) {
                                defaultNotebook.cofrinhoMeta = {
                                    name: legacyName || '',
                                    value: isNaN(legacyVal) ? 0 : legacyVal
                                };
                            }
                        }
                    }
                }

                // Delete global legacy keys to keep store clean
                delete this.data.chatMessages;
                delete this.data.fixedAccounts;
                delete this.data.fixedIncomes;
                
            } catch (e) {
                console.error("Erro ao carregar localStorage, reiniciando dados padrão", e);
                this.save();
            }
        } else {
            this.save();
        }
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    // Profiles / LogIn
    getCurrentUser() {
        return this.data.currentUser || '';
    }

    getCurrentUserContact() {
        return this.data.currentUserContact || '';
    }

    setCurrentUser(name) {
        this.data.currentUser = name;
        // If owner of default notebook is empty, set it
        const defNotebook = this.getNotebook('default');
        if (defNotebook && !defNotebook.owner) {
            defNotebook.owner = name;
            defNotebook.ownerContact = this.getCurrentUserContact();
            defNotebook.name = `Caderno de ${name}`;
            this.addMember('default', name, 'Proprietário', this.getCurrentUserContact());
        }
        this.save();
    }

    registerUser(name, contact, password, referredBy = '') {
        const cleanContact = contact.toLowerCase().trim();
        const exists = this.data.users.some(u => u.contact === cleanContact);
        if (exists) {
            return { success: false, message: 'Este e-mail ou celular já está cadastrado!' };
        }
        
        const cleanReferredBy = referredBy ? referredBy.toLowerCase().trim() : '';

        const newUser = {
            name: name.trim(),
            contact: cleanContact,
            password: password, // Store as is for offline validation
            synced: false,
            referredBy: cleanReferredBy,
            referralCount: 0,
            referralsConsumed: 0
        };
        
        this.data.users.push(newUser);
        this.data.currentUserContact = cleanContact;
        this.setCurrentUser(newUser.name);

        // Explicitly create user notebook to ensure they start fresh
        this.createNotebook(`Caderno de ${newUser.name}`);

        if (cleanReferredBy) {
            this.addReferralPoint(cleanReferredBy);
        }

        this.save();
        
        // Background sync to Supabase (if online)
        this.syncUserToCloud(newUser);
        
        return { success: true };
    }

    loginUser(contact, password) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact && u.password === password);
        
        if (user) {
            this.data.currentUserContact = cleanContact;
            this.setCurrentUser(user.name);
            
            // Set active notebook to the first notebook they own or are member of
            const userNotebooks = this.getNotebooks();
            if (userNotebooks.length > 0) {
                const isMemberOfActive = userNotebooks.some(n => n.id === this.data.activeNotebookId);
                if (!isMemberOfActive) {
                    this.data.activeNotebookId = userNotebooks[0].id;
                }
            } else {
                this.createNotebook(`Caderno de ${user.name}`);
            }

            this.save();
            return { success: true };
        }
        
        // If not found offline, we return false
        return { success: false, message: 'Usuário não cadastrado neste celular ou senha incorreta.' };
    }

    logoutUser() {
        this.data.currentUser = '';
        this.data.currentUserContact = '';
        this.data.activeConversationState = { status: 'idle' };
        this.save();
    }

    syncUserToCloud(userObj) {
        if (navigator.onLine) {
            console.log("Sincronizando novo cadastro com o Supabase...", userObj.contact);
            // Simula o envio de dados via API na nuvem
            setTimeout(() => {
                userObj.synced = true;
                this.save();
                console.log("Cadastro sincronizado com sucesso no Supabase para:", userObj.contact);
            }, 3000);
        }
    }

    getNotebooks() {
        const contact = this.getCurrentUserContact().toLowerCase();
        const currentUser = this.getCurrentUser();
        if (!contact) return [];
        
        let changed = false;
        this.data.notebooks.forEach(n => {
            if (n.sharedWith && n.sharedWith.some(s => s.contact.toLowerCase() === contact)) {
                if (!n.members) n.members = [];
                const isMem = n.members.some(m => m.contact && m.contact.toLowerCase() === contact);
                if (!isMem && currentUser) {
                    n.members.push({ name: currentUser, role: 'Convidado', contact: contact });
                    changed = true;
                }
            }
        });
        if (changed) {
            this.save();
        }

        return this.data.notebooks.filter(n => 
            (n.ownerContact && n.ownerContact.toLowerCase() === contact) || 
            (n.members && n.members.some(m => m.contact && m.contact.toLowerCase() === contact))
        );
    }

    getActiveNotebook() {
        const userNotebooks = this.getNotebooks();
        if (userNotebooks.length === 0) {
            const currentUser = this.getCurrentUser();
            if (currentUser) {
                return this.createNotebook(`Caderno de ${currentUser}`);
            }
            return null;
        }
        const active = userNotebooks.find(n => n.id === this.data.activeNotebookId);
        if (active) return active;
        
        // Fallback to the first notebook they have access to
        this.data.activeNotebookId = userNotebooks[0].id;
        this.save();
        return userNotebooks[0];
    }

    setActiveNotebook(id) {
        const nb = this.getNotebook(id);
        if (nb) {
            this.data.activeNotebookId = id;
            this.save();
            return true;
        }
        return false;
    }

    getNotebook(id) {
        return this.data.notebooks.find(n => n.id === id);
    }

    createNotebook(name) {
        const id = 'nb_' + Date.now();
        const codeNum = Math.floor(1000 + Math.random() * 9000);
        const code = `MC-${codeNum}`;
        const newNotebook = {
            id: id,
            name: name,
            inviteCode: code,
            owner: this.getCurrentUser(),
            ownerContact: this.getCurrentUserContact(),
            members: [{ name: this.getCurrentUser(), role: 'Proprietário', contact: this.getCurrentUserContact() }],
            sharedWith: [],
            transactions: [],
            chatMessages: [],
            fixedAccounts: [],
            fixedIncomes: [],
            cofrinhos: [],
            cofrinhoMeta: { name: '', value: 0 }
        };
        this.data.notebooks.push(newNotebook);
        this.data.activeNotebookId = id;
        this.save();
        return newNotebook;
    }

    deleteNotebook(id) {
        if (this.data.notebooks.length <= 1) {
            return { success: false, message: 'Você precisa ter pelo menos um caderno ativo!' };
        }
        const index = this.data.notebooks.findIndex(n => n.id === id);
        if (index === -1) {
            return { success: false, message: 'Caderno não encontrado.' };
        }
        
        // Remove notebook
        this.data.notebooks.splice(index, 1);
        
        // If deleted notebook was active, change to another one
        if (this.data.activeNotebookId === id) {
            this.data.activeNotebookId = this.data.notebooks[0].id;
        }
        
        this.save();
        return { success: true };
    }

    renameNotebook(id, newName) {
        const nb = this.getNotebook(id);
        if (!nb) {
            return { success: false, message: 'Caderno não encontrado.' };
        }
        const cleanName = newName.trim();
        if (!cleanName) {
            return { success: false, message: 'O nome do caderno não pode ser vazio!' };
        }
        nb.name = cleanName;
        this.save();
        return { success: true };
    }

    joinNotebookByCode(code) {
        // Simple mock behavior: generates a mock notebook if not existing, or joins existing
        const cleanedCode = code.toUpperCase().trim();
        const existing = this.data.notebooks.find(n => n.inviteCode === cleanedCode);
        if (existing) {
            // Check if already member
            const isMember = existing.members.some(m => m.name === this.getCurrentUser());
            if (!isMember) {
                existing.members.push({ name: this.getCurrentUser(), role: 'Convidado' });
            }
            this.data.activeNotebookId = existing.id;
            this.save();
            return existing;
        }

        // Simulating joining a remote notebook (creating a Mock remote notebook)
        const mockOwnerName = "Maria (Esposa)";
        const id = 'nb_shared_' + Date.now();
        const newNotebook = {
            id: id,
            name: `Caderno de ${mockOwnerName}`,
            inviteCode: cleanedCode,
            owner: mockOwnerName,
            members: [
                { name: mockOwnerName, role: 'Proprietário' },
                { name: this.getCurrentUser(), role: 'Esposa' }
            ],
            transactions: [
                {
                    id: 't_mock_1',
                    item: 'Supermercado Mensal',
                    value: 450.00,
                    type: 'despesa_recorrente',
                    category: 'Alimentação',
                    date: new Date().toISOString().split('T')[0],
                    time: '10:30',
                    author: mockOwnerName
                }
            ],
            chatMessages: [],
            fixedAccounts: [],
            fixedIncomes: [],
            cofrinhos: [],
            cofrinhoMeta: { name: '', value: 0 }
        };
        this.data.notebooks.push(newNotebook);
        this.data.activeNotebookId = id;
        this.save();
        return newNotebook;
    }

    // Members
    getMembers(notebookId) {
        const nb = this.getNotebook(notebookId);
        return nb ? nb.members : [];
    }

    addMember(notebookId, name, role, contact = null) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            // Avoid duplicates
            if (!nb.members.some(m => m.name.toLowerCase() === name.toLowerCase() || (contact && m.contact && m.contact.toLowerCase() === contact.toLowerCase()))) {
                nb.members.push({ name, role, contact });
                this.save();
            }
            return true;
        }
        return false;
    }

    removeMember(notebookId, contact) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            nb.members = nb.members.filter(m => !m.contact || m.contact.toLowerCase() !== contact.toLowerCase());
            this.save();
            return true;
        }
        return false;
    }

    // Google Docs style Notebook Sharing Helpers
    addNotebookShare(notebookId, contact, role) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            if (!nb.sharedWith) {
                nb.sharedWith = [];
            }
            const cleanContact = contact.toLowerCase().trim();
            // Evitar duplicidades na lista de compartilhamento
            if (!nb.sharedWith.some(s => s.contact.toLowerCase() === cleanContact)) {
                nb.sharedWith.push({ contact: cleanContact, role: role });
                this.save();
            }
            
            // Se o usuário convidado já existe no sistema localmente, podemos adicioná-lo como membro
            const guestUser = this.data.users.find(u => u.contact === cleanContact);
            if (guestUser) {
                this.addMember(notebookId, guestUser.name, role, cleanContact);
            }
            return { success: true };
        }
        return { success: false, message: 'Caderno não encontrado.' };
    }

    removeNotebookShare(notebookId, contact) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            const cleanContact = contact.toLowerCase().trim();
            if (nb.sharedWith) {
                nb.sharedWith = nb.sharedWith.filter(s => s.contact.toLowerCase() !== cleanContact);
            }
            // Remove from members as well
            nb.members = nb.members.filter(m => !m.contact || m.contact.toLowerCase() !== cleanContact);
            this.save();
            return { success: true };
        }
        return { success: false, message: 'Caderno não encontrado.' };
    }

    acceptNotebookShare(notebookId) {
        const nb = this.getNotebook(notebookId);
        const contact = this.getCurrentUserContact().toLowerCase();
        const userName = this.getCurrentUser();
        if (nb && contact && userName) {
            if (!nb.sharedWith) nb.sharedWith = [];
            const shareIdx = nb.sharedWith.findIndex(s => s.contact.toLowerCase() === contact);
            if (shareIdx !== -1) {
                const shareInfo = nb.sharedWith[shareIdx];
                this.addMember(notebookId, userName, shareInfo.role, contact);
                this.save();
                return true;
            }
        }
        return false;
    }

    // Transactions
    getTransactions(notebookId) {
        const nb = this.getNotebook(notebookId || this.data.activeNotebookId);
        return nb ? nb.transactions : [];
    }

    addTransaction(transaction) {
        const nb = this.getActiveNotebook();
        if (nb) {
            const newTx = {
                id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 5),
                item: transaction.item,
                value: parseFloat(transaction.value) || 0,
                type: transaction.type || 'despesa_esporadica',
                category: transaction.category || 'Alimentação',
                date: transaction.date || new Date().toISOString().split('T')[0],
                time: transaction.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                author: transaction.author || this.getCurrentUser(),
                cofrinhoId: transaction.cofrinhoId || null
            };
            nb.transactions.push(newTx);
            this.save();
            return newTx;
        }
        return null;
    }

    updateTransaction(txId, updatedData) {
        const nb = this.getActiveNotebook();
        if (nb) {
            const index = nb.transactions.findIndex(t => t.id === txId);
            if (index !== -1) {
                nb.transactions[index] = {
                    ...nb.transactions[index],
                    ...updatedData,
                    value: parseFloat(updatedData.value) || 0
                };
                this.save();
                return nb.transactions[index];
            }
        }
        return null;
    }

    deleteTransaction(txId) {
        const nb = this.getActiveNotebook();
        if (nb) {
            const initialLen = nb.transactions.length;
            nb.transactions = nb.transactions.filter(t => t.id !== txId);
            const deleted = nb.transactions.length < initialLen;
            if (deleted) this.save();
            return deleted;
        }
        return false;
    }

    // Categories
    getCategories() {
        return this.data.categories;
    }

    addCategory(name) {
        const cleanName = name.trim();
        if (cleanName && !this.data.categories.includes(cleanName)) {
            this.data.categories.push(cleanName);
            this.save();
            return true;
        }
        return false;
    }

    // Doubts Queue
    getDoubts() {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return [];
        return this.data.doubts.filter(d => d.author === currentUser);
    }

    addDoubt(doubt) {
        const newDoubt = {
            id: 'doubt_' + Date.now() + Math.random().toString(36).substr(2, 5),
            rawText: doubt.rawText,
            item: doubt.item || '',
            value: parseFloat(doubt.value) || null,
            date: doubt.date || new Date().toISOString().split('T')[0],
            time: doubt.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            author: this.getCurrentUser()
        };
        this.data.doubts.push(newDoubt);
        this.save();
        return newDoubt;
    }

    resolveDoubt(doubtId, resolutionData) {
        const doubtIndex = this.data.doubts.findIndex(d => d.id === doubtId);
        if (doubtIndex !== -1) {
            const doubt = this.data.doubts[doubtIndex];
            
            // Create the real transaction
            const transaction = {
                item: resolutionData.item || doubt.item,
                value: parseFloat(resolutionData.value) || doubt.value || 0,
                type: resolutionData.type,
                category: resolutionData.category,
                date: doubt.date,
                time: doubt.time,
                author: doubt.author
            };
            
            const newTx = this.addTransaction(transaction);
            
            // Dynamic learning: Feed the parser dictionary with this term!
            const cleanItem = (resolutionData.item || doubt.item).toLowerCase().trim();
            if (cleanItem) {
                this.learnTerm(cleanItem, resolutionData.category, resolutionData.type);
            }

            // Remove from doubts list
            this.data.doubts.splice(doubtIndex, 1);
            this.save();
            return newTx;
        }
        return null;
    }

    // Learning dictionary
    learnTerm(keyword, category, type) {
        this.data.dicionarioAprendizado[keyword.toLowerCase()] = { category, type };
        this.save();
    }

    getLearnedTerm(keyword) {
        return this.data.dicionarioAprendizado[keyword.toLowerCase()];
    }

    // 💬 Chat Assistant & Conversation state
    getStartOfWeek() {
        const now = new Date();
        const day = now.getDay(); // 0 is Sunday, 1 is Monday...
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday.getTime();
    }

    getActiveWeekChatMessages() {
        const startOfWeek = this.getStartOfWeek();
        const nb = this.getActiveNotebook();
        const chatMessages = nb ? (nb.chatMessages || []) : [];
        return chatMessages.filter(msg => msg.timestamp >= startOfWeek);
    }

    getArchivedChatMessages() {
        const startOfWeek = this.getStartOfWeek();
        const nb = this.getActiveNotebook();
        const chatMessages = nb ? (nb.chatMessages || []) : [];
        return chatMessages.filter(msg => msg.timestamp < startOfWeek);
    }

    addChatMessage(sender, text) {
        const nb = this.getActiveNotebook();
        if (!nb) return null;
        if (!nb.chatMessages) {
            nb.chatMessages = [];
        }
        const newMsg = {
            id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4),
            sender: sender, // 'user' | 'app'
            text: text,
            timestamp: Date.now()
        };
        nb.chatMessages.push(newMsg);
        this.save();
        return newMsg;
    }

    getActiveConversationState() {
        return this.data.activeConversationState || { status: 'idle' };
    }

    setActiveConversationState(state) {
        this.data.activeConversationState = state;
        this.save();
    }

    // Contas Fixas
    getFixedAccounts() {
        const nb = this.getActiveNotebook();
        if (nb) {
            if (!nb.fixedAccounts) {
                nb.fixedAccounts = [];
            }
            return nb.fixedAccounts;
        }
        return [];
    }

    addFixedAccount(name, value, day, expiration = null) {
        const nb = this.getActiveNotebook();
        if (!nb) return null;
        if (!nb.fixedAccounts) {
            nb.fixedAccounts = [];
        }
        const newAccount = {
            id: 'fixed_' + Date.now() + Math.random().toString(36).substr(2, 5),
            name: name.trim(),
            value: parseFloat(value) || 0,
            day: parseInt(day, 10) || 1,
            expiration: expiration ? expiration.trim() : null // Format "YYYY-MM"
        };
        nb.fixedAccounts.push(newAccount);
        this.save();
        return newAccount;
    }

    deleteFixedAccount(id) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedAccounts) return false;
        const initialLen = nb.fixedAccounts.length;
        nb.fixedAccounts = nb.fixedAccounts.filter(acc => acc.id !== id);
        const deleted = nb.fixedAccounts.length < initialLen;
        if (deleted) this.save();
        return deleted;
    }

    updateFixedAccount(id, name, value, day, expiration = null) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedAccounts) return null;
        const account = nb.fixedAccounts.find(acc => acc.id === id);
        if (account) {
            account.name = name.trim();
            account.value = parseFloat(value) || 0;
            account.day = parseInt(day, 10) || 1;
            account.expiration = expiration ? expiration.trim() : null;
            this.save();
            return account;
        }
        return null;
    }


    payFixedAccount(id, customValue = null, selectedMonth = null) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedAccounts) return null;
        const account = nb.fixedAccounts.find(acc => acc.id === id);
        if (!account) return null;

        // Auto-detect category or use default
        let category = 'Moradia'; // fallback default for fixed bills
        const nameLower = account.name.toLowerCase();
        
        // Match category from learned dictionary or default rules
        const learned = this.getLearnedTerm(nameLower);
        if (learned) {
            category = learned.category;
        } else {
            // Check default rules based on keywords
            if (nameLower.includes('mercado') || nameLower.includes('comida') || nameLower.includes('feira') || nameLower.includes('supermercado')) category = 'Alimentação';
            else if (nameLower.includes('gasolina') || nameLower.includes('carro') || nameLower.includes('uber') || nameLower.includes('transporte') || nameLower.includes('combustível')) category = 'Transporte';
            else if (nameLower.includes('spotify') || nameLower.includes('netflix') || nameLower.includes('cinema') || nameLower.includes('lazer')) category = 'Lazer';
            else if (nameLower.includes('médico') || nameLower.includes('farmácia') || nameLower.includes('remédio') || nameLower.includes('saúde') || nameLower.includes('dentista')) category = 'Saúde';
            else if (nameLower.includes('salário') || nameLower.includes('freela') || nameLower.includes('receita') || nameLower.includes('pagamento')) category = 'Receitas';
        }

        let transactionDate = new Date().toISOString().split('T')[0];
        if (selectedMonth) {
            const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
            if (selectedMonth !== currentMonthStr) {
                // Se for outro mês (passado ou futuro), registra com o dia de vencimento da conta fixa no respectivo mês
                const paddedDay = String(account.day).padStart(2, '0');
                transactionDate = `${selectedMonth}-${paddedDay}`;
            }
        }

        const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const finalValue = customValue !== null ? parseFloat(customValue) : account.value;

        const transactionData = {
            item: account.name,
            value: isNaN(finalValue) ? account.value : finalValue,
            type: 'despesa_recorrente',
            category: category,
            date: transactionDate,
            time: timeStr,
            author: this.getCurrentUser()
        };

        return this.addTransaction(transactionData);
    }

    // Receitas Mensais
    getFixedIncomes() {
        const nb = this.getActiveNotebook();
        if (nb) {
            if (!nb.fixedIncomes) {
                nb.fixedIncomes = [];
            }
            return nb.fixedIncomes;
        }
        return [];
    }

    addFixedIncome(name, value, day, expiration = null) {
        const nb = this.getActiveNotebook();
        if (!nb) return null;
        if (!nb.fixedIncomes) {
            nb.fixedIncomes = [];
        }
        const newIncome = {
            id: 'fixed_inc_' + Date.now() + Math.random().toString(36).substr(2, 5),
            name: name.trim(),
            value: parseFloat(value) || 0,
            day: parseInt(day, 10) || 1,
            expiration: expiration ? expiration.trim() : null // Format "YYYY-MM"
        };
        nb.fixedIncomes.push(newIncome);
        this.save();
        return newIncome;
    }

    deleteFixedIncome(id) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedIncomes) return false;
        const initialLen = nb.fixedIncomes.length;
        nb.fixedIncomes = nb.fixedIncomes.filter(inc => inc.id !== id);
        const deleted = nb.fixedIncomes.length < initialLen;
        if (deleted) this.save();
        return deleted;
    }

    updateFixedIncome(id, name, value, day, expiration = null) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedIncomes) return null;
        const income = nb.fixedIncomes.find(inc => inc.id === id);
        if (income) {
            income.name = name.trim();
            income.value = parseFloat(value) || 0;
            income.day = parseInt(day, 10) || 1;
            income.expiration = expiration ? expiration.trim() : null;
            this.save();
            return income;
        }
        return null;
    }


    receiveFixedIncome(id, customValue = null, selectedMonth = null) {
        const nb = this.getActiveNotebook();
        if (!nb || !nb.fixedIncomes) return null;
        const income = nb.fixedIncomes.find(inc => inc.id === id);
        if (!income) return null;

        let category = 'Receitas';

        let transactionDate = new Date().toISOString().split('T')[0];
        if (selectedMonth) {
            const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
            if (selectedMonth !== currentMonthStr) {
                const paddedDay = String(income.day).padStart(2, '0');
                transactionDate = `${selectedMonth}-${paddedDay}`;
            }
        }

        const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const finalValue = customValue !== null ? parseFloat(customValue) : income.value;

        const transactionData = {
            item: income.name,
            value: isNaN(finalValue) ? income.value : finalValue,
            type: 'receita_recorrente',
            category: category,
            date: transactionDate,
            time: timeStr,
            author: this.getCurrentUser()
        };

        return this.addTransaction(transactionData);
    }

    // Cofrinho Meta
    getCofrinhoMeta() {
        const nb = this.getActiveNotebook();
        if (nb) {
            if (!nb.cofrinhoMeta) {
                nb.cofrinhoMeta = { name: '', value: 0 };
            }
            return nb.cofrinhoMeta;
        }
        return { name: '', value: 0 };
    }

    setCofrinhoMeta(name, value) {
        const nb = this.getActiveNotebook();
        if (nb) {
            nb.cofrinhoMeta = {
                name: name.trim(),
                value: parseFloat(value) || 0
            };
            this.save();
        }
    }

    deleteCofrinhoMeta() {
        const nb = this.getActiveNotebook();
        if (nb) {
            nb.cofrinhoMeta = { name: '', value: 0 };
            this.save();
        }
    }

    // --- Múltiplos Cofrinhos ---

    getCofrinhos() {
        const nb = this.getActiveNotebook();
        if (nb) {
            if (!nb.cofrinhos) {
                nb.cofrinhos = [];
            }
            return nb.cofrinhos;
        }
        return [];
    }

    getCofrinho(id) {
        const cofrinhos = this.getCofrinhos();
        return cofrinhos.find(c => c.id === id) || null;
    }

    getCofrinhoPixKey() {
        const nb = this.getActiveNotebook();
        return nb ? (nb.cofrinhoPixKey || '') : '';
    }

    setCofrinhoPixKey(key) {
        const nb = this.getActiveNotebook();
        if (nb) {
            nb.cofrinhoPixKey = key.trim();
            this.save();
        }
    }

    createCofrinho(name, value, icon, pixKey) {
        const nb = this.getActiveNotebook();
        if (nb) {
            if (!nb.cofrinhos) {
                nb.cofrinhos = [];
            }
            const newCof = {
                id: 'cof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: name.trim(),
                value: parseFloat(value) || 0,
                icon: icon || 'piggy',
                pixKey: pixKey ? pixKey.trim() : ''
            };
            nb.cofrinhos.push(newCof);
            this.save();
            return newCof;
        }
        return null;
    }

    updateCofrinho(id, name, value, icon, pixKey) {
        const nb = this.getActiveNotebook();
        if (nb && nb.cofrinhos) {
            const cof = nb.cofrinhos.find(c => c.id === id);
            if (cof) {
                cof.name = name.trim();
                cof.value = parseFloat(value) || 0;
                cof.icon = icon || 'piggy';
                if (pixKey !== undefined) cof.pixKey = pixKey.trim();
                this.save();
                return cof;
            }
        }
        return null;
    }

    deleteCofrinho(id) {
        const nb = this.getActiveNotebook();
        if (nb && nb.cofrinhos) {
            const index = nb.cofrinhos.findIndex(c => c.id === id);
            if (index !== -1) {
                nb.cofrinhos.splice(index, 1);
                
                // Excluir transações associadas a este cofrinho
                if (nb.transactions) {
                    nb.transactions = nb.transactions.filter(t => {
                        if ((t.type === 'cofrinho_guardar' || t.type === 'cofrinho_resgatar') && 
                            (t.cofrinhoId === id || (!t.cofrinhoId && id === 'default_cofrinho'))) {
                            return false;
                        }
                        return true;
                    });
                }
                this.save();
                return true;
            }
        }
        return false;
    }

    getCofrinhoBalance(id) {
        const txs = this.getTransactions();
        let balance = 0;
        txs.forEach(t => {
            if (t.type === 'cofrinho_guardar') {
                if (t.cofrinhoId === id || (!t.cofrinhoId && id === 'default_cofrinho')) {
                    balance += t.value;
                }
            } else if (t.type === 'cofrinho_resgatar') {
                if (t.cofrinhoId === id || (!t.cofrinhoId && id === 'default_cofrinho')) {
                    balance -= t.value;
                }
            }
        });
        return balance;
    }

    getTotalCofrinhoBalance() {
        const txs = this.getTransactions();
        let balance = 0;
        txs.forEach(t => {
            if (t.type === 'cofrinho_guardar') {
                balance += t.value;
            } else if (t.type === 'cofrinho_resgatar') {
                balance -= t.value;
            }
        });
        return balance;
    }

    getNotebookBalance(notebookId) {
        const txs = this.getTransactions(notebookId);
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
        return income - expense;
    }

    depositToCofrinho(cofrinhoId, amount) {
        if (amount === undefined) {
            amount = cofrinhoId;
            cofrinhoId = 'default_cofrinho';
        }
        const cofrinho = this.getCofrinho(cofrinhoId);
        const name = cofrinho ? cofrinho.name : 'Cofrinho';
        
        return this.addTransaction({
            item: `Guardado no cofrinho ${name}`,
            value: parseFloat(amount) || 0,
            type: 'cofrinho_guardar',
            category: 'Cofrinho',
            cofrinhoId: cofrinhoId || 'default_cofrinho',
            author: this.getCurrentUser()
        });
    }

    withdrawFromCofrinho(cofrinhoId, amount) {
        if (amount === undefined) {
            amount = cofrinhoId;
            cofrinhoId = 'default_cofrinho';
        }
        const cofrinho = this.getCofrinho(cofrinhoId);
        const name = cofrinho ? cofrinho.name : 'Cofrinho';
        
        return this.addTransaction({
            item: `Resgatado do cofrinho ${name}`,
            value: parseFloat(amount) || 0,
            type: 'cofrinho_resgatar',
            category: 'Cofrinho',
            cofrinhoId: cofrinhoId || 'default_cofrinho',
            author: this.getCurrentUser()
        });
    }

    // Subscription Management (Asaas billing simulation)
    getUserSubscription(contact) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return null;
        
        // Initialize defaults if they do not exist
        if (!user.createdAt) {
            user.createdAt = Date.now();
        }
        if (!user.subscriptionStatus) {
            user.subscriptionStatus = 'trial';
        }
        if (!user.subscriptionExpiresAt) {
            // Default 30 days trial from registration
            user.subscriptionExpiresAt = user.createdAt + (30 * 24 * 60 * 60 * 1000);
        }
        if (!user.billingPlan) {
            user.billingPlan = 'monthly';
        }
        if (!user.lastReminderSent) {
            user.lastReminderSent = 'none';
        }
        if (!user.referredBy) {
            user.referredBy = '';
        }
        if (user.referralCount === undefined) {
            user.referralCount = 0;
        }
        if (user.referralsConsumed === undefined) {
            user.referralsConsumed = 0;
        }
        return {
            createdAt: user.createdAt,
            status: user.subscriptionStatus,
            expiresAt: user.subscriptionExpiresAt,
            plan: user.billingPlan,
            lastReminderSent: user.lastReminderSent,
            referredBy: user.referredBy,
            referralCount: user.referralCount,
            referralsConsumed: user.referralsConsumed
        };
    }

    updateUserSubscription(contact, updates) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return;
        
        if (updates.status !== undefined) user.subscriptionStatus = updates.status;
        if (updates.expiresAt !== undefined) user.subscriptionExpiresAt = updates.expiresAt;
        if (updates.plan !== undefined) user.billingPlan = updates.plan;
        if (updates.lastReminderSent !== undefined) user.lastReminderSent = updates.lastReminderSent;
        
        this.save();
    }

    renewUserSubscription(contact, plan) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return;
        
        const now = Date.now();
        let baseDate = user.subscriptionExpiresAt;
        // If current subscription is already expired, base off of now
        if (baseDate < now) {
            baseDate = now;
        }
        
        const durationDays = plan === 'semiannual' ? 180 : 30;
        user.subscriptionStatus = 'active';
        user.subscriptionExpiresAt = baseDate + (durationDays * 24 * 60 * 60 * 1000);
        user.billingPlan = plan;
        user.lastReminderSent = 'none';
        
        this.save();
    }

    getReferralCampaignActive() {
        if (this.data.referralCampaignActive === undefined) {
            this.data.referralCampaignActive = true;
        }
        return this.data.referralCampaignActive;
    }

    setReferralCampaignActive(isActive) {
        this.data.referralCampaignActive = !!isActive;
        this.save();
    }

    getReferralProgress(contact) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return { total: 0, consumed: 0, active: 0 };
        
        const total = user.referralCount || 0;
        const consumed = user.referralsConsumed || 0;
        const active = Math.max(0, total - consumed);
        return { total, consumed, active };
    }

    addReferralPoint(referrerContact) {
        const cleanContact = referrerContact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (user) {
            user.referralCount = (user.referralCount || 0) + 1;
            this.save();
            return true;
        }
        return false;
    }

    consumeReferrals(contact, count) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (user) {
            user.referralsConsumed = (user.referralsConsumed || 0) + count;
            this.save();
            return true;
        }
        return false;
    }

    getUserProfile(contact) {
        if (!contact) return null;
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return null;
        return {
            name: user.name || '',
            fullName: user.fullName || '',
            birthdate: user.birthdate || '',
            contact: user.contact || '',
            whatsapp: user.whatsapp || '',
            password: user.password || '',
            photo: user.photo || ''
        };
    }

    updateUserProfile(contact, updates) {
        if (!contact) return { success: false, message: 'Contato inválido' };
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact);
        if (!user) return { success: false, message: 'Usuário não encontrado' };
        
        if (updates.name !== undefined) user.name = updates.name.trim();
        if (updates.fullName !== undefined) user.fullName = updates.fullName.trim();
        if (updates.birthdate !== undefined) user.birthdate = updates.birthdate;
        if (updates.whatsapp !== undefined) user.whatsapp = updates.whatsapp.trim();
        if (updates.password !== undefined && updates.password !== '') user.password = updates.password;
        if (updates.photo !== undefined) user.photo = updates.photo;
        
        this.save();
        return { success: true, user: user };
    }
}
