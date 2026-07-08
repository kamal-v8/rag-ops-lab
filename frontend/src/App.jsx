import { useState, useRef, useEffect } from 'react';

function App() {
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
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setUploadStatus({ type: 'error', text: 'Only .txt files are supported.' });
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
      const response = await fetch('http://localhost:8000/rag-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
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
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white flex flex-col items-center p-4 sm:p-8 font-sans">
      
      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tight">
            RAG Ops Lab
          </h1>
          <p className="text-slate-400 text-sm mt-1">NVIDIA GPU Accelerated Local AI</p>
        </div>
        
        {/* Upload Button */}
        <div className="relative">
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            accept=".txt" 
            onChange={handleFileUpload} 
          />
          <label 
            htmlFor="file-upload" 
            className="cursor-pointer flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-xl transition-all shadow-lg backdrop-blur-sm active:scale-95 text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Upload Knowledge
          </label>
        </div>
      </div>

      {/* Status Toast */}
      {uploadStatus && (
        <div className={`mb-6 px-4 py-3 rounded-lg border backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4 w-full max-w-4xl
          ${uploadStatus.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 
            uploadStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 
            'bg-blue-500/10 border-blue-500/30 text-blue-200'}`}
        >
          <span className="text-sm">{uploadStatus.text}</span>
          <button onClick={() => setUploadStatus(null)} className="ml-auto opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Chat Glass Container */}
      <div className="flex-1 w-full max-w-4xl bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md' 
                  : 'bg-white/10 border border-white/5 text-slate-100 shadow-sm'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                
                {/* Context Badge */}
                {msg.context && msg.context.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-indigo-300 font-semibold mb-1 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                      Retrieved from ChromaDB
                    </p>
                    <p className="text-[11px] text-slate-400 italic line-clamp-2 bg-black/20 p-2 rounded-md">
                      "{msg.context[0]}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/10 border border-white/5 rounded-2xl px-5 py-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-black/20 border-t border-white/10">
          <form onSubmit={sendMessage} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your documents..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder-slate-500 text-white"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="absolute right-2 p-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:opacity-50 rounded-full transition-all text-white flex items-center justify-center active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default App;
