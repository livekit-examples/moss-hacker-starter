# AGENTS.md

This is a LiveKit Agents project. LiveKit Agents is a Python SDK for building voice AI agents. This project is intended to be used with LiveKit Cloud. See @README.md for more about the rest of the LiveKit ecosystem.

The following is a guide for working with this project.

## Project structure

This Python project uses the `uv` package manager. You should always use `uv` to install dependencies, run the agent, and run tests.

All app-level code is in the `src/` directory. In general, simple agents can be constructed with a single `agent.py` file. Additional files can be added, but you must retain `agent.py` as the entrypoint (see the associated Dockerfile for how this is deployed).

Be sure to maintain code formatting. You can use the ruff formatter/linter as needed: `uv run ruff format` and `uv run ruff check`.

## Moss semantic search

This is more than a generic voice assistant: it is a **Moss**-powered semantic-search agent. [Moss](https://docs.moss.dev/docs) is a Python SDK for semantic search with on-device AI capabilities. The agent uses it for both retrieval-augmented generation (RAG) and per-user agentic memory.

Moss ships as the `moss` package (already in `pyproject.toml`; install standalone with `pip install moss`). The agent talks to Moss through `MossClient`, authenticated with `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` (see `.env.example`). The agent uses `inference` for STT/LLM/TTS, so Moss credentials are the only non-LiveKit secrets to wire.

### Indexes

The agent reads and writes two Moss indexes (names overridable via `MOSS_INDEX_NAME` / `MOSS_MEMORY_INDEX_NAME`):

- **`knowledge`** — the static RAG corpus. Read-only at runtime; seeded from `knowledge.json`.
- **`memory`** — per-user agentic memory. Read **and** write at runtime. Every document carries `metadata={"user_id": <id>}`, and recall queries are scoped to the caller with a metadata filter so users never see each other's facts.

`src/create_index.py` builds both indexes from `knowledge.json` (plus a seed doc for `memory`). Run it from the repo root via `pnpm moss:index` (which calls `uv --directory agent-py run src/create_index.py`) once Moss credentials are set.

### Tools

The `Assistant` (in `src/agent.py`) exposes three `@function_tool()` methods:

- **`search_knowledge(query)`** — queries the `knowledge` index (RAG), returns the joined snippet text, and publishes a `moss_context` data message to the room for the frontend context panel.
- **`remember_fact(fact)`** — upserts a document into the `memory` index via `add_docs`, tagged with the current user's `user_id` metadata.
- **`recall_facts(query)`** — queries the `memory` index filtered to the current user (`filter={"field": "user_id", "condition": {"$eq": <user_id>}}`) and publishes a `moss_context` message.

The per-user `user_id` is parsed from `ctx.job.metadata` (dispatched by the frontend), falling back to a default for `console` mode. When you change a Moss tool's behavior, follow the TDD guidance below and update `tests/test_moss.py`, which stubs `MossClient` so the tools can be tested without Moss credentials or network access.

## LiveKit Documentation

LiveKit Agents is a fast-evolving project, and the documentation is updated frequently. You should always refer to the latest documentation when working with this project. For your convenience, LiveKit offers both a CLI and an MCP server that can be used to browse and search its documentation. If the developer has not yet installed the CLI, you should recommend that they install it.

### LiveKit CLI

The [LiveKit CLI](https://docs.livekit.io/intro/basics/cli/) `lk docs` subcommand gives full access to LiveKit documentation from the terminal. Requires CLI version 2.15.0+. Check with `lk --version`.

Install or update the CLI:

- **macOS:** `brew install livekit-cli` (update: `brew update && brew upgrade livekit-cli`)
- **Linux:** `curl -sSL https://get.livekit.io/cli | bash`
- **Windows:** `winget install LiveKit.LiveKitCLI` (update: `winget upgrade LiveKit.LiveKitCLI`)

Run `lk docs --help` to see all available commands. Key commands: `lk docs overview`, `lk docs search`, `lk docs get-page`, `lk docs code-search`, `lk docs changelog`, `lk docs submit-feedback`. Run `lk docs <command> --help` before using a command for the first time, as the help text includes advice on usage and interpreting results. Prefer browsing (`overview`, `get-page`) over search, and prefer `search` over `code-search`, as docs pages are more up-to-date and provide better context than raw code.

### LiveKit Docs MCP Server

For deeper IDE integration, LiveKit also offers an [MCP server](https://docs.livekit.io/reference/developer-tools/docs-mcp/) with the same documentation access. It uses Streamable HTTP transport at `https://docs.livekit.io/mcp`. Refer to your IDE's documentation for how to add it.

### Submit docs feedback to LiveKit

If you use the LiveKit CLI or MCP Server to search or browse documentation, also submit constructive feedback to LiveKit with `lk docs submit-feedback` or the MCP `submit_docs_feedback` tool. Add this to your to-do list when planning work, to ensure you file feedback after completing your other tasks. Useful feedback includes incomplete documentation, broken examples, missing steps or any other documentation gap or issue.

## Handoffs and tasks ("workflows")

Voice AI agents are highly sensitive to excessive latency. For this reason, it's important to design complex agents in a structured manner that minimizes the amount of irrelevant context and unnecessary tools included in requests to the LLM. LiveKit Agents supports handoffs (one agent hands control to another) and tasks (tightly-scoped prompts to achieve a specific outcome) to support building reliable workflows. You should make use of these features, instead of writing long instruction prompts that cover multiple phases of a conversation.  Refer to the [documentation](https://docs.livekit.io/agents/build/workflows/) for more information.

## Testing

When possible, add tests for agent behavior. Read the [documentation](https://docs.livekit.io/agents/start/testing/), and refer to existing tests in the `tests/` directory.  Run tests with `uv run pytest`.

Important: When modifying core agent behavior such as instructions, tool descriptions, and tasks/workflows/handoffs, never just guess what will work. Always use test-driven development (TDD) and begin by writing tests for the desired behavior. For instance, if you're planning to add a new tool, write one or more tests for the tool's behavior, then iterate on the tool until the tests pass correctly. This will ensure you are able to produce a working, reliable agent for the user.

## LiveKit CLI

Run the agent locally with the LiveKit CLI (version 2.19 or later): `lk agent console` to talk to it in the terminal, and `lk agent dev --deployment local-dev` to serve the frontend. The frontend's token route dispatches to the `local-dev` deployment by default (`AGENT_DEPLOYMENT` in `../frontend/.env.local`); without `--deployment`, `lk agent dev` registers under a random `dev-…` deployment the frontend can't reach. Running the agent script's own `dev`/`console` commands is deprecated.

Beyond documentation access, the LiveKit CLI (`lk`) supports other tasks such as managing SIP trunks for telephony-based agents. Run `lk --help` to explore available commands.
