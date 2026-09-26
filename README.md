# Fresa Master - Sistema de Orçamentos, Frete & Bling ERP

Aplicativo oficial da **Fresa Master** para automação comercial, cotação de fretes em tempo real e integração com Bling ERP e WhatsApp.

---

## 🚀 Como Rodar Localmente no VS Code

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior instalada.
- [Git](https://git-scm.com/) instalado no seu computador.
- [Visual Studio Code](https://code.visualstudio.com/).

### 2. Instalação das Dependências
Abra o terminal na pasta do projeto e execute:
```bash
npm install
```

### 3. Configuração das Variáveis de Ambiente
Copie o arquivo de exemplo para criar o seu `.env`:
```bash
cp .env.example .env
```
Preencha as seguintes variáveis no arquivo `.env`:
- `GEMINI_API_KEY`: Sua chave de API do Google AI Studio / Gemini.
- `BLING_API_TOKEN`: Seu token de API v3 do Bling ERP (opcional, para envio direto).
- `MELHOR_ENVIO_TOKEN`: Token de acesso oficial do Melhor Envio (opcional para cotação ao vivo).

### 4. Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
O aplicativo iniciará em: **http://localhost:3000**

---

## 📦 Como Enviar para o GitHub

1. Inicialize o repositório Git local (se ainda não tiver feito):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Fresa Master App"
   ```
2. Crie um novo repositório no [GitHub](https://github.com/new).
3. Conecte e envie seus arquivos:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

---

## 🛠️ Scripts Disponíveis

- `npm run dev`: Inicia o servidor backend Express e o frontend Vite juntos com recarregamento automático.
- `npm run build`: Compila o frontend e empacota o backend para produção na pasta `dist/`.
- `npm start`: Inicia o servidor compilado de produção.
- `npm run lint`: Valida tipos TypeScript sem emitir arquivos.

---

## 🏗️ Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend:** Node.js, Express (`server.ts`), `tsx`, `esbuild`.
- **Inteligência Artificial:** Google Gemini (`@google/genai`).
- **Logística & ERP:** API v2 Melhor Envio (Sedex, PAC, Jadlog) e Bling ERP v3 (XML & JSON).
- **Banco & Autenticação:** Firebase Firestore & Firebase Auth.
