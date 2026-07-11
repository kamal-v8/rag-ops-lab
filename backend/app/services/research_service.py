import logging

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def perform_deep_research(query: str, ollama_client) -> str:
    """Searches the web via SearxNG, scrapes the top 3 pages, and synthesizes a report."""
    logger.info(f"Starting deep research for: {query}")

    scraped_content = []
    citations = []

    # 1. Search the web via local SearxNG microservice
    searxng_url = "http://searxng:8080/search"
    params = {"q": query, "format": "json"}

    headers = {
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
        "Accept": "application/json",
    }

    try:
        search_resp = requests.get(
            searxng_url, params=params, headers=headers, timeout=10
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()
        results = search_data.get("results", [])[:3]
    except Exception as e:
        logger.error(f"SearxNG Search Failed: {e}")
        results = []

    if not results:
        return "I couldn't find any info on the web regarding the topic.", "", ""

    # 2. Scrape the top 3 results/URLs
    for idx, result in enumerate(results):
        url = result.get("url")
        title = result.get("title", "Unknown Title")
        citations.append(f"[{idx + 1}] {title}: {url}")

        if not url:
            continue

        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                # Extract Text from Paragraphs
                paragraphs = soup.find_all("p")
                page_text = " ".join([p.get_text() for p in paragraphs])
                # Truncate to avoid blowing up the context window
                scraped_content.append(f"Source: {title}\n{page_text[:1500]}")
        except Exception as e:
            logger.warning(f"Failed to scrape {url}: {e}")

    # 3. Prepare the Prompts
    combined_context = "\n\n---\n\n".join(scraped_content)
    system_prompt = (
        "You are an expert research assistant. Synthesize the following scraped web content "
        "into a comprehensive, well-structured research report answering the user's query. "
        "Always cite your sources using the provided references."
    )
    user_prompt = f"Context:\n{combined_context}\n\nQuery: {query}"
    citations_str = "\n".join(citations)

    # Return the prompts back to main.py so it can stream the response
    return system_prompt, user_prompt, citations_str
