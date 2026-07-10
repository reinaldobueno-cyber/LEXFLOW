# LexFlow - Direcao de Design

Atualizado em: 2026-07-10

## Objetivo visual

O LexFlow deve parecer um SaaS juridico premium, confiavel e operacional. A interface precisa transmitir:

- controle de risco;
- clareza para tomada de decisao;
- densidade informacional sem poluicao;
- seguranca para escritorio de advocacia;
- maturidade de produto comercial.

## Principios

- Priorizar leitura rapida de prazo, risco, origem e responsavel.
- Evitar estetica de planilha ou sistema improvisado.
- Usar cards apenas para indicadores, grupos de configuracao e itens repetidos.
- Manter tabelas densas, alinhadas e escaneaveis.
- Usar cor como semaforo operacional, nao como decoracao.
- Evitar fundos bege, excesso de sombra e bordas arredondadas demais.

## Paleta

- Fundo principal: `#F7F8FB`
- Superficie: `#FFFFFF`
- Texto principal: `#111827`
- Texto secundario: `#667085`
- Linha/borda: `#E4E7EC`
- Sidebar: `#101828`
- Marca/acento juridico: `#8A2438`
- Acao informativa: `#2864A6`
- Sucesso: `#23845A`
- Risco: `#C24135`
- Atencao: `#D9822B`

## Componentes

### Sidebar

- Fundo escuro solido.
- Navegacao com item ativo evidente.
- Badges pequenos, discretos e consistentes.
- Logo sempre visivel.

### Dashboard

- Cards de indicadores com borda superior colorida.
- Numeros grandes, labels curtas.
- Clique no card filtra a tela correspondente.

### Tabelas

- Cabecalho fixo claro.
- Linhas com hover sutil.
- Status em pills.
- Origem da publicacao sempre visivel.
- Acoes alinhadas e compactas.

### Formularios

- Campos com borda clara, foco azul discreto.
- Blocos de configuracao separados por titulo.
- Segredos e tokens nunca exibidos.

### Modais

- Raio maximo de 8px.
- Header, body e footer bem separados.
- Acoes primarias sempre a direita.

## Proximas melhorias visuais

- Substituir caracteres soltos de acao por icones consistentes.
- Criar tela de detalhes de publicacao com layout proprio.
- Criar componente de memoria de calculo mais visual.
- Melhorar responsividade das tabelas em mobile.
- Criar estado vazio especifico por modulo.
