# Fresa Master

Aplicativo completo de orçamento da Fresa Master para pedidos por voz ou texto, cadastro do cliente, seleção de ferramentas, cotação de frete, proposta comercial e aprovação do pedido.

- Os preços unitários informados por voz/texto prevalecem sobre o catálogo; desconto em reais é opcional e só aparece na proposta quando aplicado.
- React + Vite para a interface
- Supabase para login e armazenamento dos orçamentos
- Supabase Edge Function para APIs de IA, Bling e Melhor Envio
- GitHub Pages para hospedar a interface

## Pacote padrão e descrição das ferramentas

Novos orçamentos usam **7 cm de altura × 12 cm de largura × 17 cm de comprimento**. Em **Cálculo de Frete & Logística > Configurações**, altere as três medidas e clique em **Aplicar medidas** para recalcular, ou use **Padrão 7 × 12 × 17 cm** para restaurar. Medidas explícitas de orçamentos já salvos são preservadas; confira-as antes de cotar um envio novo.

Os itens aparecem em tabela compacta em todas as telas, com descrição em fonte de 14 px e peso normal. As colunas seguem a ordem **Descrição > Qtd > Valor Unit. > Total > SKU > NCM**, priorizando a venda antes da conferência fiscal. A descrição tem 520 px no computador e 260 px no celular, com rolagem limitada à tabela, sem alargar a página.

No celular, o nome ocupa até duas linhas. Toque nele para abrir a descrição completa em um diálogo com **Salvar descrição** e **Cancelar**; Esc também fecha sem salvar. O editor usa fonte de 16 px para evitar zoom automático no iPhone, sem aumentar a fonte da lista. No computador, a descrição continua editável diretamente na tabela e cresce conforme o texto.

Na revisão móvel, um teste visual isolado com 10 fresas confirmou fonte de 14 px/peso normal, linhas de até 65 px em 390 px de largura e ausência de transbordamento da página. A descrição integral foi conferida no diálogo; salvar, cancelar, Esc e edição direta no computador funcionaram. Quantidade e total também foram conferidos após edição. Nenhum orçamento real foi alterado nesse teste. TypeScript e build passaram.

Validação anterior do pacote em 09/10/2026: type-check e build concluídos; 52 testes automatizados passaram. A cotação real preservou tanto o padrão 7 × 12 × 17 quanto a edição manual 8 × 16 × 24. O backend publicado confirmou o novo padrão mesmo sem medidas no pedido.

## Endereço de entrega por mensagem

Marque **Entregar em outro endereço (diferente do Cartão CNPJ)**, cole a mensagem do cliente e clique em **Preencher entrega com IA**. A IA separa destinatário, CEP, rua, número e complemento; o ViaCEP completa/corrige rua, bairro, cidade e UF quando disponíveis para o CEP. O cadastro fiscal do CNPJ não é alterado.

Número e complemento não são deduzidos pelo CEP. Dados obrigatórios ausentes, CEP não encontrado e falhas de consulta são avisados para conferência manual. CEPs gerais de cidade podem não identificar rua/bairro. Confira os campos e clique em **Calcular** para atualizar o frete.

O recurso usa `/api/shipping/extract-delivery` no Express e `/shipping/extract-delivery` na Edge Function. Para disponibilizá-lo no app publicado, publique também a versão atualizada da função `api` no Supabase.

## Consulta cadastral por CNPJ

Na janela **Preencher c/ IA (Cartão CNPJ)** e na aba cadastral do Bling, informe o CNPJ para consultar os dados públicos da empresa e, quando disponível, uma Inscrição Estadual ativa correspondente à UF do estabelecimento. O recurso usa `/api/bling/lookup-cnpj` no Express e `/bling/lookup-cnpj` na Edge Function, consultando BrasilAPI e CNPJ.ws no backend. Para disponibilizá-lo no app publicado, publique a versão atualizada da função `api` no Supabase.

Confira os dados retornados antes de emitir a NF-e. A consulta pode não localizar uma IE ou estar desatualizada; nesses casos, o campo fica em branco e o app recomenda confirmação com o cliente/SEFAZ. A ausência de IE na consulta não significa que a empresa seja isenta. Informe a IE ou confirme manualmente a condição de isento antes do faturamento.

## Rejeição de pedido no Bling

O app exibe a mensagem geral e os detalhes de validação retornados pelo Bling. O bloqueio de venda duplicada (código 3, namespace `VENDAS`) significa que o Bling encontrou informações idênticas à última venda salva. Confira **Vendas > Pedidos de Venda** e continue o faturamento no pedido existente; não altere os dados apenas para contornar o bloqueio. O app não repete o envio automaticamente nem trata a rejeição como pedido criado.

### Conferência antes de criar a venda

O modal apresenta de uma vez as pendências de cadastro fiscal, documento (incluindo dígitos verificadores), endereço, IE de pessoa jurídica, NCM, quantidade, preço, frete/desconto e pagamento. **SKU é opcional para faturar**: o código comercial não é a classificação fiscal nem o ID interno do produto. A mesma conferência é aplicada no backend antes de criar contato ou venda, sem completar endereço com dados fictícios. IE ausente não é convertida automaticamente em isenção.

A listagem resumida de produtos da API do Bling não garante NCM. Ao selecionar uma ferramenta, o app consulta `/bling/products/:id` para ler o cadastro completo e salva `blingProductId`, inclusive para produtos sem SKU. **Usar NCM e produtos do Bling** consulta o cadastro e atualiza os itens no orçamento, preservando quantidade e preço negociado. A mesma resolução é feita pelo backend antes da venda/exportação e ao gerar a nota: ID explícito (ou ID numérico legado), código exato ou nome exato único. Correspondência ambígua exige seleção manual; falhas de consulta não são ignoradas.

O NCM preenchido no ERP tem prioridade sobre o orçamento. Se estiver vazio, o app avisa e conserva somente o NCM já informado; nunca copia a classificação de outra ferramenta. NCM genérico/zerado continua bloqueado. Item avulso sem SKU pode ser enviado sem código comercial quando seu NCM estiver confirmado; para produtos cadastrados, `itens[].produto.id` vincula o cadastro sem inventar SKU. A nota ainda precisa de identificação fiscal do item, definida pelo Bling/ID vinculado, independentemente do código comercial exibido no orçamento.

Conferência real em 10/10/2026: “Fresa Corte 45 graus” (ID `16708113107`) tem SKU vazio e NCM `8207.70.10`; “Fresa 2 cortes DLC 4x22” também possui esse NCM no ERP. “Fresa 3 Cortes TCT 6x12.7x22” (ID `16716486475`) continua com NCM vazio. Não foi alterado cadastro fiscal no ERP nem transmitida nota de produção para esse teste.

O botão foi testado no orçamento FM-008: a fresa de 45 graus passou a usar ID `16708113107`, SKU vazio e NCM do cadastro, preservando R$ 220,00. O preço R$ 170,00 da fresa TCT e seu NCM já informado foram mantidos, com aviso explícito de NCM vazio no ERP. As consultas fiscais, de pagamento e produtos compartilham leituras espaçadas e até duas repetições em HTTP 429, respeitando `Retry-After` até cinco segundos; nunca repetem gravação de venda/nota. A exportação real dentro do app retornou HTTP 200, com produto sem SKU vinculado por ID, Pix ID `9889571` e total R$ 404,61. A revisão possui 69 testes automatizados, incluindo geração simulada sem SKU por ID e bloqueio antes de criar nota quando o NCM do cadastro é inválido. Isso não comprova transmissão real à SEFAZ nem série 2 automática.

Pedido e NF-e são salvos imediatamente em `quote.bling`, acompanhando o orçamento na nuvem. O modal aguarda esse salvamento antes de liberar o fechamento; falha na persistência informa que o registro já existe no Bling e não deve ser recriado. Fechar/reabrir o modal ou recarregar não libera a criação de outra venda/nota para o mesmo orçamento vinculado. O envio precisa de uma nova consulta de status; alterações do orçamento após criar a venda bloqueiam a transmissão e exigem restaurar os dados do orçamento ou concluir a revisão/emissão do pedido existente no Bling. A leitura da nota também compara itens/NCM e total com o orçamento atual; a geração verifica correspondência com a venda antes de criar rascunho.

XML/JSON de exportação são consultados somente ao abrir essas abas, não em cada alteração ou abertura do modal. Isso elimina chamadas desnecessárias de pagamento que contribuíam para o limite de requisições. Falhas na consulta de contatos são exibidas e não iniciam cadastro de outro contato.

No Sandbox, **Testar conexão Sandbox** verifica o token protegido ou o token separado do servidor, sem criar carrinho. O modal sinaliza divergência entre CEP de origem cotado e remetente; aprove o orçamento e recalcule a rota antes de enviar. A chave salva da NF-e série 2 é sugerida no modal, mas ainda deve corresponder a uma nota autorizada. Testes de interface com APIs simuladas não comprovam autorização fiscal nem criação real no Sandbox.

Validação desta revisão: 60 testes automatizados aprovados e checagem TypeScript sem erros. No app, a consulta real do produto `FM-TCT-6X22` retornou NCM vazio; a seleção preservou o código confirmado `8207.70.10` e o preço R$ 170,00 no orçamento FM-008. O botão de conexão Sandbox foi testado dentro do modal e retornou falta de token, com carrinho bloqueado e divergência de origem sinalizada. Ainda não há comprovação de um carrinho real criado pelo app nem de série 2 automática; nenhuma NF-e de produção foi transmitida nesta revisão.

### Validação de NF-e e pendências

Em 07/10/2026, um teste pela API do app gerou e transmitiu a NF-e nº 000036, série 1, em homologação. O XML confirmou `tpAmb=2` e `cStat=100` (autorizada, sem valor fiscal). A configuração do Bling foi restaurada para produção e conferida após recarregar.

Esse resultado valida a comunicação, não a correção fiscal do fluxo. Os problemas identificados foram:

- NCM: o orçamento enviou `8207.70.00`, mas o XML gerado continha `00000000`. A tentativa de ajuste manual no Bling foi recusada; não foi persistida.
- Pagamento: o orçamento indicava Pix, mas o XML continha `tPag=01` (dinheiro).
- ID da NF-e: a geração retornou `data.idNotaFiscal`, mas o backend procurava somente `data.id`; isso impedia a continuação correta pela interface.

O fluxo atualizado usa `parcelas[].formaPagamento.id`, consultando uma forma de recebimento ativa com descrição exata no Bling, sem substituir Pix por dinheiro. Pix precisa ter tipo fiscal 17 ou 20. A exportação XML/JSON também exige conexão para resolver o pagamento. Se o Bling negar acesso a `/formas-pagamentos`, revise a permissão correspondente e reconecte a conta.

A geração reconhece `idNotaFiscal` com ou sem envelope `data`, reutiliza a nota vinculada ao pedido e ajusta somente o rascunho pendente. O NCM confirmado do orçamento é escrito em `itens[].classificacaoFiscal`; na ausência do orçamento, usa o cadastro fiscal do produto vinculado no Bling. Os itens precisam corresponder ao pedido salvo. Após o ajuste, o app relê a nota para conferir NCM/CFOP e pagamento. Falhas preservam o ID da nota para revisão, sem gerar outra silenciosamente.

NCM ausente, zerado ou `8207.70.00` bloqueia venda/exportação/emissão; não há substituição fiscal automática. A [tabela oficial do Siscomex](https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json) lista `8207.70.10` (de topo), `8207.70.20` (para cortar engrenagens) e `8207.70.90` (outras). Confirme com o contador o código de **cada produto**, inclusive pinças e acessórios, e edite o NCM no orçamento. Os padrões antigos do catálogo/orçamentos não foram reclassificados automaticamente.

A transmissão faz uma nova conferência no backend e fica bloqueada na interface enquanto houver pendências ou situação incompatível. Essas verificações não substituem a revisão de tributos e demais dados fiscais pelo responsável contábil. Ainda é necessário um novo teste controlado em homologação com NCM confirmado para validar o XML do fluxo corrigido.

### Série 2 e carrinho Sandbox

A conferência da NF-e exige **série 2**, inclusive imediatamente antes da transmissão. A API documentada de geração por pedido não recebe série; confira o rascunho no Bling e ajuste série/numeração lá, depois consulte novamente pelo app. O app não altera a sequência global nem presume que um campo não documentado foi aceito.

O endpoint `POST /api/shipping/create-sandbox-shipment` valida orçamento aprovado, chave NF-e modelo 55/série 2 (incluindo dígito verificador e CNPJ emissor), remetente/destino, rota cotada, produtos e pacote. Reconsulta a disponibilidade do serviço no Sandbox e adiciona ao carrinho `/api/v2/me/cart`. **Não faz checkout, compra, pagamento nem impressão de etiqueta.** A chave ainda deve ser colada no modal; confira se corresponde à venda testada.

Configure `MELHOR_ENVIO_SANDBOX_TOKEN` no backend ou informe um token Sandbox no campo protegido do modal, sem salvá-lo no navegador. Para compatibilidade, `MELHOR_ENVIO_TOKEN` só é usado quando `MELHOR_ENVIO_SANDBOX=true`; nunca há fallback para o host de produção. Confira o cadastro real do remetente, especialmente IE e CEP: os dados salvos anteriormente não são confirmação fiscal. Se houver falha de comunicação, confira o carrinho antes de repetir para evitar duplicação.

#### Resultado da investigação em 09/10/2026

- O pedido de teste `27068678963` (`TESTE-HOMOLOGACAO-SERIE2-1791388967842`) gerou inicialmente a NF-e `27068682178` na série 1. O app bloqueou a transmissão por série incorreta.
- Após ajuste manual no Bling, a mesma NF-e foi localizada pela API no ambiente de produção: série 2, número `000001`, situação 1 (pendente), sem chave de acesso. **Não foi transmitida e não deve ser faturada em produção.** A tentativa de teste em homologação não comprova autorização na série 2.
- O ambiente de emissão foi restaurado para **1 - Produção**, salvo e confirmado após recarregar. O controle de numeração exibiu próximo número 11 para série 001 e 39 para série 002; essas sequências não foram alteradas nesta investigação.
- A seleção automática de série 2 continua pendente. O contrato consultado não oferece `serie` como entrada na geração por pedido nem nos DTOs de escrita de NF-e. Não há garantia de ambiente do rascunho pela resposta resumida da API; antes de testes, confirme também o ambiente da própria nota no Bling, não apenas a preferência da conta.
- A verificação de conexão do Melhor Envio em produção retornou conectado; a consulta ao host Sandbox com o token usado no teste retornou token não autorizado ou expirado. Isso não valida eventual token Sandbox separado da rota de carrinho. Nenhum carrinho Sandbox real foi criado. O fluxo NF-e autorizada na série 2 → carrinho Sandbox ainda não foi validado de ponta a ponta.
- Após login no painel Sandbox, uma cotação real de `13321-472` para `13322-000`, pacote 7 × 12 × 17 cm e 0,5 kg, retornou Sedex R$ 13,38 (1 dia útil), Jadlog .Com R$ 15,10 (5 dias úteis) e .Package R$ 16,33 (6 dias úteis). Essa consulta foi pelo painel do Melhor Envio, não pela rota de carrinho do app. O backend atualizado informou ausência de token Sandbox configurado; os campos de token e chave da NF-e no modal compartilhado continuaram vazios. Não houve criação de envio, compra ou pagamento.

O teste usou um pedido separado identificado por `TESTE-HOMOLOGACAO-1791342197496`; pedidos de venda não são isolados pela troca do ambiente de NF-e. Esse pedido de teste permanece no Bling e não deve ser faturado em produção.

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
4. Publique a função `supabase/functions/api` no projeto Supabase (`supabase functions deploy api`) e configure nela as chaves necessárias para Gemini, Bling e Melhor Envio. Não coloque essas chaves no GitHub Pages nem no frontend.
5. Em **Supabase > Authentication > URL Configuration**, configure o Site URL para `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/` e inclua esse mesmo endereço em Redirect URLs.
6. Faça push das alterações para `main` e acompanhe a execução em **Actions**.

O endereço do app é `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/`. O Pages hospeda a interface; os recursos que consultam IA, Bling e Melhor Envio dependem da Edge Function ativa no Supabase.

## Acesso e dados

O login usa e-mail e senha com sessão persistente. O e-mail é usado apenas para configurar ou recuperar a senha. Os orçamentos são salvos na tabela `quotes` do Supabase, protegida por Row Level Security.
