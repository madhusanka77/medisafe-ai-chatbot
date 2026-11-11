import { useState, useRef, useEffect } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState('chat');

  // --- CHATBOT STATES ---
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello Pathum! I am your AI Medical Assistant. How are you feeling today?", sender: "bot" }
  ]);
  const [inputText, setInputText] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [chatError, setChatError] = useState(""); // 🌟 Validation State for Chat
  
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US'; 

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + " " + transcript);
        setChatError(""); // Clear error when typing
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      }
    }
  };

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      const cleanText = text.replace(/[*#]/g, '').trim(); 
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US'; 
      utterance.rate = 1.0; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.includes('image/') && file.type !== 'application/pdf') {
        alert("Please upload only PDF reports or Images (JPG/PNG).");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        setSelectedFile({
          base64: base64String,
          mimeType: file.type || 'application/pdf',
          name: file.name,
          isImage: file.type.startsWith('image/'),
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
        });
        setChatError(""); // Clear error when file selected
      };
      reader.readAsDataURL(file);
    }
    setIsAttachMenuOpen(false);
  };

  const handleSendMessage = async () => {
    // 🌟 VALIDATION: Check if empty
    if (inputText.trim() === "" && !selectedFile) {
      setChatError("Please type a message or attach a file first.");
      return;
    }

    if (isListening) toggleListening();
    setChatError(""); // Clear any previous errors

    const newUserMessage = { 
        id: Date.now(), 
        text: inputText, 
        sender: "user",
        file: selectedFile ? { ...selectedFile } : null 
    };
    
    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);
    
    const payload = { message: inputText || "Please analyze this medical report." };
    if (selectedFile) {
        payload.file_data = selectedFile.base64;
        payload.mime_type = selectedFile.mimeType;
    }

    setInputText(""); 
    setSelectedFile(null);
    setIsChatLoading(true);
    
    try {
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      
      let aiText = data.response;
      let actionType = null;

      // Handle specific API limit error message from backend
      if (aiText === "මට පොඩි ප්‍රශ්නයක් ආවා. කරුණාකර නැවත උත්සාහ කරන්න.") {
          aiText = "System is experiencing high traffic. Please try again in a few seconds.";
      }
      
      if (aiText.includes("[ACTION: BOOK_APPOINTMENT]")) {
          actionType = "BOOK_APPOINTMENT";
          aiText = aiText.replace("[ACTION: BOOK_APPOINTMENT]", "").trim(); 
      }

      const botMessage = { id: Date.now() + 1, text: aiText, sender: "bot", action: actionType };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
      
      if(actionType !== null || aiText !== "System is experiencing high traffic. Please try again in a few seconds."){
          speakResponse(aiText);
      }

    } catch (error) {
      setMessages((prev) => [...prev, { id: Date.now() + 2, text: "System is busy. Please try again later.", sender: "bot" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleDeleteMessage = (msgId) => {
    const index = messages.findIndex(m => m.id === msgId);
    if (index === -1) return;
    let idsToRemove = [msgId];
    if (messages[index].sender === 'user' && messages[index + 1] && messages[index + 1].sender === 'bot') {
      idsToRemove.push(messages[index + 1].id);
    } else if (messages[index].sender === 'bot' && messages[index - 1] && messages[index - 1].sender === 'user') {
      idsToRemove.push(messages[index - 1].id);
    }
    setMessages(prevMessages => prevMessages.filter(msg => !idsToRemove.includes(msg.id)));
  };

  // --- CREATE FEEDBACK ---
  const [reviewText, setReviewText] = useState("");
  const [feedbackResult, setFeedbackResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(""); // 🌟 Validation State for Feedback

  const handleFeedbackSubmit = async () => {
    // 🌟 VALIDATION: Check if empty
    if (reviewText.trim() === "") {
        setFeedbackError("Feedback cannot be empty. Please write something.");
        return;
    }

    setFeedbackError(""); // Clear any previous errors
    setIsSubmitting(true);
    setFeedbackResult(null); // Clear previous results
    
    try {
      const response = await fetch("http://127.0.0.1:8000/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_text: reviewText }),
      });
      const data = await response.json();
      if(data.status === "success") {
          setFeedbackResult(data.analysis);
          setReviewText(""); // Clear input only on success
      } else {
          setFeedbackError("Failed to submit feedback. Please try again.");
      }
    } catch (error) {
      console.error("Error", error);
      setFeedbackError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DASHBOARD & FEEDBACK CRUD STATES 📊 ---
  const [analyticsData, setAnalyticsData] = useState(null);
  const [feedbacksList, setFeedbacksList] = useState([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  const [updateModal, setUpdateModal] = useState({ isOpen: false, id: null });
  const [updateText, setUpdateText] = useState("");
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });

  const loadDashboard = async () => {
    setActiveTab('analytics');
    setIsDashboardLoading(true);
    try {
      const resStats = await fetch("http://127.0.0.1:8000/api/analytics");
      const statsData = await resStats.json();
      if(statsData.status === "success") setAnalyticsData(statsData);

      const resFb = await fetch("http://127.0.0.1:8000/api/feedbacks");
      const fbData = await resFb.json();
      setFeedbacksList(fbData);
    } catch (error) { 
      console.error("Failed to load dashboard", error); 
    } finally { 
      setIsDashboardLoading(false); 
    }
  };

  const openUpdateModal = (id, currentAction) => {
    setUpdateText(currentAction);
    setUpdateModal({ isOpen: true, id: id });
  };

  const confirmUpdateAction = async () => {
    if (!updateText.trim()) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/feedbacks/${updateModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_taken: updateText })
      });
      setUpdateModal({ isOpen: false, id: null });
      loadDashboard(); 
    } catch (error) { console.error("Update failed"); }
  };

  const openDeleteModal = (id) => {
    setDeleteModal({ isOpen: true, id: id });
  };

  const confirmDelete = async () => {
    try {
      await fetch(`http://127.0.0.1:8000/api/feedbacks/${deleteModal.id}`, { method: "DELETE" });
      setDeleteModal({ isOpen: false, id: null });
      loadDashboard(); 
    } catch (error) { console.error("Delete failed"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d0ccff] via-[#e6e4ff] to-[#bcb7ff] flex flex-col items-center justify-center py-8 px-4 font-sans relative">
      
      <div className="flex space-x-2 mb-8 bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60">
        <button onClick={() => setActiveTab('chat')} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === 'chat' ? 'bg-[#6C63FF] text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>AI Concierge</button>
        <button onClick={() => setActiveTab('feedback')} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === 'feedback' ? 'bg-[#6C63FF] text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>Patient Feedback</button>
        <button onClick={loadDashboard} className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === 'analytics' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>Admin Dashboard</button>
      </div>

      <div className="w-full max-w-md bg-white rounded-[24px] shadow-[0_20px_60px_-15px_rgba(108,99,255,0.3)] overflow-hidden flex flex-col h-[75vh] border border-white relative z-10">
        
        {/* --- CHAT VIEW --- */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="bg-[#6C63FF] text-white p-5 flex items-center space-x-4 z-10 shadow-sm">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 relative">
                <span className="text-xl">🤖</span>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-[#6C63FF] rounded-full"></span>
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-wide">MediBot AI</h2>
                <p className="text-xs text-white/80">Online | PDF & Vision Support 📄</p>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto bg-[#f8f9fc] flex flex-col space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  
                  <div className={`flex items-center group w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    
                    {msg.sender === 'user' && msg.id !== 1 && (
                      <button onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 mr-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full flex-shrink-0" title="Delete Message">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    )}

                    <div className={`max-w-[85%] flex flex-col text-sm rounded-2xl shadow-sm overflow-hidden ${msg.sender === 'user' ? 'bg-[#6C63FF] text-white rounded-tr-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-tl-sm'}`}>
                      {msg.file && msg.file.isImage && <img src={msg.file.previewUrl} alt="Upload" className="w-full h-auto max-h-48 object-cover border-b border-white/20" />}
                      {msg.file && !msg.file.isImage && <div className="flex items-center space-x-2 bg-white/20 p-3 border-b border-white/20"><span className="text-2xl">📄</span><span className="text-xs font-semibold truncate max-w-[150px]">{msg.file.name}</span></div>}
                      {msg.text && <div className="p-3.5 leading-relaxed">{msg.text}</div>}
                    </div>

                    {msg.sender === 'bot' && msg.id !== 1 && (
                      <button onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 ml-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full flex-shrink-0" title="Delete Message">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    )}
                  </div>

                  {msg.action === "BOOK_APPOINTMENT" && (
                    <div className="mt-2 w-[85%] bg-white border-2 border-[#6C63FF]/20 rounded-xl p-4 shadow-sm animate-fade-in-up">
                      <div className="flex items-center space-x-2 mb-3"><span className="text-lg">📅</span><h3 className="text-sm font-bold text-[#6C63FF]">Schedule Appointment</h3></div>
                      <input type="date" className="w-full bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#6C63FF] focus:border-[#6C63FF] block p-2 mb-3" />
                      <button className="w-full text-white bg-[#6C63FF] hover:bg-[#5A52D5] font-semibold rounded-lg text-xs px-5 py-2.5 text-center transition-colors shadow-sm">Confirm Booking</button>
                    </div>
                  )}
                </div>
              ))}
              
              {isChatLoading && (
                <div className="flex justify-start"><div className="bg-white text-gray-400 p-3.5 rounded-2xl rounded-tl-sm border border-gray-100 text-sm flex space-x-1.5 shadow-sm"><span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></span><span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span><span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span></div></div>
              )}
            </div>

            {selectedFile && (
              <div className="bg-gray-100 px-4 py-2 border-t border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                   {selectedFile.isImage ? <img src={selectedFile.previewUrl} alt="Preview" className="w-8 h-8 object-cover rounded-md border border-gray-300" /> : <span className="text-xl">📄</span>}
                   <span className="text-xs text-gray-600 font-medium truncate max-w-[200px]">{selectedFile.name}</span>
                </div>
                <button onClick={() => setSelectedFile(null)} className="text-red-500 text-xs font-bold hover:underline">Remove</button>
              </div>
            )}

            {/* 🌟 Validation Error Message for Chat */}
            {chatError && (
              <div className="bg-red-50 px-4 py-2 border-t border-red-100">
                <p className="text-xs text-red-500 font-semibold">{chatError}</p>
              </div>
            )}

            <div className="p-4 bg-white border-t border-gray-100 flex items-center space-x-2 relative">
              <button onClick={toggleListening} className={`p-3 rounded-full transition-colors flex-shrink-0 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-50 text-gray-400 hover:text-[#6C63FF] hover:bg-[#e6e4ff]'}`} title="Hold to speak">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
              </button>
              
              <div className="relative">
                <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleFileChange} />
                <input type="file" accept="application/pdf" ref={docInputRef} className="hidden" onChange={handleFileChange} />
                <button onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)} className={`p-3 rounded-full transition-colors flex-shrink-0 ${isAttachMenuOpen ? 'bg-[#e6e4ff] text-[#6C63FF]' : 'bg-gray-50 text-gray-400 hover:text-[#6C63FF] hover:bg-[#e6e4ff]'}`} title="Upload">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                </button>
                {isAttachMenuOpen && (
                  <div className="absolute bottom-14 left-0 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-gray-100 p-2 flex flex-col space-y-1 z-50 w-44 animate-fade-in-up">
                    <button onClick={() => imageInputRef.current.click()} className="flex items-center space-x-3 p-2.5 hover:bg-gray-50 rounded-xl transition-colors text-gray-700 w-full text-left"><span className="text-sm font-semibold">📸 Photos</span></button>
                    <button onClick={() => docInputRef.current.click()} className="flex items-center space-x-3 p-2.5 hover:bg-gray-50 rounded-xl transition-colors text-gray-700 w-full text-left"><span className="text-sm font-semibold">📄 Document</span></button>
                  </div>
                )}
              </div>

              <input 
                type="text" 
                className={`flex-1 rounded-full px-4 py-3 text-sm focus:outline-none transition-all ${chatError ? 'bg-red-50 border border-red-300 focus:ring-1 focus:ring-red-500' : 'bg-gray-50 text-gray-800 border border-gray-200 focus:ring-1 focus:ring-[#6C63FF] focus:bg-white'}`}
                placeholder={isListening ? "Listening..." : "Type or attach..."} 
                value={inputText} 
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (chatError) setChatError("");
                }} 
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                disabled={isChatLoading} 
              />
              <button onClick={handleSendMessage} disabled={isChatLoading} className={`px-5 py-3 rounded-full text-sm font-semibold transition-colors shadow-md flex-shrink-0 ${(!inputText.trim() && !selectedFile) || isChatLoading ? 'bg-[#a5a1f0] text-white/80 cursor-not-allowed shadow-none' : 'bg-[#6C63FF] hover:bg-[#5A52D5] text-white shadow-[#6C63FF]/20'}`}>Send</button>
            </div>
          </div>
        )}

        {/* --- FEEDBACK VIEW --- */}
        {activeTab === 'feedback' && (
          <div className="flex flex-col h-full bg-[#f8f9fc] p-8 overflow-y-auto">
            <h2 className="text-xl font-extrabold text-[#1e293b] mb-2">Hospital Experience</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">Your feedback helps us improve our services.</p>
            
            <textarea 
              className={`w-full p-4 bg-white border rounded-2xl shadow-sm focus:outline-none focus:ring-1 resize-none h-40 mb-3 text-sm text-gray-700 transition-all ${feedbackError ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-200 focus:ring-[#6C63FF]'}`}
              value={reviewText} 
              onChange={(e) => {
                  setReviewText(e.target.value);
                  if (feedbackError) setFeedbackError("");
              }}
              placeholder="Tell us about your experience..."
            ></textarea>
            
            {/* 🌟 Validation Error Message for Feedback */}
            {feedbackError && (
              <p className="text-xs text-red-500 font-semibold mb-3">{feedbackError}</p>
            )}

            <button onClick={handleFeedbackSubmit} disabled={isSubmitting} className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all shadow-md ${(!reviewText.trim() || isSubmitting) ? 'bg-[#a5a1f0] text-white/80 cursor-not-allowed shadow-none' : 'bg-[#6C63FF] hover:bg-[#5A52D5] text-white shadow-[#6C63FF]/20'}`}>
              {isSubmitting ? "Analyzing..." : "Submit Feedback"}
            </button>
            
            {feedbackResult && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">AI Analysis Result</h3>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                  <div className="flex justify-between items-center"><span className="text-sm font-medium text-gray-600">Sentiment:</span><span className={`text-xs font-bold px-3 py-1 rounded-full ${feedbackResult.sentiment === 'Negative' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{feedbackResult.sentiment}</span></div>
                  <div className="flex justify-between items-start"><span className="text-sm font-medium text-gray-600">Action:</span><span className="text-sm text-gray-800 text-right font-medium max-w-[65%] leading-snug">{feedbackResult.action}</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- 📊 ADMIN DASHBOARD (ANALYTICS + CRUD) --- */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col h-full bg-[#f8f9fc] p-6 overflow-y-auto">
            <h2 className="text-xl font-extrabold text-[#1e293b] mb-1">Director's Dashboard</h2>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">Real-time AI insights & Feedback Management.</p>
            
            {isDashboardLoading ? (
              <div className="flex-1 flex items-center justify-center flex-col space-y-4">
                <div className="w-8 h-8 border-4 border-[#6C63FF] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500 font-medium animate-pulse">Loading Dashboard...</p>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in-up">
                
                {analyticsData && analyticsData.status === "success" && (
                  <div className="bg-gradient-to-r from-[#1e293b] to-[#334155] p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">✨</div>
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-lg">🤖</span>
                      <h3 className="text-xs font-bold text-blue-200 uppercase tracking-wider">Gemini AI Executive Summary</h3>
                    </div>
                    <p className="text-white text-sm font-medium leading-relaxed">"{analyticsData.ai_insight}"</p>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2">Manage Feedbacks</h3>
                  <div className="space-y-3">
                    {feedbacksList.length === 0 ? <p className="text-xs text-gray-400 text-center">No feedbacks found.</p> :
                      feedbacksList.map(fb => (
                        <div key={fb.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-sm font-medium text-gray-800 leading-snug">"{fb.review_text}"</p>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-md ml-2 ${fb.sentiment === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{fb.sentiment}</span>
                          </div>
                          
                          <p className="text-xs text-gray-500 mb-3"><span className="font-bold text-gray-600">AI Action:</span> {fb.action_taken}</p>

                          <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
                            <button onClick={() => openUpdateModal(fb.id, fb.action_taken)} className="p-2 text-gray-400 hover:text-[#6C63FF] hover:bg-[#e6e4ff] rounded-full transition-colors" title="Edit Action">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button onClick={() => openDeleteModal(fb.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Delete Feedback">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      </div>

      {/* ========================================== */}
      {/* 🌟 CUSTOM MODALS (UPDATE & DELETE) 🌟      */}
      {/* ========================================== */}

      {/* 1. Update Modal */}
      {updateModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Update Action Status</h3>
            <p className="text-xs text-gray-500 mb-4">Edit the AI suggested action or mark it as resolved.</p>
            
            <input 
              type="text" 
              value={updateText} 
              onChange={(e) => setUpdateText(e.target.value)} 
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl px-4 py-3 mb-5 focus:outline-none focus:ring-2 focus:ring-[#6C63FF] focus:bg-white transition-all"
              placeholder="e.g., Resolved, Noted, Action Taken"
              autoFocus
            />
            
            <div className="flex space-x-3">
              <button onClick={() => setUpdateModal({ isOpen: false, id: null })} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmUpdateAction} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#6C63FF] hover:bg-[#5A52D5] transition-colors shadow-md shadow-[#6C63FF]/30">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up border border-gray-100 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⚠️</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Feedback?</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">Are you sure you want to permanently delete this patient feedback? This action cannot be undone.</p>
            
            <div className="flex space-x-3">
              <button onClick={() => setDeleteModal({ isOpen: false, id: null })} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-md shadow-red-500/30">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;