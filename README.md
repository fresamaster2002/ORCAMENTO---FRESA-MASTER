# Fresa Master

Aplicativo de orçamento para a Fresa Master com foco no mínimo necessário para funcionar bem em desenvolvimento local:

- VS Code para código
- GitHub para versionamento
- Supabase para autenticação e dados
- Frontend React para interface do usuário

A ideia principal é manter a stack enxuta, sem depender de integrações pesadas de IA, Cloud Run, Firebase, Bling ERP ou Melhor Envio para o uso básico do sistema.

## Como rodar localmente

### 1. Instale as dependências
```bash
npm install
```

### 2. Configure o Supabase
Crie um arquivo `.env` a partir do `.env.example` e defina:
```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

### 3. Inicie o app
```bash
npm run dev
```

A aplicação ficará disponível em:
```text
http://localhost:3000
```

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` publica automaticamente quando há push para `main` ou pode ser iniciado manualmente em **Actions > Deploy Fresa Master to GitHub Pages > Run workflow**.

Antes da primeira publicação:

1. Em **Settings > Pages**, selecione **GitHub Actions** como fonte de publicação.
2. Em **Settings > Secrets and variables > Actions > Variables**, crie as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados públicos do projeto Supabase. Não use a `service_role` key no frontend.
3. Execute a migration `supabase/migrations/202609280001_quotes.sql` no Supabase para criar a tabela de orçamentos e suas regras de acesso.
4. Em **Supabase > Authentication > URL Configuration**, configure o Site URL para `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/` e inclua esse mesmo endereço em Redirect URLs.
5. Faça push das alterações para `main` e acompanhe a execução em **Actions**.

O endereço do app será `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/`. O primeiro deploy não termina até que as variáveis e a configuração do Supabase estejam preenchidas.

## O que foi mantido

- Frontend em React + TypeScript
- Login por e-mail e senha com sessão persistente, e dados via Supabase; e-mail só é necessário para criar ou recuperar a senha
- Salvar orçamentos na nuvem
- Cálculo local de orçamento e frete básico
- GitHub como repositório oficial

## O que foi removido do caminho principal de operação

- Firebase Admin / Cloud Run como requisito base
- Gemini como dependência crítica do app
- API de Bling para emissão de nota fiscal como bloqueio do funcionamento
- Melhor Envio como obrigatoriedade para rodar

Se quiser evoluir depois, essas integrações podem voltar como extras opcionais, mas não devem ser a base do app para funcionar.
