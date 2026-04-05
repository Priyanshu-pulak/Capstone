import React, { useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Link2, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Message, VideoMeta, Mode } from '../App';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface ChatPanelProps {
  mode: Mode;
  chatHistory: Message[];
  question: string;
  onQuestionChange: (val: string) => void;
  onSend: (e: React.FormEvent) => void;
  isLoading: boolean;
  selectedVideo: VideoMeta | null;
  selectedCrossVideosCount: number;
}

export default function ChatPanel({
  mode, chatHistory, question, onQuestionChange, onSend, isLoading, selectedVideo, selectedCrossVideosCount
}: ChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when a new message appears
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const isCross = mode === 'cross';
  const disableInput = isCross ? selectedCrossVideosCount === 0 : false;
  const placeholderText = isCross 
    ? (selectedCrossVideosCount > 0 ? "Ask across selected videos..." : "Please select at least one video above...")
    : `Ask about ${selectedVideo?.title || 'the video'}...`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {chatHistory.length === 0 && (
          <div className="text-center text-slate-400 py-12">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>{isCross ? 'Ask a question across all videos' : `Ask anything about ${selectedVideo?.title}`}</p>
          </div>
        )}
        
        <AnimatePresence>
          {chatHistory.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
              {msg.source === 'cross-video' ? (
                <div className="w-full max-w-[85%]">
                  <div className="text-xs text-indigo-600 flex items-center gap-1 mb-1 font-medium"><Link2 className="w-3 h-3" /> Cross-video</div>
                  <div className="p-4 rounded-2xl rounded-tl-none bg-white/80 text-slate-800 border border-indigo-100 shadow-sm text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                </div>
              ) : (
                <div className={cn("max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white/80 text-slate-800 border border-slate-100 shadow-sm rounded-tl-none whitespace-pre-wrap")}>
                  {msg.content}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/80 border border-slate-100 p-4 rounded-2xl flex items-center gap-2 text-slate-500 text-sm shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin" />{isCross ? 'Searching all videos...' : 'Thinking...'}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-slate-200/60 bg-white/40 backdrop-blur-sm">
        <form onSubmit={onSend} className="relative">
          <input value={question} onChange={e => onQuestionChange(e.target.value)}
            placeholder={placeholderText}
            disabled={disableInput}
            className="w-full h-12 px-5 pr-14 rounded-2xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-800 placeholder:text-slate-400 text-sm shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" />
          <button type="submit" disabled={!question.trim() || isLoading || disableInput}
            className="absolute right-2 top-1.5 bottom-1.5 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center transition-all">
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}