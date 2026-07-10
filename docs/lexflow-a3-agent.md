# LexFlow - Agente Local A3

Atualizado em: 2026-07-10

## Decisao tecnica

O certificado digital A3/token fisico nao pode ser consumido diretamente por um Cloudflare Worker, porque o token fica conectado por USB ao computador do advogado e depende de driver, navegador, middleware do certificado e PIN local.

Portanto, o fluxo correto e:

1. LexFlow SaaS identifica publicacao restrita.
2. Usuario clica em `Abrir A3`.
3. LexFlow chama um protocolo/endpoint local, por exemplo `lexflow-a3://open`.
4. O Agente Local LexFlow A3 roda no computador do escritorio.
5. O agente abre a fonte autenticada do tribunal usando o certificado instalado.
6. O arquivo/documento autorizado e visualizado localmente ou sincronizado de volta ao LexFlow quando houver permissao.

## O que o SaaS guarda

- URL/protocolo do agente local.
- Status informado do agente.
- Tribunais permitidos.
- Exigencia de consentimento antes de abrir fonte autenticada.

## O que o SaaS nao deve guardar

- PIN do certificado A3.
- Chave privada.
- Senha do token.
- Arquivo de certificado inexistente no caso A3.

## Payload inicial enviado ao agente

Campos enviados por query string:

- `action`: `open_restricted_file`
- `processo`
- `tribunal`
- `publicacaoId`
- `origem`
- `motivo`
- `tenantId`

## Exemplo

```text
lexflow-a3://open?action=open_restricted_file&processo=5588081-07.2026.8.09.0012&tribunal=TJGO&origem=DJEN
```

## Proximo passo de implementacao

Construir o Agente Local em uma destas opcoes:

- Electron/Tauri: melhor experiencia de instalacao e protocolo customizado.
- Node local + Playwright: mais simples para prototipo, escutando em `http://127.0.0.1:48731`.
- Extensao de navegador: util quando o fluxo depende fortemente da sessao do navegador.

## Regras de seguranca

- Todo acesso restrito deve gerar log.
- O usuario precisa autorizar o acesso.
- O PIN fica somente no fluxo local.
- O agente deve aceitar comandos apenas de `https://lexflow.reinaldo-bueno.workers.dev`.
- O agente deve validar processo, tribunal e tenant antes de abrir fonte autenticada.
- Documentos sigilosos nao devem ser enviados ao SaaS sem consentimento explicito do escritorio.
