import { useState, useRef, useEffect } from 'react';

const getOrCreateSessionId = () => {
  let sessionId = localStorage.getItem('rag_session_id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('rag_session_id', sessionId);
  }
  return sessionId;
};

function App() {
  const sessionId = getOrCreateSessionId();
  const [messages, setMessages] = useState([
    { role: 'ai', content: "Hello! I am your RAG AI Assistant. Upload a document to get started, or ask me anything!" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://localhost:8000/chat-history/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          }
        }
      } catch (err) {
        console.error("Failed to load history");
      }
    };
    fetchHistory();
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowed = ['.txt', '.pdf', '.docx'];
    if (!allowed.some(ext => file.name.endsWith(ext))) {
      setUploadStatus({ type: 'error', text: 'Only .txt, .pdf, and .docx files are supported.' });
      return;
    }

    setUploadStatus({ type: 'loading', text: 'Uploading and analyzing document...' });
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (response.ok) {
        setUploadStatus({ type: 'success', text: data.message });
      } else {
        setUploadStatus({ type: 'error', text: data.detail || 'Upload failed' });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', text: 'Failed to connect to server.' });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const isResearch = userMsg.startsWith('/research');
      const endpoint = isResearch ? 'http://localhost:8000/deep-research' : 'http://localhost:8000/rag-chat';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: userMsg }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessages(prev => [...prev, { role: 'ai', content: data.response, context: data.context_used }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: `Error: ${data.detail || 'Something went wrong.'}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Error: Could not reach the server. Is it running?' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col items-center font-sans">
      
      {/* Header */}
      <header className="w-full max-w-3xl flex justify-between items-center py-8 px-4 sm:px-6">
        <div>
          <h1 className="text-4xl font-display text-ink tracking-tight mb-1">
            RAG Ops Lab
          </h1>
          <p className="text-muted text-sm font-medium">Anthropic Design Edition</p>
        </div>
        
        <div className="relative">
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            accept=".txt,.pdf,.docx" 
            onChange={handleFileUpload} 
          />
          <label 
            htmlFor="file-upload" 
            className="cursor-pointer flex items-center gap-2 bg-surface-soft hover:bg-surface-card text-ink border border-hairline px-4 py-2.5 rounded-lg transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Upload
          </label>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-3xl flex flex-col relative px-4 sm:px-6 pb-32">
        
        {uploadStatus && (
          <div className={`mb-8 px-4 py-3 rounded-lg border flex items-center gap-3 w-full
            ${uploadStatus.type === 'error' ? 'bg-[#fcf0f0] border-error/20 text-error' : 
              uploadStatus.type === 'success' ? 'bg-[#f0fcf4] border-success/20 text-success' : 
              'bg-surface-soft border-hairline text-ink'}`}
          >
            <span className="text-sm font-medium">{uploadStatus.text}</span>
            <button onClick={() => setUploadStatus(null)} className="ml-auto opacity-70 hover:opacity-100">&times;</button>
          </div>
        )}

        <div className="flex-1 space-y-10">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] ${
                msg.role === 'user' 
                  ? 'bg-surface-soft border border-hairline text-ink rounded-2xl rounded-tr-sm px-5 py-4' 
                  : 'text-body font-sans px-2'
              }`}>
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <span className="font-semibold text-ink text-sm">Assistant</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{msg.content}</p>
                
                {msg.context && msg.context.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-hairline">
                    <p className="text-xs text-muted font-semibold mb-2 uppercase tracking-widest">
                      Retrieved Context
                    </p>
                    <p className="text-[13px] text-muted-soft italic line-clamp-3 bg-surface-soft p-3 rounded-md border border-hairline">
                      "{msg.context[0]}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start px-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center animate-pulse">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <span className="text-muted text-sm animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area (Sticky Bottom) */}
      <div className="fixed bottom-0 w-full bg-gradient-to-t from-canvas via-canvas to-transparent pt-10 pb-8 px-4 flex justify-center">
        <form onSubmit={sendMessage} className="w-full max-w-3xl relative flex items-center shadow-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Assistant..."
            className="w-full bg-white border border-hairline rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:border-primary transition-colors placeholder-muted-soft text-ink shadow-sm text-[15px]"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="absolute right-3 p-2 bg-primary hover:bg-primary-active disabled:bg-primary-disabled disabled:text-muted rounded-lg transition-colors text-white flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </div>

    </div>
  );
}

export default App;
