# Client Integration Guide

Configure the Habitica MCP server in your AI client of choice: **opencode**, **Claude Code**, or **Hermes Agent**.

## Prerequisites

- Node.js 18+ and npm
- A Habitica account with API credentials ([Settings → API](https://habitica.com))
- The server installed locally (recommended):

```bash
git clone https://github.com/ibreaker/habitica-mcp-server.git
cd habitica-mcp-server
npm install
cp .env.example .env   # fill in HABITICA_USER_ID and HABITICA_API_TOKEN
```

The server reads `.env` from its own directory, so a local clone keeps your credentials out of every client config.

> **Using `npx -y habitica-mcp-server` instead?** Then the server runs from the npm cache, not your repo, and **its `.env` lookup does not find your project `.env`**. Pass the credentials explicitly as `env` in the client config (shown in each section below).

## Verify the server starts

```bash
node index.js
```

You should see `Habitica MCP 服务器已启动` (or the English equivalent) and the process keeps running.

---

## opencode

Add to your **project** `opencode.json`, or to the **global** config at `~/.config/opencode/opencode.json` to make it available in every project.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "habitica": {
      "type": "local",
      "command": ["node", "/absolute/path/to/habitica-mcp-server/index.js"],
      "enabled": true,
      "env": {}
    }
  }
}
```

If you are not using a local clone (npx install), set the credentials in `env`:

```json
{
  "mcp": {
    "habitica": {
      "type": "local",
      "command": ["npx", "-y", "habitica-mcp-server"],
      "enabled": true,
      "env": {
        "HABITICA_USER_ID": "your-user-id",
        "HABITICA_API_TOKEN": "your-api-token",
        "MCP_LANG": "en"
      }
    }
  }
}
```

Restart opencode after saving — config is only loaded at startup.

---

## Claude Code

### Global (all projects)

Add the server to the `mcpServers` block in `~/.claude.json`:

```json
{
  "mcpServers": {
    "habitica": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/habitica-mcp-server/index.js"],
      "env": {}
    }
  }
}
```

### Project scope

Create `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "habitica": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/habitica-mcp-server/index.js"],
      "env": {}
    }
  }
}
```

### Via CLI

```bash
claude mcp add habitica -- node /absolute/path/to/habitica-mcp-server/index.js
claude mcp add habitica --scope project -- node /absolute/path/to/habitica-mcp-server/index.js
```

For npx installs, add `env` inline or export the variables first:

```json
{
  "mcpServers": {
    "habitica": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "habitica-mcp-server"],
      "env": {
        "HABITICA_USER_ID": "your-user-id",
        "HABITICA_API_TOKEN": "your-api-token",
        "MCP_LANG": "en"
      }
    }
  }
}
```

Restart Claude Code (or run `/mcp` to check connection status).

---

## Hermes Agent

Hermes reads MCP servers from `~/.hermes/config.yaml` under the top-level `mcp_servers:` key. **Note:** Hermes does not pass the full shell environment to stdio servers — only the `env` you configure. A local clone still works because the server reads its own `.env`.

```yaml
mcp_servers:
  habitica:
    command: "node"
    args: ["/absolute/path/to/habitica-mcp-server/index.js"]
```

### Via CLI

```bash
hermes mcp add habitica --command node --args /absolute/path/to/habitica-mcp-server/index.js
```

### npx install with explicit credentials

```yaml
mcp_servers:
  habitica:
    command: "npx"
    args: ["-y", "habitica-mcp-server"]
    env:
      HABITICA_USER_ID: "your-user-id"
      HABITICA_API_TOKEN: "your-api-token"
      MCP_LANG: "en"
```

### Optional: filter exposed tools

The server exposes mutating tools (create/update/delete, buy, cast). Whitelist only what you need:

```yaml
mcp_servers:
  habitica:
    command: "node"
    args: ["/absolute/path/to/habitica-mcp-server/index.js"]
    tools:
      include: [get_user_profile, get_tasks, create_task, score_task]
```

After editing, reload inside Hermes with `/reload-mcp` or restart it. Hermes registers tools with the `mcp_<server>_<tool>` prefix (e.g. `mcp_habitica_get_tasks`).

---

## Configuration reference

| Variable           | Required | Default       | Description                                   |
| ------------------ | -------- | ------------- | --------------------------------------------- |
| `HABITICA_USER_ID` | Yes      | —             | Habitica User ID (Settings → API tab)         |
| `HABITICA_API_TOKEN` | Yes    | —             | Habitica API Token (Settings → API tab)       |
| `MCP_LANG`         | No       | `en` / `LANG` | Server messages: `en` or `zh-CN`              |

The API base URL is fixed to `https://habitica.com/api/v3` in `index.js`.

## Troubleshooting

- **Server exits immediately with "Please set HABITICA_USER_ID..."** — credentials are missing. Check `.env` (local clone) or the `env` block in your client config.
- **Tools not appearing in the client** — the config is only read at startup; restart the client. In Hermes run `/reload-mcp`.
- **npx install ignores your `.env`** — the server resolves `.env` relative to its own install directory, not your project. Pass credentials in the client config `env` instead.
- **API call errors** — confirm the credentials are valid, the account is active, and you are within Habitica's rate limits.
