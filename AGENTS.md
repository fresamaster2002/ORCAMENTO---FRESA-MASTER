# Fresa Master - Configurações e Diretrizes do Projeto

Este arquivo documenta as regras de negócio, arquitetura e estado atual do aplicativo **Fresa Master** para garantir continuidade perfeita entre sessões de desenvolvimento.

---

## 1. Identidade e Negócio
- **Empresa:** Fresa Master
- **E-mail de Contato:** fresamaster0@gmail.com
- **Segmento:** Venda e distribuição de fresas de alta precisão e ferramentas de usinagem para Router CNC (MDF, madeira maciça, acrílico, alumínio, ACM, etc.).
- **Produtos Principais:**
  - Fresas de 3 Cortes TCT (Widia) para corte reto e alto rendimento.
  - Fresas Helicoidais de 1 e 2 Cortes em Metal Duro Integral.
  - Fresas V-Bit (60° e 90°) para gravação, chanfro e comunicação visual.
  - Pinças de precisão (ER11, ER16, ER20, ER25, ER32).
- **Classificação Fiscal Padrão (NCM):** `8207.70.00` (Ferramentas de fresar / usinagem).

---

## 2. Fluxo Operacional da Fresa Master

### Etapa 1: Orçamento por Voz ou Mensagem
- O usuário dita por áudio ou digita os dados essenciais:
  - Exemplo típico: *"Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex"*
- A IA extrai e preenche:
  - Razão Social / Nome do Cliente.
  - CEP e endereço preliminar resolvido automaticamente via ViaCEP.
  - Lista de ferramentas com quantidades, preços unitários, subtotais e NCM fiscal.
  - Cotação de frete via Melhor Envio (Sedex, PAC e Jadlog) somada ao total final.

### Etapa 2: Emissão de Orçamento para o Cliente
- **Visualização & Impressão em PDF:** Espelho timbrado profissional com dados da Fresa Master, ferramentas, valores, frete e chave Pix.
- **Mensagem WhatsApp:** Texto comercial formatado pronto para envio em 1 clique via `wa.me`.

### Etapa 3: Pós-Aprovação e Emissão da NF-e no Bling ERP
- Quando o cliente aprova o orçamento, ele envia seus dados cadastrais (por WhatsApp, e-mail ou foto/PDF do Cartão de CNPJ).
- **Botão Direto "Preencher Dados Cadastrais com IA":** Disponível no cabeçalho da seção "Dados do Cliente & Faturamento NF-e" e no modal do Bling. O operador pode:
  - **Anexar Documento:** Foto tirada pelo celular, imagem (JPG, PNG, WEBP) ou PDF do Cartão CNPJ da Receita Federal.
  - **Colar Texto:** Mensagens de WhatsApp, e-mail ou notas adicionais.
  - A IA multimodal do Gemini lê a imagem/PDF e analisa os dados fiscais automaticamente.
- A IA processa esse documento/texto e preenche os campos fiscais:
  - Razão Social, Nome Fantasia, CNPJ/CPF formatado.
  - Inscrição Estadual (IE) ou "ISENTO".
  - Logradouro, Número, Complemento, Bairro, CEP, Cidade e UF.
  - Telefone e E-mail para envio automático do XML e DANFE da NF-e.
- O sistema gera instantaneamente:
  - **Arquivo XML do Pedido de Venda do Bling:** Para importação direta em *Bling > Vendas > Pedidos de Venda > Importar*.
  - **Payload JSON API v3 do Bling:** Pronto para envio via endpoint `/pedidos/vendas`.
  - **Cópia rápida com 1 clique** de qualquer dado individual para conferência manual.

---

## 3. Arquitetura Técnica
- **Backend:** Express (`server.ts`) rodando com `tsx` em desenvolvimento e empacotado via `esbuild` para produção (`dist/server.cjs`).
- **Frontend:** React 19 com TypeScript e Tailwind CSS v4.
- **Modelos de IA:** Google Gemini com fallback em cascata (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`) via SDK `@google/genai` no backend.
- **APIs Integradas:**
  - Gemini AI (`/api/quote/extract`, `/api/bling/extract-cadastral`, `/api/quote/generate-proposal`).
  - ViaCEP (resolução automática de endereço a partir do CEP de entrega).
  - Melhor Envio API v2 Oficial (`/api/shipping/calculate` e `/api/shipping/test-melhor-envio`): Conexão direta com a conta oficial da Fresa Master (`fresamaster0@gmail.com` em Salto/SP), cotação em tempo real de Sedex, PAC e Jadlog (.Package e .Com) com pesagem dinâmica e roteamento automático sandbox/produção.
  - Gerador de XML e JSON do Bling ERP (`/api/bling/generate-payload`).

---

## 4. Regra de Pesagem e Cubagem de Encomendas (Melhor Envio)
- **Tarifa Mínima do Melhor Envio e Correios:** **0,5 kg** (500 gramas).
  - Pedidos normais de 1 a 4 fresas pequenas/médias pesam cerca de 300g a 400g (com embalagem de 150g). Nesses casos, o sistema mantém fixo em **0,5 kg** (faixa mínima).
- **Escalonamento Inteligente de Peso para Pedidos Maiores:**
  - **Embalagem base:** 150g (caixa de papelão ondulado, plástico bolha, tubetes e fita).
  - **Fresa 3 Cortes TCT / Widia:** ~110g por unidade (corpo de aço usinado com pastilhas).
  - **Fresas Helicoidais (Metal Duro) / V-Bits:** ~45g a 85g por unidade.
  - **Pinças ER (ER11 a ER32):** ~85g por unidade.
  - Quando o pedido tem muitas peças (ex: 10 fresas TCT), o peso é calculado automaticamente (ex: 1,3 kg) e o acréscimo tarifário por quilo extra do Sedex e PAC é aplicado dinamicamente na cotação.
  - **Ajuste Manual e Atalhos de Peso:** O operador pode digitar diretamente qualquer peso em kg no campo manual (ex: `0,8`, `1,5`) com o botão "Aplicar" (ou Enter), além de poder alternar entre os atalhos rápidos (`0,5 kg`, `1,0 kg`, `2,0 kg`) com 1 clique diretamente no painel de frete.

---

## 5. Catálogo do Bling ERP Integrado no Comando de Voz
- A IA do Gemini e o backend foram sincronizados com o catálogo oficial da Fresa Master (`src/blingCatalog.ts`):
  - Fresas 3 Cortes TCT 6x22mm (`FM-TCT-6X22`), 6x32mm (`FM-TCT-6X32`), 4x17mm (`FM-TCT-4X17`).
  - Fresas Helicoidais 2 Cortes 6mm (`FM-HEL-2C-6X22`), 4mm (`FM-HEL-2C-4X17`), Downcut (`FM-DOWN-2C-6X22`).
  - Fresas 1 Corte para Acrílico e Alumínio (`FM-HEL-1C-6X22-ACR`).
  - Fresas V-Bit 60° e 90° para ACM e Gravação (`FM-VBIT-60-1/2`, `FM-VBIT-90-1/2`).
  - Pinças ER de precisão ER11, ER20, ER25 (`FM-PINCA-ER20-6MM`, etc.).
- Ao falar ou digitar qualquer termo relacionado (ex: *"2 fresas de 3 cortes TCT"*), a IA seleciona o produto exato do Bling com o SKU oficial, NCM fiscal (`8207.70.00`) e preço cadastrado.
- Há também o botão visual **"Catálogo do Bling ERP"** na tabela de itens para seleção manual rápida com 1 clique e busca em tempo real.

---

## 6. Dimensões do Pacote, CEP de Origem & Frete Próprio
- **CEP de Origem Fresa Master (Despacho / Coleta):**
  - **Padrão Oficial:** `13321-472` (Salto/SP).
  - Exibido no cabeçalho do painel de logística e na aba dedicada **"Origem Fresa Master"**.
  - O operador pode alterar o CEP de expedição a qualquer momento digitando um novo CEP com 1 clique em "Salvar & Recalcular", ou restaurar para o padrão `13321-472`.
  - Integrado diretamente ao cálculo de frete com o Melhor Envio (Sedex, PAC e Jadlog recalculados com base na nova rota).
- **Aba "Tamanho do Pacote":** Medidas padrão configuradas em **5 cm de altura x 12 cm de largura x 18 cm de comprimento**. Permite ajuste numérico imediato ou via atalhos (Padrão 5x12x18, Média 8x16x24, Grande 12x20x30 cm).
- **Aba "Meu Frete / Próprio":** Permite definir um frete fixo próprio (ex: transportadora própria, Braspress, Motoboy local ou frete grátis negociado) com valor e nome personalizáveis, adicionado automaticamente às opções de frete disponíveis no orçamento.

---

## 7. Modalidades de Envio no Comando Rápido (Voz ou Texto)
- **Melhor Envio / Correios:** Se o operador falar "melhor envio", "correios", "sedex" ou "pac", o sistema calcula e abre automaticamente as cotações oficiais do Melhor Envio (Sedex, PAC e Jadlog).
- **Motoboy Simplificado:** Quando o envio for por motoboy, não é necessário selecionar qual aplicativo foi contratado. O sistema solicita e exibe apenas o valor do frete (ex: se o operador ditar *"envio por motoboy 45 reais"*, a IA seleciona automaticamente a modalidade **Motoboy** e preenche o valor de **R$ 45,00** somado ao total).
- **Por Nossa Conta (Frete Grátis):** Se o operador ditar *"envio por nossa conta"*, *"frete grátis"* ou *"cortesia"*, o frete é selecionado automaticamente como cortesia Fresa Master com valor **R$ 0,00**.

