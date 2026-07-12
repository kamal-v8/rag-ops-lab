import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const getNewSessionId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

function App() {
  const [sessionId, setSessionId] = useState(() => {
    let sid = localStorage.getItem("rag_session_id");
    if (!sid) {
      sid = getNewSessionId();
      localStorage.setItem("rag_session_id", sid);
    }
    return sid;
  });
  
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeContext, setActiveContext] = useState([]);
  const [isWebSearch, setIsWebSearch] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [ingestedFiles, setIngestedFiles] = useState([]);
  const [abortController, setAbortController] = useState(null);

  const messagesEndRef = useRef(null);
  const contextEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  const scrollContextToBottom = () => {
    contextEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch("http://localhost:8000/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to load sessions");
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://localhost:8000/chat-history/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
            // Extract the latest context if available
            const lastMsgWithContext = [...data.history].reverse().find(m => m.context_used && m.context_used.length > 0);
            if (lastMsgWithContext) setActiveContext(lastMsgWithContext.context_used);
            else setActiveContext([]);
          } else {
            setMessages([{
              role: "ai",
              content: "SYSTEM ONLINE. AWAITING INPUT...",
            }]);
            setActiveContext([]);
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
  
  useEffect(() => {
    scrollContextToBottom();
  }, [activeContext]);

  const handleNewChat = () => {
    const newSid = getNewSessionId();
    localStorage.setItem("rag_session_id", newSid);
    setSessionId(newSid);
  };

  const handleDeleteSession = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:8000/sessions/${id}`, { method: 'DELETE' });
      if (sessionId === id) {
        handleNewChat();
      } else {
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to delete");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowed = [".txt", ".pdf", ".docx"];
    if (!allowed.some((ext) => file.name.endsWith(ext))) {
      setUploadStatus({ type: "error", text: "ERR: Invalid format." });
      return;
    }

    setUploadStatus({ type: "loading", text: "INITIALIZING UPLOAD..." });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (response.ok) {
        setUploadStatus({ type: "success", text: "UPLOAD_SUCCESS: " + data.message });
        setIngestedFiles(prev => [...prev, file.name]);
      } else {
        setUploadStatus({ type: "error", text: "ERR: " + (data.detail || "Upload failed") });
      }
    } catch (error) {
      setUploadStatus({ type: "error", text: "ERR: Connection refused." });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }, { role: "ai", content: "", context: [] }]);
    setIsLoading(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const endpoint = "http://localhost:8000/rag-chat";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: userMsg, force_web_search: isWebSearch }),
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/event-stream")) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        setIsLoading(false);

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunkValue = decoder.decode(value, { stream: true });
            const lines = chunkValue.split("\n\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "context") {
                     setActiveContext(data.context);
                     setMessages((prev) => {
                       const newMessages = [...prev];
                       newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], context: data.context };
                       return newMessages;
                     });
                  } else if (data.type === "content") {
                     setMessages((prev) => {
                       const newMessages = [...prev];
                       newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: newMessages[newMessages.length - 1].content + data.content };
                       return newMessages;
                     });
                  }
                } catch (err) {}
              }
            }
          }
        }
      } else {
        const data = await response.json();
        setIsLoading(false);
        if (response.ok) {
          setActiveContext(data.context_used);
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = data.response;
            newMessages[newMessages.length - 1].context = data.context_used;
            return newMessages;
          });
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = "ERR: NO_CONNECTION";
          return newMessages;
        });
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
      fetchSessions();
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex overflow-hidden selection:bg-primary/30 selection:text-primary font-mono text-[13px]">
      
      {/* 1. Sidebar (History) */}
      <aside className="w-64 bg-surface-soft border-r border-hairline flex flex-col h-screen shrink-0 hidden md:flex shadow-2xl relative z-20">
        <div className="p-4 border-b border-hairline">
          <div className="flex items-center gap-2 mb-4">
             <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
             <span className="font-display font-bold text-primary tracking-widest text-xs uppercase">RAG_OPS_LAB // v1.0</span>
          </div>
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 bg-transparent border border-primary text-primary hover:bg-primary/10 px-4 py-2 text-xs font-bold transition-all uppercase tracking-widest">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            INIT_NEW_SESSION
          </button>
        </div>
        <div className="px-3 py-2 text-[10px] text-muted font-bold uppercase tracking-widest border-b border-hairline bg-surface-card/50">
           ACTIVE_SESSIONS
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <div 
              key={s.session_id} 
              onClick={() => {
                localStorage.setItem("rag_session_id", s.session_id);
                setSessionId(s.session_id);
              }}
              className={`group flex items-center justify-between p-2 cursor-pointer transition-all border-l-2 ${sessionId === s.session_id ? 'bg-primary/5 border-primary text-primary' : 'border-transparent hover:bg-surface-card hover:border-muted text-muted-soft'}`}
            >
              <div className="truncate text-xs font-medium flex-1 mr-2 opacity-90 transition-opacity">
                {s.title}
              </div>
              <button onClick={(e) => handleDeleteSession(s.session_id, e)} className="opacity-0 group-hover:opacity-100 hover:text-error text-muted p-1 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* 2. Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative bg-canvas z-10">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        
        {/* Chat Area Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-40 flex flex-col items-center relative z-10">
          <div className="w-full max-w-4xl flex flex-col">
            
            {uploadStatus && (
              <div className={`mb-6 px-4 py-2 border flex items-center gap-3 w-full text-xs font-bold uppercase tracking-widest ${uploadStatus.type === "error" ? "bg-error/10 border-error/50 text-error" : uploadStatus.type === "success" ? "bg-success/10 border-success/50 text-success" : "bg-primary/10 border-primary/50 text-primary"}`}>
                <span>{uploadStatus.text}</span>
                <button onClick={() => setUploadStatus(null)} className="ml-auto opacity-70 hover:opacity-100">&times;</button>
              </div>
            )}

            <div className="flex-1 space-y-6 w-full mt-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] ${msg.role === "user" ? "bg-surface-soft border border-hairline text-ink p-4" : "text-ink p-2 w-full"}`}>
                    
                    {msg.role === "user" ? (
                       <div className="flex flex-col">
                          <span className="text-[10px] text-primary/70 font-bold uppercase tracking-widest mb-1.5">USER_INPUT</span>
                          <p className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{msg.content}</p>
                       </div>
                    ) : (
                       <div className="flex flex-col w-full">
                          <div className="flex items-center gap-2 mb-3 border-b border-hairline pb-2">
                             <div className="w-4 h-4 bg-primary/20 flex items-center justify-center border border-primary/50 text-primary">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                             </div>
                             <span className="font-bold text-primary text-xs uppercase tracking-widest">AGENT_RESPONSE</span>
                          </div>
                          <div className="font-sans text-[14px] text-ink leading-relaxed">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <div className="my-4 overflow-hidden border border-hairline bg-surface-card">
                                       <div className="bg-surface-soft px-4 py-1.5 text-[10px] text-primary font-mono uppercase tracking-wider border-b border-hairline flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-[#f85149]"></div>
                                          <div className="w-2 h-2 rounded-full bg-[#d29922]"></div>
                                          <div className="w-2 h-2 rounded-full bg-[#2ea043]"></div>
                                          <span className="ml-2">{match[1]}</span>
                                       </div>
                                       <SyntaxHighlighter
                                         {...props}
                                         children={String(children).replace(/\n$/, '')}
                                         style={vscDarkPlus}
                                         language={match[1]}
                                         PreTag="div"
                                         customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                                       />
                                    </div>
                                  ) : (
                                    <code {...props} className="bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-primary text-[13px] font-mono mx-0.5">
                                      {children}
                                    </code>
                                  )
                                },
                                p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
                                a: ({node, ...props}) => <a className="text-primary hover:underline underline-offset-4 decoration-primary/50" target="_blank" rel="noreferrer" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 text-muted" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-muted" {...props} />,
                                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                                h1: ({node, ...props}) => <h1 className="text-xl font-display font-bold mb-4 mt-6 text-ink uppercase tracking-wider border-b border-hairline pb-2" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-display font-bold mb-3 mt-5 text-ink uppercase tracking-wider" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-display font-bold mb-2 mt-4 text-ink uppercase tracking-wider" {...props} />
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                       </div>
                    )}

                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start px-2 mt-4">
                  <div className="flex items-center gap-3 bg-surface-soft border border-hairline p-3">
                    <div className="w-3 h-3 bg-primary animate-pulse"></div>
                    <span className="text-primary text-xs font-bold uppercase tracking-widest animate-pulse">PROCESSING_QUERY...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        </div>

        {/* Input Area (Bottom) */}
        <div className="absolute bottom-0 left-0 right-0 bg-canvas/80 backdrop-blur-md border-t border-hairline pt-6 pb-6 px-6 flex flex-col items-center z-20">
          {abortController && (
            <button onClick={() => abortController.abort()} className="mb-4 px-4 py-1.5 bg-error/10 border border-error/50 hover:bg-error/20 text-error text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors pointer-events-auto">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" /></svg>
              SIGINT (STOP)
            </button>
          )}
          <form onSubmit={sendMessage} className="w-full max-w-4xl relative flex items-center pointer-events-auto">
            
            <div className="absolute left-0 flex items-center justify-center h-full aspect-square border-r border-hairline bg-surface-soft hover:bg-surface-card transition-colors">
              <input type="file" id="file-upload" className="hidden" accept=".txt,.pdf,.docx" onChange={handleFileUpload} />
              <label htmlFor="file-upload" className="cursor-pointer w-full h-full flex items-center justify-center text-muted hover:text-primary transition-colors" title="UPLOAD_DOC">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </label>
            </div>

            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="> ENTER COMMAND OR QUERY..." className="w-full bg-canvas border border-hairline pl-16 pr-44 py-4 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder-muted-soft text-primary text-sm shadow-inner" disabled={isLoading} />
            
            <div className="absolute right-14 flex items-center h-full py-2">
              <button
                type="button"
                onClick={() => setIsWebSearch(!isWebSearch)}
                className={`flex items-center gap-2 px-3 h-full border transition-all font-bold text-[10px] uppercase tracking-widest ${isWebSearch ? 'bg-primary/20 text-primary border-primary/50' : 'bg-surface-soft border-hairline text-muted hover:text-ink hover:bg-surface-card'}`}
                title="Force Web Search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                {isWebSearch ? 'WEB: ON' : 'WEB: OFF'}
              </button>
            </div>

            <button type="submit" disabled={isLoading || !input.trim()} className="absolute right-0 h-full px-4 bg-primary hover:bg-primary-active disabled:bg-surface-soft disabled:text-muted disabled:border-l disabled:border-hairline transition-colors text-canvas flex items-center justify-center font-bold">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>
      </main>

      {/* 3. System Logs Pane (Right) */}
      <aside className="w-80 bg-surface-dark border-l border-hairline flex flex-col h-screen shrink-0 hidden lg:flex shadow-2xl relative z-20">
         <div className="px-4 py-3 border-b border-hairline flex items-center justify-between bg-surface-card/30">
            <span className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
               SYSTEM_MONITOR
            </span>
            <span className="text-[10px] text-primary font-mono bg-primary/10 px-1.5 py-0.5">LIVE</span>
         </div>
         
         {/* Metrics Header */}
         <div className="p-4 border-b border-hairline space-y-3">
            <div>
               <div className="flex justify-between text-[10px] text-muted mb-1 font-bold">
                  <span>VECTOR_DB_LATENCY</span>
                  <span className="text-success">24ms</span>
               </div>
               <div className="w-full bg-surface-soft h-1">
                  <div className="bg-success h-full" style={{ width: '24%' }}></div>
               </div>
            </div>
            <div>
               <div className="flex justify-between text-[10px] text-muted mb-1 font-bold">
                  <span>RELEVANCE_SCORE_AVG</span>
                  <span className="text-primary">0.92</span>
               </div>
               <div className="w-full bg-surface-soft h-1">
                  <div className="bg-primary h-full" style={{ width: '92%' }}></div>
               </div>
            </div>
         </div>

         {/* Ingested Files */}
         {ingestedFiles.length > 0 && (
            <div className="p-4 border-b border-hairline bg-surface-dark-elevated">
               <div className="text-[10px] text-primary font-bold uppercase tracking-widest mb-3 pb-2 border-b border-hairline/30">
                  RECENTLY_INGESTED_FILES
               </div>
               <div className="space-y-2">
                  {ingestedFiles.map((fname, idx) => (
                     <div key={idx} className="flex items-center gap-2 text-[11px] text-on-dark-soft font-mono bg-surface-dark px-2 py-1.5 border border-hairline/20 rounded-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <span className="truncate">{fname}</span>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {/* Context Logs */}
         <div className="flex-1 overflow-y-auto p-4 bg-surface-dark-soft">
            <div className="text-[10px] text-muted font-bold uppercase tracking-widest mb-3 border-b border-hairline pb-2">
               RETRIEVED_CONTEXT_CHUNKS [{activeContext.length}]
            </div>
            
            {activeContext.length === 0 ? (
               <div className="text-xs text-muted-soft italic mt-4">NO_CONTEXT_LOADED</div>
            ) : (
               <div className="space-y-4">
                  {activeContext.map((ctx, idx) => (
                     <div key={idx} className="border border-hairline bg-surface-card overflow-hidden">
                        <div className="bg-surface-soft px-2 py-1.5 border-b border-hairline flex justify-between items-center">
                           <span className="text-[9px] text-primary font-bold uppercase tracking-widest">CHUNK_{idx.toString().padStart(4, '0')}</span>
                           <span className="text-[9px] text-muted font-mono">RANK:{idx+1}</span>
                        </div>
                        <div className="p-3 text-[11px] text-ink leading-relaxed font-sans opacity-80 break-words">
                           {ctx.substring(0, 300)}{ctx.length > 300 ? '...' : ''}
                        </div>
                     </div>
                  ))}
                  <div ref={contextEndRef} />
               </div>
            )}
         </div>
      </aside>

    </div>
  );
}

export default App;
