# Manual Operacional LexFlow

## 1. Objetivo do sistema

O LexFlow é um SaaS jurídico para centralizar publicações, recortes, prazos, audiências, tarefas, alertas e histórico processual.

A proposta é reduzir a dependência de intermediadores como ControlJus/Aviso Urgente, usando fontes oficiais e conectadas, principalmente:

- DJEN/CNJ;
- ControlJus como fonte complementar autorizada;
- portais autenticados dos tribunais quando houver restrição;
- certificado digital A3 no computador do advogado;
- motor LexFlow de classificação, cálculo assistivo de prazo e cobrança operacional.

O LexFlow não deve ser usado como simples planilha. Ele deve funcionar como rotina de gestão: sincronizar, interpretar, atribuir responsável, acompanhar status e preservar histórico.

## 2. Conceitos principais

### Tenant / escritório

Cada escritório é um tenant. Todos os dados pertencem a um TenantID:

- usuários;
- processos;
- publicações;
- prazos;
- audiências;
- tarefas;
- configurações;
- logs;
- integrações.

O advogado só vê o próprio escritório. O Administrador Master pode ver todos para suporte e gestão da plataforma.

### Publicação / recorte

É a comunicação recebida de uma fonte conectada, como DJEN ou ControlJus. A publicação ainda não é necessariamente um prazo. Ela precisa ser analisada.

### Prazo

É uma obrigação com data fatal. Pode vir de fonte externa ou ser sugerido pelo motor LexFlow.

### Tarefa

É uma providência operacional. Pode nascer de publicação, prazo, audiência ou cadastro direto.

### Acervo

É a visão histórica por processo. Mostra tudo que já foi carregado/criado no LexFlow para aquele processo.

Importante: o acervo não inventa histórico. Se o período anterior não foi sincronizado, ele aparece como lacuna de cobertura.

## 3. Rotina diária recomendada

1. Entrar no LexFlow.
2. Abrir o Dashboard Executivo.
3. Clicar em "Sincronizar fontes".
4. Verificar se DJEN e fontes privadas sincronizaram.
5. Atacar primeiro:
   - prazos vencidos;
   - prazos que vencem hoje;
   - publicações restritas;
   - itens sem responsável.
6. Abrir Publicações / Processos.
7. Para cada publicação:
   - verificar origem;
   - abrir análise;
   - gerar prazo quando aplicável;
   - criar tarefa quando não houver prazo direto;
   - atribuir responsável;
   - marcar status.
8. Conferir a tela de Prazos.
9. Enviar itens relevantes para agenda ou WhatsApp.
10. Acompanhar tarefas no Kanban.
11. Arquivar ou desconsiderar itens que não devem permanecer ativos.

## 4. Dashboard Executivo

O Dashboard é a tela de comando do dia.

Use os cards para filtrar a fila crítica:

- Prazos vencidos;
- Vencem hoje;
- Próximos 3 dias;
- Próximos 7 dias;
- Publicações sem tratamento;
- Publicações restritas;
- Tarefas sem responsável;
- Audiências próximas;
- Itens críticos.

Ao clicar em um card, o LexFlow mostra somente os itens daquele status ou risco.

Boa prática: nenhum item crítico deve ficar sem responsável.

## 5. Publicações / Processos

Essa tela mostra publicações vindas de fontes conectadas.

Colunas principais:

- data da publicação;
- origem;
- cliente / parte;
- advogado monitorado;
- processo;
- tribunal;
- tipo;
- texto da publicação;
- prazo / inteligência;
- tratamento.

### Origem

Pode ser:

- DJEN;
- ControlJus;
- futura fonte autenticada.

### Publicações restritas

Quando o texto público indica segredo de justiça, arquivo indisponível ou documento não publicado, o LexFlow marca restrição.

Nesses casos, o conteúdo completo depende de:

- acesso autorizado ao tribunal;
- Domicílio Judicial / PDPJ;
- certificado A3;
- portal específico do tribunal.

### Como tratar uma publicação

1. Leia o resumo.
2. Clique em "Ver análise".
3. Confira a sugestão do LexFlow:
   - ato identificado;
   - área inferida;
   - fundamento;
   - prazo sugerido;
   - confiança;
   - restrições.
4. Se gerar prazo, clique em "Gerar prazo".
5. Se não gerar prazo, clique em "Criar tarefa".
6. Atribua responsável na própria linha.
7. Atualize o status.

## 6. Prazos

A tela de Prazos é a tela de execução.

Ela mostra:

- cliente;
- processo;
- tribunal;
- origem;
- publicação;
- tipo de prazo;
- confiança;
- prazo fatal;
- dias restantes;
- responsável;
- status;
- prioridade;
- ações.

### Status sugeridos

- Novo;
- Em análise;
- Em elaboração;
- Aguardando revisão;
- Protocolar;
- Concluído;
- Vencido;
- Arquivado.

### Responsável

O responsável pode ser informado direto na linha. Não é necessário abrir o editor.

Se o prazo for crítico, o LexFlow deve impedir avanço irresponsável sem atribuição.

### Canais de ação

Cada prazo pode ser enviado para:

- Google Agenda;
- Outlook;
- arquivo ICS;
- WhatsApp.

## 7. O que é ICS

ICS é um arquivo universal de calendário.

Quando o usuário baixa e abre um ICS, o compromisso pode ser adicionado em:

- Google Agenda;
- Outlook;
- Apple Calendar;
- agenda do celular;
- outros calendários compatíveis.

É útil quando o escritório não quer conectar OAuth do Google/Microsoft no LexFlow.

## 8. WhatsApp

No MVP, o botão WhatsApp abre uma mensagem pronta no WhatsApp Web ou app.

O usuário revisa e envia manualmente.

Envio automático futuro exige:

- API oficial ou provedor autorizado;
- número aprovado;
- opt-in do destinatário;
- logs;
- regras por tenant;
- controle de templates e consentimento.

## 9. Agenda

Hoje o LexFlow suporta:

- link Google Agenda;
- link Outlook;
- download ICS.

Configuração disponível:

- provedor destacado;
- horário padrão para prazos/tarefas;
- lembrete padrão no ICS.

Fase futura:

- OAuth Google por escritório;
- OAuth Microsoft por escritório;
- criação automática de eventos;
- logs de sincronização;
- revogação de permissão.

## 10. Tarefas e Kanban

Tarefas representam providências operacionais.

Podem nascer de:

- publicação;
- prazo;
- audiência;
- cadastro direto.

O Kanban pode ter colunas personalizadas. Sugestão inicial:

- Aberta;
- Em andamento;
- Aguardando terceiro;
- Revisão;
- Concluída.

### Desconsiderar tarefa

Se uma tarefa foi criada por engano, use "Desconsiderar".

Ela sai da visão ativa, mas continua preservada para histórico/auditoria.

Para consultar depois, marque "Mostrar arquivadas".

## 11. Audiências / Agenda

Use para controlar:

- data;
- horário;
- processo;
- cliente;
- tribunal;
- modalidade;
- link;
- responsável;
- status.

Cada audiência pode ser enviada para agenda ou WhatsApp.

Após a realização, atualize o status para manter o dashboard limpo.

## 12. Alertas

Alertas agrupam riscos:

- prazos aguardando validação;
- prazos com revisão recomendada;
- prazos vencidos;
- prazos que vencem hoje;
- publicações restritas;
- publicações sem análise;
- audiências próximas;
- itens sem responsável.

O alerta não é um cadastro separado. Ele reflete dados das outras telas.

Para resolver um alerta, corrija o item de origem.

## 13. Base de Prazos

A Base de Prazos reúne:

- normas oficiais;
- regras assistivas;
- fundamentos legais;
- confiança do cálculo;
- contagem em dias úteis ou corridos;
- observações de risco.

O motor LexFlow deve sugerir prazos com base em:

- área do processo;
- tribunal;
- vara;
- tipo de ato;
- texto da publicação;
- fundamento legal;
- termo inicial;
- restrições;
- feriados e exceções quando disponíveis.

Quando a confiança for baixa, o prazo deve ser marcado como revisão recomendada.

## 14. Histórico / Acervo

O acervo mostra processos que já possuem dados no LexFlow.

Ele apresenta:

- processos no acervo;
- ativos;
- encerrados/arquivados;
- eventos auditados;
- primeiro registro carregado;
- último registro carregado;
- meses com dados;
- filtro por mês/ano.

### Meses anteriores

Se o sistema mostra apenas junho/2026 em diante, isso significa que só esse período está carregado.

Para meses e anos anteriores, será necessária carga histórica:

- DJEN/CNJ por OAB e intervalo;
- ControlJus retroativo, se autorizado;
- busca por número de processo;
- portal autenticado quando houver segredo.

## 15. Integrações

### DJEN/CNJ

Fonte oficial pública para comunicações processuais. O LexFlow consulta por OAB e data.

Limitação: publicações restritas ou documentos sigilosos podem não trazer o conteúdo completo.

### ControlJus

Fonte privada complementar. Não deve ser o centro do produto.

Uso recomendado:

- transição;
- comparação;
- validação;
- cobertura enquanto a integração oficial amadurece.

### Certificado A3

O Cloudflare não acessa token USB.

O fluxo correto é:

1. o advogado entra no LexFlow na nuvem;
2. o token físico está plugado no computador dele;
3. ao abrir uma publicação restrita, o LexFlow direciona para a fonte autenticada no navegador;
4. o certificado é usado localmente pelo navegador/driver do advogado;
5. o PIN não é salvo no LexFlow.

## 16. Configurações

Cada escritório deve configurar suas próprias integrações.

Áreas:

- ControlJus;
- DJEN;
- OABs monitoradas;
- Agenda;
- A3;
- futuras notificações.

Nunca usar chave fixa global para clientes diferentes.

## 17. Usuários e perfis

Perfis iniciais:

- Administrador Master;
- Administrador;
- Advogado;
- Assistente.

Regras:

- Master enxerga todos os tenants;
- advogado enxerga somente seu escritório;
- assistente também fica restrito ao tenant;
- usuário inativo não deve operar.

## 18. Implantação em um novo escritório

Checklist:

1. Criar contrato/escritório.
2. Criar usuários.
3. Configurar OABs monitoradas.
4. Configurar fontes autorizadas.
5. Testar sincronização DJEN.
6. Testar ControlJus se houver.
7. Configurar agenda.
8. Testar abertura de publicação restrita com A3.
9. Rodar primeira carga.
10. Conferir Dashboard.
11. Atribuir responsáveis.
12. Explicar Kanban e fluxo de prazos.
13. Definir rotina diária.

## 19. Regras de operação segura

- Nunca considerar ausência de dado como inexistência de processo.
- Nunca apagar item crítico; arquivar ou desconsiderar.
- Sempre atribuir responsável a prazo fatal.
- Toda sugestão de prazo deve ter memória de cálculo.
- Conteúdo restrito deve ser tratado com fonte autenticada.
- Toda integração deve registrar logs.
- Toda consulta deve respeitar TenantID.

## 20. Roadmap operacional

Próximas entregas recomendadas:

1. Backfill histórico por OAB e período.
2. Histórico por fonte e cobertura.
3. WhatsApp via API oficial por tenant.
4. OAuth Google/Microsoft por escritório.
5. Motor de prazos com mais códigos e feriados.
6. Busca por número de processo em fontes oficiais.
7. Relatórios PDF.
8. SLA de tratamento por responsável.
9. Auditoria completa de decisões do motor.
10. Painel de consumo de integrações.
