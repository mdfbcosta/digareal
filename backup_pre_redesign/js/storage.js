class WalletStorage {
    constructor() {
        this.STORAGE_KEY = 'minhas_contas_data_v1';
        this.data = {
            currentUser: '',
            currentUserContact: '',
            users: [], // { name, contact, password, synced }
            activeNotebookId: 'default',
            notebooks: [
                {
                    id: 'default',
                    name: 'Meu Caderno',
                    inviteCode: 'MC-8923',
                    owner: '',
                    members: [], // { name: '', role: '' }
                    transactions: [], // { id, item, value, type, category, date, time, author }
                    chatMessages: [],
                    fixedAccounts: [],
                    fixedIncomes: [],
                    cofrinhoMeta: { name: '', value: 0 }
                }
            ],
            categories: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Receitas'],
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
                if (!this.data.currentUserContact) {
                    this.data.currentUserContact = '';
                }
                if (!this.data.categories || this.data.categories.length === 0) {
                    this.data.categories = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Receitas'];
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
                        if (!nb.cofrinhoMeta) nb.cofrinhoMeta = { name: '', value: 0 };
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
            defNotebook.name = `Caderno de ${name}`;
            this.addMember('default', name, 'Proprietário');
        }
        this.save();
    }

    registerUser(name, contact, password) {
        const cleanContact = contact.toLowerCase().trim();
        const exists = this.data.users.some(u => u.contact === cleanContact);
        if (exists) {
            return { success: false, message: 'Este e-mail ou celular já está cadastrado!' };
        }
        
        const newUser = {
            name: name.trim(),
            contact: cleanContact,
            password: password, // Store as is for offline validation
            synced: false
        };
        
        this.data.users.push(newUser);
        this.setCurrentUser(newUser.name);
        this.data.currentUserContact = cleanContact;
        this.save();
        
        // Background sync to Supabase (if online)
        this.syncUserToCloud(newUser);
        
        return { success: true };
    }

    loginUser(contact, password) {
        const cleanContact = contact.toLowerCase().trim();
        const user = this.data.users.find(u => u.contact === cleanContact && u.password === password);
        
        if (user) {
            this.setCurrentUser(user.name);
            this.data.currentUserContact = cleanContact;
            this.save();
            return { success: true };
        }
        
        // If not found offline, we return false
        return { success: false, message: 'Usuário não cadastrado neste celular ou senha incorreta.' };
    }

    logoutUser() {
        this.data.currentUser = '';
        this.data.currentUserContact = '';
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

    // Notebooks (Estante)
    getNotebooks() {
        return this.data.notebooks;
    }

    getActiveNotebook() {
        return this.getNotebook(this.data.activeNotebookId) || this.data.notebooks[0];
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
            members: [{ name: this.getCurrentUser(), role: 'Proprietário' }],
            transactions: [],
            chatMessages: [],
            fixedAccounts: [],
            fixedIncomes: [],
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

    addMember(notebookId, name, role) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            // Avoid duplicates
            if (!nb.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
                nb.members.push({ name, role });
                this.save();
            }
            return true;
        }
        return false;
    }

    removeMember(notebookId, name) {
        const nb = this.getNotebook(notebookId);
        if (nb) {
            nb.members = nb.members.filter(m => m.name.toLowerCase() !== name.toLowerCase());
            // Filter transactions of this author or keep them but note that the user has left
            this.save();
            return true;
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
                author: transaction.author || this.getCurrentUser()
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
        return this.data.doubts;
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

    getCofrinhoBalance() {
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

    depositToCofrinho(amount) {
        return this.addTransaction({
            item: 'Guardado no Cofrinho',
            value: parseFloat(amount) || 0,
            type: 'cofrinho_guardar',
            category: 'Cofrinho',
            author: this.getCurrentUser()
        });
    }

    withdrawFromCofrinho(amount) {
        return this.addTransaction({
            item: 'Resgatado do Cofrinho',
            value: parseFloat(amount) || 0,
            type: 'cofrinho_resgatar',
            category: 'Cofrinho',
            author: this.getCurrentUser()
        });
    }
}
