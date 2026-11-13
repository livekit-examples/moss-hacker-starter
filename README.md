# Moss Hacker Starter — LiveKit voice agent + Moss RAG & memory

A voice AI starter that pairs the official **[LiveKit](https://livekit.io) Agents** stack with
**[Moss](https://usemoss.dev)** for retrieval. Talk to a "LiveKit docs helper" in the browser; it
answers grounded in a Moss knowledge base (RAG) and remembers facts you tell it (agentic memory),
scoped per user.

Built entirely on the official LiveKit starter templates — `agent-starter-python` and
`agent-starter-react` — adapted for Moss. The starters are the source of truth for current LiveKit
idioms.

## What you get

- **Voice agent** (`agent-py/`) — a Python LiveKit agent (`AgentServer` + `@server.rtc_session`)
  with three tools:
  - `search_knowledge` — semantic search (RAG) over the static **`knowledge`** Moss index.
  - `remember_fact` — writes a fact to the **`memory`** Moss index, tagged with your `user_id`.
  - `recall_facts` — reads back *your* facts only, via a per-user metadata filter.
- **Frontend** (`frontend/`) — the React/Next.js starter, rebranded as the "Moss LiveKit Docs
  Helper", with a live **Knowledge Matches** panel that shows the retrieved chunks and relevance
  scores in real time as the agent searches.
- **Indexer** (`agent-py/src/create_index.py`) — builds both Moss indexes from
  `agent-py/knowledge.json`.

### Only two sets of credentials

You need **LiveKit** and **Moss** credentials — nothing else. Speech-to-text, the LLM, and
text-to-speech all run through **[LiveKit Inference](https://docs.livekit.io/agents/models/)**
(model strings, billed through LiveKit), so there are **no OpenAI / Deepgram / Cartesia / embedding
API keys** to manage anywhere in this repo.

## Architecture

```
  ┌──────────────────────┐         ┌────────────────────────────┐
  │  Browser frontend     │  WebRTC │   LiveKit Cloud             │
  │  (Next.js, frontend/) │◀───────▶│   • media transport         │
  │  • mic / audio         │  data   │   • Inference: STT/LLM/TTS  │
  │  • Knowledge Matches   │  packets│   • agent dispatch          │
  └──────────┬───────────┘         └─────────────┬──────────────┘
             │  POST /api/token                    │ dispatch (agent_name="agent-py",
             │  → mints lk_moss_user cookie         │            metadata {"user_id": …})
             │  → stamps {"user_id"} as dispatch    │
             │     metadata                          ▼
             │                          ┌────────────────────────────┐
             │   moss_context data ◀────│  Python voice agent         │
             └──────── packets ─────────│  (agent-py/, AgentServer)   │
                                        │  search_knowledge / remember │
                                        │  _fact / recall_facts        │
                                        └─────────────┬──────────────┘
                                                      │  Moss SDK
                                                      ▼
                                        ┌────────────────────────────┐
                                        │  Moss                       │
                                        │  • knowledge index (RAG)    │
                                        │  • memory  index (per-user) │
                                        └────────────────────────────┘
```

The frontend's token route (`frontend/app/api/token/route.ts`) sets an httpOnly `lk_moss_user`
cookie (a random UUID) on first visit and stamps `{"user_id": "<uuid>"}` into the agent's dispatch
metadata. The agent reads it from `ctx.job.metadata` and uses it to scope memory reads/writes, so
each browser gets its own private memory that persists across reconnects.

## Repository layout

```
moss-hacker-starter/
├── agent-py/                  # Python voice agent (uv-managed)
│   ├── src/agent.py           #   agent + 3 Moss tools, registered as "agent-py"
│   ├── src/create_index.py    #   builds the knowledge + memory indexes
│   ├── knowledge.json         #   RAG seed corpus (~13 LiveKit Q&A entries)
│   ├── Dockerfile             #   deploy image (CMD: uv run src/agent.py start)
│   └── .env.local             #   LIVEKIT_* (auto) + MOSS_* (you paste)
├── frontend/                  # Next.js app (pnpm-managed)
│   ├── app/api/token/route.ts #   token + dispatch metadata + lk_moss_user cookie
│   ├── app-config.ts          #   branding + AGENT_NAME wiring
│   ├── hooks/useMossContextEvents.ts          # parses moss_context data packets
│   └── components/app/moss-results-panel.tsx  # "Knowledge Matches" UI
│   └── .env.local             #   LIVEKIT_* + AGENT_NAME=agent-py (no Moss vars)
└── package.json               # root pnpm orchestrator (scripts below)
```

## Prerequisites

- **Python 3.10+** and **[uv](https://docs.astral.sh/uv/)** (manages the agent's venv).
- **Node.js 22+** and **[pnpm](https://pnpm.io) 10+**.
- The **[LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/)** (`lk`),
  authenticated to a LiveKit Cloud project:
  ```bash
  lk cloud auth          # opens a browser to link your project
  lk project list        # verify a linked project exists
  ```
- A **[LiveKit Cloud](https://cloud.livekit.io)** account/project.
- A **[Moss](https://portal.usemoss.dev)** account (free tier is plenty — see below).

> **Never hand-write LiveKit keys.** All LiveKit setup goes through `lk`, and whenever you touch
> LiveKit code or config, look up the current API first (`lk docs` or the LiveKit Docs MCP).

## Setup

If you cloned this repo, the two starters and their LiveKit credentials are already in place. If you
are scaffolding from scratch, the starters are created with the LiveKit CLI:

```bash
lk app create --template agent-starter-python --install --yes agent-py
lk app create --template agent-starter-react  --install --yes frontend
```

**1. Install dependencies and create `.env.local` files:**

```bash
pnpm setup
```

This installs the frontend (`pnpm`), syncs the agent (`uv sync`), and copies `.env.example` →
`.env.local` for each app if missing.

**2. Write LiveKit credentials** into both apps with the CLI (never typed by hand):

```bash
lk app env -w agent-py     # reads agent-py/.env.example → writes agent-py/.env.local
lk app env -w frontend     # reads frontend/.env.example → writes frontend/.env.local
```

This populates `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in both files. The
frontend's `AGENT_NAME` is already set to `agent-py` so the browser explicitly dispatches to this
agent.

**3. Paste your Moss credentials — the one manual step.** From the
[Moss portal](https://portal.usemoss.dev), copy your project ID and key into
`agent-py/.env.local`:

```dotenv
MOSS_PROJECT_ID=your_moss_project_id
MOSS_PROJECT_KEY=your_moss_project_key
# defaults below are fine for this starter:
MOSS_INDEX_NAME=knowledge
MOSS_MEMORY_INDEX_NAME=memory
MOSS_MODEL_ID=moss-minilm
```

The **frontend needs no Moss variables** — only the agent talks to Moss.

## Build the Moss indexes

```bash
pnpm moss:index
```

Runs `agent-py/src/create_index.py`, which creates **both** indexes:

- **`knowledge`** — populated from `agent-py/knowledge.json` (the RAG corpus).
- **`memory`** — seeded with one placeholder doc so it exists before the first runtime write.

It prints the document counts / job IDs for each. You can confirm the indexes appear in the
[Moss portal](https://portal.usemoss.dev). (Requires the Moss credentials from setup.)

## Run

Start the agent and the frontend together:

```bash
pnpm dev
```

- Frontend: **http://localhost:3000** — click **Start call**, allow the mic, and talk.
- The agent connects to LiveKit Cloud and waits for the browser to dispatch it.

No-frontend smoke test (talk to the agent in your terminal):

```bash
pnpm agent:py:console
```

## Try it — the three tools

With `pnpm dev` running, connect at http://localhost:3000 and:

1. **RAG / `search_knowledge`** — ask a docs question, e.g.
   *"How does turn detection work in LiveKit?"*
   The agent searches the `knowledge` index, answers grounded in the snippets, and the
   **Knowledge Matches** panel fills in with the retrieved chunks + relevance scores.
2. **Write memory / `remember_fact`** — say
   *"Remember that I prefer Cartesia for text-to-speech."*
   The agent stores the fact tagged with your `user_id`.
3. **Read memory / `recall_facts`** — ask
   *"What's my TTS preference?"*
   The agent recalls *your* facts only (per-user metadata filter) and answers from them.

Because the `lk_moss_user` cookie is httpOnly and long-lived, your memory persists across reloads
and reconnects — the same browser keeps the same `user_id`.

## Test & lint

```bash
pnpm test    # pytest (agent-py)
pnpm lint    # ruff (agent-py) + next lint (frontend)
pnpm format  # prettier (frontend) + ruff format (agent-py)
```

## Deploy

The frontend's `/api/token` route is **development-only** (it throws in production) — deploy it
behind your own auth before shipping. The agent deploys to **LiveKit Cloud** straight from its
Dockerfile (`agent-py/Dockerfile`).

> Commands below reflect the current LiveKit CLI flow — re-check with `lk docs` /
> `lk agent --help` before deploying, as the CLI evolves.

```bash
cd agent-py
lk agent create        # first deploy: registers the agent, writes livekit.toml,
                       #   uploads the build context, builds the Dockerfile image,
                       #   and deploys it. Dispatch name "agent-py" is preserved.
```

Your agent needs its environment in the cloud too — set `LIVEKIT_*` and `MOSS_PROJECT_ID` /
`MOSS_PROJECT_KEY` (plus the `MOSS_*` index names) as deployment
[secrets](https://docs.livekit.io/deploy/agents/secrets/).

Subsequent updates and monitoring:

```bash
lk agent deploy        # ship a new version
lk agent status        # status / replica count
lk agent logs          # live log tail
```

See [Agent deployment](https://docs.livekit.io/deploy/agents/quickstart/) and
[Builds & Dockerfiles](https://docs.livekit.io/deploy/agents/builds/) for details.

## Customize

- **Knowledge base** — edit `agent-py/knowledge.json` (each entry is a self-contained Q&A
  paragraph with `{id, text, metadata}`), then re-run `pnpm moss:index`.
- **Agent persona / behavior** — edit the instructions and tools in `agent-py/src/agent.py`.
- **Models** — swap the LiveKit Inference model strings (STT/LLM/TTS) in `agent-py/src/agent.py`.
- **Branding & visualizer** — edit `frontend/app-config.ts`.
- **Knowledge Matches UI** — `frontend/components/app/moss-results-panel.tsx` (rendered from
  `frontend/components/agents-ui/blocks/agent-session-view-01/components/agent-session-block.tsx`).

## Root scripts

| Script | What it does |
| --- | --- |
| `pnpm setup` | install frontend + sync agent (`uv`) + copy `.env.local` files |
| `pnpm moss:index` | build the `knowledge` + `memory` Moss indexes |
| `pnpm dev` | run agent + frontend together (via `concurrently`) |
| `pnpm agent:py:console` | terminal smoke test (no frontend) |
| `pnpm agent:py:start` / `pnpm agent:py:download-files` | prod entry / fetch plugin model files |
| `pnpm build` / `pnpm start:frontend` | build / serve the frontend |
| `pnpm test` / `pnpm lint` / `pnpm format` | tests, lint, format |

## Moss resources

- **LiveKit Integration:** https://docs.moss.dev/docs/integrations/livekit
- **Portal (get your project ID + key):** https://portal.usemoss.dev
- **Indexing & retrieval guides:** https://docs.moss.dev/docs
- **Free tier:** ~**60 voice-minutes/month** and up to **3 indexes** — enough to run this starter
  end to end (the `knowledge` and `memory` indexes count as 2).

## License

MIT — see [LICENSE](./LICENSE).
