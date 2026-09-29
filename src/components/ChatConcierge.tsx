import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, RotateCcw, AlertTriangle, ShieldAlert, Phone, Clock, ExternalLink, X, Check, Copy } from 'lucide-react';
import { SUGGESTED_QUESTIONS, CLINIC_INFO } from '../data/clinicData';
import { ChatMessage } from '../types';
import { sanitizePlainText, getLocalConciergeAnswer } from '../utils/conciergeEngine';

interface ChatConciergeProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  onOpenAppointmentModal: () => void;
}

export const ChatConcierge: React.FC<ChatConciergeProps> = ({
  isOpen,
  onClose,
  initialQuery,
  onOpenAppointmentModal,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        "Hi! I'm the AI Dental Concierge. I can help you find information about services, office hours, doctors, financing, new-patient information, and contacting the clinic.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, messages]);

  // Handle incoming trigger query from quick actions or hero
  useEffect(() => {
    if (initialQuery && isOpen) {
      handleSendMessage(initialQuery);
    }
  }, [initialQuery]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || input.trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setIsLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('model' as const),
          text: m.content,
        }));

      let replyContent = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history: historyPayload,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            replyContent = sanitizePlainText(data.reply);
          }
        }
      } catch (fetchErr) {
        // Handled silently by switching to the local grounded concierge engine
        console.warn('Backend chat unreachable, using client concierge engine:', fetchErr);
      }

      // If backend was unreachable or returned empty response, use grounded knowledge engine
      if (!replyContent) {
        replyContent = sanitizePlainText(getLocalConciergeAnswer(textToSend));
      }

      const isEmergencyAlert =
        textToSend.toLowerCase().includes('emergency') ||
        replyContent.toLowerCase().includes('911') ||
        replyContent.toLowerCase().includes('cannot diagnose');

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEmergencyAlert,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      // Ultimate safety fallback to ensure the user always receives an answer
      const fallbackReply = sanitizePlainText(getLocalConciergeAnswer(textToSend));
      const fallbackMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome-1',
        role: 'assistant',
        content:
          "Hi! I'm the AI Dental Concierge. I can help you find information about services, office hours, doctors, financing, new-patient information, and contacting the clinic.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <aside
      id="ai-dental-concierge-floating-window"
      aria-label="AI Dental Concierge chat"
      className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-50 w-[calc(100vw-1.5rem)] sm:w-[410px] md:w-[430px] h-[580px] max-h-[calc(100dvh-4.5rem)] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ring-1 ring-slate-900/10"
    >
      {/* Dedicated Header */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-cyan-800 text-white px-4 py-3 sm:px-4 sm:py-3.5 shrink-0 flex items-center justify-between border-b border-teal-600/40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-cyan-200 ring-1 ring-white/20 shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base tracking-tight font-['Outfit'] text-white">
                AI Dental Concierge
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/30 shrink-0">
                Concept Demo
              </span>
            </div>
            <p className="text-[11px] text-teal-100/90 truncate max-w-[210px] sm:max-w-xs">
              Dental Care & Implants of Houston • Greenspoint
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            title="Reset conversation"
            aria-label="Reset conversation"
            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl hover:bg-white/15 transition-colors text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            id="chat-popup-close-button"
            onClick={onClose}
            title="Close chat"
            aria-label="Close"
            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl hover:bg-white/15 transition-colors text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

        {/* Safety & Demo Guardrail Banner */}
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Informational Concierge Only:</strong> Does not diagnose, prescribe, or provide medical advice. Answers questions using clinic facts only.
            </span>
          </div>
          <button
            onClick={onOpenAppointmentModal}
            className="hidden md:inline-flex items-center gap-1 font-semibold text-amber-950 underline hover:text-amber-800 text-[11px] shrink-0"
          >
            Demo Booking Flow
          </button>
        </div>

        {/* Chat Message Scrollable Container */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                    DC
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-sm leading-relaxed shadow-xs relative group ${
                    isUser
                      ? 'bg-gradient-to-br from-teal-700 to-cyan-800 text-white rounded-tr-xs'
                      : msg.isEmergencyAlert
                      ? 'bg-rose-50 text-slate-900 border border-rose-200 rounded-tl-xs'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                  }`}
                >
                  {/* Emergency notice badge if detected */}
                  {msg.isEmergencyAlert && !isUser && (
                    <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700 mb-2 pb-1.5 border-b border-rose-200/60">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Clinical / Safety Guidance</span>
                    </div>
                  )}

                  <div className="whitespace-pre-line break-words">{msg.content}</div>

                  <div
                    className={`flex items-center justify-between gap-2 mt-2 pt-1.5 text-[10px] ${
                      isUser ? 'text-cyan-200/80' : 'text-slate-400'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {!isUser && (
                      <button
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:text-slate-600"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-teal-600" />
                            <span className="text-teal-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                DC
              </div>
              <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs p-4 shadow-xs flex items-center gap-2 text-slate-600 text-xs">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.4s]"></span>
                <span className="ml-1 font-medium text-slate-700">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Questions Carousel */}
        <div className="p-3 bg-white border-t border-slate-200/80 shrink-0">
          <div className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center justify-between">
            <span>Suggested Questions:</span>
            <span className="text-slate-400 font-normal">Optional shortcuts</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200">
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
                className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 transition-all shrink-0 active:scale-95 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Manual Chat Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 sm:p-4 bg-white border-t border-slate-200/80 flex items-center gap-2 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask a question..."
            className="flex-1 bg-slate-100/90 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 shrink-0 min-w-[80px]"
            title="Send"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Direct Call & Emergency Footer Strip */}
        <div className="bg-slate-100/80 px-4 py-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-teal-800">
              <Phone className="w-3 h-3 text-teal-600" />
              New Patients: {CLINIC_INFO.phoneNewPatients}
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:flex items-center gap-1">
              Callers: {CLINIC_INFO.phoneOtherCallers}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            For severe life-threatening emergencies, call 911 immediately.
          </div>
        </div>
    </aside>
  );
};
