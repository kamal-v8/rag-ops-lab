import logging
import uuid

import chromadb
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ollama import Client
from pydantic import BaseModel

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
    message: str


# @app.get("/health", tags=["System"])
# async def health_check():
#     return {"status": "healthy"}


@app.post("/upload", tags=["Documents"])
async def upload_document(file: UploadFile = File(...)):
    """Upload a .txt file, chunk it, and save the embeddings to ChromaDB."""
    if not collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected.")

    if not file.filename.endswith(".txt"):
        raise HTTPException(
            status_code=400, detail="Only .txt files are supported right now."
        )

    try:
        # 1. Read the file content
        content = await file.read()
        text = content.decode("utf-8")

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
async def rag_chat_endpoint(request: ChatRequest):
    """Query ChromaDB for context and then ask the AI model."""
    if not collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected.")

    try:
        # 1. Embed the user's question
        query_response = ollama_client.embeddings(model='nomic-embed-text', prompt=request.message)
        query_embedding = query_response['embedding']

        # 2. Search ChromaDB for the 3 most relevant document chunks
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=3
        )

        # Extract the text chunks from the search results
        documents = results['documents'][0] if results['documents'] else []
        context = "\n\n".join(documents)

        # 3. Construct the prompt for the AI
        system_prompt = (
            "You are a helpful assistant. Use the following pieces of retrieved context to answer the question. "
            "If you don't know the answer based on the context, just say that you don't know.\n\n"
            f"Context:\n{context}"
        )

        # 4. Ask phi3 using the context
        chat_response = ollama_client.chat(model='phi3', messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': request.message}
        ])

        return {
            "response": chat_response['message']['content'],
            "context_used": documents
        }
    except Exception as e:
        logger.error(f"RAG Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
