# LexFlow - Agente Local A3

Atualizado em: 2026-07-10

## Decisao tecnica

O certificado digital A3/token fisico nao pode ser consumido diretamente por um Cloudflare Worker, porque o token fica conectado por USB ao computador do advogado e depende de driver, navegador, middleware do certificado e PIN local.

Portanto, o fluxo correto e:

1. LexFlow SaaS identifica publicacao restrita.
2. Usuario clica em `Abrir A3`.
3. LexFlow registra a solicitacao no backend em `/api/a3/requests`.
4. O backend grava auditoria, tenant, usuario, processo, tribunal e `requestId`.
5. LexFlow chama o endpoint local, por padrao `http://127.0.0.1:48731/open`.
6. O Agente Local LexFlow A3 roda no computador do escritorio.
7. O agente abre a fonte autenticada do tribunal usando o certificado instalado.
8. O arquivo/documento autorizado e visualizado localmente ou sincronizado de volta ao LexFlow quando houver permissao explicita.

## O que o SaaS guarda

- URL/protocolo do agente local.
- Status informado do agente.
- Tribunais permitidos.
- Exigencia de consentimento antes de abrir fonte autenticada.
- Historico/auditoria das solicitacoes A3.

## O que o SaaS nao deve guardar

- PIN do certificado A3.
- Chave privada.
- Senha do token.
- Arquivo de certificado inexistente no caso A3.

## Payload inicial enviado ao agente

Campos enviados por query string:

- `action`: `open_restricted_file`
- `requestId`
- `processo`
- `tribunal`
- `publicacaoId`
- `origem`
- `motivo`
- `tenantId`
- `sourceUrl`
- `lexflowUrl`

## Exemplo

```text
http://127.0.0.1:48731/open?action=open_restricted_file&requestId=...&processo=5588081-07.2026.8.09.0012&tribunal=TJGO&origem=DJEN
```

## Prototipo local implementado

Rodar no computador onde o certificado/token A3 esta conectado:

```bash
npm run a3:agent
```

O agente sobe em:

```text
http://127.0.0.1:48731
```

Configurar no LexFlow:

```text
http://127.0.0.1:48731/open
```

Rotas locais:

- `GET /health`: verifica se o agente esta ativo.
- `GET /open?...`: recebe solicitacao do LexFlow e abre a URL autenticada quando `sourceUrl` estiver disponivel.

## Proximos passos de implementacao

Construir o Agente Local em uma destas opcoes:

- Electron/Tauri: melhor experiencia de instalacao e protocolo customizado.
- Node local + navegador local: prototipo inicial ja criado em `tools/a3-local-agent.mjs`.
- Node local + Playwright: proxima evolucao quando for preciso automatizar navegacao dentro do tribunal.
- Extensao de navegador: util quando o fluxo depende fortemente da sessao do navegador.

## Regras de seguranca

- Todo acesso restrito deve gerar log.
- O usuario precisa autorizar o acesso.
- O PIN fica somente no fluxo local.
- O agente deve aceitar comandos apenas de `https://lexflow.reinaldo-bueno.workers.dev` ou ambiente local autorizado.
- O agente deve validar processo, tribunal e tenant antes de abrir fonte autenticada.
- Documentos sigilosos nao devem ser enviados ao SaaS sem consentimento explicito do escritorio.
