import subprocess
import asyncio
from ollama import Client

ollama_client = Client(host="http://ollama:11434")

async def execute_system_command(user_query: str):
    # 1. Ask Phi3 to translate the user query into a raw bash command
    prompt = f"Convert this query into a safe Linux bash command. Output ONLY the raw command, no markdown, no explanation: {user_query}"
    
    response = ollama_client.chat(model="phi3", messages=[{"role": "user", "content": prompt}])
    command = response["message"]["content"].strip().replace("`", "")
    
    # Stream the command being executed to the UI
    yield f"data: {{\"type\": \"content\", \"content\": \"> Executing: {command}\\n\\n\"}}\n\n"
    await asyncio.sleep(0.5)
    
    try:
        # 2. Execute the command securely inside the container
        result = subprocess.run(
            command, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=10 # Prevent infinite hangs
        )
        
        output = result.stdout if result.returncode == 0 else result.stderr
        if not output.strip():
            output = "Command executed successfully with no terminal output."
            
        # 3. Stream the terminal output back
        # We need to escape newlines for Server-Sent Events formatting
        formatted_output = output.replace("\n", "\\n").replace("\"", "\\\"")
        yield f"data: {{\"type\": \"content\", \"content\": \"{formatted_output}\\n\"}}\n\n"
        
    except subprocess.TimeoutExpired:
         yield "data: {{\"type\": \"content\", \"content\": \"ERR: Command timed out after 10 seconds.\\n\"}}\n\n"
    except Exception as e:
         yield f"data: {{\"type\": \"content\", \"content\": \"ERR: {str(e)}\\n\"}}\n\n"
