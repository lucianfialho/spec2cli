import { readFileSync } from "node:fs";
import { encoding_for_model } from "tiktoken";

const enc = encoding_for_model("gpt-4o"); // closest available to Claude's tokenizer

function countTokens(text) {
  if (typeof text !== "string") text = JSON.stringify(text, null, 2);
  return enc.encode(text).length;
}

// ============================================================
// METHODOLOGY v3
// ============================================================
// - MCP: ALL 82 tool definitions extracted from GitHub MCP server
//   source code (pkg/github/*.go). No extrapolation. Real data.
//
// - MCP+Deferred: Real tool names + first-sentence descriptions
//   as index. Schemas loaded on demand per operation.
//
// - CLI: Real `gh` help output (gh v2.83.1). Two scenarios:
//   "Naive agent" (reads help) and "Expert agent" (knows gh).
//
// - mcp-c: Simulated protocol. Schemas use same descriptions
//   as MCP for fairness (not artificially shortened).
//
// - Output: Simulated but realistic API responses measured for
//   both MCP (raw GitHub API JSON) and mcp-c (envelope format).
//
// - Tokenizer: tiktoken gpt-4o (proxy for Claude tokenizer).
//   Absolute counts may differ; ratios should hold.
// ============================================================

// ============================================================
// 1. MCP: LOAD ALL 82 REAL TOOL DEFINITIONS
// ============================================================

const allMcpTools = JSON.parse(readFileSync("github_mcp_tools.json", "utf8"));
const allMcpToolsJson = JSON.stringify(allMcpTools, null, 2);
const mcpTotalTokens = countTokens(allMcpToolsJson);
const mcpToolCount = allMcpTools.length;

// Per-tool token stats
const perToolTokens = allMcpTools.map((t) => ({
  name: t.name,
  tokens: countTokens(t),
}));
perToolTokens.sort((a, b) => b.tokens - a.tokens);
const avgTokensPerTool = mcpTotalTokens / mcpToolCount;
const minTool = perToolTokens[perToolTokens.length - 1];
const maxTool = perToolTokens[0];
const medianTool = perToolTokens[Math.floor(perToolTokens.length / 2)];

// Build real deferred index from actual tool names + first-sentence descriptions
const deferredIndex = allMcpTools.map((t) => ({
  name: t.name,
  description: t.description.split(/\.\s/)[0] + ".",
}));
const deferredIndexTokens = countTokens(deferredIndex);

// Lookup helpers
const mcpToolByName = Object.fromEntries(allMcpTools.map((t) => [t.name, t]));

// ============================================================
// 2. CLI: REAL HELP OUTPUT (gh v2.83.1)
// ============================================================

const cliRootHelp = `Work seamlessly with GitHub from the command line.

USAGE
  gh <command> <subcommand> [flags]

CORE COMMANDS
  auth:          Authenticate gh and git with GitHub
  browse:        Open repositories, issues, pull requests, and more in the browser
  codespace:     Connect to and manage codespaces
  gist:          Manage gists
  issue:         Manage issues
  org:           Manage organizations
  pr:            Manage pull requests
  project:       Work with GitHub Projects.
  release:       Manage releases
  repo:          Manage repositories

GITHUB ACTIONS COMMANDS
  cache, run, workflow

ADDITIONAL COMMANDS
  agent-task, alias, api, attestation, completion, config, extension,
  gpg-key, label, preview, ruleset, search, secret, ssh-key, status, variable

FLAGS
  --help      Show help for command
  --version   Show gh version`;

const cliGroupHelp = `Work with GitHub issues.

USAGE
  gh issue <command> [flags]

GENERAL COMMANDS
  create:        Create a new issue
  list:          List issues in a repository
  status:        Show status of relevant issues

TARGETED COMMANDS
  close, comment, delete, develop, edit, lock, pin, reopen,
  transfer, unlock, unpin, view

FLAGS
  -R, --repo [HOST/]OWNER/REPO   Select another repository

INHERITED FLAGS
  --help   Show help for command`;

const cliHelp = {
  "issue list": `List issues in a GitHub repository. By default, this only lists open issues.

The search query syntax is documented here:
<https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests>

USAGE
  gh issue list [flags]

FLAGS
      --app string         Filter by GitHub App author
  -a, --assignee string    Filter by assignee
  -A, --author string      Filter by author
  -q, --jq expression      Filter JSON output using a jq expression
      --json fields        Output JSON with the specified fields
  -l, --label strings      Filter by label
  -L, --limit int          Maximum number of issues to fetch (default 30)
      --mention string     Filter by mention
  -m, --milestone string   Filter by milestone number or title
  -S, --search query       Search issues with query
  -s, --state string       Filter by state: {open|closed|all} (default "open")
  -t, --template string    Format JSON output using a Go template
  -w, --web                List issues in the web browser

INHERITED FLAGS
      --help                     Show help for command
  -R, --repo [HOST/]OWNER/REPO   Select another repository

JSON FIELDS
  assignees, author, body, closed, closedAt, closedByPullRequestsReferences,
  comments, createdAt, id, isPinned, labels, milestone, number, projectCards,
  projectItems, reactionGroups, state, stateReason, title, updatedAt, url

EXAMPLES
  $ gh issue list --label "bug" --label "help wanted"
  $ gh issue list --author monalisa
  $ gh issue list --assignee "@me"`,

  "issue create": `Create an issue on GitHub.

USAGE
  gh issue create [flags]

FLAGS
  -a, --assignee login   Assign people by their login. Use "@me" to self-assign.
  -b, --body string      Supply a body. Will prompt for one otherwise.
  -F, --body-file file   Read body text from file
  -e, --editor           Skip prompts and open the text editor
  -l, --label name       Add labels by name
  -m, --milestone name   Add the issue to a milestone by name
  -p, --project title    Add the issue to projects by title
      --recover string   Recover input from a failed run of create
  -T, --template name    Template name to use as starting body text
  -t, --title string     Supply a title. Will prompt for one otherwise.
  -w, --web              Open the browser to create an issue

INHERITED FLAGS
      --help                     Show help for command
  -R, --repo [HOST/]OWNER/REPO   Select another repository

EXAMPLES
  $ gh issue create --title "I found a bug" --body "Nothing works"
  $ gh issue create --label "bug,help wanted"
  $ gh issue create --assignee monalisa,hubot`,

  "issue view": `Display the title, body, and other information about an issue.

With --web flag, open the issue in a web browser instead.

USAGE
  gh issue view {<number> | <url>} [flags]

FLAGS
  -c, --comments          View issue comments
  -q, --jq expression     Filter JSON output using a jq expression
      --json fields       Output JSON with the specified fields
  -t, --template string   Format JSON output using a Go template
  -w, --web               Open an issue in the browser

INHERITED FLAGS
      --help                     Show help for command
  -R, --repo [HOST/]OWNER/REPO   Select another repository

JSON FIELDS
  assignees, author, body, closed, closedAt, closedByPullRequestsReferences,
  comments, createdAt, id, isPinned, labels, milestone, number, projectCards,
  projectItems, reactionGroups, state, stateReason, title, updatedAt, url`,

  "issue comment": `Add a comment to a GitHub issue.

USAGE
  gh issue comment {<number> | <url>} [flags]

FLAGS
  -b, --body text        The comment body text
  -F, --body-file file   Read body text from file
      --create-if-none   Create a new comment if no comments are found
      --delete-last      Delete the last comment of the current user
      --edit-last        Edit the last comment of the current user
  -e, --editor           Skip prompts and open the text editor
  -w, --web              Open the web browser to write the comment
      --yes              Skip the delete confirmation prompt

INHERITED FLAGS
      --help                     Show help for command
  -R, --repo [HOST/]OWNER/REPO   Select another repository

EXAMPLES
  $ gh issue comment 12 --body "Hi from GitHub CLI"`,
};

// ============================================================
// 3. MCP-C PROTOCOL (simulated progressive discovery)
//    Descriptions match MCP tool descriptions for fairness
// ============================================================

const mcpcDiscovery = {
  manifest: {
    name: "github",
    version: "1.0.0",
    description: "GitHub CLI via mcp-c protocol",
    groups: [
      { name: "issue", description: "Manage issues (list, create, read, comment, search, sub-issues)", commands: 7 },
      { name: "repo", description: "Manage repositories (search, create, fork, files, branches, tags, tree)", commands: 12 },
      { name: "pr", description: "Manage pull requests (list, create, read, review, merge, update)", commands: 8 },
      { name: "actions", description: "GitHub Actions (list, get, trigger workflows, job logs)", commands: 4 },
      { name: "release", description: "Manage releases (list, get latest, get by tag)", commands: 3 },
      { name: "gist", description: "Manage gists (list, get, create, update)", commands: 4 },
      { name: "security", description: "Code scanning, secret scanning, dependabot, advisories", commands: 10 },
      { name: "notification", description: "Manage notifications (list, get, dismiss, subscribe)", commands: 5 },
      { name: "discussion", description: "Manage discussions (list, get, comments, categories)", commands: 4 },
      { name: "project", description: "Manage projects (list, get, write)", commands: 3 },
      { name: "label", description: "Manage labels (get, list, write)", commands: 3 },
      { name: "user", description: "Search users, orgs, get current user, teams", commands: 4 },
      { name: "star", description: "Star/unstar/list starred repositories", commands: 3 },
      { name: "copilot", description: "Assign copilot to issues, request reviews", commands: 2 },
    ],
    _meta: { protocol: "mcp-c/1", total_commands: 82 },
  },

  groups: {
    issue: {
      group: "issue",
      commands: [
        { name: "list", description: "List issues in a GitHub repository", hint: "read-only" },
        { name: "create", description: "Create a new issue", hint: "write" },
        { name: "update", description: "Update an existing issue", hint: "write", args: ["number"] },
        { name: "get", description: "Get details of a specific issue", hint: "read-only", args: ["number"] },
        { name: "comment", description: "Add a comment to an issue", hint: "write", args: ["number"] },
        { name: "search", description: "Search issues using GitHub search syntax", hint: "read-only" },
        { name: "sub-issues", description: "Manage sub-issues of an issue", hint: "write", args: ["number"] },
      ],
    },
  },

  // Schemas use MCP-equivalent descriptions for fairness
  commands: {
    "issue.list": {
      command: "issue.list",
      description: "List issues in a GitHub repository. For pagination, use the endCursor from the previous response's pageInfo in the after parameter.",
      params: [
        { name: "owner", type: "string", required: true, description: "Repository owner" },
        { name: "repo", type: "string", required: true, description: "Repository name" },
        { name: "state", type: "enum", values: ["OPEN", "CLOSED"], description: "Filter by state, by default both open and closed issues are returned when not provided" },
        { name: "labels", type: "string[]", description: "Filter by labels" },
        { name: "orderBy", type: "enum", values: ["CREATED_AT", "UPDATED_AT", "COMMENTS"], description: "Order issues by field. If provided, the direction also needs to be provided." },
        { name: "direction", type: "enum", values: ["ASC", "DESC"], description: "Order direction. If provided, the orderBy also needs to be provided." },
        { name: "since", type: "string", description: "Filter by date (ISO 8601 timestamp)" },
        { name: "perPage", type: "integer", min: 1, max: 100, description: "Results per page for pagination (min 1, max 100)" },
        { name: "after", type: "string", description: "Cursor for pagination. Use the endCursor from the previous page's PageInfo for GraphQL APIs." },
      ],
      auth: { required: true, scheme: "bearer" },
    },
    "issue.create": {
      command: "issue.create",
      description: "Create a new issue in a GitHub repository.",
      params: [
        { name: "owner", type: "string", required: true, description: "Repository owner" },
        { name: "repo", type: "string", required: true, description: "Repository name" },
        { name: "title", type: "string", required: true, description: "Issue title" },
        { name: "body", type: "string", description: "Issue body content" },
        { name: "labels", type: "string[]", description: "Labels to apply to this issue" },
        { name: "assignees", type: "string[]", description: "Usernames to assign to this issue" },
        { name: "milestone", type: "integer", description: "Milestone number" },
        { name: "type", type: "string", description: "Type of this issue. Only use if the repository has issue types configured." },
      ],
      auth: { required: true, scheme: "bearer" },
    },
    "issue.get": {
      command: "issue.get",
      description: "Get information about a specific issue in a GitHub repository.",
      params: [
        { name: "owner", type: "string", required: true, description: "The owner of the repository" },
        { name: "repo", type: "string", required: true, description: "The name of the repository" },
        { name: "number", type: "integer", required: true, description: "The number of the issue" },
      ],
      auth: { required: true, scheme: "bearer" },
    },
    "issue.comment": {
      command: "issue.comment",
      description: "Add a comment to a specific issue in a GitHub repository. Use this tool to add comments to pull requests as well (pass pull request number as issue_number).",
      params: [
        { name: "owner", type: "string", required: true, description: "Repository owner" },
        { name: "repo", type: "string", required: true, description: "Repository name" },
        { name: "number", type: "integer", required: true, description: "Issue number to comment on" },
        { name: "body", type: "string", required: true, description: "Comment content" },
      ],
      auth: { required: true, scheme: "bearer" },
    },
  },
};

// ============================================================
// 4. SIMULATED API RESPONSES
// ============================================================

const apiResponses = {
  mcp_list_issues: [
    {
      number: 28374, title: "useEffect cleanup not called on unmount in StrictMode", state: "OPEN",
      author: { login: "developerx" }, labels: [{ name: "bug" }, { name: "react-core" }],
      createdAt: "2024-12-15T10:23:45Z", updatedAt: "2025-01-02T14:11:22Z",
      body: "When using StrictMode in React 18, the cleanup function passed to useEffect is not called during the simulated unmount-remount cycle. This causes memory leaks in components that set up subscriptions.\n\nReproduction steps:\n1. Create a component with useEffect that subscribes to an event\n2. Wrap it in StrictMode\n3. Observe that cleanup is not called between the simulated unmount/remount",
      comments: { totalCount: 12 }, assignees: { nodes: [{ login: "maintainer1" }] },
      milestone: { title: "v18.4" }, url: "https://github.com/facebook/react/issues/28374",
    },
    {
      number: 28391, title: "Suspense boundary throws when fallback contains portal", state: "OPEN",
      author: { login: "contrib42" }, labels: [{ name: "bug" }, { name: "suspense" }],
      createdAt: "2024-12-18T08:45:12Z", updatedAt: "2024-12-29T16:33:01Z",
      body: "Using a portal inside a Suspense fallback causes an unhandled error.",
      comments: { totalCount: 5 }, assignees: { nodes: [] }, milestone: null,
      url: "https://github.com/facebook/react/issues/28391",
    },
    {
      number: 28405, title: "useSyncExternalStore selector re-runs unnecessarily", state: "OPEN",
      author: { login: "perf_hunter" }, labels: [{ name: "bug" }, { name: "performance" }],
      createdAt: "2024-12-20T15:02:33Z", updatedAt: "2025-01-03T09:45:18Z",
      body: "The selector function in useSyncExternalStore is called on every render even when the store hasn't changed.",
      comments: { totalCount: 8 }, assignees: { nodes: [{ login: "maintainer2" }] },
      milestone: { title: "v18.4" }, url: "https://github.com/facebook/react/issues/28405",
    },
  ],

  mcpc_list_issues: {
    summary: "Found 42 open issues labeled 'bug'. Showing 3 most recent.",
    data: [
      { number: 28374, title: "useEffect cleanup not called on unmount in StrictMode", state: "open", author: "developerx", labels: ["bug", "react-core"], created: "2024-12-15", comments: 12 },
      { number: 28391, title: "Suspense boundary throws when fallback contains portal", state: "open", author: "contrib42", labels: ["bug", "suspense"], created: "2024-12-18", comments: 5 },
      { number: 28405, title: "useSyncExternalStore selector re-runs unnecessarily", state: "open", author: "perf_hunter", labels: ["bug", "performance"], created: "2024-12-20", comments: 8 },
    ],
    _meta: { count: 3, total: 42, truncated: true },
  },

  mcp_get_issue: {
    number: 28374, title: "useEffect cleanup not called on unmount in StrictMode", state: "OPEN",
    author: { login: "developerx" }, labels: [{ name: "bug" }, { name: "react-core" }],
    createdAt: "2024-12-15T10:23:45Z", updatedAt: "2025-01-02T14:11:22Z",
    body: "When using StrictMode in React 18, the cleanup function passed to useEffect is not called during the simulated unmount-remount cycle. This causes memory leaks in components that set up subscriptions.\n\nReproduction steps:\n1. Create a component with useEffect that subscribes to an event\n2. Wrap it in StrictMode\n3. Observe that cleanup is not called between the simulated unmount/remount",
    comments: { totalCount: 12, nodes: [
      { author: { login: "maintainer1" }, body: "I can reproduce this. Looking into it.", createdAt: "2024-12-16T09:00:00Z" },
      { author: { login: "developerx" }, body: "Thanks! Let me know if you need more info.", createdAt: "2024-12-16T10:30:00Z" },
    ]},
    assignees: { nodes: [{ login: "maintainer1" }] }, milestone: { title: "v18.4" },
    url: "https://github.com/facebook/react/issues/28374",
  },

  mcpc_get_issue: {
    summary: "Issue #28374: useEffect cleanup not called on unmount in StrictMode (open, 12 comments, assigned to maintainer1)",
    data: {
      number: 28374, title: "useEffect cleanup not called on unmount in StrictMode", state: "open",
      author: "developerx", labels: ["bug", "react-core"], milestone: "v18.4",
      body: "When using StrictMode in React 18, the cleanup function passed to useEffect is not called during the simulated unmount-remount cycle.",
      comments: 12, assignee: "maintainer1",
    },
    _meta: { has_more_comments: true },
  },

  mcp_comment_result: { id: 1234567, body: "Confirmed, this is a regression from v18.3", author: { login: "agent" }, createdAt: "2025-01-04T12:00:00Z", url: "https://github.com/facebook/react/issues/28374#issuecomment-1234567" },
  mcpc_comment_result: { summary: "Comment added to issue #28374.", data: { id: 1234567 }, _meta: {} },
};

// ============================================================
// CALCULATIONS
// ============================================================

const cliRootTokens = countTokens(cliRootHelp);
const cliGroupTokens = countTokens(cliGroupHelp);
const mcpcManifestTokens = countTokens(mcpcDiscovery.manifest);
const mcpcGroupTokens = countTokens(mcpcDiscovery.groups.issue);

// Output tokens
const outMcpList = countTokens(apiResponses.mcp_list_issues);
const outMcpcList = countTokens(apiResponses.mcpc_list_issues);
const outMcpGet = countTokens(apiResponses.mcp_get_issue);
const outMcpcGet = countTokens(apiResponses.mcpc_get_issue);
const outMcpComment = countTokens(apiResponses.mcp_comment_result);
const outMcpcComment = countTokens(apiResponses.mcpc_comment_result);

// ============================================================
// OUTPUT
// ============================================================

console.log("═══════════════════════════════════════════════════════════════════════════");
console.log("  BENCHMARK v3: MCP vs MCP+Deferred vs CLI vs mcp-c");
console.log("  All 82 GitHub MCP server tools measured (no extrapolation)");
console.log("═══════════════════════════════════════════════════════════════════════════\n");

console.log("  DATA SOURCES:");
console.log(`    MCP tools:              ${mcpToolCount} definitions from github/github-mcp-server source`);
console.log(`    MCP total tokens:       ${mcpTotalTokens.toLocaleString()} (measured, not extrapolated)`);
console.log(`    MCP avg/tool:           ${avgTokensPerTool.toFixed(0)} tokens`);
console.log(`    MCP min:                ${minTool.tokens} tokens (${minTool.name})`);
console.log(`    MCP max:                ${maxTool.tokens} tokens (${maxTool.name})`);
console.log(`    MCP median:             ${medianTool.tokens} tokens (${medianTool.name})`);
console.log(`    MCP+Deferred index:     ${deferredIndexTokens} tokens (real names + 1st sentence)`);
console.log(`    CLI:                    gh v2.83.1 (real --help output)`);
console.log(`    Tokenizer:              tiktoken gpt-4o (proxy for Claude)\n`);

// --- Baseline ---

console.log("┌─────────────────────────────────────────────────────────────────────────┐");
console.log("│  BASELINE: Connection cost (tokens loaded before any operation)         │");
console.log("└─────────────────────────────────────────────────────────────────────────┘\n");

console.log(`  MCP (all 82 tools):          ${mcpTotalTokens.toLocaleString()} tokens`);
console.log(`  MCP + Deferred (index):      ${deferredIndexTokens.toLocaleString()} tokens`);
console.log(`  CLI naive (gh --help):       ${cliRootTokens} tokens`);
console.log(`  CLI expert (knows gh):       0 tokens`);
console.log(`  mcp-c (manifest):            ${mcpcManifestTokens} tokens\n`);

console.log(`  Ratios vs mcp-c:`);
console.log(`    MCP:             ${(mcpTotalTokens / mcpcManifestTokens).toFixed(0)}x`);
console.log(`    MCP+Deferred:    ${(deferredIndexTokens / mcpcManifestTokens).toFixed(1)}x`);
console.log(`    CLI naive:       ${(cliRootTokens / mcpcManifestTokens).toFixed(1)}x`);
console.log(`    CLI expert:      0x (no connection cost)\n`);

// --- Helper for scenarios ---

function scenario(name, description, approaches) {
  console.log("┌─────────────────────────────────────────────────────────────────────────┐");
  console.log(`│  ${name}: ${description.padEnd(63)}│`);
  console.log("└─────────────────────────────────────────────────────────────────────────┘\n");

  for (const a of approaches) {
    console.log(`  ${a.name}:`);
    for (const [key, val] of Object.entries(a.breakdown)) {
      console.log(`    ${key.padEnd(30)} ${String(val).padStart(7)} tokens`);
    }
    console.log(`    ${"─ INPUT TOTAL".padEnd(30)} ${String(a.input).padStart(7)} tokens`);
    console.log(`    ${"─ OUTPUT TOTAL".padEnd(30)} ${String(a.output).padStart(7)} tokens`);
    console.log(`    ${"═ COMBINED".padEnd(30)} ${String(a.input + a.output).padStart(7)} tokens\n`);
  }

  const mcpc = approaches.find((a) => a.name.startsWith("mcp-c"));
  console.log("  Ratios vs mcp-c (combined):");
  for (const a of approaches) {
    if (a === mcpc) continue;
    const r = ((a.input + a.output) / (mcpc.input + mcpc.output)).toFixed(1);
    console.log(`    ${a.name.padEnd(25)} ${r}x`);
  }
  console.log("");
}

// --- S1: List issues ---

const s1_mcp_inv = countTokens({ method: "tools/call", params: { name: "list_issues", arguments: { owner: "facebook", repo: "react", state: "OPEN", labels: ["bug"] } } });
const s1_def_schema = countTokens(mcpToolByName["list_issues"]);

const s1_cli_cmdhelp = countTokens(cliHelp["issue list"]);
const s1_cli_inv = countTokens('gh issue list --repo facebook/react --label "bug" --state open');

const s1_mcpc_inv = countTokens("mcp-c issue list --owner facebook --repo react --label bug --state open");

scenario("S1", '"List open issues labeled bug in repo X"', [
  {
    name: "MCP",
    input: mcpTotalTokens + s1_mcp_inv,
    output: outMcpList,
    breakdown: { "Discovery (82 tools)": mcpTotalTokens, "Invocation": s1_mcp_inv },
  },
  {
    name: "MCP + Deferred",
    input: deferredIndexTokens + s1_def_schema + s1_mcp_inv,
    output: outMcpList,
    breakdown: { "Index": deferredIndexTokens, "Schema on demand (1)": s1_def_schema, "Invocation": s1_mcp_inv },
  },
  {
    name: "CLI naive (reads help)",
    input: cliRootTokens + cliGroupTokens + s1_cli_cmdhelp + s1_cli_inv,
    output: outMcpList, // CLI gets same raw output
    breakdown: { "Root help": cliRootTokens, "Group help": cliGroupTokens, "Command help": s1_cli_cmdhelp, "Invocation": s1_cli_inv },
  },
  {
    name: "CLI expert (knows gh)",
    input: s1_cli_inv,
    output: outMcpList,
    breakdown: { "Invocation only": s1_cli_inv },
  },
  {
    name: "mcp-c",
    input: mcpcManifestTokens + mcpcGroupTokens + s1_mcpc_inv,
    output: outMcpcList,
    breakdown: { "Manifest (phase 1)": mcpcManifestTokens, "Group detail (phase 2)": mcpcGroupTokens, "Invocation": s1_mcpc_inv },
  },
]);

// --- S2: Create issue ---

const s2_mcp_inv = countTokens({ method: "tools/call", params: { name: "issue_write", arguments: { method: "create", owner: "facebook", repo: "react", title: "Bug in useEffect cleanup", body: "When unmounting, cleanup doesn't fire", labels: ["bug"] } } });
const s2_def_schema = countTokens(mcpToolByName["issue_write"]);
const s2_cli_cmdhelp = countTokens(cliHelp["issue create"]);
const s2_cli_inv = countTokens('gh issue create --repo facebook/react --title "Bug in useEffect cleanup" --body "When unmounting, cleanup doesn\'t fire" --label bug');
const s2_mcpc_schema = countTokens(mcpcDiscovery.commands["issue.create"]);
const s2_mcpc_inv = countTokens('mcp-c issue create --owner facebook --repo react --title "Bug in useEffect cleanup" --body "When unmounting, cleanup doesn\'t fire" --labels bug');
const s2_mcp_output = countTokens({ number: 28410, url: "https://github.com/facebook/react/issues/28410", title: "Bug in useEffect cleanup", state: "OPEN", author: { login: "agent" } });
const s2_mcpc_output = countTokens({ summary: "Issue #28410 created.", data: { number: 28410, url: "https://github.com/facebook/react/issues/28410" }, _meta: {} });

scenario("S2", '"Create issue with title and label"', [
  {
    name: "MCP",
    input: mcpTotalTokens + s2_mcp_inv,
    output: s2_mcp_output,
    breakdown: { "Discovery (82 tools)": mcpTotalTokens, "Invocation": s2_mcp_inv },
  },
  {
    name: "MCP + Deferred",
    input: deferredIndexTokens + s2_def_schema + s2_mcp_inv,
    output: s2_mcp_output,
    breakdown: { "Index": deferredIndexTokens, "Schema on demand (1)": s2_def_schema, "Invocation": s2_mcp_inv },
  },
  {
    name: "CLI naive (reads help)",
    input: cliRootTokens + cliGroupTokens + s2_cli_cmdhelp + s2_cli_inv,
    output: s2_mcp_output,
    breakdown: { "Root + group help": cliRootTokens + cliGroupTokens, "Command help": s2_cli_cmdhelp, "Invocation": s2_cli_inv },
  },
  {
    name: "CLI expert (knows gh)",
    input: s2_cli_inv,
    output: s2_mcp_output,
    breakdown: { "Invocation only": s2_cli_inv },
  },
  {
    name: "mcp-c",
    input: mcpcManifestTokens + mcpcGroupTokens + s2_mcpc_schema + s2_mcpc_inv,
    output: s2_mcpc_output,
    breakdown: { "Manifest (phase 1)": mcpcManifestTokens, "Group (phase 2)": mcpcGroupTokens, "Schema (phase 3)": s2_mcpc_schema, "Invocation": s2_mcpc_inv },
  },
]);

// --- S3: Multi-step ---

const s3_mcp_inv1 = countTokens({ method: "tools/call", params: { name: "list_issues", arguments: { owner: "facebook", repo: "react", labels: ["bug"] } } });
const s3_mcp_inv2 = countTokens({ method: "tools/call", params: { name: "issue_read", arguments: { method: "get", owner: "facebook", repo: "react", issue_number: 28374 } } });
const s3_mcp_inv3 = countTokens({ method: "tools/call", params: { name: "add_issue_comment", arguments: { owner: "facebook", repo: "react", issue_number: 28374, body: "Confirmed, this is a regression from v18.3" } } });
const s3_mcp_invs = s3_mcp_inv1 + s3_mcp_inv2 + s3_mcp_inv3;
const s3_mcp_output = outMcpList + outMcpGet + outMcpComment;

const s3_def_schemas = countTokens(mcpToolByName["list_issues"]) + countTokens(mcpToolByName["issue_read"]) + countTokens(mcpToolByName["add_issue_comment"]);

const s3_cli_helps = countTokens(cliHelp["issue list"]) + countTokens(cliHelp["issue view"]) + countTokens(cliHelp["issue comment"]);
const s3_cli_inv1 = countTokens('gh issue list --repo facebook/react --label "bug"');
const s3_cli_inv2 = countTokens("gh issue view 28374 --repo facebook/react");
const s3_cli_inv3 = countTokens('gh issue comment 28374 --repo facebook/react --body "Confirmed, this is a regression from v18.3"');
const s3_cli_invs = s3_cli_inv1 + s3_cli_inv2 + s3_cli_inv3;

const s3_mcpc_schemas = countTokens(mcpcDiscovery.commands["issue.list"]) + countTokens(mcpcDiscovery.commands["issue.get"]) + countTokens(mcpcDiscovery.commands["issue.comment"]);
const s3_mcpc_inv1 = countTokens("mcp-c issue list --owner facebook --repo react --label bug");
const s3_mcpc_inv2 = countTokens("mcp-c issue get --owner facebook --repo react --number 28374");
const s3_mcpc_inv3 = countTokens('mcp-c issue comment --owner facebook --repo react --number 28374 --body "Confirmed, this is a regression from v18.3"');
const s3_mcpc_invs = s3_mcpc_inv1 + s3_mcpc_inv2 + s3_mcpc_inv3;
const s3_mcpc_output = outMcpcList + outMcpcGet + outMcpcComment;

scenario("S3", '"List bugs, get first, add comment" (3 steps)', [
  {
    name: "MCP",
    input: mcpTotalTokens + s3_mcp_invs,
    output: s3_mcp_output,
    breakdown: { "Discovery (82 tools)": mcpTotalTokens, "3 invocations": s3_mcp_invs },
  },
  {
    name: "MCP + Deferred",
    input: deferredIndexTokens + s3_def_schemas + s3_mcp_invs,
    output: s3_mcp_output,
    breakdown: { "Index": deferredIndexTokens, "3 schemas on demand": s3_def_schemas, "3 invocations": s3_mcp_invs },
  },
  {
    name: "CLI naive (reads help)",
    input: cliRootTokens + cliGroupTokens + s3_cli_helps + s3_cli_invs,
    output: s3_mcp_output,
    breakdown: { "Root + group help": cliRootTokens + cliGroupTokens, "3 command helps": s3_cli_helps, "3 invocations": s3_cli_invs },
  },
  {
    name: "CLI expert (knows gh)",
    input: s3_cli_invs,
    output: s3_mcp_output,
    breakdown: { "3 invocations only": s3_cli_invs },
  },
  {
    name: "mcp-c",
    input: mcpcManifestTokens + mcpcGroupTokens + s3_mcpc_schemas + s3_mcpc_invs,
    output: s3_mcpc_output,
    breakdown: { "Manifest + group": mcpcManifestTokens + mcpcGroupTokens, "3 schemas on demand": s3_mcpc_schemas, "3 invocations": s3_mcpc_invs },
  },
]);

// --- S4: 5 APIs idle ---

const s4_mcp_idle = mcpTotalTokens * 5;
const s4_def_idle = deferredIndexTokens * 5;
const s4_mcpc_idle = mcpcManifestTokens * 5;
const s4_op = s1_mcp_inv;

scenario("S4", "5 APIs connected, use only 1 command", [
  {
    name: "MCP",
    input: s4_mcp_idle + s4_op,
    output: outMcpList,
    breakdown: { "Idle (5 × 82 tools)": s4_mcp_idle, "1 invocation": s4_op },
  },
  {
    name: "MCP + Deferred",
    input: s4_def_idle + s1_def_schema + s4_op,
    output: outMcpList,
    breakdown: { "Idle (5 × index)": s4_def_idle, "1 schema on demand": s1_def_schema, "1 invocation": s4_op },
  },
  {
    name: "CLI naive (reads help)",
    input: cliRootTokens + cliGroupTokens + s1_cli_cmdhelp + s1_cli_inv,
    output: outMcpList,
    breakdown: { "Root + group + cmd help": cliRootTokens + cliGroupTokens + s1_cli_cmdhelp, "1 invocation": s1_cli_inv },
  },
  {
    name: "CLI expert (knows gh)",
    input: s1_cli_inv,
    output: outMcpList,
    breakdown: { "1 invocation only": s1_cli_inv },
  },
  {
    name: "mcp-c",
    input: s4_mcpc_idle + mcpcGroupTokens + s1_mcpc_inv,
    output: outMcpcList,
    breakdown: { "Idle (5 manifests)": s4_mcpc_idle, "Group + invocation": mcpcGroupTokens + s1_mcpc_inv },
  },
]);

// --- Cost ---

console.log("┌─────────────────────────────────────────────────────────────────────────┐");
console.log("│  COST: Monthly estimate (10,000 operations, S1 as baseline)             │");
console.log("└─────────────────────────────────────────────────────────────────────────┘\n");

const inputPrice = 3;
const outputPrice = 15;
const ops = 10000;

function cost(inp, out) {
  return ((inp * ops * inputPrice + out * ops * outputPrice) / 1_000_000).toFixed(2);
}

const s1_mcp_input = mcpTotalTokens + s1_mcp_inv;
const s1_def_input = deferredIndexTokens + s1_def_schema + s1_mcp_inv;
const s1_cli_naive_input = cliRootTokens + cliGroupTokens + s1_cli_cmdhelp + s1_cli_inv;
const s1_cli_expert_input = s1_cli_inv;
const s1_mcpc_input = mcpcManifestTokens + mcpcGroupTokens + s1_mcpc_inv;

console.log(`  Pricing: $${inputPrice}/M input, $${outputPrice}/M output (Claude Sonnet 4)\n`);
console.log(`  MCP:              $${cost(s1_mcp_input, outMcpList)}/month`);
console.log(`  MCP + Deferred:   $${cost(s1_def_input, outMcpList)}/month`);
console.log(`  CLI naive:        $${cost(s1_cli_naive_input, outMcpList)}/month`);
console.log(`  CLI expert:       $${cost(s1_cli_expert_input, outMcpList)}/month`);
console.log(`  mcp-c:            $${cost(s1_mcpc_input, outMcpcList)}/month\n`);

// --- Summary ---

console.log("═══════════════════════════════════════════════════════════════════════════");
console.log("  SUMMARY");
console.log("═══════════════════════════════════════════════════════════════════════════\n");

const summaryRows = [
  { name: "Connection", mcp: mcpTotalTokens, def: deferredIndexTokens, cliN: cliRootTokens, cliE: 0, mcpc: mcpcManifestTokens },
  { name: "S1: List issues", mcp: s1_mcp_input + outMcpList, def: s1_def_input + outMcpList, cliN: s1_cli_naive_input + outMcpList, cliE: s1_cli_expert_input + outMcpList, mcpc: s1_mcpc_input + outMcpcList },
  { name: "S3: 3-step workflow", mcp: mcpTotalTokens + s3_mcp_invs + s3_mcp_output, def: deferredIndexTokens + s3_def_schemas + s3_mcp_invs + s3_mcp_output, cliN: cliRootTokens + cliGroupTokens + s3_cli_helps + s3_cli_invs + s3_mcp_output, cliE: s3_cli_invs + s3_mcp_output, mcpc: mcpcManifestTokens + mcpcGroupTokens + s3_mcpc_schemas + s3_mcpc_invs + s3_mcpc_output },
  { name: "S4: 5 APIs, use 1", mcp: s4_mcp_idle + s4_op + outMcpList, def: s4_def_idle + s1_def_schema + s4_op + outMcpList, cliN: cliRootTokens + cliGroupTokens + s1_cli_cmdhelp + s1_cli_inv + outMcpList, cliE: s1_cli_inv + outMcpList, mcpc: s4_mcpc_idle + mcpcGroupTokens + s1_mcpc_inv + outMcpcList },
];

console.log("  (combined: input + output tokens)\n");
console.log("  Scenario              │     MCP    │  MCP+Def  │ CLI naive │ CLI expert│   mcp-c   │ MCP/mcp-c │ Def/mcp-c");
console.log("  ──────────────────────┼────────────┼───────────┼───────────┼───────────┼───────────┼───────────┼──────────");

for (const r of summaryRows) {
  const rm = (r.mcp / r.mcpc).toFixed(1);
  const rd = r.mcpc > 0 ? (r.def / r.mcpc).toFixed(1) : "-";
  console.log(
    `  ${r.name.padEnd(22)} │ ${String(r.mcp).padStart(8)}   │ ${String(r.def).padStart(7)}   │ ${String(r.cliN).padStart(7)}   │ ${String(r.cliE).padStart(7)}   │ ${String(r.mcpc).padStart(7)}   │ ${rm.padStart(7)}x  │ ${rd.padStart(7)}x`
  );
}

console.log("\n  KEY CAVEATS:");
console.log("  1. MCP tokens are MEASURED (82 real tools), not extrapolated");
console.log("  2. MCP+Deferred index uses REAL tool names + first-sentence descriptions");
console.log("  3. CLI expert = agent knows gh from training (0 discovery cost) — best case for CLI");
console.log("  4. CLI naive = agent reads help like any unknown CLI — realistic for new CLIs");
console.log("  5. mcp-c output uses envelope format (summary + truncated data) — designed by us");
console.log("  6. MCP/CLI output is same raw JSON — mcp-c envelope saves output tokens");
console.log("  7. Tokenizer is gpt-4o (Claude may differ in absolute counts, ratios should hold)");
console.log("  8. Does NOT measure accuracy (whether agent picks the right command)\n");

// --- Tool distribution ---
console.log("  APPENDIX: Token distribution across 82 MCP tools\n");
console.log(`    Smallest:  ${minTool.name} (${minTool.tokens} tokens)`);
console.log(`    25th pct:  ${perToolTokens[Math.floor(perToolTokens.length * 0.75)].name} (${perToolTokens[Math.floor(perToolTokens.length * 0.75)].tokens} tokens)`);
console.log(`    Median:    ${medianTool.name} (${medianTool.tokens} tokens)`);
console.log(`    75th pct:  ${perToolTokens[Math.floor(perToolTokens.length * 0.25)].name} (${perToolTokens[Math.floor(perToolTokens.length * 0.25)].tokens} tokens)`);
console.log(`    Largest:   ${maxTool.name} (${maxTool.tokens} tokens)`);
console.log(`    Total:     ${mcpTotalTokens.toLocaleString()} tokens across ${mcpToolCount} tools\n`);

enc.free();
