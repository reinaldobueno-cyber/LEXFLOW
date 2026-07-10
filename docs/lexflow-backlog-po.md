# LexFlow - Backlog do Produto

Atualizado em: 2026-07-08

## Norte do Produto

O LexFlow deve ser um painel de comando juridico para escritorios de advocacia, com foco em evitar perda de prazos, audiencias e tarefas criticas.

O sistema nao deve ser apenas uma tabela. Ele deve:

- centralizar publicacoes, prazos, audiencias e tarefas;
- priorizar risco juridico;
- atribuir responsaveis;
- registrar historico e auditoria;
- integrar fontes oficiais e fornecedores;
- preparar operacao multi-tenant SaaS;
- reduzir dependencia operacional do ControlJus/Aviso Urgente.

## Status Geral

Legenda:

- `[x]` concluido no MVP atual
- `[~]` iniciado/parcial
- `[ ]` pendente
- `[!]` risco ou decisao necessaria

## Ja Concluido

- [x] Layout principal LexFlow com menu lateral.
- [x] Dashboard executivo com cards clicaveis.
- [x] Aba de Prazos com status, responsavel, prioridade e filtros.
- [x] Aba de Audiencias/Agenda.
- [x] Aba de Tarefas.
- [x] Central de Alertas.
- [x] Historico de alteracoes.
- [x] Login e sessao autenticada.
- [x] Estrutura multi-tenant inicial.
- [x] Usuario Master com visao administrativa.
- [x] Tela de Usuarios e Contratos/Escritorios.
- [x] Tela de Configuracoes por tenant.
- [x] Configuracao ControlJus por tenant.
- [x] Configuracao DJEN por tenant.
- [x] Cadastro de OABs monitoradas.
- [x] Integracao DJEN publica por OAB.
- [x] Separacao visual de origem: DJEN / ControlJus.
- [x] Separacao entre advogado monitorado e cliente/parte.
- [x] Exclusao de dados manuais da operacao de publicacoes.
- [x] Backend Cloudflare Worker publicado.
- [x] Secrets sensiveis no Cloudflare.
- [x] Token/API DJEN criptografado e enviado como Bearer quando configurado.

## Decisoes de Produto

- [x] Nome do produto: LexFlow.
- [x] Dados manuais servem apenas para de-para/validacao, nao para operacao.
- [x] Operacao de publicacoes deve mostrar apenas origem integrada.
- [x] Advogado monitorado nunca deve aparecer como cliente do processo.
- [x] Prazo fatal nao deve ser inventado quando a fonte nao entrega base suficiente.
- [x] Prioridade critica definida: Motor de Prazos Validavel passa a ser o foco imediato.
- [ ] Definir fonte autenticada principal para processos em segredo de justica.
- [ ] Definir estrategia oficial para certificado digital A3.
- [ ] Definir se aceitaremos certificado A1 como alternativa operacional.

## Epic 1 - Inbox de Publicacoes Integradas

Objetivo: transformar DJEN/ControlJus em uma caixa de entrada confiavel para analise juridica.

Status: `[~]`

Itens:

- [x] Consumir DJEN publico por OAB.
- [x] Consumir ControlJus via backend.
- [x] Identificar origem da publicacao.
- [x] Separar cliente/parte de advogado monitorado.
- [x] Bloquear texto grande no campo cliente.
- [x] Bloquear advogado como cliente.
- [x] Mostrar "Parte nao identificada" quando nao houver dado confiavel.
- [x] Criar campo `restrito/sigilo` quando o texto indicar segredo de justica.
- [x] Exibir estado operacional quando ainda nao ha prazo fatal calculado.
- [ ] Criar detalhe expandido da publicacao com texto completo, partes, advogados e fonte.
- [ ] Criar fila de triagem: Novo -> Em analise -> Gera prazo -> Nao gera prazo -> Tarefa criada.
- [ ] Criar vinculacao com processo existente.
- [ ] Criar deduplicacao mais forte por fonte, processo, data, texto e id oficial.

Critérios de aceite:

- Nenhum advogado monitorado aparece como cliente.
- Nenhum texto narrativo aparece como cliente.
- Publicacoes sem parte estruturada ficam marcadas como parte nao identificada.
- Publicacoes com segredo de justica ficam destacadas como restritas.
- Publicacoes integradas sem prazo calculado mostram se exigem analise, autenticacao ou se nao ha prazo automatico.

## Epic 2 - Motor de Prazos

Objetivo: calcular prazos fatais com rastreabilidade.

Status: `[~]`

Problema:

O DJEN entrega a comunicacao/publicacao, mas nao entrega o prazo fatal calculado. O LexFlow precisa calcular o prazo com base normativa, reduzindo a dependencia de controller/intermediador.

Itens:

- [x] Modelar base normativa inicial com codigos oficiais do Planalto.
- [x] Modelar regra assistiva `area + ato + prazo + contagem + fundamento + confianca`.
- [x] Mapear tipo de ato -> prazo sugerido para regras iniciais de Civil, Penal, Trabalhista, Eleitoral e Tributario.
- [x] Configurar dias corridos vs dias uteis na regra.
- [x] Criar sugestao de prazo na publicacao com fundamento, confianca e memoria de calculo.
- [x] Definir regra de inicio de contagem inicial: publicacao oficial como base para sugestao DJEN/recorte.
- [x] Integrar calendario inicial de feriados nacionais fixos.
- [ ] Integrar feriados estaduais/tribunais.
- [x] Registrar base do calculo: data inicial, dias, calendario usado, regra e fonte oficial.
- [x] Criar status de confianca: calculado LexFlow, revisao recomendada, sem regra confiavel.
- [ ] Permitir recontagem manual com justificativa.
- [ ] Alertar quando prazo tiver baixa confianca, termo inicial sensivel ou dados incompletos.

Critérios de aceite:

- Todo prazo fatal deve ter memoria de calculo.
- Prazo calculado automaticamente deve indicar confianca, fundamento e memoria.
- Usuario deve conseguir auditar por que o prazo caiu naquela data.

## Epic 3 - Segredo de Justica e Fontes Autenticadas

Objetivo: obter dados restritos apenas por meios autorizados, com seguranca e auditoria.

Status: `[!]`

Contexto:

Consultas publicas do DJEN podem indicar segredo de justica ou arquivos nao publicados. Para acessar conteudo restrito, o LexFlow precisa usar fonte autenticada/autorizada do advogado/escritorio.

Fontes candidatas:

- [ ] Domicilio Judicial Eletronico / PDPJ, se houver API autorizada para o escritorio.
- [ ] PJe por tribunal.
- [ ] e-SAJ por tribunal.
- [ ] Projudi por tribunal.
- [ ] SEEU.
- [ ] Portais com certificado digital.
- [ ] APIs oficiais quando existentes.

Itens:

- [ ] Mapear tribunais prioritarios do escritorio.
- [ ] Para cada tribunal, identificar se ha API, login, certificado, captcha, 2FA ou token.
- [ ] Classificar fonte como publica, autenticada por usuario/senha, autenticada por token, autenticada por certificado.
- [ ] Criar cadastro de credenciais por tenant e por fonte.
- [ ] Criar cofre de credenciais com criptografia.
- [ ] Criar log de acesso a processo sigiloso.
- [ ] Criar termo de responsabilidade/consentimento por escritorio.
- [ ] Criar status "restrito - requer autenticacao".
- [ ] Criar rotina de tentativa autenticada apenas quando houver permissao.

Critérios de aceite:

- Nenhum dado sigiloso e acessado sem credencial autorizada.
- Todo acesso autenticado gera log.
- Token/certificado nunca aparece em tela ou log.
- Usuario sabe quando uma publicacao nao foi completada por restricao.

## Epic 4 - Certificado Digital A3 / Token Fisico

Objetivo: permitir integracoes que exigem certificado digital fisico sem quebrar a arquitetura SaaS.

Status: `[~]`

Restricao tecnica:

Um certificado A3/token fisico fica conectado a uma maquina local e depende de driver, PIN e interacao do sistema operacional/navegador. Um Cloudflare Worker na nuvem nao consegue acessar USB/token fisico do escritorio.

Arquiteturas possiveis:

1. Agente local LexFlow Desktop
   - [~] Pequeno app instalado no computador do escritorio.
   - [ ] Acessa o certificado A3 pelo navegador/sistema local.
   - [ ] Sincroniza apenas metadados/documentos autorizados com o LexFlow.
   - [ ] Ideal para token fisico A3.

2. Coletor dedicado em servidor com certificado instalado
   - [ ] VPS/Windows/Render/Railway com navegador e certificado configurado.
   - [ ] Requer guarda segura e operacao assistida.
   - [ ] Pode ser instavel com A3 se o token fisico nao estiver no servidor.

3. Certificado A1 como alternativa
   - [ ] Arquivo PFX/P12 armazenado em cofre seguro.
   - [ ] Permite mTLS/assinatura em backend.
   - [ ] Mais viavel para SaaS, mas exige decisao juridica e seguranca forte.

4. API oficial com token OAuth/API Key
   - [ ] Melhor cenario.
   - [ ] Evita automacao de tela.
   - [ ] Depende de disponibilidade do tribunal/CNJ/fornecedor.

Decisao pendente:

- [x] Para A3, o caminho definido e agente local; Cloudflare Worker nao acessa USB/token fisico.
- [ ] O escritorio aceita usar A1 para integracoes automaticas?
- [ ] Quais tribunais realmente exigem A3 para os dados que faltam?
- [x] Preparar Configuracoes do LexFlow para URL/protocolo do Agente Local A3.
- [x] Criar acao `Abrir A3` em publicacoes restritas.
- [x] Documentar arquitetura do Agente Local A3.

Critérios de aceite:

- A3 nunca e tratado como segredo de servidor comum.
- PIN nunca e armazenado sem decisao explicita e segura.
- Toda coleta via certificado tem auditoria.
- Usuario sabe quando precisa deixar agente local ativo.

## Epic 5 - Dashboard e Alertas

Status: `[~]`

Itens:

- [x] Cards de vencidos, hoje, 3 dias, 7 dias.
- [x] Cards clicaveis filtrando a tela correta.
- [x] Fila de prioridade critica.
- [x] Alertas por vencimento e responsavel.
- [x] Alertas por publicacao restrita.
- [ ] Alertas por prazo sugerido sem validacao.
- [ ] Alertas por falha de sincronizacao.
- [ ] Alertas por credencial expirada.
- [ ] Envio por email/WhatsApp futuramente.

## Epic 6 - Workflow Operacional

Status: `[~]`

Fluxo desejado:

1. Publicacao integrada chega.
2. LexFlow classifica.
3. Se houver possivel prazo, sugere prazo/tarefa.
4. Usuario valida.
5. Sistema cria tarefa/prazo.
6. Responsavel executa.
7. Revisao/protocolo.
8. Conclusao com data e historico.

Itens:

- [x] Status basicos em prazos, publicacoes e tarefas.
- [x] Criar prazo a partir de publicacao.
- [ ] Criar tarefa a partir de publicacao.
- [ ] Checklist operacional por tipo de ato.
- [ ] Responsavel obrigatorio para itens criticos.
- [ ] Aprovacao/revisao antes de concluir.
- [ ] Campo "comprovante/protocolo".

## Epic 7 - SaaS Multi-Tenant e Administracao

Status: `[~]`

Itens:

- [x] Login.
- [x] Master admin.
- [x] Usuarios por tenant.
- [x] Contratos/escritorios.
- [x] Configuracoes por tenant.
- [x] Isolamento por TenantID no backend principal.
- [ ] Migrar persistencia operacional para banco robusto.
- [ ] Criar tabelas reais de processos, publicacoes, prazos, tarefas.
- [ ] Criar auditoria consultavel por administrador.
- [ ] Criar planos/limites.
- [ ] Criar billing futuramente.

## Epic 8 - IA Juridica Assistiva

Status: `[ ]`

Objetivo: ajudar a interpretar, nao decidir sozinha.

Itens:

- [ ] Resumir publicacao.
- [ ] Identificar tipo de ato.
- [ ] Sugerir se gera prazo.
- [ ] Sugerir prazo e fundamento.
- [ ] Sugerir tarefa/checklist.
- [ ] Classificar prioridade.
- [ ] Indicar confianca baixa/media/alta.
- [ ] Exigir validacao humana para prazo fatal.

Critérios de aceite:

- IA/motor nunca deve ocultar incerteza: quando a regra for fraca, deve marcar revisao recomendada e explicar o risco.
- Toda sugestao tem justificativa.
- Baixa confianca vira alerta, nao automacao.

## Epic 9 - Design System e Experiencia SaaS

Status: `[~]`

Objetivo: transformar o LexFlow de prototipo funcional em produto juridico SaaS confiavel, vendavel e agradavel de operar todos os dias.

Itens:

- [x] Definir direcao visual em documento proprio.
- [x] Trocar base visual quente/bege por base neutra SaaS.
- [x] Melhorar sidebar, topbar, cards, tabelas, formularios e modais.
- [ ] Substituir caracteres soltos de acao por icones consistentes.
- [ ] Criar tela de detalhe de publicacao com hierarquia visual propria.
- [ ] Criar componente visual dedicado para memoria de calculo de prazo.
- [ ] Revisar mobile/responsividade das tabelas grandes.
- [ ] Criar estados vazios especificos por modulo.

Critérios de aceite:

- O usuario deve sentir que esta usando um SaaS juridico profissional, nao uma planilha.
- Tabelas precisam ser densas, legiveis e alinhadas.
- Elementos criticos devem aparecer por hierarquia visual, nao por improviso.

## Ordem Recomendada dos Proximos Itens

### Sprint 1 - Higiene da Inbox Integrada

- [x] Marcar publicacoes de segredo de justica/restritas.
- [x] Trocar traco vazio de prazo por estado operacional de triagem.
- [ ] Melhorar detalhe da publicacao.
- [ ] Criar campo "parte nao identificada" como status/filtro.
- [ ] Deduplicacao forte.
- [ ] Filtro por origem: DJEN / ControlJus / restrito.

### Sprint 2 - Credenciais e Fontes Restritas

- [ ] Mapear tribunais prioritarios.
- [ ] Criar tela "Fontes autenticadas".
- [ ] Definir estrategia A3 vs A1.
- [ ] Criar prototipo de agente local ou coletor autenticado.

### Sprint 3 - Motor de Prazo Validavel

- [x] Criar base normativa inicial a partir de codigos oficiais.
- [x] Criar prazo sugerido com fundamento na publicacao.
- [x] Modelar memoria de calculo persistente e auditavel.
- [ ] Criar validacao humana.
- [ ] Criar alerta de prazo sem validacao.

### Sprint 4 - Workflow de Execucao

- [ ] Criar tarefas a partir de publicacao.
- [ ] Checklist por tipo de ato.
- [ ] Responsavel obrigatorio em itens criticos.
- [ ] Conclusao com comprovante.

## Proximo Item Ativo

Sugestao de proximo item:

`Sprint 3.1 - Motor de Prazo Validavel`

Motivo:

Este e o item mais critico do produto. O LexFlow precisa entregar uma sugestao de prazo com fundamento legal, considerando area do processo, vara/ramo, tipo de ato e base normativa, removendo a dependencia operacional de controller/intermediador.

Critérios de aceite:

- Publicacao mostra sugestao de prazo quando houver regra aplicavel.
- Sugestao informa area inferida, ato/peca, fundamento, contagem e confianca.
- Prazo sugerido criado fica como calculado pelo LexFlow quando a regra for confiavel; baixa confianca vira revisao recomendada.
- Base de Prazos mostra normas oficiais e regras assistivas cadastradas.
