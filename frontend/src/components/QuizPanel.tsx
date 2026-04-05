import React, { useState } from 'react';
import { BookOpen, Loader2, Sparkles, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../api';
import type { VideoMeta } from '../App';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// We offloaded the Quiz interfaces here!
interface MCQ { question: string; options: string[]; answer: string; explanation: string; }
interface ShortQ { question: string; answer: string; explanation: string; }
type QuizQuestion = MCQ | ShortQ;
const isMCQ = (q: QuizQuestion): q is MCQ => 'options' in q;

interface QuizPanelProps {
  selectedVideo: VideoMeta | null;
}

export default function QuizPanel({ selectedVideo }: QuizPanelProps) {
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  const generateQuiz = async () => {
    if (!selectedVideo) return;
    setIsGeneratingQuiz(true); setQuiz([]); setSelectedAnswers({}); setRevealedAnswers({});
    try {
      const res = await api.post('/quiz', { video_url: selectedVideo.url, num_questions: numQuestions, quiz_type: quizType });
      setQuiz(res.data.quiz.questions || []);
    } catch { 
      alert('Failed to generate quiz. Please try again.'); 
    } finally { 
      setIsGeneratingQuiz(false); 
    }
  };

  if (!selectedVideo) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
          <BookOpen className="w-12 h-12 text-slate-300" />
          <p className="text-slate-500">Select a video to generate a quiz</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-white/70 rounded-2xl p-5 border border-slate-100 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-600" />Generate Quiz</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Type</label>
              <select value={quizType} onChange={e => setQuizType(e.target.value as 'mcq' | 'short')}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                <option value="mcq">Multiple Choice</option><option value="short">Short Answer</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Count</label>
              <select value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                {[3,5,8,10].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <button onClick={generateQuiz} disabled={isGeneratingQuiz}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center gap-2 transition-all shadow-md shadow-indigo-500/20">
              {isGeneratingQuiz ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Sparkles className="w-4 h-4" />Generate</>}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {quiz.map((q, qi) => (
            <motion.div key={qi} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: qi * 0.06 }}
              className="bg-white/70 rounded-2xl p-5 border border-slate-100 shadow-sm space-y-3">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{qi + 1}</span>
                <p className="text-slate-800 font-medium text-sm">{q.question}</p>
              </div>
              {isMCQ(q) ? (
                <div className="space-y-2 ml-9">
                  {q.options.map((opt, oi) => {
                    const r = revealedAnswers[qi]; const correct = opt === q.answer; const sel = selectedAnswers[qi] === opt;
                    return (
                      <button key={oi} onClick={() => { setSelectedAnswers(p => ({...p,[qi]:opt})); setRevealedAnswers(p => ({...p,[qi]:true})); }}
                        className={cn("w-full text-left px-4 py-2.5 rounded-xl text-xs border transition-all",
                          !r && "bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-slate-700",
                          r && correct && "bg-green-50 border-green-400 text-green-800",
                          r && sel && !correct && "bg-red-50 border-red-400 text-red-700",
                          r && !sel && !correct && "bg-white border-slate-100 text-slate-400")}>
                        <span className="flex items-center justify-between">
                          {opt}
                          {r && correct && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                          {r && sel && !correct && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                        </span>
                      </button>
                    );
                  })}
                  {revealedAnswers[qi] && <p className="text-xs text-slate-500 px-1">💡 {q.explanation}</p>}
                </div>
              ) : (
                <div className="ml-9">
                  {!revealedAnswers[qi]
                    ? <button onClick={() => setRevealedAnswers(p => ({...p,[qi]:true}))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-100">
                        <ChevronDown className="w-3.5 h-3.5" />Reveal Answer</button>
                    : <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-green-50 border border-green-200">
                        <p className="text-green-800 font-medium text-xs">{q.answer}</p>
                        <p className="text-green-600 text-xs mt-1">💡 {q.explanation}</p>
                      </motion.div>}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}