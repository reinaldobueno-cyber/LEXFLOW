# Estudo Tecnico e Estrategico - Integracao LexFlow com DJEN/CNJ

Atualizado em: 2026-07-10

## 0. Resumo Executivo

O LexFlow pode reduzir a dependencia de ControlJus/Aviso Urgente usando o DJEN como fonte primaria de publicacoes e comunicacoes oficiais, mas o DJEN nao substitui sozinho um fornecedor de recortes pronto. O DJEN entrega a materia-prima: comunicacao/publicacao, dados do processo, tribunal, partes/advogados quando disponiveis e texto do ato. O LexFlow precisa construir a camada de inteligencia: deduplicacao, classificacao, motor normativo de prazos, agenda, alertas, auditoria e tratamento de sigilo.

Decisao de produto: o valor do LexFlow nao deve ser "mostrar publicacao". O valor e entregar prazo calculado com fundamento, confianca, memoria de calculo e alerta de risco, removendo a dependencia de controller/intermediador.

## 1. O que e o DJEN

O Diario de Justica Eletronico Nacional (DJEN) e o instrumento nacional de publicacao de atos judiciais no ambito do Poder Judiciario, regulamentado pelo CNJ. Pela Resolucao CNJ n. 455/2022, o DJEN e parte do ecossistema do Portal de Servicos do Poder Judiciario / PDPJ-Br e substitui os diarios eletronicos dos tribunais como meio de publicacao oficial, observadas as regras de implantacao e os casos em que a lei exige vista ou intimacao pessoal.

Finalidade:

- publicar atos judiciais em ambiente nacional;
- centralizar publicacoes oficiais;
- padronizar a comunicacao processual;
- permitir consulta centralizada a atos publicados;
- apoiar a contagem de prazo a partir da publicacao oficial.

Abrangencia:

- nacional, vinculada ao CNJ/PDPJ-Br;
- depende da integracao/adocao pelos tribunais e sistemas processuais;
- coexiste com sistemas de processo e portais dos tribunais durante fases de transicao.

Relacao com CNJ:

- CNJ regulamenta o DJEN e o Domicilio Judicial Eletronico;
- CNJ tambem coordena PDPJ-Br, DataJud, PJe e servicos nacionais;
- a Resolucao CNJ n. 455/2022 e a base normativa principal para DJEN/Domicilio/Portal.

Diferenças importantes:

- DJEN: publicacao oficial/comunicacao. Fonte para recortes/intimacoes publicadas.
- DataJud: base nacional de metadados processuais e movimentacoes, voltada a estatistica/transparencia/pesquisa. Nao e diario.
- PJe: sistema de tramitacao processual eletronica usado por varios tribunais.
- e-SAJ: sistema de tramitacao usado por alguns tribunais estaduais.
- Projudi: sistema de processo eletronico adotado por alguns tribunais.
- SEEU: sistema de execucao penal.
- Diarios dos tribunais: diarios locais/legados. O DJEN tende a centralizar/substituir, mas a transicao pode variar por tribunal.

## 2. Disponibilidade de API

### O que foi identificado

Existe endpoint publico em uso para consulta de comunicacoes:

`https://comunicaapi.pje.jus.br/api/v1/comunicacao`

Esse endpoint e utilizado pelo LexFlow hoje como fonte DJEN/CNJ. Porem, ate este estudo, nao localizamos documentacao oficial publica completa do endpoint com contrato OpenAPI/Swagger, limites, SLA e lista oficial de filtros. Portanto:

- existe endpoint publico observavel;
- nao devemos tratar parametros nao testados como contrato oficial;
- precisamos manter testes automatizados de compatibilidade;
- precisamos documentar empiricamente os campos retornados;
- para producao critica, ideal e obter documentacao/termo de uso oficial ou canal CNJ/PDPJ.

### Autenticacao

Para comunicacoes publicas, o endpoint em uso responde sem token. Para dados restritos, sigilosos, documentos nao publicados, confirmacao de ciencia ou acesso a autos, o caminho nao deve ser o DJEN publico. Deve-se usar fonte autenticada/autorizada:

- Portal/servico do tribunal;
- Domicilio Judicial Eletronico;
- PDPJ/SSO;
- certificado digital;
- token/API oficial quando disponivel.

### Filtros a validar e suportar no LexFlow

Filtros que o LexFlow deve tratar como prioritarios:

- OAB: UF + numero;
- data de disponibilizacao inicial/final;
- tribunal;
- numero do processo;
- nome da parte;
- nome do advogado;
- tipo de comunicacao;
- pagina/tamanho, se houver paginacao.

Observacao: OAB e data sao os filtros mais importantes para o MVP porque simulam o trabalho dos recortes. Busca por parte/processo pode depender da exposicao do endpoint e da forma de indexacao.

### Limites de requisicoes

Nao foi encontrada documentacao oficial publica com rate limit. Recomendacao LexFlow:

- sincronizar em janelas pequenas;
- usar cache por tenant/OAB/data;
- aplicar backoff exponencial;
- registrar HTTP status, tempo de resposta e payload parcial;
- evitar consulta agressiva;
- manter uma fila de sincronizacao por escritorio.

## 3. Dados Disponiveis

O LexFlow deve mapear a comunicacao DJEN para uma entidade `publicacoes`.

Campos esperados/necessarios:

- data de disponibilizacao;
- data considerada como publicacao;
- tribunal;
- orgao julgador;
- numero do processo;
- classe/assunto se vier na comunicacao ou via DataJud;
- nomes das partes quando publicos;
- nome/OAB do advogado quando publicos;
- texto da publicacao;
- tipo da comunicacao;
- link/fonte oficial quando houver;
- meio de intimacao;
- origem: DJEN;
- status de restricao/sigilo;
- hash de deduplicacao;
- payload bruto para auditoria.

Campos que nao devem ser presumidos:

- prazo fatal calculado;
- ciencia/confirmacao de leitura;
- conteudo sigiloso;
- documentos anexos;
- movimentacao completa do processo.

Conclusao: o DJEN entrega a comunicacao. O prazo deve ser calculado pelo LexFlow com base normativa, datas, calendario e tipo de ato.

## 4. Limitacoes

O DJEN nao e um sistema completo de andamento processual. Ele tende a trazer comunicacoes oficiais/publicacoes, nao a linha do tempo integral do processo.

Limitacoes principais:

- tribunais podem estar em fases diferentes de integracao;
- dados restritos nao devem aparecer integralmente;
- algumas publicacoes indicam apenas que arquivos nao sao publicos;
- textos podem vir sem estrutura ideal;
- parte/cliente pode nao vir limpo;
- advogado monitorado pode aparecer no texto e nao deve ser confundido com cliente;
- prazo nao vem necessariamente calculado;
- feriados locais, suspensoes, indisponibilidades e regras especiais exigem motor proprio;
- segredo de justica exige fonte autenticada;
- automacao deve respeitar termos de uso, LGPD, sigilo profissional e credenciais autorizadas.

## 5. Comparacao com ControlJus/Aviso Urgente

ControlJus entrega pronto:

- recorte ja encontrado;
- agrupamento por advogado/escritorio;
- possivel normalizacao de processo/cliente;
- origem do recorte;
- exportacoes;
- alertas/rotina operacional dependendo do plano;
- intermediacao humana ou curadoria em alguns fluxos.

DJEN entrega bruto:

- comunicacao/publicacao oficial;
- texto e metadados;
- dados publicos disponiveis;
- sem garantia de cliente limpo;
- sem prazo fatal pronto;
- sem workflow operacional.

LexFlow precisa construir:

- coletor resiliente;
- banco multi-tenant;
- deduplicacao;
- parser/normalizador;
- base de processos/clientes;
- motor de prazos;
- IA de classificacao;
- alertas;
- auditoria;
- calendario de feriados;
- tratamento de sigilo e fonte autenticada.

Funcionalidades inicialmente perdidas:

- curadoria humana do fornecedor;
- cobertura de fontes nao integradas ao DJEN;
- eventuais enriquecimentos proprietarios;
- historico consolidado do fornecedor.

Funcionalidades melhores no LexFlow:

- memoria de calculo do prazo;
- fundamento legal;
- confianca e risco;
- workflow de execucao;
- dashboards por escritorio;
- alertas por risco real;
- independencia de fornecedor;
- integraçao com DJEN, DataJud e portais autenticados.

## 6. Arquitetura Sugerida

Fluxo:

DJEN/CNJ -> Coletor de publicacoes -> Banco LexFlow -> Normalizador -> Motor de classificacao -> Motor normativo de prazos -> IA assistiva -> Prazos/Tarefas/Alertas -> Dashboard

Backend recomendado:

- Cloudflare Workers para borda, API leve, agenda e cache;
- banco relacional para producao: PostgreSQL/Supabase/Neon ou Cloudflare D1 se o escopo permanecer serverless;
- fila: Cloudflare Queues, BullMQ ou job scheduler;
- armazenamento de payload bruto: R2/S3 quando crescer;
- secrets por tenant para APIs e tokens.

Rotina de sincronizacao:

- por tenant;
- por OAB monitorada;
- janela incremental por data de disponibilizacao;
- frequencia inicial: diaria + botao manual;
- evoluir para 1h/2h em horario comercial;
- idempotencia por hash.

Controle de duplicidade:

Hash recomendado:

`source + tribunal + processo + dataDisponibilizacao + tipoComunicacao + hash(textoNormalizado)`

Logs:

- inicio/fim da sincronizacao;
- OAB consultada;
- filtros usados;
- quantidade retornada;
- quantidade criada;
- quantidade atualizada;
- erros HTTP;
- payload bruto parcial;
- versao do parser.

Auditoria:

- quem sincronizou;
- quando;
- origem;
- alteracoes em prazo;
- calculo/recalculo;
- fundamento usado;
- mudanca manual;
- acesso a dados restritos.

## 7. Modelo de Banco de Dados

Tabelas principais:

### escritorios

- id
- nome
- plano
- status
- criado_em
- limite_usuarios
- limite_processos

### usuarios

- id
- tenant_id
- nome
- email
- senha_hash
- perfil
- status
- criado_em

### advogados

- id
- tenant_id
- nome
- oab_uf
- oab_numero
- ativo

### processos

- id
- tenant_id
- numero_cnj
- tribunal
- orgao_julgador
- classe
- assunto
- area_direito
- status
- sigiloso
- criado_em

### partes

- id
- tenant_id
- processo_id
- nome
- tipo_polo
- documento_hash
- papel

### publicacoes

- id
- tenant_id
- source
- source_id
- processo_id
- numero_processo
- tribunal
- orgao_julgador
- data_disponibilizacao
- data_publicacao
- tipo_comunicacao
- texto
- texto_hash
- advogado_monitorado_id
- restrito
- restricao_motivo
- payload_json
- status
- criado_em

### prazos

- id
- tenant_id
- processo_id
- publicacao_id
- data_base
- data_inicio_contagem
- prazo_fatal
- dias
- tipo_contagem
- area_direito
- ato_processual
- regra_id
- fundamento
- confianca
- status_calculo
- status_execucao
- responsavel_id
- memoria_calculo_json
- criado_em

### tarefas

- id
- tenant_id
- processo_id
- publicacao_id
- prazo_id
- titulo
- descricao
- prioridade
- status
- responsavel_id
- data_limite

### audiencias

- id
- tenant_id
- processo_id
- data
- hora
- tipo
- modalidade
- link
- status
- responsavel_id

### tribunais

- id
- codigo
- nome
- ramo
- uf
- integrado_djen
- fonte_autenticada

### logs_integracao

- id
- tenant_id
- integracao
- status
- filtros_json
- retorno_json
- erro
- iniciado_em
- finalizado_em

### audit_log

- id
- tenant_id
- usuario_id
- acao
- entidade
- entidade_id
- antes_json
- depois_json
- criado_em

## 8. Fluxo Operacional no LexFlow

1. Nova publicacao encontrada no DJEN.
2. Salvar payload bruto.
3. Gerar hash e verificar duplicidade.
4. Normalizar processo, tribunal, OAB, partes e texto.
5. Verificar se e restrita/sigilosa.
6. Classificar area do direito e tipo de ato.
7. Consultar base normativa de prazos.
8. Calcular prazo sugerido quando houver regra.
9. Atribuir confianca.
10. Criar prazo automaticamente se confianca media/alta.
11. Marcar revisao recomendada se baixa confianca/dado incompleto.
12. Criar tarefa/checklist.
13. Definir prioridade.
14. Alertar responsaveis.
15. Acompanhar ate cumprimento/conclusao.

## 9. IA Aplicada

IA no LexFlow deve ser assistiva e explicavel:

- resumir publicacao;
- identificar tipo de ato;
- extrair parte, advogado, tribunal e orgao;
- classificar area do direito;
- sugerir ato processual;
- escolher regra candidata;
- indicar prazo;
- explicar fundamento;
- apontar incerteza;
- criar checklist;
- sugerir responsavel;
- alertar risco de perda de prazo.

O motor de prazo nao deve ser apenas IA generativa. Deve combinar:

- regras normativas estruturadas;
- calendario;
- dados do processo;
- IA para classificacao;
- memoria de calculo auditavel.

## 10. MVP

Fase 1 - Consulta manual/semi-automatica:

- consulta por OAB e data;
- gravar publicacoes;
- mostrar origem DJEN;
- deduplicar;
- detectar sigilo.

Fase 2 - Importacao diaria:

- scheduler;
- logs;
- cache;
- falha/retry;
- status por OAB.

Fase 3 - Classificacao com IA:

- resumo;
- tipo de ato;
- area;
- risco;
- cliente/parte.

Fase 4 - Prazos e tarefas:

- base normativa inicial;
- calculo automatico;
- confianca;
- tarefa/checklist;
- alerta.

Fase 5 - Dashboard executivo:

- vencidos;
- hoje;
- proximos 7 dias;
- publicacoes sem regra;
- restritos;
- sincronizacoes com erro.

Fase 6 - Substituicao gradual do ControlJus:

- rodar paralelo por 30/60 dias;
- comparar resultados;
- mapear divergencias;
- consolidar fontes faltantes;
- desligar ControlJus por escritorio quando cobertura for aceitavel.

## 11. Riscos

Tecnicos:

- API instavel ou sem contrato oficial;
- mudanca de payload;
- rate limit nao documentado;
- tribunais nao integrados;
- dados incompletos;
- segredo de justica;
- falha de sincronizacao;
- duplicidade;
- timezone/data de publicacao;
- feriados e suspensoes.

Juridicos:

- LGPD;
- sigilo processual;
- uso indevido de credenciais;
- responsabilidade por prazo errado;
- necessidade de termo de responsabilidade;
- logs contendo dados sensiveis.

Operacionais:

- advogado confiar sem conferir risco;
- OAB cadastrada errada;
- processo sem cliente associado;
- regra de prazo especifica nao mapeada;
- feriado local ausente;
- indisponibilidade do tribunal.

## 12. Plano de Acao

### O que precisamos descobrir

- contrato oficial/documentacao do endpoint DJEN/Comunica API;
- lista oficial de filtros e campos;
- limites de requisicao;
- tribunais efetivamente integrados por ramo;
- estrategia autorizada para segredo de justica;
- regras de feriados/suspensoes por tribunal;
- se existe API autenticada do Domicilio/PDPJ para escritorio.

### O que precisamos testar

- consulta por OAB GO/DF;
- consulta por data;
- consulta por processo;
- paginacao;
- resposta vazia;
- erro/rate limit;
- publicacao restrita;
- diferenca entre data de disponibilizacao e publicacao;
- duplicidade DJEN x ControlJus.

### O que precisamos construir

- coletor DJEN robusto;
- banco persistente multi-tenant;
- base de regras de prazo;
- motor de calendario;
- painel de sincronizacao;
- auditoria;
- alertas;
- integracao autenticada para restritos.

### Primeiro prototipo

Criar um job diario por tenant/OAB:

1. consulta DJEN por OAB e janela de datas;
2. salva payload bruto;
3. deduplica;
4. classifica area/ato;
5. calcula prazo quando houver regra;
6. cria alerta quando nao houver regra ou houver restricao;
7. exibe no dashboard.

### Caminho mais seguro para tirar dependencia do ControlJus

1. Rodar DJEN e ControlJus em paralelo.
2. Criar tabela de divergencias.
3. Medir cobertura por OAB/tribunal.
4. Corrigir regras de prazo.
5. Integrar DataJud para enriquecer classe/assunto/movimentacoes.
6. Integrar fontes autenticadas para segredo de justica.
7. Desligar ControlJus por escritorio somente quando a cobertura estiver comprovada.

## Fontes Oficiais e Observacoes

- Resolucao CNJ n. 455/2022: https://atos.cnj.jus.br/atos/detalhar/4509
- DataJud - Portal CNJ: https://www.cnj.jus.br/sistemas/datajud/
- Comunica API em uso tecnico pelo LexFlow: https://comunicaapi.pje.jus.br/api/v1/comunicacao

Observacao importante: o endpoint Comunica API esta em uso tecnico e acessivel para consultas publicas, mas este estudo nao encontrou documentacao oficial publica completa de contrato, SLA, rate limit e OpenAPI. O LexFlow deve tratar isso como risco tecnico ate obter confirmacao/documentacao oficial.
