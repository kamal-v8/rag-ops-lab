from fastapi import FastAPI

app = FastAPI(
    title="RAG API",
    description="Backend API for the RAG Knowledge Base and Agents",
    version="0.1.0",
)


@app.get("/health", tags=["System"])
async def health_check():
    """
    Basic health check endpoint to verify the API is running.
    """
    return {"status": "healthy", "message": "API is operational."}
