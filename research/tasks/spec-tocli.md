# Spec: tocli — Context-Efficient CLI Protocol for AI Agents

## 0. Visão do Projeto

O ecossistema MCP tem um problema estrutural: **quanto mais tools você conecta, pior o AI fica**. O GitHub MCP server sozinho consome 46K-55K tokens. 5 servers conectados queimam 30-60K tokens antes do usuário digitar qualquer coisa. Com 50+ tools, accuracy cai pra 60%.

Soluções como Deferred Tools, Lazy-MCP e RAG-MCP são band-aids — reduzem o sintoma mas não resolvem o problema arquitetural: **MCP injeta schemas inteiros no contexto pra descrever capacidades que um CLI resolve com stdout**.

O tocli é um **protocolo + runtime** que oferece uma alternativa fundamentalmente mais leve:

- **MCP**: 66 tool definitions do GitHub = 46K tokens no contexto
- **CLI**: `gh --help` = ~500 tokens, e o agent só carrega o que precisa sob demanda

### As 3 camadas

```
1. Protocolo (tocli-protocol)
   → Como CLIs se descrevem e são invocados por AI agents
   → Discovery progressivo: manifesto leve → detalhes sob demanda
   → Output tipado e streaming

2. Runtime (tocli)
   → Lê OpenAPI 3.x e expõe como CLI que fala o protocolo
   → Primeira implementação de referência

3. Bridge (tocli-bridge)
   → Wrappeia CLIs existentes no protocolo
   → Sem reescrever nada
```

### Princípio core: Context Budget

Toda decisão de design é filtrada por: **"quantos tokens isso consome no contexto do AI agent?"**

- Discovery em 2 fases: manifesto compacto (~100 tokens) + detalhes sob demanda
- Output com envelope que inclui resumo + dados completos separados
- Schemas referenciáveis, não duplicados

---

## 1. Problem Statement

**O que estamos resolvendo?**

AI agents (Claude Code, Cursor, Copilot, Codex) precisam interagir com APIs e ferramentas externas. Hoje existem duas opções:

1. **MCP servers** — rico em funcionalidade, mas consome contexto agressivamente (4-32x mais tokens que CLI pra mesma tarefa). Com muitos tools, accuracy despenca.
2. **CLI direto** — eficiente em tokens, mas sem padronização. O agent parseia `--help` como texto livre e torce pra entender.

Falta uma **terceira via**: a eficiência do CLI com a estruturação do MCP.

**Por que agora?**

- MCP está em adoção massiva, mas o problema de contexto tá escalando junto
- A própria Anthropic já implementou Deferred Tools como workaround — o problema é reconhecido
- context-mode (3.9K stars) prova que a comunidade tá buscando soluções ativamente
- SEP-1576 no MCP spec pede schema deduplication — o protocolo tá tentando se consertar
- Benchmark ScaleKit mostra CLI custando $3.20/mês vs MCP $55.20/mês pra mesma carga

---

## 2. User Stories

### US-1: Discovery progressivo (AI Agent)
**Como** um AI agent,
**Eu quero** descobrir as capacidades de um CLI de forma progressiva,
**Para que** eu consuma o mínimo de contexto necessário pra decidir qual comando usar.

**Acceptance Criteria:**
- [ ] Fase 1 — Manifesto: `tocli --discover` retorna JSON compacto (~100-200 tokens) com nome, descrição, lista de command groups (só nomes + one-liners)
- [ ] Fase 2 — Detalhe: `tocli --discover <group>` retorna comandos do grupo com params e tipos
- [ ] Fase 3 — Schema completo: `tocli --discover <group> <command>` retorna schema completo do comando específico
- [ ] O agent nunca precisa carregar todos os schemas de uma vez
- [ ] Formato de saída é JSON estruturado com campo `_meta.token_estimate`

### US-2: Gerar CLI a partir de OpenAPI (Runtime)
**Como** um desenvolvedor de API,
**Eu quero** apontar minha spec OpenAPI 3.x para o tocli,
**Para que** ele exponha minha API como CLI com discovery progressivo, sem escrever código.

**Acceptance Criteria:**
- [ ] Aceita spec OpenAPI 3.x em YAML ou JSON
- [ ] Aceita spec via path local ou URL remota
- [ ] Lê a spec em runtime e monta comandos dinamicamente
- [ ] Cada tag da spec vira um command group
- [ ] Cada operação (path + method) vira um subcomando
- [ ] O nome do comando é derivado do `operationId` (fallback: method + path segments)
- [ ] Implementa o protocolo de discovery progressivo (US-1)
- [ ] `--help` continua funcionando pra humanos

### US-3: Mapear parâmetros para flags
**Como** um usuário do CLI (humano ou AI agent),
**Eu quero** que os parâmetros da API virem flags tipadas,
**Para que** eu possa chamar qualquer endpoint com validação.

**Acceptance Criteria:**
- [ ] Path params viram argumentos posicionais ou flags obrigatórias
- [ ] Query params viram flags opcionais
- [ ] Header params viram flags (`--header-x-custom`)
- [ ] Request body aceita JSON inline (`--data '{...}'`) ou arquivo (`--data @payload.json`)
- [ ] Params `required` na spec são obrigatórios no CLI
- [ ] Tipos são validados (string, integer, boolean, enum)
- [ ] Enum values aparecem no help e no discovery schema

### US-4: Output com envelope (Context-Aware)
**Como** um AI agent,
**Eu quero** receber output estruturado com resumo separado dos dados completos,
**Para que** eu decida quanto contexto consumir.

**Acceptance Criteria:**
- [ ] Output padrão (humano): JSON pretty-print com cores
- [ ] `--output envelope`: retorna `{ summary: "...", data: [...], _meta: { count, truncated, total } }`
- [ ] `summary` é uma descrição textual curta do resultado (~50 tokens max)
- [ ] `--output json`: JSON compacto (pipe-friendly)
- [ ] `--output table`: formato tabular
- [ ] `--quiet`: só exit code
- [ ] `--verbose`: request/response completo (debug)
- [ ] `--max-items N`: limita itens retornados (paginação client-side)
- [ ] Respostas maiores que threshold (ex: 5KB) são automaticamente truncadas com `truncated: true`

### US-5: Autenticação
**Como** um usuário do CLI,
**Eu quero** autenticar de forma flexível,
**Para que** eu possa usar tanto flags rápidas quanto config persistente.

**Acceptance Criteria:**
- [ ] Flags inline: `--token`, `--api-key`, `--auth-header`
- [ ] Config persistente via `tocli auth login`
- [ ] Config salva em `~/.config/tocli/`
- [ ] `tocli auth logout` limpa credenciais
- [ ] `tocli auth status` mostra auth ativa
- [ ] Detecta `securitySchemes` da spec e configura automaticamente
- [ ] Flags inline têm prioridade sobre config salva
- [ ] Múltiplos perfis (`--profile staging`)
- [ ] Variáveis de ambiente suportadas (`$API_TOKEN`)

### US-6: Wrappear CLIs existentes (Bridge)
**Como** um usuário que já tem CLIs instalados,
**Eu quero** expor CLIs existentes via protocolo tocli,
**Para que** AI agents possam usá-los de forma eficiente sem MCP.

**Acceptance Criteria:**
- [ ] `tocli bridge <cli-name>` analisa um CLI instalado e gera manifesto
- [ ] Parseia `--help` e `man` pages pra inferir estrutura de comandos
- [ ] Gera manifesto editável (JSON/YAML) que o usuário pode refinar
- [ ] Com manifesto presente, o CLI passa a responder ao protocolo de discovery
- [ ] Funciona como proxy: `tocli bridge gh repos list` → executa `gh repos list`

### US-7: Uso e distribuição
**Como** um desenvolvedor,
**Eu quero** usar o tocli facilmente,
**Para que** eu comece rápido.

**Acceptance Criteria:**
- [ ] `npx tocli --spec ./openapi.yaml users list` funciona
- [ ] `npm install -g tocli` instala globalmente
- [ ] `tocli init` gera `.toclirc` com spec path e config padrão
- [ ] Com `.toclirc` presente, `tocli users list` funciona sem `--spec`
- [ ] `.toclirc` suporta: `spec`, `baseUrl`, `auth`, `environments`

---

## 3. O Protocolo (tocli-protocol)

### 3.1 Discovery em 3 fases

```bash
# Fase 1: Manifesto (~100-200 tokens)
$ tocli --discover
{
  "name": "petstore",
  "version": "1.0.0",
  "description": "Petstore API CLI",
  "groups": [
    { "name": "pets", "description": "Manage pets", "commands": 5 },
    { "name": "store", "description": "Store operations", "commands": 3 }
  ],
  "_meta": { "protocol": "tocli/1", "token_estimate": 85 }
}

# Fase 2: Group detail (~200-500 tokens)
$ tocli --discover pets
{
  "group": "pets",
  "commands": [
    { "name": "list", "description": "List pets", "method": "GET" },
    { "name": "get", "description": "Get pet by ID", "method": "GET", "args": ["id"] },
    { "name": "create", "description": "Create a pet", "method": "POST" },
    { "name": "update", "description": "Update a pet", "method": "PUT", "args": ["id"] },
    { "name": "delete", "description": "Delete a pet", "method": "DELETE", "args": ["id"], "destructive": true }
  ]
}

# Fase 3: Command schema completo (só quando necessário)
$ tocli --discover pets create
{
  "command": "pets.create",
  "description": "Create a new pet in the store",
  "params": [
    { "name": "name", "type": "string", "required": true, "description": "Pet name" },
    { "name": "tag", "type": "string", "required": false, "description": "Pet tag" },
    { "name": "status", "type": "enum", "values": ["available", "pending", "sold"], "default": "available" }
  ],
  "auth": { "required": true, "scheme": "bearer" },
  "output": { "type": "object", "schema": "Pet" }
}
```

### 3.2 Comparação de consumo de contexto

| Cenário | MCP | tocli |
|---|---|---|
| Conectar GitHub (66 tools) | ~46,000 tokens | ~150 tokens (manifesto) |
| Descobrir comandos de repos | (já carregado) | ~400 tokens (group detail) |
| Executar um comando | ~200 tokens | ~300 tokens (schema + invocação) |
| **Total pra 1 operação** | **~46,200 tokens** | **~850 tokens** |
| **10 operações no mesmo group** | **~46,200 tokens** | **~3,150 tokens** |

### 3.3 Output envelope

```bash
$ tocli pets list --output envelope --max-items 3
{
  "summary": "Found 42 pets. Showing first 3.",
  "data": [
    { "id": 1, "name": "Rex", "status": "available" },
    { "id": 2, "name": "Luna", "status": "pending" },
    { "id": 3, "name": "Max", "status": "sold" }
  ],
  "_meta": {
    "count": 3,
    "total": 42,
    "truncated": true,
    "token_estimate": 120
  }
}
```

O AI agent lê o `summary` e o `_meta`, e só consome `data` se precisar.

---

## 4. Non-Goals (v1)

- **Code generation** — é runtime, não gera código standalone
- **GraphQL / gRPC** — só OpenAPI 3.x
- **Swagger 2.0** — fora do v1
- **GUI / TUI interativo** — CLI puro
- **Substituir MCP** — é complementar, não substituto. MCP continua sendo melhor pra resources/prompts/sampling
- **MCP server embutido** — v1 não expõe como MCP server (mas é um caminho natural pra v2)
- **Binário standalone** — npm only no v1

---

## 5. Decisões Técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Input | OpenAPI 3.x (YAML/JSON) | Padrão de facto, ampla adoção |
| Abordagem | Runtime dinâmico | Sem build step, feedback instantâneo |
| Linguagem | Node.js / TypeScript | Ecossistema npm, parsing fácil |
| CLI framework | commander.js | Leve, popular, bem documentado |
| Auth | Flags + config persistente | Flexível pra humanos e agents |
| Distribuição | npm package | npx pra zero-install |
| Formato de discovery | JSON | Parseável por agents, legível por humanos |
| Protocolo de discovery | `--discover` flag | Sem servidor, sem daemon, sem overhead |

---

## 6. Open Questions

1. **MCP interop** — Deve o tocli funcionar TAMBÉM como MCP server (mode dual)? Isso permitiria adoção gradual: usa como MCP mas com discovery eficiente.
2. **Bridge accuracy** — Parsear `--help` de CLIs existentes vai ter limitações. Qual o threshold mínimo de qualidade aceitável pro bridge?
3. **Paginação** — Detectar padrões de paginação da API automaticamente e oferecer `--all`?
4. **Shell completions** — Gerar completions (bash/zsh/fish) automaticamente a partir do discovery schema?
5. **Naming** — "tocli" como nome do protocolo E do runtime pode confundir. Separar em `tocli-protocol` + `tocli`?
6. **Spec format** — O protocolo deve ter spec formal (como MCP tem)? Se sim, TypeScript-first (como MCP) ou JSON Schema-first?
