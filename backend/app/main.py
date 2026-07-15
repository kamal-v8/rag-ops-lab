import io
import json
import logging
import uuid

import chromadb
import docx
import fitz  # PyMuPDF
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from ollama import Client
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import ChatMessage
from .services.research_service import perform_deep_research

Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="RAG API",
    description="Backend API for the RAG Knowledge Base and Agents",
    version="0.1.0",
)

# Enable CORS so the React frontend can talk to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    chroma_client = chromadb.HttpClient(host="chromadb", port=8000)
    collection = chroma_client.get_or_create_collection(name="documents")
    logger.info("ChromaDB client initialized successfully.")
except Exception as e:
    chroma_client = None
    logger.error(f"Failed to connect to ChromaDB: {e}")

ollama_client = Client(host="http://ollama:11434")

logger.info("Loading CrossEncoder model...")
cross_encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
logger.info("CrossEncoder loaded.")


class ChatRequest(BaseModel):
    session_id: str
    message: str
    force_web_search: bool = False


# @app.get("/health", tags=["System"])
# async def health_check():
#     return {"status": "healthy"}


@app.post("/upload", tags=["Documents"])
async def upload_document(file: UploadFile = File(...)):
    """Upload a .txt, .pdf, or .docx file, chunk it, and save the embeddings to ChromaDB."""
    if not collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected.")

    allowed_extensions = (".txt", ".pdf", ".docx")
    if not file.filename.endswith(allowed_extensions):
        raise HTTPException(
            status_code=400, detail="Only .txt, .pdf, and .docx files are supported."
        )

    try:
        # 1. Read the file content
        content = await file.read()
        text = ""

        if file.filename.endswith(".txt"):
            text = content.decode("utf-8")
        elif file.filename.endswith(".pdf"):
            pdf_document = fitz.open(stream=content, filetype="pdf")
            for page in pdf_document:
                text += page.get_text() + "\n\n"
        elif file.filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n\n"

        # 2. Split the text into chunks (basic chunking by paragraphs)
        chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]

        if not chunks:
            return {"message": "File was empty."}

        # 3. Generate embeddings and save to ChromaDB
        for chunk in chunks:
            # Get the embedding vector from Ollama using nomic-embed-text
            response = ollama_client.embeddings(model="nomic-embed-text", prompt=chunk)
            embedding = response["embedding"]

            # Save to database
            collection.add(
                ids=[str(uuid.uuid4())],
                embeddings=[embedding],
                documents=[chunk],
                metadatas=[{"source": file.filename}],
            )

        return {
            "message": f"Successfully processed {len(chunks)} chunks from {file.filename}."
        }

    except Exception as e:
        logger.error(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat", tags=["AI"])
async def chat_endpoint(request: ChatRequest):
    try:
        response = ollama_client.chat(
            model="phi3", messages=[{"role": "user", "content": request.message}]
        )
        return {"response": response["message"]["content"]}
    except Exception as e:
        logger.error(f"Ollama Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag-chat", tags=["AI"])
async def rag_chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """Agentic router that decides whether to search web, search docs, or just chat."""
    try:
        # Save user message to DB
        user_msg = ChatMessage(
            role="user", session_id=request.session_id, content=request.message
        )
        db.add(user_msg)
        db.commit()

        # 1. Prepare Tools for Agentic Loop
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_documents",
                    "description": "Search the local vector database for information about uploaded files, documents, or internal knowledge.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "The exact search query to look up in the vector database"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "execute_system_command",
                    "description": "Execute a raw Linux bash command on the host server. Use this to check metrics, list files, or interact with the OS.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {"type": "string", "description": "The raw bash command to run (e.g. 'ls -la', 'ping google.com')"}
                        },
                        "required": ["command"]
                    }
                }
            }
        ]

        # Dynamically inject Web Search tool ONLY if the user enables it in the UI
        if request.force_web_search:
            tools.append({
                "type": "function",
                "function": {
                    "name": "search_web",
                    "description": "Search the live internet via SearxNG for recent news, events, or external information not found in local documents.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "The web search query"}
                        },
                        "required": ["query"]
                    }
                }
            })

        # 2. Build history payload
        history_records = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == request.session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(10)
            .all()
        )
        history_records.reverse()

        system_prompt = (
            "You are a highly capable DevOps AI agent. You have access to tools. "
            "CRITICAL RULE: If the user asks about recent events, modern tech terms, people, or ANY fact you aren't 100% certain about, "
            "you MUST use the `search_web` tool. Do not guess or say the term is unclear. ALWAYS search first."
        )
        messages_payload = [{"role": "system", "content": system_prompt}]
        for msg in history_records:
            role_map = "assistant" if msg.role == "ai" else "user"
            if msg.content != request.message or role_map != "user":
                messages_payload.append({"role": role_map, "content": msg.content})

        messages_payload.append({"role": "user", "content": request.message})

        def generate_response():
            import subprocess
            context_badge = []
            citations_str = ""
            
            # Step 1: Agent Router (Call LLM with tools)
            try:
                response = ollama_client.chat(model="qwen2.5:3b", messages=messages_payload, tools=tools)
            except Exception as e:
                yield f"data: {json.dumps({'type': 'content', 'content': f'**Ollama Error:** Model qwen2.5:3b might not be downloaded. ({e})'})}\n\n"
                return
            
            if response.get("message", {}).get("tool_calls"):
                messages_payload.append(response["message"])
                for tool_call in response["message"]["tool_calls"]:
                    func_name = tool_call["function"]["name"]
                    args = tool_call["function"]["arguments"]
                    
                    yield f"data: {json.dumps({'type': 'content', 'content': f'> Agent invoking: `{func_name}`...\n\n'})}\n\n"
                    
                    if func_name == "search_documents":
                        context_badge.append("Doc Search")
                        query = args.get("query", "")
                        if collection:
                            query_response = ollama_client.embeddings(model="nomic-embed-text", prompt=query)
                            results = collection.query(query_embeddings=[query_response["embedding"]], n_results=15)
                            retrieved_docs = results["documents"][0] if results["documents"] else []
                            if retrieved_docs:
                                pairs = [[query, doc] for doc in retrieved_docs]
                                scores = cross_encoder.predict(pairs)
                                scored_docs = sorted(zip(scores, retrieved_docs), key=lambda x: x[0], reverse=True)
                                docs = [doc for score, doc in scored_docs[:3]]
                                messages_payload.append({"role": "tool", "content": "\n\n".join(docs), "name": func_name})
                            else:
                                messages_payload.append({"role": "tool", "content": "No documents found in database.", "name": func_name})
                        else:
                            messages_payload.append({"role": "tool", "content": "Database offline.", "name": func_name})
                            
                    elif func_name == "search_web":
                        context_badge.append("Web Search")
                        query = args.get("query", "")
                        sys_p, usr_p, citations_str = perform_deep_research(query, ollama_client)
                        messages_payload.append({"role": "tool", "content": f"{sys_p}\n\n{usr_p}", "name": func_name})
                        
                    elif func_name == "execute_system_command":
                        context_badge.append("System Exec")
                        command = args.get("command", "")
                        try:
                            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=15)
                            out = result.stdout if result.returncode == 0 else result.stderr
                            if not out.strip():
                                out = "Command executed successfully with no output."
                            messages_payload.append({"role": "tool", "content": out, "name": func_name})
                        except Exception as e:
                            messages_payload.append({"role": "tool", "content": f"Error executing command: {e}", "name": func_name})

                # Step 2: Stream final synthesis
                stream = ollama_client.chat(model="qwen2.5:3b", messages=messages_payload, stream=True)
                full_ai_response = ""
                
                if context_badge:
                    yield f"data: {json.dumps({'type': 'context', 'context': context_badge})}\n\n"
                    
                for chunk in stream:
                    content = chunk["message"]["content"]
                    full_ai_response += content
                    yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"
                    
                if citations_str:
                    sources_text = f"\n\n**Sources:**\n{citations_str}"
                    full_ai_response += sources_text
                    yield f"data: {json.dumps({'type': 'content', 'content': sources_text})}\n\n"
            else:
                # No tools called, just output the normal chat response
                full_ai_response = response["message"]["content"]
                yield f"data: {json.dumps({'type': 'content', 'content': full_ai_response})}\n\n"

            # Save final AI answer to database
            ai_msg = ChatMessage(
                role="ai",
                session_id=request.session_id,
                content=full_ai_response,
                context_used=json.dumps(context_badge) if 'context_badge' in locals() else "[]",
            )
            new_db = next(get_db())
            new_db.add(ai_msg)
            new_db.commit()
            new_db.close()

        return StreamingResponse(generate_response(), media_type="text/event-stream")

    except Exception as e:
        logger.error(f"Agent Router Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat-history/{session_id}", tags=["AI"])
async def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    history = []
    for msg in messages:
        history.append(
            {
                "role": msg.role,
                "content": msg.content,
                "context_used": json.loads(msg.context_used)
                if msg.context_used
                else [],
            }
        )
    return {"history": history}


@app.get("/sessions", tags=["AI"])
async def get_sessions(db: Session = Depends(get_db)):
    """Returns a list of all chat sessions."""
    from sqlalchemy import func

    latest_times = (
        db.query(
            ChatMessage.session_id, func.max(ChatMessage.created_at).label("updated_at")
        )
        .group_by(ChatMessage.session_id)
        .order_by(func.max(ChatMessage.created_at).desc())
        .all()
    )

    sessions = []
    for session_id, updated_at in latest_times:
        first_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id, ChatMessage.role == "user")
            .order_by(ChatMessage.created_at.asc())
            .first()
        )

        title = (
            first_msg.content[:40] + "..."
            if first_msg and len(first_msg.content) > 40
            else (first_msg.content if first_msg else "New Chat")
        )

        sessions.append(
            {
                "session_id": session_id,
                "title": title,
                "updated_at": updated_at.isoformat() if updated_at else None,
            }
        )

    return {"sessions": sessions}


@app.delete("/sessions/{session_id}", tags=["AI"])
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.commit()
    return {"status": "success"}


@app.post("/deep-research", tags=["AI"])
async def deep_research_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """Orchestrates the deep research flow and streams the response."""
    try:
        # Save user request to DB
        user_msg = ChatMessage(
            role="user", session_id=request.session_id, content=request.message
        )
        db.add(user_msg)
        db.commit()

        clean_query = request.message.replace("/research ", "").strip()
        system_prompt, user_prompt, citations_str = perform_deep_research(
            clean_query, ollama_client
        )

        def generate_research_response():
            # If no results found, perform_deep_research returns a simple string message
            if not user_prompt:
                yield f"data: {json.dumps({'type': 'content', 'content': system_prompt})}\n\n"
                return

            # Stream the actual AI generation
            stream = ollama_client.chat(
                model="phi3",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
            )

            full_ai_response = ""

            # Send the Web Search context badge to UI
            yield f"data: {json.dumps({'type': 'context', 'context': ['Web Search']})}\n\n"

            for chunk in stream:
                content = chunk["message"]["content"]
                full_ai_response += content
                yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

            # Stream the citations at the end
            sources_text = f"\n\n**Sources:**\n{citations_str}"
            full_ai_response += sources_text
            yield f"data: {json.dumps({'type': 'content', 'content': sources_text})}\n\n"

            # Save to DB
            ai_msg = ChatMessage(
                role="ai",
                session_id=request.session_id,
                content=full_ai_response,
                context_used='["Web Search"]',
            )
            new_db = next(get_db())
            new_db.add(ai_msg)
            new_db.commit()
            new_db.close()

        return StreamingResponse(
            generate_research_response(), media_type="text/event-stream"
        )

    except Exception as e:
        logger.error(f"Deep Research Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
