# Graph Report - .  (2026-07-08)

## Corpus Check
- Corpus is ~6,612 words - fits in a single context window. You may not need a graph.

## Summary
- 81 nodes · 65 edges · 26 communities (8 shown, 18 thin omitted)
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Component 0|Component 0]]
- [[_COMMUNITY_Component 1|Component 1]]
- [[_COMMUNITY_Component 2|Component 2]]
- [[_COMMUNITY_Component 3|Component 3]]
- [[_COMMUNITY_Component 4|Component 4]]
- [[_COMMUNITY_Component 5|Component 5]]
- [[_COMMUNITY_Component 6|Component 6]]
- [[_COMMUNITY_Component 7|Component 7]]
- [[_COMMUNITY_Component 8|Component 8]]
- [[_COMMUNITY_Component 9|Component 9]]
- [[_COMMUNITY_Component 10|Component 10]]
- [[_COMMUNITY_Component 11|Component 11]]
- [[_COMMUNITY_Component 12|Component 12]]
- [[_COMMUNITY_Component 15|Component 15]]
- [[_COMMUNITY_Component 16|Component 16]]
- [[_COMMUNITY_Component 17|Component 17]]
- [[_COMMUNITY_Component 18|Component 18]]
- [[_COMMUNITY_Component 19|Component 19]]
- [[_COMMUNITY_Component 20|Component 20]]
- [[_COMMUNITY_Component 21|Component 21]]
- [[_COMMUNITY_Component 22|Component 22]]
- [[_COMMUNITY_Component 23|Component 23]]
- [[_COMMUNITY_Component 24|Component 24]]
- [[_COMMUNITY_Component 25|Component 25]]

## God Nodes (most connected - your core abstractions)
1. `FastAPI Backend` - 7 edges
2. `scripts` - 5 edges
3. `API Service` - 5 edges
4. `ChatRequest` - 4 edges
5. `Redis Cache & Queue` - 4 edges
6. `upload_document()` - 3 edges
7. `rag_chat_endpoint()` - 3 edges
8. `ChromaDB Vector DB` - 3 edges
9. `Celery Workers` - 3 edges
10. `Ollama LLM` - 3 edges

## Surprising Connections (you probably didn't know these)
- `fastapi` --semantically_similar_to--> `FastAPI Backend`  [INFERRED] [semantically similar]
  backend/requirements.txt → RAG_API_PROJECT_PLAN.md
- `API Service Mac Override` --semantically_similar_to--> `API Service`  [INFERRED] [semantically similar]
  docker-compose.mac.yaml → docker-compose.yaml
- `Frontend Service` --semantically_similar_to--> `React + Vite Client`  [INFERRED] [semantically similar]
  docker-compose.yaml → RAG_API_PROJECT_PLAN.md
- `API Service` --semantically_similar_to--> `FastAPI Backend`  [INFERRED] [semantically similar]
  docker-compose.yaml → RAG_API_PROJECT_PLAN.md
- `redis` --semantically_similar_to--> `Redis Cache & Queue`  [INFERRED] [semantically similar]
  backend/requirements.txt → RAG_API_PROJECT_PLAN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **System Architecture** — rag_api_project_plan_client, rag_api_project_plan_nginx, rag_api_project_plan_fastapi, rag_api_project_plan_redis, rag_api_project_plan_postgresql, rag_api_project_plan_chromadb, rag_api_project_plan_celery, rag_api_project_plan_ollama [EXTRACTED 1.00]
- **Deep Research Flow** — rag_api_project_plan_deep_research_mode, rag_api_project_plan_celery, rag_api_project_plan_ollama [EXTRACTED 1.00]

## Communities (26 total, 18 thin omitted)

### Community 0 - "Component 0"
Cohesion: 0.15
Nodes (13): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+5 more)

### Community 1 - "Component 1"
Cohesion: 0.20
Nodes (12): chromadb, fastapi, API Service, ChromaDB Service, Frontend Service, API Service Mac Override, Postgres Service, ChromaDB Vector DB (+4 more)

### Community 2 - "Component 2"
Cohesion: 0.28
Nodes (8): chat_endpoint(), ChatRequest, rag_chat_endpoint(), Query ChromaDB for context and then ask the AI model., Upload a .txt file, chunk it, and save the embeddings to ChromaDB., upload_document(), BaseModel, UploadFile

### Community 3 - "Component 3"
Cohesion: 0.22
Nodes (8): dependencies, react, react-dom, @tailwindcss/vite, name, private, type, version

### Community 4 - "Component 4"
Cohesion: 0.25
Nodes (8): ollama, redis, Ollama Service Nvidia Override, Ollama Service, Redis Service, Celery Workers, Ollama LLM, Redis Cache & Queue

### Community 5 - "Component 5"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

## Knowledge Gaps
- **49 isolated node(s):** `UploadFile`, `name`, `private`, `version`, `type` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Component 0` to `Component 3`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `FastAPI Backend` connect `Component 1` to `Component 4`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `scripts` connect `Component 5` to `Component 3`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `FastAPI Backend` (e.g. with `fastapi` and `API Service`) actually correct?**
  _`FastAPI Backend` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `API Service` (e.g. with `FastAPI Backend` and `API Service Mac Override`) actually correct?**
  _`API Service` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UploadFile`, `Upload a .txt file, chunk it, and save the embeddings to ChromaDB.`, `Query ChromaDB for context and then ask the AI model.` to the rest of the system?**
  _53 weakly-connected nodes found - possible documentation gaps or missing edges._