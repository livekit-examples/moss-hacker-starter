"""Build the Moss indexes used by this voice agent.

Creates two indexes from the credentials in ``agent-py/.env.local``:

* the static ``knowledge`` index (RAG corpus), seeded from ``agent-py/knowledge.json``
* the ``memory`` index (per-user agentic memory), seeded with a single placeholder
  document so the index exists and can be loaded before the first runtime write.

Run from the repo root via ``pnpm moss:index`` (which invokes
``uv --directory agent-py run src/create_index.py``) once Moss credentials are set.
This script needs ``MOSS_PROJECT_ID`` / ``MOSS_PROJECT_KEY`` to run; without them it
exits with a clear message instead of contacting Moss.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from moss import DocumentInfo, MossClient

# Resolve paths relative to this file so the script works regardless of the
# current working directory. ``src/create_index.py`` -> parent.parent == agent-py/.
AGENT_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_PATH = AGENT_DIR / "knowledge.json"
ENV_PATH = AGENT_DIR / ".env.local"

DEFAULT_MODEL_ID = "moss-minilm"
DEFAULT_KNOWLEDGE_INDEX = "knowledge"
DEFAULT_MEMORY_INDEX = "memory"

# Load environment variables from agent-py/.env.local.
load_dotenv(ENV_PATH)


def _load_knowledge_documents() -> list[DocumentInfo]:
    """Load knowledge.json into a list of Moss DocumentInfo entries."""
    if not KNOWLEDGE_PATH.exists():
        raise FileNotFoundError(f"Knowledge data file not found at {KNOWLEDGE_PATH}.")

    with KNOWLEDGE_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise ValueError("knowledge.json must be a list of document entries.")

    documents: list[DocumentInfo] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        doc_id = entry.get("id")
        text = entry.get("text")
        if not doc_id or not text:
            continue
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        # Moss metadata values must be strings.
        metadata = {str(k): str(v) for k, v in metadata.items()}
        documents.append(
            DocumentInfo(id=str(doc_id), text=str(text), metadata=metadata)
        )

    if not documents:
        raise ValueError("No valid documents were loaded from knowledge.json.")

    return documents


def _memory_seed_documents() -> list[DocumentInfo]:
    """A single placeholder doc so the memory index exists and loads cleanly.

    The agent's memory tools upsert real per-user documents at runtime (matching
    ``id`` upserts). This seed is filtered out at query time by its ``user_id``.
    """
    return [
        DocumentInfo(
            id="__seed__",
            text="(memory seed) placeholder document so the memory index can be loaded before the first write.",
            metadata={"user_id": "__seed__"},
        )
    ]


async def build_indexes() -> None:
    project_id = os.getenv("MOSS_PROJECT_ID")
    project_key = os.getenv("MOSS_PROJECT_KEY")
    knowledge_index = os.getenv("MOSS_INDEX_NAME", DEFAULT_KNOWLEDGE_INDEX)
    memory_index = os.getenv("MOSS_MEMORY_INDEX_NAME", DEFAULT_MEMORY_INDEX)
    model_id = os.getenv("MOSS_MODEL_ID", DEFAULT_MODEL_ID)

    missing = [
        name
        for name, value in {
            "MOSS_PROJECT_ID": project_id,
            "MOSS_PROJECT_KEY": project_key,
        }.items()
        if not value
    ]
    if missing:
        raise OSError(
            "Missing required Moss environment variables: "
            + ", ".join(missing)
            + f". Set them in {ENV_PATH} before running this script."
        )

    assert project_id is not None
    assert project_key is not None

    knowledge_docs = _load_knowledge_documents()
    memory_docs = _memory_seed_documents()

    client = MossClient(project_id, project_key)

    print(
        f"Creating Moss knowledge index '{knowledge_index}' with "
        f"{len(knowledge_docs)} docs using model '{model_id}'..."
    )
    knowledge_result = await client.create_index(
        knowledge_index, knowledge_docs, model_id
    )
    print(
        f"  done (job: {knowledge_result.job_id}, index: {knowledge_result.index_name}, "
        f"docs: {knowledge_result.doc_count})"
    )

    print(
        f"Creating Moss memory index '{memory_index}' with "
        f"{len(memory_docs)} seed doc(s) using model '{model_id}'..."
    )
    memory_result = await client.create_index(memory_index, memory_docs, model_id)
    print(
        f"  done (job: {memory_result.job_id}, index: {memory_result.index_name}, "
        f"docs: {memory_result.doc_count})"
    )

    print("Both Moss indexes created. Knowledge (RAG) and memory are ready for use.")


if __name__ == "__main__":
    asyncio.run(build_indexes())
