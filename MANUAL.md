# 📖 Manual do Assistente de Voz inteligente (Gemini) - Minhas Contas

Este manual orienta você sobre o uso do assistente de voz inteligente integrado ao aplicativo **Minhas Contas** (antigo DigaReal), explicando como configurá-lo, o comportamento dos comandos e os exemplos práticos de uso.

---

## ⚙️ 1. Como Configurar o Gemini (Cérebro do Sistema)

Por padrão, o aplicativo utiliza um processador local off-line para comandos de voz básicos. Para ativar o **Gemini** (que compreende conversas complexas, responde a perguntas sobre suas finanças e entende qualquer frase natural), siga as etapas abaixo:

1.  Acesse o menu de **três pontinhos** no canto superior direito da tela do caderno.
2.  Clique em **"Configurar Gemini"**.
3.  Marque a caixa **"Ativar Assistente Gemini"**.
4.  No campo de texto que aparecerá, cole a sua **API Key (Chave de API)** do Google Gemini.
    *   *Nota:* Se você não tiver uma chave, clique no link indicado na tela ([Google AI Studio](https://aistudio.google.com/)) para criar uma chave de API **totalmente gratuita**.
5.  Clique em **"Salvar"**.

---

## 🔊 2. O Controle de Mute (Silenciar) e os Fluxos de Conversa

O ícone de **Alto-falante** serve para ativar ou desativar o som (voz de resposta) do assistente. A decisão é persistente e sincronizada em todas as telas.

### 🔇 A. Se o Assistente estiver Mutado (Silenciado):
*   **Comportamento:** Ao clicar no microfone (seja na Home ou no cabeçalho do caderno) e falar, o sistema abrirá automaticamente a **Janela Flutuante do Chat**.
*   **Por que abre o chat?** Como o som está desligado, a janela se abre para que você possa ver a resposta do assistente por escrito no histórico e interagir via texto se desejar.
*   **Como fechar:** Basta clicar no botão **"X"** no canto superior direito do cabeçalho do chat.

### 🔊 B. Se o Assistente NÃO estiver Mutado (Som Ativado):
*   **Comportamento:** O fluxo de conversa ocorre exclusivamente por **voz e escuta**. Ao clicar no microfone e falar, a janela flutuante **não se abre**.
*   **Interação:** O assistente executa a operação em segundo plano e responde falando em voz alta. O resultado visual (como novos lançamentos ou atualização de saldo) aparece diretamente na tela em que você estiver.
*   **Histórico:** Tudo o que você fala e o que o assistente responde é registrado no **Diário de Conversas (Chat)** de forma silenciosa para que você consulte quando quiser.

---

## 💬 3. Exemplos de Comandos Inteligentes (Gemini)

Com o Gemini ativado, você não precisa decorar comandos rígidos. Fale como se estivesse conversando com uma pessoa. Aqui estão exemplos práticos do que você pode pedir:

### 💰 Lançamentos de Despesas e Receitas
*   *"Gastei 50 reais com combustível ontem à noite"*
*   *"Recebi 4500 reais de salário hoje"*
*   *"Comprei uma pizza por 35 reais em Alimentação"*
*   *"Di, acabei de pagar 20 reais no estacionamento"*

### 🐷 Gestão dos Cofrinhos (Metas)
*   *"Criar um cofrinho do Dia das Crianças com meta de 200 reais"*
*   *"Criar a caixinha da Viagem de Férias"*
*   *"Guarda 100 reais na minha caixinha do carro"*
*   *"Resgata 50 reais do meu cofrinho de viagem"*
*   *"Poupar 30 reais no cofrinho de emergência"*

### 📌 Cadastro de Dívidas e Receitas Fixas (Mensais)
*   *"Cadastra uma despesa fixa de internet de 120 reais todo dia 15"*
*   *"Cadastre uma receita mensal de aluguel no valor de 1500 reais com recebimento todo dia 5"*
*   *"Adicione uma conta mensal de luz de 180 reais vencendo dia 10 válida até 12/2026"*

### 📊 Consultas e Perguntas Inteligentes
*   *"Qual é o meu saldo livre total hoje?"*
*   *"Quanto eu gastei com comida nas últimas transações?"*
*   *"O que eu comprei ontem?"*
*   *"Quanto eu tenho guardado nos cofrinhos?"*

---

## 📴 4. Modo de Segurança (Fallback Offline)

Se você estiver em um local sem acesso à internet, se o servidor do Google apresentar instabilidade ou se a sua chave de API expirar, o sistema aciona automaticamente o **Parser Local off-line**. 

Você poderá continuar registrando suas despesas e receitas por comandos de voz básicos estruturados (como *"Gastei 30 com combustível"* ou *"Recebi 1500"*), garantindo que você nunca fique na mão e seu caderno esteja sempre acessível.
