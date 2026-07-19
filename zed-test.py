#!/usr/bin/env python3
"""
Zed Test Script for RAG Ops Lab
-------------------------------
This script performs basic environment verification, checks Python imports,
and tests connection to the containerized services of the RAG Ops Lab.
"""

import sys
import socket
import urllib.request
import urllib.error

# ANSI coloring helpers
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_section(title):
    print(f"\n{BOLD}{BLUE}=== {title} ==={RESET}")

def print_result(name, success, message=""):
    status = f"{GREEN}[PASS]{RESET}" if success else f"{RED}[FAIL]{RESET}"
    msg = f" - {message}" if message else ""
    print(f"  {status} {name}{msg}")

def check_port(host, port):
    try:
        with socket.create_connection((host, port), timeout=2.0):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def check_http(url):
    try:
        with urllib.request.urlopen(url, timeout=2.0) as response:
            return response.status == 200
    except urllib.error.HTTPError as e:
        # 4xx/5xx still means the service is alive and listening!
        return True
    except Exception:
        return False

def main():
    print(f"{BOLD}Running RAG Ops Lab Diagnostics...{RESET}\n")

    # 1. Check Python Environment
    print_section("Python Environment Info")
    print(f"  Python Version : {sys.version}")
    print(f"  Executable     : {sys.executable}")
    
    # 2. Check Package Imports
    print_section("Verifying Python Library Imports")
    libraries = [
        ("requests", "requests"),
        ("chromadb", "chromadb"),
        ("ollama", "ollama"),
        ("fastapi", "fastapi"),
        ("sentence_transformers", "sentence-transformers"),
        ("bs4", "beautifulsoup4"),
    ]
    
    for lib_module, lib_name in libraries:
        try:
            __import__(lib_module)
            print_result(f"Import {lib_name}", True)
        except ImportError as e:
            print_result(f"Import {lib_name}", False, f"Error: {e}")

    # 3. Check Running Services (via localhost ports)
    print_section("Checking Local Docker Services")
    services = [
        ("PostgreSQL", "localhost", 5432, "Database"),
        ("Redis", "localhost", 6379, "Caching / Session Store"),
        ("FastAPI Backend (API)", "localhost", 8000, "Core orchestration API"),
        ("React Frontend", "localhost", 5173, "Dashboard UI"),
        ("ChromaDB", "localhost", 8001, "Vector DB"),
        ("Ollama", "localhost", 11433, "Local LLM Server"),
        ("SearXNG", "localhost", 8080, "Private Search Engine"),
        ("Prometheus", "localhost", 9000, "Metrics database"),
        ("Grafana", "localhost", 3000, "Dashboard metrics visualizer"),
    ]

    for name, host, port, desc in services:
        is_open = check_port(host, port)
        if is_open:
            # Check if we can also query it over HTTP if applicable
            url = f"http://{host}:{port}"
            if port in [8000, 5173, 8001, 11433, 8080, 9000, 3000]:
                is_alive = check_http(url)
                status_msg = f"Port {port} open, HTTP responding" if is_alive else f"Port {port} open, but HTTP error"
                print_result(f"{name} ({desc})", True, status_msg)
            else:
                print_result(f"{name} ({desc})", True, f"Port {port} open")
        else:
            print_result(f"{name} ({desc})", False, f"Port {port} is closed/unreachable")

    print(f"\n{BOLD}Diagnostic run complete!{RESET}\n")

if __name__ == "__main__":
    main()
