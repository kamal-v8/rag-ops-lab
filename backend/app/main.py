from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import chromadb
from ollama import Client
import logging
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="RAG API")

# Initialize ChromaDB and create our 'documents' collection
try:
    chroma_client = chromadb.HttpClient(host='chromadb', port=8000)
    collection = chroma_client.get_or_create_collection(name="documents")
    logger.info("ChromaDB client initialized successfully.")
except Exception as e:
    chroma_client = None
    collection = None
    logger.error(f"Failed to connect to ChromaDB: {e}")

ollama_client = Client(host='http://ollama:11434')

class ChatRequest(BaseModel):
    message: str

@app.get("/health", tags=["System"])
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy", "message": "API is operational."}

@app.get("/db-status", tags=["System"])
async def db_status():
    """Check the connection to ChromaDB."""
    if not chroma_client:
        raise HTTPException(status_code=503, detail="ChromaDB client is not initialized.")
    try:
        heartbeat = chroma_client.heartbeat()
        return {"status": "healthy", "message": "Connected to ChromaDB!", "heartbeat": heartbeat}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to ping ChromaDB: {str(e)}")

@app.post("/upload", tags=["Documents"])
async def upload_document(file: UploadFile = File(...)):
    """Upload a .txt file, chunk it, and save the embeddings to ChromaDB."""
    if not collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected.")
    
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are supported right now.")

    try:
        # 1. Read the file content
        content = await file.read()
        text = content.decode('utf-8')

        # 2. Split the text into chunks (basic chunking by paragraphs)
        chunks = [chunk.strip() for chunk in text.split('\n\n') if chunk.strip()]

        if not chunks:
            return {"message": "File was empty."}

        # 3. Generate embeddings and save to ChromaDB
        for chunk in chunks:
            response = ollama_client.embeddings(model='phi3', prompt=chunk)
            embedding = response['embedding']

            collection.add(
                ids=[str(uuid.uuid4())],
                embeddings=[embedding],
                documents=[chunk],
                metadatas=[{"source": file.filename}]
            )

        return {"message": f"Successfully processed {len(chunks)} chunks from {file.filename}."}
    
    except Exception as e:
        logger.error(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", tags=["AI"])
async def chat_endpoint(request: ChatRequest):
    """Send a message directly to the AI model."""
    try:
        response = ollama_client.chat(model='phi3', messages=[
            {'role': 'user', 'content': request.message}
        ])
        return {"response": response['message']['content']}
    except Exception as e:
        logger.error(f"Ollama Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
