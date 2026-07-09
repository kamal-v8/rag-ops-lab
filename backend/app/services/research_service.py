import logging
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)

def perform_deep_research(query: str, ollama_client) -> str:
    """Searches the web, scrapes the top 3 pages, and synthesizes a report."""
    logger.info(f"Starting deep research for: {query}")

    # 1. Search the web
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=3))

    if not results:
        return "I couldn't find any info on the web regarding the topic."

    scraped_content = []
    citations = []

    # 2. Scrape the top 3 results/URLs
    for idx, result in enumerate(results):
        url = result["href"]
        title = result["title"]
        citations.append(f"[{idx + 1}] {title}: {url}")

        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                # Extract Text from Paragraphs
                paragraphs = soup.find_all("p")
                page_text = " ".join([p.get_text() for p in paragraphs])
                # Truncate
                scraped_content.append(f"Source: {title}\n{page_text[:1500]}")
        except Exception as e:
            logger.warning(f"Failed to scrape {url}: {e}")

    # 3. Synthesize with Ollama
    combined_context = "\n\n---\n\n".join(scraped_content)
    system_prompt = (
        "You are an expert research assistant. Synthesize the following scraped web content "
        "into a comprehensive, well-structured research report answering the user's query. "
        "Always cite your sources using the provided references."
    )

    try:
        chat_response = ollama_client.chat(
            model="phi3",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Context:\n{combined_context}\n\nQuery: {query}",
                },
            ],
        )

        report = chat_response["message"]["content"]
        citations_str = "\n".join(citations)
        return f"{report}\n\n**Sources:**\n{citations_str}"

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        return "I gathered the research, but the AI failed to synthesize it."
