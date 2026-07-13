# LexFlow - Acesso autenticado com A3

Atualizado em: 2026-07-10

## Decisao tecnica

O LexFlow deve continuar 100% SaaS. O advogado acessa a aplicacao pela nuvem, com login e senha, e usa o token/certificado A3 conectado na propria maquina quando o tribunal solicitar autenticacao.

Um Cloudflare Worker nao acessa USB, token fisico, driver local, middleware do certificado nem PIN. Portanto, o fluxo padrao nao depende de pasta local, `npm`, agente instalado ou localhost.

## Fluxo padrao em nuvem

1. LexFlow identifica uma publicacao restrita.
2. Usuario clica em `Abrir fonte oficial`.
3. LexFlow registra a solicitacao no backend em `/api/a3/requests`.
4. O backend grava tenant, usuario, processo, tribunal, origem, motivo e `requestId`.
5. O backend devolve `browserLaunchUrl`, com a URL oficial da publicacao/tribunal.
6. O navegador do usuario abre a fonte oficial em nova aba.
7. Se o tribunal exigir certificado, o navegador e o driver local acionam o token A3.
8. O PIN e informado somente na maquina do advogado, fora do LexFlow.

## O que o SaaS guarda

- Registro auditado da tentativa de abertura.
- Tenant e usuario que solicitou.
- Processo, tribunal, origem e motivo da restricao.
- URL oficial usada para abrir a fonte.
- Horario da solicitacao.

## O que o SaaS nao guarda

- PIN do certificado A3.
- Chave privada.
- Senha do token.
- Conteudo sigiloso baixado sem autorizacao explicita.
- Arquivo de certificado A3, pois A3 e token fisico.

## Limitacao importante

Este fluxo resolve o acesso pelo advogado, mas nao permite que o Worker leia automaticamente documentos restritos. Para o LexFlow capturar o conteudo restrito automaticamente, sera necessario um dos caminhos abaixo:

- API oficial do tribunal/CNJ com autenticacao adequada.
- Certificado A1 autorizado pelo escritorio, quando juridicamente e operacionalmente viavel.
- Agente local/desktop opcional, se o escritorio aceitar instalacao para automacao.
- Integracao especifica por tribunal, respeitando termos de uso, sigilo e permissao do cliente.

## Payload registrado

Campos principais gravados em `/api/a3/requests`:

- `action`: `open_restricted_file`
- `requestId`
- `processo`
- `tribunal`
- `publicacaoId`
- `origem`
- `motivo`
- `tenantId`
- `sourceUrl`
- `actorUserId`
- `actorEmail`

## Agente local opcional

O prototipo `tools/a3-local-agent.mjs` fica mantido apenas como alternativa avancada. Ele nao e requisito para o advogado testar o LexFlow na nuvem.

Usar somente se futuramente for necessario automatizar navegacao local autorizada:

```bash
npm run a3:agent
```

## Criterios de seguranca

- Todo acesso restrito deve gerar log.
- O usuario precisa confirmar antes de abrir fonte autenticada.
- O PIN nunca entra no LexFlow.
- O documento restrito nao deve ser importado para o SaaS sem autorizacao expressa.
- Quando a publicacao nao tiver `sourceUrl`, o sistema deve informar que nao ha link oficial mapeado.
