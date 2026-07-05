# **Project Blueprint: RAG API with FastAPI & Full DevOps Pipeline**

---

## **1. Executive Summary**

This document outlines the complete start-to-finish plan for building a Production-Grade RAG (Retrieval-Augmented Generation) API. The primary goal is to build a full-stack web application that serves as a powerful AI knowledge base, while simultaneously serving as a comprehensive learning platform for modern DevOps practices.

The project will be end-to-end **"DevOpsified"**—encompassing local development, automated testing, security scanning, CI/CD pipelines, infrastructure as code, and production-grade monitoring. The entire stack will be deployable on a local Linux machine with a single command.

---

## **2. Project Overview**

### **Project Name Proposals:**
- `rag-ops-lab`
- `docu-chat`
- `ai-knowledge-base-api`

### **What It Is (Industry Standard Terms)**
- **RAG API:** A backend service that retrieves relevant information from a knowledge base to augment the responses of a Large Language Model (LLM).
- **AI Knowledge Base:** A system that allows users to upload documents and query them using natural language.
- **Document QA System:** A Question-Answering system specifically designed for a user's private documents.
- **Conversational AI Platform:** An interactive chat interface powered by AI.

### **Target Audience / Use Case:**
- **Primary:** Adrag & team for internal knowledge management.
- **Secondary:** A learning resource for developing full-stack and DevOps skills.
- **Deployment:** Local Linux Machine, with a clear path to cloud deployment.

### **Key Features (MVP)**
1.  **Document Upload & Management:**
    -   Upload documents (PDF, DOCX, TXT).
    -   Automatic text extraction and chunking.
    -   Vector embedding and storage.
2.  **Intelligent Chat with RAG:**
    -   Ask questions about uploaded documents.
    -   Context-aware responses powered by a local LLM (Ollama).
    -   Source attribution (showing which chunks were used for the answer).
3.  **Persistent Chat History:**
    -   Conversations are saved to a database.
    -   Users can view and resume previous chats.
4.  **"Deep Research" Mode:**
    -   **Web Search:** Search the internet via APIs (e.g., DuckDuckGo, SerpAPI) to find relevant web pages.
    -   **Web Scraping:** Scrape and clean content from the found URLs.
    -   **AI Synthesis:** An AI agent summarizes the scraped information and compiles it into a coherent research report, distinct from the standard RAG flow over local documents.
5.  **Robust API & UI:**
    -   A beautiful, responsive web UI for the chat and document management.
    -   A fully documented, interactive API (via Swagger UI / Redoc).

---

## **3. Complete System Architecture**

This section details the high-level system architecture, illustrating how all components interact.

### **Architecture Diagram (Logical)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                   🌐 Client (Browser)                        │
│                           (React + Vite + Tailwind CSS)                      │
└───────────────────────┬──────────────────────────────────────────────────────┘
                        │
                        │ HTTPS / HTTP
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           🛡️ Nginx (Reverse Proxy)                          │
│                  (SSL Termination, Rate Limiting, Static File Serving)      │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   🚀 API     │ │  📊 Admin    │ │   🎯 RAG     │
│  (FastAPI)   │ │  (Swagger/   │ │  Endpoints   │
│              │ │   PGAdmin)   │ │  (Streaming) │
└─────┬────────┘ └──────────────┘ └─────┬───────┘
      │                                 │
      └─────────────────┬───────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    ▼                   ▼                   ▼
┌─────────┐      ┌───────────┐      ┌──────────────┐
│  Redis  │      │ PostgreSQL│      │   ChromaDB   │
│  (Cache &│      │ (Users,   │      │  (Document   │
│  Queue) │      │ Chats, &  │      │  Embeddings) │
│         │      │ Metadata) │      │              │
└────┬────┘      └──────── Artist────┘      └──────────────┘
     │
     └──▶ 🌿 Celery Workers ◀──┐
                                │
                          ┌──────┴──────┐
                          │  🦙 Ollama  │
                          │  (LLM &     │
                          │  Embeddings)│
                          └─────────────┘
                          │
                    ┌─────┴─────┐
                    │ Local GPU │
                    │  (CUDA)   │
                    └───────────┘
```

### **Frontend (React SPA)**
- **Framework:** React 18+ with Vite (for fast development builds).
- **Styling:** Tailwind CSS (for rapid, responsive UI development) + `shadcn/ui` or `Chakra UI` (for pre-built accessible components).
- **State Management:** `React Query` (TanStack Query) for server state, `Zustand` or `React Context` for client state.
- **Routing:** `react-router-dom`.
- **HTTP Client:** `axios` or `fetch`.
- **Key UI Components:**
    -   **Auth Pages:** Login, Register.
    -   **Chat Interface:** Message history, input field, streaming responses, source citations.
    -   **Document Manager:** Upload area, list of uploaded documents, delete functionality.
    -   **Sidebar:** Navigation links, list of previous chat sessions.

### **Backend (FastAPI)**
- **Framework:** FastAPI (for high-performance, async Python APIs).
- **Async Support:** `asyncio` and `httpx` for non-blocking I/O.
- **Auth:** `fastapi-users` or custom JWT implementation with `PyJWT` and `passlib`.
- **API Documentation:** Auto-generated via OpenAPI/Swagger UI and ReDoc.
- **Core Logic Layers:**
    -   `api/`: Route definitions and dependency injection.
    -   `services/`: Business logic (document processing, chat orchestration, research agent).
    -   `db/`: SQLAlchemy models, migrations (Alembic), and database session management.
    -   `core/`: Application settings (Pydantic), security utilities, and logging configuration.

### **Data Layer**
- **PostgreSQL:** The primary relational database. Stores user accounts, chat sessions, messages, and document metadata (but not the document chunks themselves).
- **ChromaDB:** A vector database. Stores the document chunks and their corresponding vector embeddings for efficient semantic search.
- **Redis:** Used as a multi-purpose tool:
    -   **Cache:** Caching frequently accessed data (e.g., user sessions, recent chat history).
    -   **Queue:** As the message broker for Celery, enabling asynchronous task execution.

### **AI/ML Layer**
- **Ollama:** Runs locally as a separate container/service. It serves two purposes:
    -   **Embeddings:** Converts text chunks into high-dimensional vectors (e.g., using `nomic-embed-text` or `mxbai-embed-large`).
    -   **Generation:** Runs the LLM (e.g., `llama3`, `mistral`, `qwen2.5`) to generate responses based on the retrieved context.
- **Deep Research Agent:** A custom Python class that orchestrates the research flow. It will use tools like `duckduckgo-search`, `beautifulsoup4`, and the Ollama LLM to perform multi-step research.

### **Background Workers (Celery)**
- **Purpose:** To handle long-running, I/O-bound, or CPU-intensive tasks without blocking the main API.
- **Tasks:**
    -   **Document Processing:** Extracting text, splitting, embedding, and saving to ChromaDB after a user uploads a file.
    -   **Deep Research:** Executing the multi-step web search and scraping process.
- **Monitoring:** Celery Flower will be included in the stack to monitor worker tasks.

### **Reverse Proxy & Gateway (Nginx)**
- **Role:** The single entry point to the entire application.
- **Functions:**
    -   Routes incoming requests to the correct service (frontend static files, API, PGAdmin, etc.).
    -   Handles SSL/TLS termination (using Let's Encrypt or self-signed certs).
    -   Applies rate limiting to prevent API abuse.

### **Monitoring & Observability Stack**
- **Prometheus:** Scrapes metrics from the FastAPI application (using `prometheus-fastapi-instrumentator`) and other services.
- **Grafana:** Visualizes the collected metrics in custom dashboards (request latency, error rates, active users, document processing times).
- **ELK Stack (Elasticsearch, Logstash, Kibana):**
    -   **Logstash:** Aggregates and processes logs from all containers.
    -   **Elasticsearch:** Stores the processed log data.
    -   **Kibana:** Provides a powerful UI for searching, filtering, and visualizing logs. This enables centralized logging, a critical DevOps practice.

---

## **4. "Deep Research" Feature Architecture**

This is an advanced feature that goes beyond simple RAG. It mimics the behavior of "Deep Research" tools by enabling the AI to autonomously search the web.

### **Workflow:**
1.  **User Query:** The user provides a research topic or a complex question.
2.  **Query Decomposition:** An LLM is prompted to break the main query down into 2-4 sub-questions or search keywords.
3.  **Parallel Web Search:** For each sub-question, the application calls a web search API (e.g., `duckduckgo-search` Python library, or SerpAPI).
4.  **URL Filtering & Scraping:** The top N URLs from each search are collected. A scraper (using `httpx` and `BeautifulSoup4` or `Playwright`) fetches the raw text content from these pages.
5.  **Contextual Summarization:** The raw content from each page is passed back to the LLM with a prompt to summarize the key findings relevant to the original query.
6.  **Final Synthesis:** All the summaries are aggregated. A final LLM prompt combines them into a single, coherent, well-structured research report with proper citations (links to the source URLs).
7.  **Execution:** This entire process is executed as an asynchronous Celery worker task due to its high latency.

---

## **5. The "DevOpsified" CI/CD & Deployment Pipeline**

This pipeline ensures that every code change is built, tested, scanned, and deployed automatically and reliably.

### **Version Control (Git & GitHub)**
- A well-defined branching strategy (e.g., Git Flow or GitHub Flow).
- Branch protection rules for the `main` branch, requiring Pull Requests (PRs) and status checks to pass before merging.

### **Continuous Integration (CI) - GitHub Actions**
- **Triggered On:** Every Pull Request (PR) and push to `main`.
- **Jobs:**
    1.  **Lint & Format:** `ruff` (Python linter), `black` (Python formatter), `eslint` and `prettier` (for frontend code).
    2.  **Unit & Integration Tests:** Runs the `pytest` suite for the backend and `vitest` for the frontend.
    3.  **Build Docker Images:** Builds the production-optimized Docker images for the backend and frontend.
    4.  **Container Security Scan:** Uses **Trivy** to scan the newly built Docker images for known vulnerabilities (CVEs) in the base images and installed packages. The pipeline will fail if high-severity vulnerabilities are found.
    5.  **Static Application Security Testing (SAST):** Uses **Bandit** (for Python) and **Snyc** or `npm audit` (for JavaScript) to find potential security flaws in the application code.
    6.  **Code Quality Gate:** Uploads test coverage reports to a service like Codecov.

### **Continuous Deployment (CD) - GitHub Actions**
- **Triggered On:** Successful merge to `main` (after严重的后果 of the CI pipeline).
- **Jobs:**
    1.  **Push to Registry:** Tags and pushes the validated Docker images to a container registry (e.g., Docker Hub, GitHub Container Registry, or a private cloud registry).
    2.  **Infrastructure Update:** **Terraform** or **Ansible** scripts are run from within the GitHub Action to update the cloud infrastructure (if deploying to AWS, GCP, or Azure).
    3.  **Deploy to Staging:** Automatically deploys the new images to a staging environment for final QA.
    4.  **Deploy to Production (Optional):** Can be configured for a production deployment, potentially using a "blue-green" or "rolling" update strategy to ensure zero downtime.

### **Infrastructure as Code (IaC)**
- **Terraform:** Defines the required cloud resources (VMs, load balancers, managed databases, storage accounts) in `.tf` files. This makes the infrastructure reproducible, version-controlled, and auditable.
- **Ansible:** Used for configuration management. Playbooks are used to provision the VMs (install Docker, configure Nginx, set up SSL, etc.), ensuring that every server is configured identically.

---

## **6. Complete Technology Stack & Prerequisites**

### **Hardware Prerequisites:**
-   A Linux machine (Ubuntu/Debian preferred) with a modern CPU.
-   **Minimum 16GB RAM** (32GB+ recommended for larger LLMs and running all services simultaneously).
-   **(Optional but recommended) A GPU with CUDA support** to run Ollama models significantly faster.
-   ~50GB of free disk space.

### **Software Prerequisites:**
1.  **Operating System:** A modern Linux distribution (e.g., Ubuntu 22.04 LTS).
2.  **Git:** For version control.
3.  **Docker & Docker Compose:** For containerization and local orchestration.
4.  **Python 3.10+ & `pip`:** For backend development.
5.  **Node.js 18+ & `npm`/`yarn`/`pnpm`:** For frontend development.
6.  **Ollama:** For running LLMs locally.
7.  **Make:** (Usually pre-installed on Linux) for using the `Makefile` shortcuts.

---

## **7. Local Development & Deployment Guide (The "One-Liner")**

To set up the development environment, follow these steps:
1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd rag-ops-lab
    ```
2.  **Configure environment variables:**
    ```bash
    cp .env.example .env
    # Edit .env with your secrets (generate a SECRET_KEY, set DB passwords, etc.)
    ```
3.  **Run the entire stack:**
    ```bash
    make deploy
    # Or manually: docker compose -f docker-compose.yml up --build -d
    ```
4.  **Access the services:**
    -   **Web UI:** `http://localhost`
    -   **API Docs:** `http://localhost/docs`
    -   **PGAdmin:** `http://localhost:5050`
    -   **Grafana:** `http://localhost:3001`
    -   **Prometheus:** `http://localhost:9090`
    -   **Flower (Celery):** `http://localhost:5555`
    -   **Kibana:** `http://localhost:5601`

### **Production Deployment Path:**
While the primary focus is local deployment, the architecture is designed for easy transition to the cloud. The recommended path is:
1.  **Build:** Push validated images from the CI pipeline to a container registry.
2.  **Provision:** Use **Terraform** to create the necessary cloud infrastructure (e.g., on AWS EC2 or DigitalOcean).
3.  **Configure:** Use **Ansible** to set up the production server(s), install Docker, and configure SSL.
4.  **Deploy:** Run the production `docker-compose.yml` on the server, pulling the latest images.

---

## **8. Project Directory Structure**

To ensure the project is readable for a beginner, the directory and file structure will be as follows:

```
rag-ops-lab/
├── .github/
│   └── workflows/
│       ├── backend-ci.yml         # CI/CD pipeline for backend
│       └── frontend-ci.yml        # CI/CD pipeline for frontend
├── ansible/                       # Ansible playbooks for deployment
│   ├── playbooks/
│   └── inventory
├── backend/                       # FastAPI application
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   ├── services/
│   │   ├── rag_service.py
│   │   └── research_service.py
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── docker-compose.yml             # Orchestrates all local services
├── frontend/                      # React SPA
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── infra/                         # Terraform configurations
│   ├── main.tf
│   └── variables.tf
├── monitoring/                    # Monitoring/README
├── nginx/                         # Nginx config
│   └── nginx.conf
├── scripts/                       # Utility scripts
│   ├── setup.sh
│   └── backup.sh
└── Makefile                       # One-line commands for everything
```

---

## **9. Skills & Knowledge Gained (The "Exponential" Growth)**

Upon completing this project, you will have production-grade experience with:
-   **API Development:** Building robust, authenticated, documented APIs with FastAPI.
-   **AI/ML Integration:** Working with embeddings, vector databases, and LLMs.
-   **State-of-the-Art Web UI:** Building modern, responsive, and interactive UIs with React.
-   **Data Engineering:** Understanding of data processing pipelines and storage (SQL, NoSQL, Vector DBs).
-   **Containerization & Orchestration:** Docker, Docker Compose, and networking.
-   **CI/CD:** Building and managing automated pipelines with GitHub Actions.
-   **Security:** Implementing JWT auth, secure secrets management, and vulnerability scanning.
-   **Observability:** Logging, metrics, and tracing in a distributed system.
-   **Infrastructure as Code:** Managing cloud infrastructure with Terraform and Ansible.
-   **Problem-Solving:** Dealing with real-world system integration challenges.

---

## **10. Conclusion & Next Steps</parameter>

This project plan serves as a comprehensive blueprint for building a modern, full-stack AI application while simultaneously mastering the entire DevOps lifecycle. The next step is to begin the implementation, starting with the foundational backend and database setup, followed by the frontend and the integration of the RAG pipeline. The end result will be a portfolio-worthy project that demonstrates deep technical expertise across the entire stack.
