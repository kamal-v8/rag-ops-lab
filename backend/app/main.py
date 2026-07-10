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


class ChatRequest(BaseModel):
    session_id: str
    message: str


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
    """Query ChromaDB for context and then ask the AI model."""
    if not collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected.")

    try:
        # Save user message to DB
        user_msg = ChatMessage(
            role="user", session_id=request.session_id, content=request.message
        )
        db.add(user_msg)
        db.commit()

        # 1. Embed the user's question
        query_response = ollama_client.embeddings(
            model="nomic-embed-text", prompt=request.message
        )
        query_embedding = query_response["embedding"]

        # 2. Search ChromaDB for the 3 most relevant document chunks
        results = collection.query(query_embeddings=[query_embedding], n_results=3)

        # Extract the text chunks from the search results
        documents = results["documents"][0] if results["documents"] else []
        context = "\n\n".join(documents)

        # 3. Construct the prompt for the AI
        system_prompt = (
            "You are a helpful AI assistant. You have been provided with some retrieved context from the user's documents.\n"
            "If the context is relevant to the user's question, use it to formulate your answer.\n"
            "If the context is irrelevant to the question, completely ignore the context and answer the question using your own general knowledge.\n\n"
            f"Context:\n{context}"
        )

        # Build message history for conversational memory (last 10 messages)
        history_records = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == request.session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(10)
            .all()
        )
        history_records.reverse()  # Sort chronologically

        # 4. Stream response from phi3
        messages_payload = [{"role": "system", "content": system_prompt}]
        for msg in history_records:
            # Ollama expects 'assistant' instead of 'ai'
            role_map = "assistant" if msg.role == "ai" else "user"
            messages_payload.append({"role": role_map, "content": msg.content})

        def generate_response():
            stream = ollama_client.chat(model='phi3', messages=messages_payload, stream=True)
            full_ai_response = ""
            
            # Send context first (optional, but good for UI)
            yield f"data: {json.dumps({'type': 'context', 'context': documents})}\n\n"

            for chunk in stream:
                content = chunk['message']['content']
                full_ai_response += content
                # Yield the word chunk in Server-Sent Events (SSE) format
                yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

            # Once the stream finishes, save the full message to the database
            ai_msg = ChatMessage(
                role='ai', 
                session_id=request.session_id, 
                content=full_ai_response, 
                context_used=json.dumps(documents)
            )
            # We need a new db session here since the original one might close during streaming
            new_db = next(get_db())
            new_db.add(ai_msg)
            new_db.commit()
            new_db.close()

        return StreamingResponse(generate_response(), media_type="text/event-stream")
    except Exception as e:
        logger.error(f"RAG Chat Error: {e}")
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


@app.post("/deep-research", tags=["AI"])
async def deep_research_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """Orchestrates the deep research flow and saves to history."""
    try:
        # Save user request to DB
        user_msg = ChatMessage(
            role="user", session_id=request.session_id, content=request.message
        )
        db.add(user_msg)
        db.commit()

        # Execute research
        clean_query = request.message.replace("/research ", "").strip()
        report = perform_deep_research(clean_query, ollama_client)

        # Save AI response to DB
        ai_msg = ChatMessage(
            role="ai",
            session_id=request.session_id,
            content=report,
            context_used='["Web Search"]',
        )
        db.add(ai_msg)
        db.commit()

        return {"response": report, "context_used": ["Web Search"]}
    except Exception as e:
        logger.error(f"Deep Research Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
