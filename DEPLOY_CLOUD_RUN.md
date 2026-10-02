# Publicacao da Fresa Master

O projeto Firebase e o servico Cloud Run ja existem. O objetivo e atualizar o servico atual, sem criar outro: `or-amentos-fresa-master` em `us-west1`, no projeto `gen-lang-client-0377769207`.

## Estado atual

- Google Authentication esta habilitado.
- O app Web Firebase existente e `ai-studio-applet-webapp`.
- O Firestore nomeado `ai-studio-oramentosfresama-1dee2e02-3999-4b68-aff8-d54fc43c4925` existe em `us-west1` e estava vazio.
- As regras privadas para o administrador e suas cotacoes foram publicadas nesse banco.
- O Bling aponta o callback para `https://or-amentos-fresa-master.ai.studio/api/bling/oauth/callback`.
- O Cloud Run esta configurado com minimo zero, maximo uma instancia e cobranca por requisicao.

## O que falta para atualizar o servico

1. Configurar Workload Identity Federation entre o repositorio GitHub `fresamaster2002/ORCAMENTO---FRESA-MASTER` e o projeto Google Cloud, com permissao para build/deploy.
2. Criar no Google Secret Manager `GEMINI_API_KEY`, `BLING_API_TOKEN` e `MELHOR_ENVIO_TOKEN`.
3. Criar uma conta de servico de runtime dedicada com `roles/datastore.user` e `roles/secretmanager.secretAccessor` nesses tres secrets.
4. No GitHub, em Settings > Secrets and variables > Actions, definir as variables `GCP_PROJECT_ID=gen-lang-client-0377769207`, `GCP_REGION=us-west1`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_RUNTIME_SERVICE_ACCOUNT`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN=gen-lang-client-0377769207.firebaseapp.com`, `FIREBASE_APP_ID` e `FIREBASE_DATABASE_ID=ai-studio-oramentosfresama-1dee2e02-3999-4b68-aff8-d54fc43c4925`.
5. Depois de revisar o custo e autorizar a publicacao, executar Actions > Deploy Fresa Master to Cloud Run > Run workflow. O workflow e manual para evitar deploy e consumo de creditos em pushes acidentais.

O projeto esta no plano Blaze e o Console informa que a conta ja esta gerando cobrancas, embora haja credito promocional. O servico escala a zero e usa cobranca por requisicao, mas nenhum deploy pode ser garantido como custo zero. O budget do Google apenas alerta; nao bloqueia cobrancas automaticamente.

Para reduzir o custo por chamada, o workflow usa Gemini Flash Lite e limita a saida da IA. Textos acima de 8.000 caracteres e anexos acima de 1,8 MB sao recusados. `GEMINI_DAILY_REQUEST_LIMIT=0` nao acrescenta um teto arbitrario: valem as cotas configuradas pelo Google para o projeto da chave. Para preco gratuito, use uma API key de um projeto AI Studio Free, sem billing ativo; o projeto Cloud Run atual esta em Tier 1 com billing e por isso as chamadas sao cobradas. Se desejar um teto proprio, defina esse valor acima de zero; ele sera contado no Firestore.

O workflow usa Workload Identity Federation e Secret Manager; nao coloque chaves de servico nem tokens nos arquivos do repositorio.