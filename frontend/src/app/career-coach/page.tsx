"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Bot, User, Mic, Paperclip, RotateCcw } from "lucide-react";
import { mockChatHistory } from "@/lib/mock-data";

type Message = {
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
  suggestions?: string[];
  cards?: { title: string; items: string[] }[];
};

const aiResponses: Record<string, Message> = {
  default: {
    role: "assistant",
    content: "That's a great question! Based on your resume profile, I have some tailored recommendations. Your TypeScript and Node.js background is a strong foundation. The key areas to focus on next are cloud-native skills and system design fundamentals.",
    timestamp: new Date(),
    cards: [
      { title: "Immediate Actions", items: ["Update resume with Kubernetes experience", "Add Go to skill set (30 days)", "Start LeetCode daily practice"] },
      { title: "This Month", items: ["Complete AWS Certified Solutions Architect", "Build a gRPC microservice project", "Practice 2 system design problems/week"] },
    ],
  },
};

export default function CareerCoachPage() {
  const [messages, setMessages] = useState<Message[]>(mockChatHistory as Message[]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { ...aiResponses.default, timestamp: new Date() }]);
    }, 1800);
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--bg-primary)]/80 backdrop-blur-sm">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-[var(--text-primary)] text-sm">AI Career Coach</h1>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online · Powered by Claude
          </div>
        </div>
        <button className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-all">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center
              ${msg.role === "assistant"
                ? "bg-gradient-to-br from-violet-500 to-cyan-500"
                : "bg-gradient-to-br from-slate-600 to-slate-700"
              }`}
            >
              {msg.role === "assistant" ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
            </div>

            <div className={`flex-1 max-w-2xl ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
              {/* Bubble */}
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
                ${msg.role === "user"
                  ? "chat-user text-white rounded-tr-sm"
                  : "chat-ai text-[var(--text-primary)] rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>

              {/* Cards */}
              {msg.cards && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {msg.cards.map((card, j) => (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + j * 0.1 }}
                      className="glass rounded-xl p-4 border border-violet-500/10"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs font-bold text-violet-400">{card.title}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {card.items.map((item, k) => (
                          <li key={k} className="text-xs text-[var(--text-secondary)] flex items-start gap-2">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Suggestion chips */}
              {msg.suggestions && (
                <div className="flex flex-wrap gap-2">
                  {msg.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium
                        border border-violet-500/25 text-violet-400
                        hover:bg-violet-500/10 hover:border-violet-500/40
                        transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-[var(--text-muted)]">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-3 items-end"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="chat-ai rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="w-2 h-2 rounded-full bg-violet-400"
                    animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-sm">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-all flex-shrink-0">
            <Paperclip className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about your career, resume, or interview prep..."
              rows={1}
              className="w-full resize-none px-4 py-3 rounded-xl input-glass text-sm
                bg-[var(--bg-secondary)] border border-[var(--border)]
                text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                pr-12 max-h-32 overflow-y-auto"
              style={{ lineHeight: "1.5" }}
            />
          </div>
          <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-all flex-shrink-0">
            <Mic className="w-4 h-4" />
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || typing}
            className="w-10 h-10 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-violet-600 to-violet-500
              text-white shadow-glow-sm disabled:opacity-40 transition-all flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        <p className="text-center text-[10px] text-[var(--text-muted)] mt-2">
          AI can make mistakes. Verify important career advice independently.
        </p>
      </div>
    </div>
  );
}
