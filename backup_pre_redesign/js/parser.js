class TransactionParser {
    constructor(walletStorage) {
        this.storage = walletStorage;
        
        // Hardcoded keyword-to-category associations (default starter rules)
        this.defaultRules = {
            // Expenses
            'uber': { category: 'Transporte', type: 'despesa_esporadica' },
            'taxista': { category: 'Transporte', type: 'despesa_esporadica' },
            'ônibus': { category: 'Transporte', type: 'despesa_esporadica' },
            'combustível': { category: 'Transporte', type: 'despesa_esporadica' },
            'gasolina': { category: 'Transporte', type: 'despesa_esporadica' },
            
            'pizza': { category: 'Alimentação', type: 'despesa_esporadica' },
            'almoço': { category: 'Alimentação', type: 'despesa_esporadica' },
            'jantar': { category: 'Alimentação', type: 'despesa_esporadica' },
            'restaurante': { category: 'Alimentação', type: 'despesa_esporadica' },
            'padaria': { category: 'Alimentação', type: 'despesa_esporadica' },
            'mercado': { category: 'Alimentação', type: 'despesa_esporadica' },
            'supermercado': { category: 'Alimentação', type: 'despesa_esporadica' },
            'feira': { category: 'Alimentação', type: 'despesa_esporadica' },
            
            'aluguel': { category: 'Moradia', type: 'despesa_recorrente' },
            'condomínio': { category: 'Moradia', type: 'despesa_recorrente' },
            'luz': { category: 'Moradia', type: 'despesa_recorrente' },
            'energia': { category: 'Moradia', type: 'despesa_recorrente' },
            'água': { category: 'Moradia', type: 'despesa_recorrente' },
            'internet': { category: 'Moradia', type: 'despesa_recorrente' },
            'netflix': { category: 'Lazer', type: 'despesa_recorrente' },
            'spotify': { category: 'Lazer', type: 'despesa_recorrente' },
            
            'cinema': { category: 'Lazer', type: 'despesa_esporadica' },
            'show': { category: 'Lazer', type: 'despesa_esporadica' },
            'cerveja': { category: 'Lazer', type: 'despesa_esporadica' },
            'bar': { category: 'Lazer', type: 'despesa_esporadica' },
            
            'farmácia': { category: 'Saúde', type: 'despesa_esporadica' },
            'médico': { category: 'Saúde', type: 'despesa_esporadica' },
            'remédio': { category: 'Saúde', type: 'despesa_esporadica' },
            'dentista': { category: 'Saúde', type: 'despesa_esporadica' },
            
            // Incomes
            'salário': { category: 'Receitas', type: 'salario' },
            'pagamento': { category: 'Receitas', type: 'salario' },
            'freela': { category: 'Receitas', type: 'receita_esporadica' },
            'venda': { category: 'Receitas', type: 'receita_esporadica' },
            'aluguel_recebido': { category: 'Receitas', type: 'receita_recorrente' }
        };
    }

    extractExpiration(text) {
        const cleanText = text.toLowerCase();
        const ateIndex = cleanText.indexOf('até');
        if (ateIndex === -1) return null;
        
        // Extrai a parte do texto após o "até"
        const afterAte = cleanText.substring(ateIndex + 3).trim();
        
        // 1. Tenta formato numérico (ex: "12/2026", "12/26", "12-2026")
        const numericRegex = /(\d{1,2})[/-](\d{2,4})/;
        const numMatch = afterAte.match(numericRegex);
        if (numMatch) {
            let m = parseInt(numMatch[1], 10);
            let y = parseInt(numMatch[2], 10);
            if (y < 100) y += 2000;
            if (m >= 1 && m <= 12) {
                return `${y}-${m.toString().padStart(2, '0')}`;
            }
        }
        
        // 2. Tenta nomes de meses por extenso
        const monthsMap = {
            'janeiro': 1, 'jan': 1,
            'fevereiro': 2, 'fev': 2,
            'março': 3, 'marco': 3, 'mar': 3,
            'abril': 4, 'abr': 4,
            'maio': 5, 'mai': 5,
            'junho': 6, 'jun': 6,
            'julho': 7, 'jul': 7,
            'agosto': 8, 'ago': 8,
            'setembro': 9, 'set': 9,
            'outubro': 10, 'out': 10,
            'novembro': 11, 'nov': 11,
            'dezembro': 12, 'dez': 12
        };
        
        const words = afterAte.split(/[^a-z0-9]/);
        let foundMonth = null;
        let foundMonthIdx = -1;
        
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            if (monthsMap[w] !== undefined) {
                foundMonth = monthsMap[w];
                foundMonthIdx = i;
                break;
            }
        }
        
        if (foundMonth !== null) {
            let year = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            
            for (let i = foundMonthIdx + 1; i < words.length; i++) {
                const num = parseInt(words[i], 10);
                if (!isNaN(num) && num > 20) {
                    year = num;
                    if (year < 100) year += 2000;
                    break;
                }
            }
            
            // Se ano não especificado, e o mês já passou no ano corrente, assume o próximo ano
            if (foundMonthIdx !== -1 && !afterAte.match(/\b(20)?\d{2}\b/)) {
                if (foundMonth < currentMonth) {
                    year += 1;
                }
            }
            
            return `${year}-${foundMonth.toString().padStart(2, '0')}`;
        }
        
        return null;
    }

    parseText(text) {
        if (!text || text.trim() === '') {
            return { hasDoubt: true, reason: 'Texto vazio' };
        }

        const rawText = text;
        let cleanText = text.toLowerCase().trim();
        const cleanTextNormalized = cleanText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 1. Intercepta comandos de Cofrinho (Poupança)
        if (cleanTextNormalized.includes('cofrinho')) {
            let action = null;
            const saveWords = ['guardar', 'poupar', 'separar', 'colocar', 'depositar', 'deposito'];
            const withdrawWords = ['resgatar', 'tirar', 'sacar', 'pegar', 'retirar'];
            
            if (saveWords.some(w => cleanTextNormalized.includes(w))) {
                action = 'guardar';
            } else if (withdrawWords.some(w => cleanTextNormalized.includes(w))) {
                action = 'resgatar';
            }
            
            if (action) {
                let value = null;
                const regex = /(\d+(?:[.,]\d+)?)/g;
                let matches;
                let numbers = [];
                while ((matches = regex.exec(cleanTextNormalized)) !== null) {
                    numbers.push(parseFloat(matches[1].replace(',', '.')));
                }
                
                if (numbers.length > 0) {
                    value = numbers[0];
                }
                
                if (value !== null) {
                    return {
                        isCofrinhoTemplate: true,
                        hasDoubt: false,
                        cofrinhoAction: action,
                        value: value
                    };
                } else {
                    return {
                        hasDoubt: true,
                        isCofrinhoTemplate: true,
                        cofrinhoAction: action,
                        rawText: rawText,
                        reason: `Entendi que você quer mexer no cofrinho, mas qual valor deseja ${action === 'guardar' ? 'guardar' : 'resgatar'}?`
                    };
                }
            }
        }

        // 2. Intercepta cadastro de Dívidas Mensais (Contas Fixas)
        const isFixedAccountCmd = 
            (cleanTextNormalized.includes('conta fixa') || 
             cleanTextNormalized.includes('contas fixas') ||
             cleanTextNormalized.includes('divida mensal') ||
             cleanTextNormalized.includes('dividas mensais') ||
             cleanTextNormalized.includes('gasto fixo') ||
             cleanTextNormalized.includes('gastos fixos') ||
             cleanTextNormalized.includes('despesa fixa') ||
             cleanTextNormalized.includes('despesas fixas') ||
             cleanTextNormalized.includes('despesa mensal') ||
             cleanTextNormalized.includes('despesas mensais') ||
             cleanTextNormalized.includes('gasto mensal') ||
             cleanTextNormalized.includes('gastos mensais') ||
             cleanTextNormalized.includes('pagamento mensal') ||
             cleanTextNormalized.includes('pagamentos mensais') ||
             cleanTextNormalized.includes('pagamento fixo') ||
             cleanTextNormalized.includes('pagamentos fixos') ||
             cleanTextNormalized.includes('conta mensal') ||
             cleanTextNormalized.includes('contas mensais') ||
             cleanTextNormalized.includes('divida') || 
             cleanTextNormalized.includes('dividas') ||
             cleanTextNormalized.includes('mensalidade') ||
             cleanTextNormalized.includes('mensalidades') ||
             cleanTextNormalized.includes('parcela') ||
             cleanTextNormalized.includes('parcelas') ||
             cleanTextNormalized.includes('prestacao') ||
             cleanTextNormalized.includes('prestacoes') ||
             cleanTextNormalized.includes('prestação') ||
             cleanTextNormalized.includes('prestações') ||
             cleanTextNormalized.includes('assinatura') ||
             cleanTextNormalized.includes('assinaturas')) && 
            !cleanTextNormalized.includes('paguei') && 
            !cleanTextNormalized.includes('gastei') && 
            !cleanTextNormalized.includes('comprei') &&
            !cleanTextNormalized.includes('recebi') &&
            !cleanTextNormalized.includes('vendi') &&
            !cleanTextNormalized.includes('ganhei') &&
            !cleanTextNormalized.includes('resgatei') &&
            !cleanTextNormalized.includes('guardei') &&
            !cleanTextNormalized.includes('depositei');

        if (isFixedAccountCmd) {
            const expiration = this.extractExpiration(cleanText);
            
            // Remove a expressão "até ..." do texto para não poluir o nome do item
            let textForParsing = rawText;
            const ateIdx = cleanText.indexOf('até');
            if (ateIdx !== -1) {
                textForParsing = rawText.substring(0, ateIdx).trim();
                textForParsing = textForParsing.replace(/[,;.\s]+$/, '');
            }
            
            const cleanTextForParsing = textForParsing.toLowerCase().trim();

            // Extrair todos os números
            let value = null;
            const regex = /(\d+(?:[.,]\d+)?)/g;
            let matches;
            let numbers = [];
            while ((matches = regex.exec(cleanTextForParsing)) !== null) {
                numbers.push({
                    val: parseFloat(matches[1].replace(',', '.')),
                    index: matches.index,
                    raw: matches[1]
                });
            }

            // Identificar o dia do pagamento (ex: todo dia 10, dia 5)
            let day = 1;
            const dayRegex = /(?:todo\s+)?dia\s+(\d+)/i;
            const dayMatch = cleanTextForParsing.match(dayRegex);
            if (dayMatch) {
                day = parseInt(dayMatch[1], 10);
            }

            // Separar o valor da conta (número diferente do dia)
            if (numbers.length > 0) {
                const dayStr = day.toString();
                const valCandidate = numbers.find(n => n.val !== day || n.raw !== dayStr);
                if (valCandidate) {
                    value = valCandidate.val;
                } else {
                    value = numbers[0].val;
                }
            }

            // Extrair o nome do item limpando o texto
            let cleanWords = textForParsing.split(/\s+/);
            const wordsToRemove = [
                'conta', 'fixa', 'contas', 'fixas', 'divida', 'dívida', 'dividas', 'dívidas', 'mensal', 'mensais',
                'gasto', 'gastos', 'despesa', 'despesas', 'pagamento', 'pagamentos',
                'cadastrar', 'adicionar', 'inserir', 'lançar', 'lança', 'adiciona', 'cadastra', 'novo', 'nova', 'novos', 'novas',
                'reais', 'reais,', 'reais.', 'pila', 'real', 'r$', 'de', 'com', 'no', 'na', 'do', 'da', 'em', 'para',
                'recorrente', 'todo', 'dia', 'vencimento',
                'mensalidade', 'mensalidades', 'parcela', 'parcelas', 'prestação', 'prestacao', 'prestações', 'prestacoes', 'assinatura', 'assinaturas'
            ];
            
            const dayStr = day.toString();
            const numbersToRemove = value !== null ? [value.toString(), value.toString().replace('.', ','), dayStr] : [dayStr];

            let filteredWords = cleanWords.filter(word => {
                const lower = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
                const lowerNormalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const wordsToRemoveNormalized = wordsToRemove.map(w => w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
                return !wordsToRemoveNormalized.includes(lowerNormalized) && !numbersToRemove.includes(lower) && lower !== '';
            });

            let item = filteredWords.join(' ');
            if (!item || item.trim() === '') {
                item = 'Dívida Mensal';
            }

            if (value === null) {
                return {
                    hasDoubt: true,
                    isFixedAccountTemplate: true,
                    rawText: rawText,
                    item: item,
                    day: day,
                    expiration: expiration,
                    reason: 'Para cadastrar uma dívida mensal, preciso que informe o valor em números.'
                };
            }

            return {
                isFixedAccountTemplate: true,
                hasDoubt: false,
                item: item,
                value: value,
                day: day,
                expiration: expiration
            };
        }

        // 2B. Intercepta cadastro de Receitas Mensais (Receitas Fixas)
        const isFixedIncomeCmd = 
            (cleanTextNormalized.includes('receita mensal') || 
             cleanTextNormalized.includes('receitas mensais') ||
             cleanTextNormalized.includes('receita fixa') ||
             cleanTextNormalized.includes('receitas fixas') ||
             cleanTextNormalized.includes('salario fixo') ||
             cleanTextNormalized.includes('salário fixo') ||
             cleanTextNormalized.includes('ganho fixo') ||
             cleanTextNormalized.includes('ganhos fixos') ||
             cleanTextNormalized.includes('ganho mensal') ||
             cleanTextNormalized.includes('ganhos mensais') ||
             cleanTextNormalized.includes('entrada mensal') ||
             cleanTextNormalized.includes('entradas mensais') ||
             cleanTextNormalized.includes('entrada fixa') ||
             cleanTextNormalized.includes('entradas fixas')) && 
            !cleanTextNormalized.includes('paguei') && 
            !cleanTextNormalized.includes('gastei') && 
            !cleanTextNormalized.includes('comprei') &&
            !cleanTextNormalized.includes('recebi') &&
            !cleanTextNormalized.includes('vendi') &&
            !cleanTextNormalized.includes('ganhei') &&
            !cleanTextNormalized.includes('resgatei') &&
            !cleanTextNormalized.includes('guardei') &&
            !cleanTextNormalized.includes('depositei');

        if (isFixedIncomeCmd) {
            const expiration = this.extractExpiration(cleanText);
            
            let textForParsing = rawText;
            const ateIdx = cleanText.indexOf('até');
            if (ateIdx !== -1) {
                textForParsing = rawText.substring(0, ateIdx).trim();
                textForParsing = textForParsing.replace(/[,;.\s]+$/, '');
            }
            
            const cleanTextForParsing = textForParsing.toLowerCase().trim();

            let value = null;
            const regex = /(\d+(?:[.,]\d+)?)/g;
            let matches;
            let numbers = [];
            while ((matches = regex.exec(cleanTextForParsing)) !== null) {
                numbers.push({
                    val: parseFloat(matches[1].replace(',', '.')),
                    index: matches.index,
                    raw: matches[1]
                });
            }

            let day = 1;
            const dayRegex = /(?:todo\s+)?dia\s+(\d+)/i;
            const dayMatch = cleanTextForParsing.match(dayRegex);
            if (dayMatch) {
                day = parseInt(dayMatch[1], 10);
            }

            if (numbers.length > 0) {
                const dayStr = day.toString();
                const valCandidate = numbers.find(n => n.val !== day || n.raw !== dayStr);
                if (valCandidate) {
                    value = valCandidate.val;
                } else {
                    value = numbers[0].val;
                }
            }

            let cleanWords = textForParsing.split(/\s+/);
            const wordsToRemove = [
                'receita', 'fixa', 'receitas', 'fixas', 'salario', 'salário', 'ganho', 'ganhos', 'mensal', 'mensais',
                'entrada', 'entradas',
                'cadastrar', 'adicionar', 'inserir', 'lançar', 'lança', 'adiciona', 'cadastra', 'novo', 'nova', 'novos', 'novas',
                'reais', 'reais,', 'reais.', 'pila', 'real', 'r$', 'de', 'com', 'no', 'na', 'do', 'da', 'em', 'para',
                'recorrente', 'todo', 'dia', 'recebimento'
            ];
            
            const dayStr = day.toString();
            const numbersToRemove = value !== null ? [value.toString(), value.toString().replace('.', ','), dayStr] : [dayStr];

            let filteredWords = cleanWords.filter(word => {
                const lower = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
                const lowerNormalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const wordsToRemoveNormalized = wordsToRemove.map(w => w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
                return !wordsToRemoveNormalized.includes(lowerNormalized) && !numbersToRemove.includes(lower) && lower !== '';
            });

            let item = filteredWords.join(' ');
            if (!item || item.trim() === '') {
                item = 'Receita Mensal';
            }

            if (value === null) {
                return {
                    hasDoubt: true,
                    isFixedIncomeTemplate: true,
                    rawText: rawText,
                    item: item,
                    day: day,
                    expiration: expiration,
                    reason: 'Para cadastrar uma receita mensal, preciso que informe o valor em números.'
                };
            }

            return {
                isFixedIncomeTemplate: true,
                hasDoubt: false,
                item: item,
                value: value,
                day: day,
                expiration: expiration
            };
        }

        // 1. Extract Value
        // Match numbers like R$ 50, R$50, 50 reais, 50.00, 50,50, 50pila
        let value = null;
        const valueRegex = /(?:r\$\s*|gastei\s+|recebi\s+)?(\d+(?:[.,]\d+)?)(?:\s*(?:reais|pila|r\$))?/gi;
        
        // We find all numbers and try to pick the correct transaction value
        let matches;
        let numbers = [];
        const regex = /(\d+(?:[.,]\d+)?)/g;
        while ((matches = regex.exec(cleanText)) !== null) {
            numbers.push({
                val: parseFloat(matches[1].replace(',', '.')),
                index: matches.index,
                raw: matches[1]
            });
        }

        if (numbers.length > 0) {
            // By default, pick the first parsed number as the transaction value
            value = numbers[0].val;
        }

        if (value === null) {
            return {
                hasDoubt: true,
                rawText: rawText,
                reason: 'Valor não encontrado. Por favor, especifique o valor.'
            };
        }

        // 2. Determine Transaction Direction (Income vs Expense)
        let direction = 'expense'; // default fallback
        
        const incomeWords = ['recebi', 'ganhei', 'salario', 'salário', 'receita', 'entrada', 'pix de', 'recebimento', 'vendi', 'faturamento'];
        const expenseWords = ['gastei', 'paguei', 'comprei', 'compra', 'debito', 'débito', 'saida', 'saída', 'perdi', 'custou'];

        const hasIncomeWord = incomeWords.some(word => cleanText.includes(word));
        const hasExpenseWord = expenseWords.some(word => cleanText.includes(word));

        if (hasIncomeWord && !hasExpenseWord) {
            direction = 'income';
        } else if (hasExpenseWord && !hasIncomeWord) {
            direction = 'expense';
        }

        // 3. Determine if Recurring / Salary
        let isRecurring = false;
        let isSalary = false;

        const recurringWords = ['recorrente', 'mensal', 'todo mês', 'todo mes', 'assinatura', 'fixo', 'fixa'];
        if (recurringWords.some(word => cleanText.includes(word))) {
            isRecurring = true;
        }

        if (cleanText.includes('salário') || cleanText.includes('salario')) {
            isSalary = true;
        }

        // Map final sub-type
        let transactionType = 'despesa_esporadica';
        if (direction === 'income') {
            if (isSalary) {
                transactionType = 'salario';
            } else if (isRecurring) {
                transactionType = 'receita_recorrente';
            } else {
                transactionType = 'receita_esporadica';
            }
        } else {
            if (isRecurring) {
                transactionType = 'despesa_recorrente';
            } else {
                transactionType = 'despesa_esporadica';
            }
        }

        // 4. Extract Date
        let date = new Date().toISOString().split('T')[0];
        if (cleanText.includes('ontem')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            date = yesterday.toISOString().split('T')[0];
        } else if (cleanText.includes('anteontem')) {
            const anteontem = new Date();
            anteontem.setDate(anteontem.getDate() - 2);
            date = anteontem.toISOString().split('T')[0];
        }

        // 5. Extract Item/Description (cleaning text)
        // Remove words like "gastei", "recebi", "reais", values, prepositions
        let cleanWords = rawText.split(/\s+/);
        const wordsToRemove = [
            'gastei', 'recebi', 'comprei', 'paguei', 'ganhei', 'vendi',
            'reais', 'reais,', 'reais.', 'pila', 'real', 'r$', 'de', 'com', 'no', 'na', 'do', 'da', 'em', 'para',
            'comprando', 'referente', 'a', 'o', 'ontem', 'anteontem', 'hoje',
            'mensal', 'recorrente', 'fixo', 'todo', 'mês', 'mes', 'assinatura'
        ];

        // Also remove the number substring
        const cleanNumbers = numbers.map(n => n.raw);

        let filteredWords = cleanWords.filter(word => {
            const lower = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
            return !wordsToRemove.includes(lower) && !cleanNumbers.includes(lower) && lower !== '';
        });

        let item = filteredWords.join(' ');
        
        // Fallback item name if nothing left
        if (!item || item.trim() === '') {
            if (isSalary) {
                item = 'Salário';
            } else {
                return {
                    hasDoubt: true,
                    rawText: rawText,
                    value: value,
                    date: date,
                    reason: 'Não consegui entender o nome do item. O que você comprou ou recebeu?'
                };
            }
        }

        // 6. Match Category (Dynamic Learning Dictionary first, then Default Rules)
        let category = null;
        const itemLower = item.toLowerCase().trim();

        // 6.1 Check learned dictionary in storage
        const learned = this.storage.getLearnedTerm(itemLower);
        if (learned) {
            category = learned.category;
            transactionType = learned.type; // Override sub-type if we learned a specific one
        }

        // 6.2 Check substring of learned dictionary keys
        if (!category) {
            const learnedDict = this.storage.data.dicionarioAprendizado;
            for (const key in learnedDict) {
                if (itemLower.includes(key) || key.includes(itemLower)) {
                    category = learnedDict[key].category;
                    transactionType = learnedDict[key].type;
                    break;
                }
            }
        }

        // 6.3 Check default rules
        if (!category) {
            for (const key in this.defaultRules) {
                if (itemLower.includes(key) || key.includes(itemLower)) {
                    category = this.defaultRules[key].category;
                    // Only override type if not explicitly set to recurring/salary in cleanText
                    if (!isRecurring && !isSalary) {
                        transactionType = this.defaultRules[key].type;
                    }
                    break;
                }
            }
        }

        // 7. If Category still not found, send to Doubts queue
        if (!category) {
            return {
                hasDoubt: true,
                rawText: rawText,
                item: item,
                value: value,
                date: date,
                reason: `Não sei a categoria de "${item}". Onde devemos salvar?`
            };
        }

        // 8. Success: Return parsed object
        return {
            hasDoubt: false,
            item: item,
            value: value,
            type: transactionType,
            category: category,
            date: date,
            author: this.storage.getCurrentUser()
        };
    }
}
