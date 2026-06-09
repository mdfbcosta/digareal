/**
 * supabase-sync.js — DigaReal Cloud
 * Camada de sincronização entre localStorage (offline-first) e Supabase (nuvem).
 *
 * Estratégia: localStorage é a fonte local imediata.
 * Supabase é a fonte remota verdadeira.
 * Escritas: local primeiro → Supabase async (fire-and-forget com retry).
 * Leituras iniciais: Supabase → merge com localStorage.
 */

class SupabaseSync {
    constructor(sb) {
        this.sb = sb;         // instância do supabaseClient
        this.userId = null;   // uuid do auth.users
        this.realtimeSubs = {}; // subscriptions ativas por notebook_id
        this._authListeners = [];
    }

    // ─────────────────────────────────────────────
    // AUTH
    // ─────────────────────────────────────────────

    /** Retorna sessão atual ou null */
    async getSession() {
        const { data } = await this.sb.auth.getSession();
        if (data?.session?.user) {
            this.userId = data.session.user.id;
        }
        return data?.session || null;
    }

    /** Cadastro de novo usuário */
    async signUp(email, password, name, referredBy = '') {
        const { data, error } = await this.sb.auth.signUp({ email, password });
        if (error) return { success: false, message: error.message };

        const uid = data.user?.id;
        if (!uid) return { success: false, message: 'Erro interno ao criar conta.' };
        this.userId = uid;

        // Criar perfil na tabela profiles
        const { error: profErr } = await this.sb
            .from('profiles')
            .insert({
                id: uid,
                name: name.trim(),
                contact: email.toLowerCase().trim(),
                referred_by: referredBy || null
            });

        if (profErr) console.warn('[Sync] Erro ao criar perfil:', profErr.message);
        return { success: true, userId: uid };
    }

    /** Login de usuário existente */
    async signIn(email, password) {
        const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
        if (error) return { success: false, message: error.message };
        this.userId = data.user?.id;
        return { success: true, userId: this.userId, session: data.session };
    }

    /** Logout */
    async signOut() {
        await this.sb.auth.signOut();
        this.userId = null;
        // Encerrar todos os subscriptions
        Object.values(this.realtimeSubs).forEach(ch => ch.unsubscribe());
        this.realtimeSubs = {};
    }

    // ─────────────────────────────────────────────
    // CADERNOS
    // ─────────────────────────────────────────────

    /** Busca todos os cadernos do usuário (owner + member) */
    async fetchNotebooks() {
        if (!this.userId) return [];
        // Cadernos onde é membro
        const { data: memberRows } = await this.sb
            .from('notebook_members')
            .select('notebook_id, role, notebooks(*)')
            .eq('user_id', this.userId);

        if (!memberRows) return [];
        return memberRows.map(r => ({
            ...r.notebooks,
            role: r.role,
            _source: 'cloud'
        }));
    }

    /** Cria um caderno na nuvem */
    async createNotebook(localNotebook) {
        if (!this.userId) return null;
        const { data, error } = await this.sb
            .from('notebooks')
            .insert({
                id: localNotebook.id.startsWith('nb_') ? undefined : localNotebook.id,
                name: localNotebook.name,
                invite_code: localNotebook.inviteCode,
                owner_id: this.userId
            })
            .select()
            .single();

        if (error) { console.warn('[Sync] Erro ao criar caderno:', error.message); return null; }

        // Inserir membro proprietário
        await this.sb.from('notebook_members').insert({
            notebook_id: data.id,
            user_id: this.userId,
            role: 'Proprietário'
        });

        return data;
    }

    /** Busca caderno por código de convite */
    async fetchNotebookByInviteCode(code) {
        const { data, error } = await this.sb
            .from('notebooks')
            .select('*')
            .eq('invite_code', code.toUpperCase().trim())
            .single();

        if (error || !data) return null;
        return data;
    }

    /** Entra em um caderno via código de convite */
    async joinNotebook(notebookId) {
        if (!this.userId) return false;
        const { error } = await this.sb
            .from('notebook_members')
            .upsert({ notebook_id: notebookId, user_id: this.userId, role: 'Membro' });
        return !error;
    }

    // ─────────────────────────────────────────────
    // TRANSAÇÕES
    // ─────────────────────────────────────────────

    /** Busca transações de um caderno */
    async fetchTransactions(notebookId) {
        const { data, error } = await this.sb
            .from('transactions')
            .select('*')
            .eq('notebook_id', notebookId)
            .order('created_at', { ascending: true });

        if (error) { console.warn('[Sync] Erro ao buscar transações:', error.message); return []; }
        return data || [];
    }

    /** Insere uma transação na nuvem */
    async insertTransaction(tx, notebookId) {
        if (!this.userId || !notebookId) return null;
        const { data, error } = await this.sb
            .from('transactions')
            .insert({
                notebook_id: notebookId,
                item: tx.item,
                value: tx.value,
                type: tx.type,
                category: tx.category || null,
                date: tx.date,
                time: tx.time || null,
                author_id: this.userId,
                author_name: tx.author || null,
                cofrinho_id: tx.cofrinhoId || null
            })
            .select()
            .single();

        if (error) console.warn('[Sync] Erro ao inserir transação:', error.message);
        return data || null;
    }

    /** Deleta uma transação na nuvem (por id local ou cloud id) */
    async deleteTransaction(txId) {
        const { error } = await this.sb
            .from('transactions')
            .delete()
            .eq('id', txId);
        if (error) console.warn('[Sync] Erro ao deletar transação:', error.message);
    }

    // ─────────────────────────────────────────────
    // COFRINHOS
    // ─────────────────────────────────────────────

    /** Busca cofrinhos de um caderno */
    async fetchCofrinhos(notebookId) {
        const { data, error } = await this.sb
            .from('cofrinhos')
            .select('*')
            .eq('notebook_id', notebookId);
        if (error) { console.warn('[Sync] Erro ao buscar cofrinhos:', error.message); return []; }
        return data || [];
    }

    /** Insere/atualiza cofrinho na nuvem */
    async upsertCofrinho(cofrinho, notebookId) {
        if (!notebookId) return null;
        const { data, error } = await this.sb
            .from('cofrinhos')
            .upsert({
                id: cofrinho.id,
                notebook_id: notebookId,
                name: cofrinho.name,
                target_value: cofrinho.value || 0,
                icon: cofrinho.icon || 'piggy',
                pix_key: cofrinho.pixKey || null,
                pix_key_type: cofrinho.pixKeyType || null,
                pix_name: cofrinho.pixName || null
            })
            .select()
            .single();
        if (error) console.warn('[Sync] Erro ao upsert cofrinho:', error.message);
        return data || null;
    }

    /** Deleta cofrinho na nuvem */
    async deleteCofrinho(cofrinhoId) {
        const { error } = await this.sb
            .from('cofrinhos')
            .delete()
            .eq('id', cofrinhoId);
        if (error) console.warn('[Sync] Erro ao deletar cofrinho:', error.message);
    }

    // ─────────────────────────────────────────────
    // AGENDA PIX
    // ─────────────────────────────────────────────

    /** Busca todos os contatos PIX do usuário */
    async fetchPixContacts() {
        if (!this.userId) return [];
        const { data, error } = await this.sb
            .from('pix_contacts')
            .select('*')
            .eq('user_id', this.userId)
            .order('label', { ascending: true });
        if (error) { console.warn('[Sync] Erro ao buscar agenda PIX:', error.message); return []; }
        return data || [];
    }

    /** Insere contato PIX */
    async insertPixContact(contact) {
        if (!this.userId) return null;
        const { data, error } = await this.sb
            .from('pix_contacts')
            .insert({
                user_id: this.userId,
                label: contact.label.toLowerCase().trim(),
                pix_key: contact.pixKey.trim(),
                pix_key_type: contact.pixKeyType,
                recipient_name: contact.recipientName || null,
                description: contact.description || null
            })
            .select()
            .single();
        if (error) console.warn('[Sync] Erro ao inserir contato PIX:', error.message);
        return data || null;
    }

    /** Atualiza contato PIX */
    async updatePixContact(id, contact) {
        const { data, error } = await this.sb
            .from('pix_contacts')
            .update({
                label: contact.label.toLowerCase().trim(),
                pix_key: contact.pixKey.trim(),
                pix_key_type: contact.pixKeyType,
                recipient_name: contact.recipientName || null,
                description: contact.description || null
            })
            .eq('id', id)
            .select()
            .single();
        if (error) console.warn('[Sync] Erro ao atualizar contato PIX:', error.message);
        return data || null;
    }

    /** Deleta contato PIX */
    async deletePixContact(id) {
        const { error } = await this.sb
            .from('pix_contacts')
            .delete()
            .eq('id', id);
        if (error) console.warn('[Sync] Erro ao deletar contato PIX:', error.message);
    }

    // ─────────────────────────────────────────────
    // REALTIME — Cadernos Compartilhados
    // ─────────────────────────────────────────────

    /**
     * Inicia escuta em tempo real das transações de um caderno.
     * @param {string} notebookId
     * @param {function} onInsert - callback(tx) quando nova transação chega
     * @param {function} onDelete - callback(txId) quando transação é deletada
     */
    subscribeNotebook(notebookId, onInsert, onDelete) {
        if (this.realtimeSubs[notebookId]) {
            this.realtimeSubs[notebookId].unsubscribe();
        }

        const channel = this.sb
            .channel(`notebook-${notebookId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'transactions',
                    filter: `notebook_id=eq.${notebookId}`
                },
                (payload) => {
                    console.log('[Realtime] Nova transação:', payload.new.item);
                    if (onInsert) onInsert(payload.new);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'transactions',
                    filter: `notebook_id=eq.${notebookId}`
                },
                (payload) => {
                    console.log('[Realtime] Transação deletada:', payload.old.id);
                    if (onDelete) onDelete(payload.old.id);
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Canal notebook-${notebookId}: ${status}`);
            });

        this.realtimeSubs[notebookId] = channel;
        return channel;
    }

    /** Encerra a escuta de um caderno */
    unsubscribeNotebook(notebookId) {
        if (this.realtimeSubs[notebookId]) {
            this.realtimeSubs[notebookId].unsubscribe();
            delete this.realtimeSubs[notebookId];
        }
    }

    // ─────────────────────────────────────────────
    // SINCRONIZAÇÃO COMPLETA (ao fazer login)
    // ─────────────────────────────────────────────

    /**
     * Sincroniza dados da nuvem para o localStorage após login.
     * @param {WalletStorage} storage - instância do storage local
     */
    async fullSyncFromCloud(storage) {
        if (!this.userId) return;
        console.log('[Sync] Iniciando sincronização completa da nuvem...');

        try {
            // 1. Buscar cadernos
            const cloudNotebooks = await this.fetchNotebooks();

            for (const cnb of cloudNotebooks) {
                // Verificar se já existe localmente
                let localNb = storage.getNotebook(cnb.id);
                if (!localNb) {
                    // Criar localmente com os dados da nuvem
                    storage.data.notebooks.push({
                        id: cnb.id,
                        name: cnb.name,
                        inviteCode: cnb.invite_code,
                        owner: cnb.owner_id,
                        ownerContact: '',
                        members: [],
                        sharedWith: [],
                        transactions: [],
                        chatMessages: [],
                        fixedAccounts: [],
                        fixedIncomes: [],
                        cofrinhos: [],
                        cofrinhoMeta: { name: '', value: 0 }
                    });
                    localNb = storage.getNotebook(cnb.id);
                }

                // 2. Sincronizar transações
                const cloudTxs = await this.fetchTransactions(cnb.id);
                if (cloudTxs.length > 0) {
                    // Substituir transações locais pelas da nuvem (nuvem é fonte verdadeira)
                    localNb.transactions = cloudTxs.map(t => ({
                        id: t.id,
                        item: t.item,
                        value: parseFloat(t.value),
                        type: t.type,
                        category: t.category || '',
                        date: t.date,
                        time: t.time || '',
                        author: t.author_name || '',
                        cofrinhoId: t.cofrinho_id || null
                    }));
                }

                // 3. Sincronizar cofrinhos
                const cloudCofs = await this.fetchCofrinhos(cnb.id);
                if (cloudCofs.length > 0) {
                    localNb.cofrinhos = cloudCofs.map(c => ({
                        id: c.id,
                        name: c.name,
                        value: parseFloat(c.target_value),
                        icon: c.icon || 'piggy',
                        pixKey: c.pix_key || null,
                        pixKeyType: c.pix_key_type || null,
                        pixName: c.pix_name || null
                    }));
                }
            }

            // 4. Sincronizar agenda PIX (localStorage local)
            const cloudPixContacts = await this.fetchPixContacts();
            if (cloudPixContacts.length > 0) {
                localStorage.setItem('digareal_pix_contacts', JSON.stringify(cloudPixContacts.map(c => ({
                    id: c.id,
                    label: c.label,
                    pixKey: c.pix_key,
                    pixKeyType: c.pix_key_type,
                    recipientName: c.recipient_name || '',
                    description: c.description || ''
                }))));
            }

            storage.save();
            console.log('[Sync] Sincronização completa concluída.');
        } catch (err) {
            console.warn('[Sync] Erro durante sincronização:', err);
        }
    }
}

// Instância global disponível para uso no app
const sync = new SupabaseSync(supabaseClient);

// ─────────────────────────────────────────────
// AGENDA PIX LOCAL (helper)
// ─────────────────────────────────────────────

const PixAgenda = {
    _key: 'digareal_pix_contacts',

    getAll() {
        try {
            return JSON.parse(localStorage.getItem(this._key) || '[]');
        } catch { return []; }
    },

    save(contacts) {
        localStorage.setItem(this._key, JSON.stringify(contacts));
    },

    add(contact) {
        const contacts = this.getAll();
        const newContact = {
            id: 'pix_' + Date.now(),
            label: contact.label.toLowerCase().trim(),
            pixKey: contact.pixKey.trim(),
            pixKeyType: contact.pixKeyType,
            recipientName: contact.recipientName || '',
            description: contact.description || ''
        };
        contacts.push(newContact);
        this.save(contacts);

        // Sync para nuvem (async)
        sync.insertPixContact(newContact).then(cloudRow => {
            if (cloudRow) {
                // Atualizar ID local com o ID da nuvem
                const all = this.getAll();
                const idx = all.findIndex(c => c.id === newContact.id);
                if (idx !== -1) {
                    all[idx].id = cloudRow.id;
                    this.save(all);
                }
            }
        });

        return newContact;
    },

    update(id, contact) {
        const contacts = this.getAll();
        const idx = contacts.findIndex(c => c.id === id);
        if (idx === -1) return false;
        contacts[idx] = { ...contacts[idx], ...contact };
        this.save(contacts);
        sync.updatePixContact(id, contact);
        return true;
    },

    delete(id) {
        const contacts = this.getAll();
        this.save(contacts.filter(c => c.id !== id));
        sync.deletePixContact(id);
    },

    /** Busca por label aproximado (para voz: "pagar aluguel") */
    findByLabel(text) {
        const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const needle = norm(text);
        const contacts = this.getAll();
        return contacts.find(c => {
            const label = norm(c.label);
            return needle.includes(label) || label.includes(needle);
        }) || null;
    }
};

console.log('[DigaReal] SupabaseSync e PixAgenda carregados.');
