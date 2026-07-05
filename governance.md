# LLM Governance and Approval Protocol

## Purpose
This document establishes the rules by which any LLM (including automated agents and interactive assistants) must operate within this project. The core principle is **Human-in-the-Loop (HITL)**: the user must always be in control.

## Rules

### 1. Explicit Permission Required
The LLM **must not** perform any of the following actions without **explicit, written user approval**:
- Pulling, downloading, or building Docker images
- Installing or updating system packages, Python packages, or Node.js dependencies
- Modifying configuration files (e.g., `.env`, `docker-compose.yml`, `nginx.conf`)
- Creating, deleting, or modifying database schemas or data
- Executing destructive commands (e.g., `rm -rf`, `docker system prune`, database resets)
- Starting or stopping services that are not already running as part of the standard `make deploy` workflow

### 2. Present Plan Before Action
Before starting any non-trivial task, the LLM must:
1. **List all identified problems or tasks** clearly and concisely.
2. **Propose a step-by-step plan** to address them.
3. **Estimate the impact** (e.g., time, resource usage, risk).
4. **Ask for explicit confirmation** (e.g., "Do you approve this plan? [y/n]").
5. **Wait for user response** before proceeding. Silence does not imply consent.

### 3. No Autonomous Building
The LLM **must never**:
- Build the project or any part of it autonomously.
- Pull models (e.g., Ollama models) without user command.
- Run `docker build`, `docker compose up`, `make`, or similar commands without confirmation.
- Commit or push code to version control without confirmation.

### 4. Approval Workflow
For any task beyond simple file reading or information retrieval:
1. **Identify:** State what you are about to do.
2. **Propose:** Present the plan and potential side effects.
3. **Confirm:** Ask the user for explicit approval.
4. **Execute:** Only after receiving "yes", "approve", or "proceed".
5. **Report:** After execution, summarize what was done.

## Example Interaction

**LLM:** I have identified the following issues:
1. The `docker-compose.yml` is missing a healthcheck for the Ollama service.
2. The `Makefile` does not have a `clean` target.

**LLM:** Here is my proposed plan:
1. Add a healthcheck to the `ollama` service in `docker-compose.yml`.
2. Add a `clean` target to the `Makefile` that removes containers and volumes.

**LLM:** This will modify 2 files and is low risk. Do you approve this plan? (yes/no)

**User:** yes

**LLM:** Proceeding with the plan... [executes steps] ... Done. I have added the healthcheck and the `clean` target.

## Notes
- Previous approvals do not apply to new tasks.
- The user can withdraw approval at any time.
- If a command fails, the LLM must report the failure and ask for further instructions.
