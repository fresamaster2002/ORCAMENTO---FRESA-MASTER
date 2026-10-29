# Fresa Master

Aplicativo completo de orçamento da Fresa Master para pedidos por voz ou texto, cadastro do cliente, seleção de ferramentas, cotação de frete, proposta comercial e aprovação do pedido.

- Os preços unitários informados por voz/texto prevalecem sobre o catálogo; desconto em reais é opcional e só aparece na proposta quando aplicado.
- React + Vite para a interface
- Supabase para login e armazenamento dos orçamentos
- Supabase Edge Function para APIs de IA, Bling e Melhor Envio
- GitHub Pages para hospedar a interface

## Refinamento da área de trabalho

### Endereço na proposta e no PDF

A prévia, a impressão e o PDF baixado usam a mesma folha e mostram o endereço de entrega completo: logradouro, número, complemento (quando informado), bairro, cidade/UF e CEP. Isso vale para Correios, Jadlog, motoboy, frete próprio e cortesia, mesmo antes de escolher a modalidade. Quando **Entregar em outro endereço** está ativado, são usados exclusivamente esse endereço e seu destinatário, sem completar lacunas com o cadastro fiscal. Campos ausentes são indicados na proposta como pendentes de confirmação antes do envio; divergência entre o CEP do cadastro e o do frete também é avisada. Não são inventados número ou complemento.

Para **Retirada no Local**, a proposta informa **Retirada no estoque Fresa Master — Salto/SP**, orienta combinar local/horário e não apresenta endereço do cliente como destino, peso, seguro ou prazo de transporte. Orçamentos antigos também usam essa apresentação ao gerar um novo PDF; arquivos já baixados não são alterados.

O ponto de retorno anterior a esta etapa é a tag Git **`checkpoint-antes-refino-2026-10-18`**, no commit `f08aee4`, publicada no GitHub. Ela preserva o código anterior para comparação/retorno controlado; não é um backup do banco de dados ou dos orçamentos.

O resumo do orçamento acompanha a rolagem abaixo da navegação, mostrando cliente, situação e total, com acesso à proposta. A tela indica uma próxima ação sem executar aprovação, faturamento ou envio automaticamente. Vínculos históricos de pedido Bling, NF-e e envio de teste ficam disponíveis para consulta; “autorizada” e pagamento de teste confirmado dependem dos estados já registrados, não apenas da existência de um ID.

Em **Orçamentos**, busque por nome (com ou sem acentos), CPF/CNPJ ou número e filtre pela situação. **Duplicar** inicia um rascunho com nova identificação/data, mantém produtos, preços e condições comerciais, mas remove vínculos de pedido/NF-e/envio, a confirmação fiscal e a cotação anterior. O frete e o seguro voltam a zero até nova seleção; confira os preços e o cadastro antes de continuar. O orçamento original não é alterado.

## Publicação automática do backend

### Melhor Envio em produção

A área operacional **Melhor Envio** usa exclusivamente `https://melhorenvio.com.br`; não há fluxo Sandbox disponível no app nem nas rotas de envio. Registros antigos de teste são mantidos apenas como histórico. **Continuar para envio**, após a NF-e autorizada, abre o fluxo de produção; isso não cria envio automaticamente.

1. Aprove o orçamento e consulte a NF-e autorizada da série 2 no Bling.
2. Em **Melhor Envio**, confira o remetente (CEP de origem padrão `13321-472`, editável), destinatário, pacote e produtos.
3. **Testar conexão Melhor Envio** faz apenas leitura da conta. **Cotar no Melhor Envio** obtém preço oficial sem estimativa; não altera o valor cobrado do cliente nem a NF-e.
4. Confira o custo, marque a confirmação e clique em **Adicionar ao carrinho do Melhor Envio (sem pagar)**.
5. Abra o carrinho no painel oficial para pagar, emitir e imprimir a etiqueta. O app não faz checkout, debita saldo, gera etiqueta ou confirma postagem no ambiente real.

O backend Supabase usa os tokens OAuth persistidos da conta de produção. Opcionalmente, aceita `MELHOR_ENVIO_PRODUCTION_TOKEN` como credencial estática de produção. Tokens genéricos ou marcados como Sandbox não são usados; sem credencial OAuth/produção válida, não há cotação oficial nem criação de envio. O Express de desenvolvimento também não usa credenciais fornecidas pelo navegador e só pode cotar com `MELHOR_ENVIO_PRODUCTION_TOKEN` configurado no servidor.

Para conectar sem inserir tokens no navegador, cadastre um aplicativo na Área Dev do Melhor Envio, habilite as permissões `shipping-calculate` (cotação), `users-read` (identificar a conta na verificação de conexão) e `cart-write` (inclusão no carrinho sem pagamento) e configure `MELHOR_ENVIO_CLIENT_ID` e `MELHOR_ENVIO_CLIENT_SECRET` como secrets da Edge Function `api`. Cadastre como redirect URI `https://jnakhctoigbepxwbaygk.supabase.co/functions/v1/api/shipping/melhor-envio/callback`. Aplique a migration `supabase/migrations/202610250001_melhor_envio_oauth.sql` no banco antes de iniciar OAuth. O botão **Conectar Melhor Envio (OAuth)** solicita apenas essas permissões; não solicita `shipping-checkout` nem `shipping-generate`. Access/refresh tokens são mantidos numa tabela com RLS habilitada e sem acesso para `anon`/`authenticated`, e o backend renova o access token quando está a menos de cinco minutos do vencimento.

Contas autorizadas antes da inclusão de `cart-write` precisam usar **Conectar Melhor Envio (OAuth)** novamente e consentir a permissão de carrinho. O teste de conexão somente identifica a conta, não comprova permissão de escrita no carrinho. Iniciar a nova autorização preserva a credencial atual até a conclusão; atualizar ou renovar o token antigo não concede permissões adicionais automaticamente.

Após clicar em **Conectar Melhor Envio (OAuth)**, abra o link **Autorizar cotação e carrinho no Melhor Envio (sem pagamento automático)** exibido no próprio modal. Ele abre o site oficial em uma nova aba sem depender de um pop-up assíncrono. Depois do consentimento, volte ao app e teste a conexão. Se o link expirar, inicie uma nova conexão.

Quando a API de produção não disponibiliza uma cotação, as opções locais de Sedex/PAC/Jadlog recebem o rótulo **Estimativa (sem cotação oficial)**; não use esses valores como preço confirmado ao cliente. A inclusão no carrinho exige nova cotação em produção dentro do modal.

A ausência de autorização OAuth do Melhor Envio não bloqueia a extração do pedido nem a identificação dos produtos do catálogo real do Bling. Nesse caso, apenas a cotação oficial fica indisponível; as estimativas continuam identificadas e as operações de envio real permanecem bloqueadas até conectar a conta.

Antes do carrinho real, a API relê a NF-e atual no Bling, compara chave, série, destinatário e itens e confere no XML o ambiente `tpAmb=1` e protocolo autorizado. Notas de homologação (`tpAmb=2`), canceladas, divergentes ou sem XML disponível bloqueiam o envio. A transportadora é recotada e qualquer diferença de preço exige nova conferência.

O vínculo real fica em `productionShipment`, separado de `sandboxShipment`, e é removido ao duplicar o orçamento. A operação é reservada antes do POST ao Melhor Envio em um registro de controle com chave única `ME-PRODUCTION:<orçamento>` na tabela `quotes`, sob o mesmo proprietário/RLS. Esse registro não é um orçamento e não aparece na lista; é independente das gravações automáticas da venda, inclusive se ela for removida. Não exige migração de banco. Concorrência, recarga e falhas de comunicação não disparam nova criação automaticamente. Em resultado incerto, **Conferir solicitação salva / recuperar envio** recupera o controle; confira o painel oficial antes de qualquer reenvio. O controle incerto não é liberado automaticamente.

As rotas de produção Supabase são `POST /shipping/test-production`, `/shipping/quote-production`, `/shipping/production-shipment` e `/shipping/create-production-shipment` (com prefixo `/api` no Express de desenvolvimento). As rotas antigas de Sandbox e troca de token no Express estão desativadas. As cotações de frete padrão também apontam para produção. Publique interface e função `api`. Os testes simulam o Melhor Envio e o Bling para validar isolamento, preço, NF-e e reserva/recuperação sem criar, pagar ou emitir um envio real.

Recusas explícitas do carrinho (HTTP 400/401/403/404/422) ficam como `rejected`, exibem o motivo e permitem corrigir os dados/credencial após conferir o registro e recotar. Timeout, resposta sem ID, conflito ou falha de servidor continuam bloqueados como situação incerta. Registros antigos de Sandbox, inclusive os que indiquem pagamento, nunca liberam nem representam um envio de produção.

O workflow [Deploy Fresa Master API to Supabase](.github/workflows/deploy-supabase.yml) publica a função `api` no projeto `jnakhctoigbepxwbaygk` quando mudanças do backend, suas dependências ou testes chegam à `main`. Também pode ser executado manualmente em **GitHub > Actions > Deploy Fresa Master API to Supabase > Run workflow**. A publicação exige tipagem e testes aprovados e mantém a configuração de autenticação de `supabase/config.toml`.

Configure uma única vez o secret de repositório **SUPABASE_ACCESS_TOKEN**, em **Settings > Secrets and variables > Actions**, com um token pessoal do Supabase de uma conta com permissão de publicação no projeto. Se já possui esse token, reutilize-o; o Supabase não permite recuperar o valor de um token antigo após sua criação. Não use a chave pública, `service_role`, senha do banco ou token do Melhor Envio. Nunca coloque a credencial no código, no frontend ou no chat.

O GitHub guarda o secret criptografado e o fornece apenas às etapas de publicação; não é necessário login local nem criar outro token a cada atualização. Se expirar ou for revogado, atualize o mesmo secret. As chaves Gemini, Bling e Melhor Envio continuam nos secrets do Supabase, sem substituição pelo workflow. O deploy não executa migrações de banco nem cria pedidos, etiquetas ou notas fiscais. A interface continua sendo publicada pelo workflow separado do GitHub Pages; confira o sucesso dos dois workflows ao alterar frontend e backend.

## Retomar o trabalho ao reabrir

### DANFE em PDF A4 e compartilhamento por link

Nas telas do Bling e de conferência da NF-e autorizada, **Baixar DANFE em PDF A4** salva um arquivo pronto para anexar no WhatsApp, com nome **NF - NOME DO CLIENTE - DD-MM-AAAA.pdf**, usando destinatário e data de emissão consultados na própria nota. **Abrir DANFE**, **Abrir XML** e **Compartilhar link com cliente** continuam disponíveis. O download consulta novamente a nota e seu vínculo com o pedido, sem emitir, transmitir ou alterar dados fiscais, orçamento ou envio.

O documento HTML oficial do Bling é renderizado em quadro isolado, sem scripts ou acesso à rede, preservando textos, tabelas, logotipo incorporado e código de barras. O PDF usa A4, margens de 8 mm e escala proporcional: notas curtas cabem em uma página; notas extensas usam páginas adicionais sem cortar linhas. Se o Bling já retornar PDF, o arquivo original é preservado. Imagens externas ou documentos não reconhecidos geram aviso explícito para abrir o original, em vez de salvar um DANFE incompleto. O endpoint autenticado `POST /bling/nfe/danfe-document` é compartilhado pelo Express e Supabase e aceita apenas o link obtido diretamente da consulta ao Bling.

Após preparar o arquivo, o app mostra **Salvar PDF**, **Abrir PDF pronto** e, quando suportado, **Compartilhar arquivo PDF**. O toque ocorre com o arquivo já em memória, sem depender de um download automático depois de chamadas assíncronas que navegadores móveis podem bloquear. O arquivo fica disponível enquanto essa tela estiver aberta, sem nova consulta/conversão a cada tentativa de salvar. A consulta e as esperas de renderização têm limites e exibem erros; os estados mostram se o app está consultando o Bling ou ajustando o A4.

No iPhone, inclusive no atalho instalado, o preparo usa uma área de renderização no viewport e transforma o logotipo já carregado em canvas antes da clonagem, evitando a espera duplicada de imagens do WebKit. O progresso distingue carregamento do logotipo, renderização da página e finalização do arquivo. Depois de pronto, **Compartilhar arquivo PDF > Salvar em Arquivos** é a opção de salvamento do iOS; **Abrir PDF pronto** também mantém acesso ao visualizador.

Cada alteração do orçamento é gravada imediatamente neste navegador, separada por conta, antes da sincronização com o Supabase. Ao reabrir, o app retoma o orçamento ativo (não apenas o último da lista), o texto do comando rápido, a edição do cliente, a janela aberta, a aba e o texto cadastral do Bling, a chave de NF-e digitada para o Sandbox e a posição da página. Orçamentos alterados antes de trocar para outro ficam na fila de sincronização; falhas na nuvem não apagam os rascunhos locais nem os substituem por um orçamento vazio. A renovação do login não recarrega o orçamento nem descarta edições.

O salvamento na nuvem continua automático e também pode ser solicitado em **Salvar**. Falhas de armazenamento/sincronização aparecem na tela. Se a leitura inicial da nuvem falhar, a sincronização fica pausada para evitar sobrescrever dados; reabra com conexão. Entre dispositivos, apenas dados já sincronizados na nuvem estão disponíveis. O ponto da tela e rascunhos pendentes são próprios do navegador; limpar seus dados ou usar navegação privada pode removê-los.

Senhas, novos tokens Sandbox, arquivos anexados ainda não processados e confirmações de emissão/pagamento não são guardados nessa sessão. Reabrir uma tela não transmite NF-e, cria envio nem repete pagamento automaticamente.

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

### Leitura de PDF, foto e ficha cadastral

As duas telas usam a mesma leitura estruturada para Cartão CNPJ e fichas criadas pelo cliente, inclusive tabelas e PDFs multipágina. Imagens são enviadas na qualidade original, sem redução automática que apague letras pequenas. O limite é **6 MB por arquivo** (PDF/JPG/PNG/WEBP) e **12.000 caracteres de texto**.

A IA extrai campos com trechos de origem, distingue cliente de fornecedor/contador e cadastro fiscal de endereço de entrega, prioriza o contato de faturamento e faz uma segunda conferência para anexos. CPF/CNPJ, CEP, UF, e-mail e telefone passam por validação; dados ausentes, contraditórios ou inválidos ficam em branco com aviso, sem inventar IE, “ISENTO”, “S/N” ou reaproveitar cadastro de outro cliente. Arquivo ilegível, resposta truncada, indisponibilidade da IA e múltiplos clientes sem identificação explícita não produzem um cadastro de sucesso fictício.

A leitura não substitui o endereço ou contato do documento por informações de uma consulta pública. A consulta por CNPJ continua separada, e a complementação de IE conserva os dados expressos com aviso de divergências. No Bling, o cadastro permanece aberto para conferência após a leitura. A IA não garante acerto em arquivos ilegíveis: confira antes de aplicar/emissão. Para disponibilizar a melhoria, publique frontend e Edge Function `api`.

Para anexos, a segunda passagem é independente: não recebe a resposta inicial para evitar repetir um erro por influência da primeira leitura. CPF/CNPJ válidos diferentes bloqueiam o resultado; outros campos divergentes ficam em branco com aviso. Trechos de origem e o estado da conferência são retornados pela API e apresentados nas duas telas. Esses trechos também são transcritos pela IA, não constituem validação independente. Avisos ficam separados do sucesso da operação e campos obrigatórios ausentes são destacados para revisão. Um número parcial não é aceito apenas por estar contido nos dígitos de um trecho maior.

Validação desta etapa: testes da API real com documentos sintéticos de conteúdo conhecido cobriram cartão cadastral sem IE, ficha de duas páginas com endereço de entrega/contador separados, PDF somente de imagem e documento com duas empresas ambíguas. Os três documentos identificados tiveram os campos comparados ao conteúdo esperado; a ambiguidade foi bloqueada. Isso não mede a taxa de acerto em documentos reais dos clientes nem garante leitura de fotos desfocadas, cortes de página ou PDFs ilegíveis.

Na janela **Preencher c/ IA (Cartão CNPJ)** e na aba cadastral do Bling, informe o CNPJ para consultar os dados públicos da empresa e, quando disponível, uma Inscrição Estadual ativa correspondente à UF do estabelecimento. O recurso usa `/api/bling/lookup-cnpj` no Express e `/bling/lookup-cnpj` na Edge Function, consultando BrasilAPI e CNPJ.ws no backend. Para disponibilizá-lo no app publicado, publique a versão atualizada da função `api` no Supabase.

Confira os dados retornados antes de emitir a NF-e. A consulta pode não localizar uma IE ou estar desatualizada; nesses casos, o campo fica em branco e o app recomenda confirmação com o cliente/SEFAZ. A ausência de IE na consulta não significa que a empresa seja isenta. Informe a IE ou confirme manualmente a condição de isento antes do faturamento.

Após extrair um PDF, foto ou texto com CNPJ válido, as duas telas cadastrais consultam automaticamente a mesma busca por CNPJ, inclusive quando o documento contém IE. Somente a IE ausente compatível com a UF é complementada; IE expressa, endereço, número e contatos lidos são preservados. Divergências entre a IE do documento e a consulta, falhas/limites e UF/CNPJ incompatíveis são avisados, sem presumir isenção.

O cadastro mostra separadamente a situação do CNPJ, a IE ativa na UF, fonte e horário da consulta. **CNPJ ativo não significa contribuinte de ICMS.** Uma única IE ativa compatível sugere contribuinte e seleciona **Venda de mercadoria**, desde que exista uma única natureza ativa com esse nome no Bling. Sem evidência conclusiva, a condição permanece **Não confirmada**; ausência de IE, erro da consulta ou CNPJ inativo nunca selecionam automaticamente não contribuinte. CPF também pode ser contribuinte. “ISENTO” não distingue contribuinte isento de não contribuinte.

O operador confirma a condição de ICMS e a natureza selecionada no próprio app; para não contribuinte confirmado, a sugestão é **Venda de mercadoria a não contribuinte**. Operações com ST e contribuinte isento exigem seleção/conferência manual, sem inferência de impostos ou CFOP. A confirmação inclui documento, IE, UF, condição e natureza (ID/descrição). O app consulta naturezas ativas em `/api/bling/natures`, envia o ID nos itens do novo pedido e confere a natureza real da NF-e antes de transmitir. Não troca somente o título de notas existentes nem inventa regras fiscais: divergências e série diferente de 2 bloqueiam transmissão para revisão no Bling. Notas autorizadas não são reclassificadas. Metadados da consulta e confirmação não contam como mudança comercial; condição e natureza selecionadas contam. O XML legado de importação de pedido não transporta a seleção de natureza: confira-a no Bling ao importar. Para disponibilizar o recurso, publique frontend e função `api` do Supabase.

O resumo dos dados do cliente mantém visíveis a natureza selecionada, a condição de ICMS e a situação cadastral após aplicar a consulta. Fonte e horário ficam na conferência fiscal.

Depois de confirmar o cadastro fiscal, a etapa de criar pedido/gerar NF-e mostra somente a natureza e o status de conferência, sem repetir seletores ou exigir outra confirmação cadastral. **Revisar cadastro fiscal** abre a aba de cadastro quando necessário. Cadastro pendente ou alterado continua mostrando os campos de conferência e bloqueando a emissão. Na revisão da NF-e, a natureza aparece uma vez; divergências com a seleção do cadastro ficam explícitas. A confirmação final dos dados da nota e do ambiente antes de transmitir permanece obrigatória. Orientações longas ficam em detalhes expansíveis.

### Emissão guiada da NF-e

**Preparar NF-e** cria e salva o vínculo do pedido, gera e salva o rascunho, e abre a conferência. Se já houver pedido ou nota vinculados, reutiliza-os. Falhas de persistência interrompem a sequência; não há repetição automática de gravações. **Criar somente o pedido** permanece como opção avançada. Preparar não transmite à SEFAZ.

A conferência prioriza destinatário, natureza, ferramentas, valores, pagamento e entrega. **Mostrar detalhes fiscais / editar** abre NCM, CFOP, impostos e observações; pendências retornadas pelo backend abrem esses detalhes automaticamente. Atalhos levam ao cadastro fiscal, consulta de produtos ou nota no Bling. As regras tributárias continuam no ERP.

Antes de transmitir, o app salva no vínculo da nota o horário da solicitação. Com resultado ainda indefinido, bloqueia uma nova transmissão, inclusive após recarregar. Depois de um envio aceito com situação pendente, faz no máximo seis consultas, espaçadas em cinco segundos, interrompendo em autorização, rejeição ou outra situação final. Parar o acompanhamento não cancela o envio; falha ou demora exige consulta, nunca reenvio automático. Uma rejeição confirmada permite corrigir e conferir antes de tentar novamente. A API nem sempre retorna o motivo detalhado da SEFAZ; o app conserva os erros recebidos e oferece acesso à rejeição no Bling, sem inventar diagnóstico.

Após autorização, os dados reais da nota permanecem somente leitura e aparecem atalhos para DANFE, XML, compartilhamento (ou cópia da mensagem) e Melhor Envio. Os links do Bling podem expirar; recarregar obtém links atuais. **Continuar para envio** abre a conferência do Melhor Envio, não cria carrinho, compra frete nem gera etiqueta automaticamente. Registros Sandbox antigos são somente históricos.

A autorização confirmada (situação 5 do Bling) mostra um destaque verde **NF-e emitida com sucesso!**, com número e série, tanto na conferência quanto no painel da nota. O destaque também aparece ao reabrir uma nota autorizada. Rascunho, processamento e rejeição não exibem essa mensagem.

Validação do fluxo guiado: 23 testes focados passaram, além de TypeScript/build. Em fixture isolada no navegador, clique duplo gerou uma única criação de pedido e um único rascunho; a transmissão simulada ocorreu uma vez, seguida de duas consultas até autorização. Conferidos também detalhes fiscais recolhidos/editáveis, compartilhamento, retorno à logística e ausência de transbordamento em 390 px. A NF-e existente foi consultada em modo somente leitura; nenhuma nova nota foi transmitida no teste desta melhoria.

Teste real em homologação em 11/10/2026: consulta de CNPJ com IE ativa selecionou **Venda de mercadoria** (`15110327796`). Pedido `27103607823` gerou o rascunho `27103608394`, NF-e nº 8/série 2, com a mesma natureza, CFOP 5102, NCM 8207.70.10, Pix de R$ 220,00 e retirada sem frete. O app retornou zero pendências de consistência e o vínculo persistiu após recarregar. **Esta nota não foi transmitida à SEFAZ.** A série da natureza foi alterada de 1 para 2 com autorização; regime e regras tributárias do Bling foram preservados, não redefinidos pelo app.

## Rejeição de pedido no Bling

O app exibe a mensagem geral e os detalhes de validação retornados pelo Bling. O bloqueio de venda duplicada (código 3, namespace `VENDAS`) significa que o Bling encontrou informações idênticas à última venda salva. Confira **Vendas > Pedidos de Venda** e continue o faturamento no pedido existente; não altere os dados apenas para contornar o bloqueio. O app não repete o envio automaticamente nem trata a rejeição como pedido criado.

### Conferência antes de criar a venda

A tela do Bling consulta a situação da NF-e ao abrir um orçamento com pedido vinculado e ao voltar à janela do app. A consulta também localiza a nota pelo pedido quando ela foi gerada diretamente no Bling e o app ainda não tem seu ID. Situação, chave e links são salvos no orçamento; não há geração, ajuste ou transmissão nessa sincronização. A revisão da NF-e também persiste o resultado consultado e atualiza ao retornar à janela, desde que não haja edições pendentes ou operação em andamento. Falhas e vínculos divergentes são exibidos sem substituir os dados salvos. Sem pedido vinculado, a nota não é associada por nome do cliente; confira o vínculo existente, sem duplicar venda ou nota.

Se o orçamento mudar após criar o pedido, as telas do Bling e de revisão da NF-e mostram os campos divergentes da referência salva. Endereço de entrega diferente do fiscal é permitido; mudar a entrega depois de salvar a venda exige revisar o pedido vinculado. Pontuação do mesmo NCM não representa alteração fiscal, mas troca de código continua bloqueando. Não remova o vínculo nem duplique a venda para liberar uma nota; confira o pedido e o rascunho existentes no Bling.

O modal apresenta de uma vez as pendências de cadastro fiscal, documento (incluindo dígitos verificadores), endereço, IE de pessoa jurídica, NCM, quantidade, preço, frete/desconto e pagamento. **SKU é opcional para faturar**: o código comercial não é a classificação fiscal nem o ID interno do produto. A mesma conferência é aplicada no backend antes de criar contato ou venda, sem completar endereço com dados fictícios. IE ausente não é convertida automaticamente em isenção.

A listagem resumida de produtos da API do Bling não garante NCM. Ao selecionar uma ferramenta, o app consulta `/bling/products/:id` para ler o cadastro completo e salva `blingProductId`, inclusive para produtos sem SKU. **Usar NCM e produtos do Bling** consulta o cadastro e atualiza os itens no orçamento, preservando quantidade e preço negociado. A mesma resolução é feita pelo backend antes da venda/exportação e ao gerar a nota: ID explícito (ou ID numérico legado), código exato ou nome exato único. Correspondência ambígua exige seleção manual; falhas de consulta não são ignoradas.

O NCM padrão das fresas é **8207.70.10**, conforme configuração solicitada pela Fresa Master. Nos itens identificados como fresa, NCM ausente ou o antigo `8207.70.00`/`82077000` usa esse padrão no catálogo, extração, seleção e reabertura de orçamentos. Outros NCMs preenchidos e produtos como pinças são preservados. A consulta ao Bling avisa quando o cadastro não tem o NCM utilizado; não altera o produto no ERP nem notas já emitidas. NCM zerado ou inválido continua bloqueado. Confira a classificação na revisão fiscal antes de emitir. Item avulso sem SKU pode ser enviado sem código comercial quando seu NCM estiver confirmado; produtos cadastrados continuam vinculados por `itens[].produto.id`.

Conferência real em 10/10/2026: “Fresa Corte 45 graus” (ID `16708113107`) tem SKU vazio e NCM `8207.70.10`; “Fresa 2 cortes DLC 4x22” também possui esse NCM no ERP. “Fresa 3 Cortes TCT 6x12.7x22” (ID `16716486475`) continua com NCM vazio. Não foi alterado cadastro fiscal no ERP nem transmitida nota de produção para esse teste.

O botão foi testado no orçamento FM-008: a fresa de 45 graus passou a usar ID `16708113107`, SKU vazio e NCM do cadastro, preservando R$ 220,00. O preço R$ 170,00 da fresa TCT e seu NCM já informado foram mantidos, com aviso explícito de NCM vazio no ERP. As consultas fiscais, de pagamento e produtos compartilham leituras espaçadas e até duas repetições em HTTP 429, respeitando `Retry-After` até cinco segundos; nunca repetem gravação de venda/nota. A exportação real dentro do app retornou HTTP 200, com produto sem SKU vinculado por ID, Pix ID `9889571` e total R$ 404,61. A revisão possui 69 testes automatizados, incluindo geração simulada sem SKU por ID e bloqueio antes de criar nota quando o NCM do cadastro é inválido. Isso não comprova transmissão real à SEFAZ nem série 2 automática.

Pedido e NF-e são salvos imediatamente em `quote.bling`, acompanhando o orçamento na nuvem. O modal aguarda esse salvamento antes de liberar o fechamento; falha na persistência informa que o registro já existe no Bling e não deve ser recriado. Fechar/reabrir o modal ou recarregar não libera a criação de outra venda/nota para o mesmo orçamento vinculado. O envio precisa de uma nova consulta de status; alterações do orçamento após criar a venda bloqueiam a transmissão e exigem restaurar os dados do orçamento ou concluir a revisão/emissão do pedido existente no Bling. A leitura da nota também compara itens/NCM e total com o orçamento atual; a geração verifica correspondência com a venda antes de criar rascunho.

XML/JSON de exportação são consultados somente ao abrir essas abas, não em cada alteração ou abertura do modal. Isso elimina chamadas desnecessárias de pagamento que contribuíam para o limite de requisições. Falhas na consulta de contatos são exibidas e não iniciam cadastro de outro contato.

Todas as chamadas REST ao Bling (conexão, catálogo, contatos, pedidos e NF-e) compartilham espaçamento de 700 ms por instância do backend. Respostas 429 estabelecem espera por credencial conforme `Retry-After`; somente leituras têm até duas repetições limitadas. POST/PUT não são repetidos automaticamente, evitando duplicação de operações fiscais. O modal consulta a configuração local ao abrir, sem disparar o teste de conexão; esse teste permanece disponível manualmente. O controle por instância não coordena múltiplas instâncias ou outros aplicativos na mesma conta e não elimina limites diários do ERP.

Validação do controle de requisições: 72 testes aprovados, TypeScript e builds de interface/Express/Edge Function concluídos.

Teste real pelo site oficial em tela de 390 px em 10/10/2026: o orçamento separado FM-011 criou o pedido `27098308403` e a NF-e `27098309297`, sem erro de limite nas operações de consulta de produto, criação, geração, transmissão e status. A ferramenta sem SKU foi vinculada ao cadastro e manteve NCM e preço. A geração saiu na série 1 e o app bloqueou o envio; após ajuste manual no Bling, a NF-e nº `000001`, série 2, foi autorizada. O XML confirmou `tpAmb=2`, `cStat=100`, NCM `82077010`, Pix `tPag=20` e total `220.00`. Nenhuma nota de produção foi transmitida. O ambiente original **1 - Produção** foi restaurado, salvo e conferido após recarregar. O teste não garante ausência de limites diários nem coordenação entre instâncias.

A recarga preservou os IDs do pedido e da nota. A comparação de venda ignora reordenação das chaves, campos cadastrais opcionais vazios e a lista de alternativas de frete acrescentada pelo carregamento; o frete escolhido e alterações reais de cadastro, itens, pagamento e valores continuam bloqueando emissão.

No Sandbox, **Testar conexão Sandbox** verifica o token protegido ou o token separado do servidor, sem criar carrinho. O modal sinaliza divergência entre CEP de origem cotado e remetente; aprove o orçamento e recalcule a rota antes de enviar. A chave salva da NF-e série 2 é sugerida no modal, mas ainda deve corresponder a uma nota autorizada. Testes de interface com APIs simuladas não comprovam autorização fiscal nem criação real no Sandbox.

Validação anterior: 60 testes automatizados aprovados e checagem TypeScript sem erros. No app, a consulta real do produto `FM-TCT-6X22` retornou NCM vazio; a seleção preservou o código confirmado `8207.70.10` e o preço R$ 170,00 no orçamento FM-008. O botão de conexão Sandbox foi testado dentro do modal e retornou falta de token, com carrinho bloqueado e divergência de origem sinalizada. Ainda não há comprovação de um carrinho real criado pelo app; nenhuma NF-e de produção foi transmitida nesta revisão. A série 2 automática foi validada posteriormente conforme abaixo.

### Validação de NF-e e pendências

Em 07/10/2026, um teste pela API do app gerou e transmitiu a NF-e nº 000036, série 1, em homologação. O XML confirmou `tpAmb=2` e `cStat=100` (autorizada, sem valor fiscal). A configuração do Bling foi restaurada para produção e conferida após recarregar.

Esse resultado valida a comunicação, não a correção fiscal do fluxo. Os problemas identificados foram:

- NCM: o orçamento enviou `8207.70.00`, mas o XML gerado continha `00000000`. A tentativa de ajuste manual no Bling foi recusada; não foi persistida.
- Pagamento: o orçamento indicava Pix, mas o XML continha `tPag=01` (dinheiro).
- ID da NF-e: a geração retornou `data.idNotaFiscal`, mas o backend procurava somente `data.id`; isso impedia a continuação correta pela interface.

O fluxo atualizado usa `parcelas[].formaPagamento.id`, consultando uma forma de recebimento ativa com descrição exata no Bling, sem substituir Pix por dinheiro. Pix precisa ter tipo fiscal 17 ou 20. A exportação XML/JSON também exige conexão para resolver o pagamento. Se o Bling negar acesso a `/formas-pagamentos`, revise a permissão correspondente e reconecte a conta.

A geração reconhece `idNotaFiscal` com ou sem envelope `data`, reutiliza a nota vinculada ao pedido e ajusta somente o rascunho pendente. O NCM confirmado do orçamento é escrito em `itens[].classificacaoFiscal`; na ausência do orçamento, usa o cadastro fiscal do produto vinculado no Bling. Os itens precisam corresponder ao pedido salvo. Após o ajuste, o app relê a nota para conferir NCM/CFOP e pagamento. Falhas preservam o ID da nota para revisão, sem gerar outra silenciosamente.

NCM ausente, zerado ou `8207.70.00` bloqueia venda/exportação/emissão; não há substituição fiscal automática. A [tabela oficial do Siscomex](https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json) lista `8207.70.10` (de topo), `8207.70.20` (para cortar engrenagens) e `8207.70.90` (outras). Confirme com o contador o código de **cada produto**, inclusive pinças e acessórios, e edite o NCM no orçamento. Os padrões antigos do catálogo/orçamentos não foram reclassificados automaticamente.

A transmissão faz uma nova conferência no backend e fica bloqueada na interface enquanto houver pendências ou situação incompatível. Essas verificações não substituem a revisão de tributos e demais dados fiscais pelo responsável contábil. O teste controlado de 10/10/2026 acima validou o XML do fluxo corrigido para uma ferramenta com NCM cadastrado.

### Série 2 e integração de envio

Na tela do orçamento, **Emitir NF-e** abre sempre a aba de emissão do Bling. A seção **Nota Fiscal (NF-e)** aparece primeiro, antes das configurações de conexão, inclusive no celular. Sem venda vinculada, mostra **1. Criar pedido para emitir NF-e** e as pendências cadastrais/fiscais; após criar a venda, libera **Gerar NF-e a partir do pedido**. Depois, abra **Conferir e editar NF-e no app**. Não há transmissão automática. Notas autorizadas mostram **Autorizada** e acesso ao DANFE, sem oferecer uma nova transmissão. O indicador do orçamento considera a situação da NF-e, não a modalidade de frete.

### Conferência e edição da NF-e no app

A tela consulta os dados reais da nota e confirma seu vínculo com o pedido de venda. Exibe destinatário/endereço fiscal, itens, quantidades, valores, NCM, CFOP, impostos retornados pela API, frete, total, parcelas, transporte e observações. Campos ausentes na resposta ficam identificados como **não informados pela API**, não como zero. O orçamento continua separado da nota: corrigir o NCM da NF-e não altera o produto no ERP nem o orçamento.

Somente notas **pendentes** podem receber correções de **NCM, CFOP e observações**. Cliente, quantidades, preços, impostos, frete e pagamento são somente consulta; alterações comerciais exigem revisar o pedido vinculado no Bling. O app preserva o CFOP definido pelo Bling/natureza, sem substituí-lo automaticamente por 5102/6102. Confirme a classificação e o CFOP com o contador.

Se o Bling reutilizou um contato existente do mesmo CPF/CNPJ e a nota trouxe nome/endereço fiscal diferentes do orçamento, a transmissão permanece bloqueada. **Conferir e usar destinatário desta NF-e no orçamento** permite adotar explicitamente o cadastro real da nota, sem modificar contato, pedido ou NF-e no ERP. A ação relê vínculo/revisão, verifica o mesmo documento, endereço completo, itens, valores e pagamento; rejeita notas autorizadas e qualquer outra divergência comercial. Somente o destinatário da referência salva é atualizado, sem apagar mudanças de itens/frete/valores. O salvamento de cliente e vínculo na nuvem é conjunto; depois, reabra e confira a nota. Pessoa física com CPF válido e sem IE não exige a conferência exclusiva de CNPJ nem consulta cadastral por CNPJ.

**Salvar correções no Bling** executa uma atualização sem repetir gravações e relê a nota, verificando persistência dos campos editados e preservação dos demais dados fiscais. A API pode restringir notas vinculadas ou recalcular impostos; nesses casos a tela bloqueia a emissão e pede nova conferência. Uma revisão SHA-256 dos dados fiscais impede salvar/transmitir uma versão que mudou desde a leitura. As rotas `POST /api/bling/nfe/review`, `/update-draft` e `/send-reviewed` exigem a mesma autenticação das demais rotas fiscais, além de pedido, nota e orçamento correspondentes.

Para transmitir, abra **Conferir e emitir NF-e no app**, salve qualquer edição, confira a nota, marque **Conferi os dados fiscais e o ambiente de emissão** e clique em **Transmitir NF-e à SEFAZ**. **Atualizar situação (não transmite)** somente consulta o status; substitui o antigo rótulo ambíguo “Conferir NF-e e liberar envio”. O rodapé informa o motivo de cada bloqueio (pendências, diferenças comerciais, alterações não salvas, erro ou confirmação ausente). Há confirmação final; o backend relê a nota e verifica revisão, vínculo, itens/valores, destinatário, NCM, CFOP, série 2 e pagamento antes do POST à SEFAZ. Diferenças comerciais bloqueiam envio. NCM corrigido explicitamente na nota aparece como aviso, sem ser sobrescrito pelo catálogo durante a transmissão. Notas autorizadas são somente consulta e disponibilizam DANFE/XML quando retornados pelo Bling; diferenças com o orçamento atual não alteram a nota nem permitem retransmissão.

O contrato GET do Bling não informa o ambiente produção/homologação. A tela sinaliza essa limitação e exige conferência da configuração no ERP; não inventa um indicador de ambiente. Série e numeração também não são editáveis por esta tela. Essas verificações não substituem a revisão contábil dos impostos.

Teste real em 11/10/2026 pelo site oficial: o FM-002, com pedido `27103035014` e nota `27103035405`, foi conferido e transmitido pelo botão **Transmitir NF-e à SEFAZ**, após confirmar no Bling o ambiente de homologação já configurado. O XML retornou `tpAmb=2`, `cStat=100` (Autorizado o uso da NF-e), número 4, série 2, NCM `82077010`, CFOP `5102`, pagamento Pix (`tPag=20`), frete R$ 28,50 e total R$ 83,50. Após recarregar o site, a autorização permaneceu salva e não havia botão para nova transmissão. O ambiente foi mantido em homologação; esse teste não representa emissão com valor fiscal em produção.

Teste de pessoa física em 11/10/2026: novo orçamento, extração de texto com CPF autorizado pelo operador e IE em branco, seleção de uma Fresa Corte 45 graus do catálogo Bling, Pix e retirada sem frete. O pedido `27103288968` gerou a nota `27103289558`, nº 7/série 2. O CPF já possuía contato no ERP; a transmissão foi bloqueada pela divergência de nome/endereço e só prosseguiu após autorização explícita para adotar no orçamento o destinatário da nota, sem alterar o cadastro do Bling nem gerar outra venda. O site oficial transmitiu e o XML confirmou `tpAmb=2`, `cStat=100`, destinatário com CPF (sem CNPJ), `indIEDest=9`, sem IE, NCM `82077010`, CFOP `5102`, Pix (`tPag=20`), frete zero e total R$ 220,00. Reload confirmou autorização persistente e ausência de nova transmissão. Dados pessoais não são registrados nesta documentação. O teste comprova este fluxo em homologação, não todas as situações fiscais de pessoas físicas.

O seguro cobrado no orçamento é somado ao **frete fiscal** na criação da venda e nas exportações XML/JSON, uma única vez, para que frete, parcelas e total da NF-e correspondam ao total comercial. Pedidos antigos já criados com outro valor precisam ser revisados, não são alterados retroativamente.

A conferência da NF-e exige **série 2**, inclusive imediatamente antes da transmissão. A API documentada de geração por pedido não recebe série: ela é definida na **natureza de operação** do Bling. Conforme a [orientação oficial do Bling](https://ajuda.bling.com.br/hc/pt-br/articles/360036464953), acesse **Todas as configurações > Notas Fiscais > Naturezas de operação**, abra a natureza usada na venda e configure **Série = 2**. Não altere tributos nem reinicie a numeração para resolver a série.

Em 10/10/2026, a natureza padrão de venda usada pela integração, **Venda de mercadoria a não contribuinte** (ID `15110327797`), foi alterada de série 1 para 2 e conferida após reabrir. Nenhum outro campo fiscal ou sequência foi editado. Essa configuração vale também para novas vendas que usem a mesma natureza no Bling; outras naturezas não foram alteradas. Se uma venda usar outra natureza, confira sua série antes de transmitir. Rascunhos antigos não são corrigidos retroativamente.

**Teste de série automática concluído pelo site oficial:** o orçamento separado FM-012 criou o pedido `27098423130` e a NF-e `27098424062`. A geração já retornou nº `000002`, **série 2**, sem editar a nota no Bling, com conferência fiscal sem pendências. A transmissão pelo app foi autorizada em homologação; o XML confirmou `tpAmb=2`, `cStat=100`, série `2`, número `2`, NCM `82077010`, Pix `tPag=20` e total `220.00`. Não ocorreu erro de limite nesse fluxo. Recarregar o app preservou o vínculo e a nota autorizada, sem aviso falso de orçamento alterado. O ambiente **1 - Produção** foi restaurado, salvo e conferido após recarregar, mantendo a natureza configurada para série 2. Nenhuma nota de produção foi emitida nos testes.

O app continua bloqueando notas de outra série, dados fiscais inconsistentes e duplicação de pedido/nota; não presume aceitação de campos não documentados nem altera a sequência global. Produtos sem NCM no cadastro precisam de classificação confirmada, não de um código inventado.

> Os relatos de Sandbox abaixo são registros históricos de validação. O fluxo Sandbox foi removido da interface e não deve ser usado para operações atuais.

#### Resultado da investigação em 09/10/2026

- O pedido de teste `27068678963` (`TESTE-HOMOLOGACAO-SERIE2-1791388967842`) gerou inicialmente a NF-e `27068682178` na série 1. O app bloqueou a transmissão por série incorreta.
- Após ajuste manual no Bling, a mesma NF-e foi localizada pela API no ambiente de produção: série 2, número `000001`, situação 1 (pendente), sem chave de acesso. **Não foi transmitida e não deve ser faturada em produção.** A tentativa de teste em homologação não comprova autorização na série 2.
- O ambiente de emissão foi restaurado para **1 - Produção**, salvo e confirmado após recarregar. O controle de numeração exibiu próximo número 11 para série 001 e 39 para série 002; essas sequências não foram alteradas nesta investigação.
- Naquela investigação, a seleção automática de série 2 permanecia pendente. Foi resolvida em 10/10/2026 pela configuração da natureza de operação e validada no FM-012 acima. O contrato consultado não oferece `serie` como entrada na geração por pedido nem nos DTOs de escrita de NF-e. Não há garantia de ambiente do rascunho pela resposta resumida da API; antes de testes, confirme também o ambiente da própria nota no Bling, não apenas a preferência da conta.
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

Para publicar localmente a Edge Function no Windows com verificação de tipos e testes antes do deploy, execute `.\scripts\deploy-supabase-api.ps1` no PowerShell. O script solicita o Personal Access Token do Supabase em uma entrada oculta, usa-o somente durante o deploy e não o grava no projeto. Nunca cole esse token no chat, no código ou em arquivos `.env`.

## Acesso e dados

O login usa e-mail e senha com sessão persistente. O e-mail é usado apenas para configurar ou recuperar a senha. Os orçamentos são salvos na tabela `quotes` do Supabase, protegida por Row Level Security.
