import React, { useState, useRef, useEffect } from 'react';
import { Send, Youtube, MessageSquare, Sparkles, Loader2, Video, Plus, Link2, BookOpen, CheckCircle, XCircle, ChevronDown, Trash2, Network, Eye, ArrowRight, LogOut, User as UserIcon, Lock, Mail, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface Message { role: 'user' | 'assistant'; content: string; source?: string; }
interface VideoMeta { video_id: string; url: string; title: string; }
interface MCQ { question: string; options: string[]; answer: string; explanation: string; }
interface ShortQ { question: string; answer: string; explanation: string; }
type QuizQuestion = MCQ | ShortQ;
type Mode = 'chat' | 'cross' | 'quiz' | 'perspectives' | 'concepts';
type AuthView = 'login' | 'signup';
const isMCQ = (q: QuizQuestion): q is MCQ => 'options' in q;

interface PerspectiveData {
  student: { summary: string; key_concepts: string[]; study_tip: string; };
  developer: { summary: string; key_concepts: string[]; action_item: string; };
  business: { summary: string; key_concepts: string[]; decision: string; };
  beginner_expert: { beginner: string; expert: string; bridge: string; };
}
interface GraphNode { id: string; label: string; level: number; description: string; }
interface GraphEdge { from: string; to: string; label: string; }
interface ConceptGraph { nodes: GraphNode[]; edges: GraphEdge[]; }

const LEVEL_COLORS = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e'];
const LEVEL_BG = ['#eef2ff','#f5f3ff','#faf5ff','#fdf4ff','#fdf2f8','#fff1f2'];

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('vq_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }: { onAuth: (token: string, username: string) => void }) {
  const [view, setView] = useState<AuthView>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (view === 'signup') {
        const res = await api.post('/auth/register', { username, email, password });
        onAuth(res.data.token, res.data.username);
      } else {
        const res = await api.post('/auth/login', { email, password });
        onAuth(res.data.token, res.data.username);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #ddd6fe 100%)' }}>
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-72 h-72 rounded-full bg-indigo-400 opacity-10 blur-[80px]" />
        <div className="absolute bottom-[15%] right-[10%] w-56 h-56 rounded-full bg-purple-400 opacity-10 blur-[60px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60 p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Video className="text-white w-5 h-5" />
          </div>
          <span className="text-2xl font-bold text-slate-800">
            Vid<span style={{ background: 'linear-gradient(to right,#6366f1,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Query</span>
          </span>
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-1">
          {view === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {view === 'login' ? 'Sign in to access your video history' : 'Start chatting with any YouTube video'}
        </p>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
          {(['login', 'signup'] as AuthView[]).map(v => (
            <button key={v} onClick={() => { setView(v); setError(''); }}
              className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {v === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {view === 'signup' && (
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email address" required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" required minLength={6}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : view === 'login' ? 'Sign In' : <><UserPlus className="w-4 h-4" />Create Account</>}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          {view === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setView(view === 'login' ? 'signup' : 'login'); setError(''); }}
            className="text-indigo-600 font-medium hover:underline">
            {view === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function VidQueryApp() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('vq_username'));
  const [mode, setMode] = useState<Mode>('chat');
  const [videos, setVideos] = useState<VideoMeta[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoMeta | null>(null);
  const [selectedCrossVideos, setSelectedCrossVideos] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  const [perspectives, setPerspectives] = useState<PerspectiveData | null>(null);
  const [isLoadingPerspectives, setIsLoadingPerspectives] = useState(false);
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  // Load user's video history on login
  useEffect(() => {
    if (!currentUser) return;
    api.get('/history').then(res => {
      if (res.data.videos?.length) {
        setVideos(res.data.videos);
        setSelectedVideo(res.data.videos[0]);
      }
    }).catch(() => {});
  }, [currentUser]);

  const handleAuth = (token: string, username: string) => {
    localStorage.setItem('vq_token', token);
    localStorage.setItem('vq_username', username);
    setCurrentUser(username);
  };

  const logout = () => {
    localStorage.removeItem('vq_token');
    localStorage.removeItem('vq_username');
    setCurrentUser(null);
    setVideos([]);
    setSelectedVideo(null);
    setChatHistory([]);
  };

  if (!currentUser) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const addVideo = async () => {
    if (!urlInput.trim()) return;
    setIsProcessing(true);
    try {
      const res = await api.post('/process', { video_url: urlInput });
      const nv: VideoMeta = { video_id: res.data.video_id, url: urlInput, title: res.data.title || `Video ${res.data.video_id?.slice(0,8)}...` };
      setVideos(prev => [...prev.filter(v => v.url !== urlInput), nv]);
      setSelectedVideo(nv);
      setUrlInput('');
      setChatHistory(prev => [...prev, { role: 'assistant', content: `✅ Video processed! Ask me anything about it.` }]);
    } catch {
      alert('Failed to process video. Check the URL and make sure the backend is running.');
    } finally { setIsProcessing(false); }
  };

  const removeVideo = (url: string) => {
    setVideos(prev => {
      const remaining = prev.filter(v => v.url !== url);
      if (selectedVideo?.url === url) setSelectedVideo(remaining[0] ?? null);
      return remaining;
    });
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedVideo || isLoadingAnswer) return;
    const q = question; setQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);
    setIsLoadingAnswer(true);
    try {
      const res = await api.post('/query', { video_url: selectedVideo.url, question: q });
      setChatHistory(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
    } catch { setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, an error occurred.' }]); }
    finally { setIsLoadingAnswer(false); }
  };

  const sendCrossQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoadingAnswer) return;
    if (selectedCrossVideos.length < 1) {
      alert('Please select at least one video for cross-video analysis.');
      return;
    }
    const q = question; setQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);
    setIsLoadingAnswer(true);
    try {
      const res = await api.post('/query/cross', { 
        question: q,
        video_urls: selectedCrossVideos 
      });
      setChatHistory(prev => [...prev, { role: 'assistant', content: res.data.answer, source: 'cross-video' }]);
    } catch { setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, an error occurred.' }]); }
    finally { setIsLoadingAnswer(false); }
  };

  const generateQuiz = async () => {
    if (!selectedVideo) return;
    setIsGeneratingQuiz(true); setQuiz([]); setSelectedAnswers({}); setRevealedAnswers({});
    try {
      const res = await api.post('/quiz', { video_url: selectedVideo.url, num_questions: numQuestions, quiz_type: quizType });
      setQuiz(res.data.quiz.questions || []);
    } catch { alert('Failed to generate quiz.'); }
    finally { setIsGeneratingQuiz(false); }
  };

  const loadPerspectives = async () => {
    if (!selectedVideo) return;
    setIsLoadingPerspectives(true); setPerspectives(null);
    try {
      const res = await api.post('/summary/perspectives', { video_url: selectedVideo.url });
      setPerspectives(res.data.perspectives);
    } catch { alert('Failed to generate perspectives.'); }
    finally { setIsLoadingPerspectives(false); }
  };

  const loadConceptGraph = async () => {
    if (!selectedVideo) return;
    setIsLoadingGraph(true); setConceptGraph(null);
    try {
      const res = await api.post('/concept-graph', { video_url: selectedVideo.url });
      setConceptGraph(res.data.graph);
    } catch { alert('Failed to generate concept graph.'); }
    finally { setIsLoadingGraph(false); }
  };

  const getGraphLayout = (graph: ConceptGraph) => {
    const levels: Record<number, GraphNode[]> = {};
    graph.nodes.forEach(n => { if (!levels[n.level]) levels[n.level] = []; levels[n.level].push(n); });
    const pos: Record<string, { x: number; y: number }> = {};
    const maxL = Math.max(...Object.keys(levels).map(Number));
    Object.entries(levels).forEach(([lvl, nodes]) => {
      const y = 40 + (Number(lvl) / (maxL || 1)) * 360;
      nodes.forEach((n, i) => { pos[n.id] = { x: (i + 1) * 700 / (nodes.length + 1), y }; });
    });
    return pos;
  };

  const tabs: { id: Mode; icon: React.ElementType; label: string }[] = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'cross', icon: Link2, label: 'Cross-Video' },
    { id: 'quiz', icon: BookOpen, label: 'Quiz' },
    { id: 'perspectives', icon: Eye, label: 'Perspectives' },
    { id: 'concepts', icon: Network, label: 'Concept Map' },
  ];

  const chatMessages = (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {chatHistory.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>{mode === 'cross' ? 'Ask a question across all videos' : `Ask anything about ${selectedVideo?.title}`}</p>
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
      {isLoadingAnswer && (
        <div className="flex justify-start">
          <div className="bg-white/80 border border-slate-100 p-4 rounded-2xl flex items-center gap-2 text-slate-500 text-sm shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin" />{mode === 'cross' ? 'Searching all videos...' : 'Thinking...'}
          </div>
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  );

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #ddd6fe 100%)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white/60 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
            <Video className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">
            Vid<span style={{ background: 'linear-gradient(to right,#6366f1,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Query</span>
          </span>
        </div>
        <div className="flex gap-1 bg-white/80 rounded-2xl p-1 border border-slate-200 shadow-sm overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setMode(tab.id)}
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap",
                mode === tab.id ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100")}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </div>
        {/* User + Logout */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/70 border border-slate-200 text-sm text-slate-700">
            <UserIcon className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-medium text-xs">{currentUser}</span>
          </div>
          <button onClick={logout} title="Logout"
            className="w-8 h-8 rounded-xl bg-white/70 border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-all group">
            <LogOut className="w-3.5 h-3.5 text-slate-500 group-hover:text-red-500" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white/50 backdrop-blur-md border-r border-slate-200/60 flex flex-col p-4 gap-3 overflow-y-auto flex-shrink-0">
          <div className="font-semibold text-slate-700 text-xs uppercase tracking-wider">Videos ({videos.length})</div>
          <div className="flex gap-2">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addVideo()}
              placeholder="YouTube URL..."
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <button onClick={addVideo} disabled={isProcessing || !urlInput}
              className="w-8 h-8 flex-shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center transition-all">
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Plus className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
          {videos.length === 0
            ? <div className="text-xs text-slate-400 text-center py-6">Add a YouTube video to start</div>
            : (<div className="flex flex-col gap-1.5">
              {videos.map(v => (
                <div key={v.url} onClick={() => setSelectedVideo(v)}
                  className={cn("flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all group",
                    selectedVideo?.url === v.url ? "bg-indigo-600 text-white" : "bg-white hover:bg-slate-50 border border-slate-100")}>
                  <Youtube className={cn("w-3.5 h-3.5 flex-shrink-0", selectedVideo?.url === v.url ? "text-white" : "text-red-500")} />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-xs font-medium truncate", selectedVideo?.url === v.url ? "text-white" : "text-slate-700")}>{v.title}</div>
                    <div className={cn("text-[10px]", selectedVideo?.url === v.url ? "text-indigo-200" : "text-slate-400")}>ID: {v.video_id}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeVideo(v.url); }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center transition-all rounded">
                    <Trash2 className={cn("w-3 h-3", selectedVideo?.url === v.url ? "text-white/70" : "text-red-400")} />
                  </button>
                </div>
              ))}
            </div>)}
          {mode === 'cross' && videos.length > 1 && (
            <div className="mt-auto p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
              <Link2 className="w-3 h-3 inline mr-1" />Querying <strong>{videos.length}</strong> videos
            </div>
          )}
        </aside>

        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* CHAT */}
          {mode === 'chat' && (
            videos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <Youtube className="w-14 h-14 text-slate-300" />
                <h2 className="text-2xl font-bold text-slate-800">Add a video to start</h2>
                <p className="text-slate-500 text-sm">Paste a YouTube URL in the sidebar</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {chatMessages}
                <div className="p-4 border-t border-slate-200/60 bg-white/40 backdrop-blur-sm">
                  <form onSubmit={sendChat} className="relative">
                    <input value={question} onChange={e => setQuestion(e.target.value)}
                      placeholder={`Ask about ${selectedVideo?.title || 'the video'}...`}
                      className="w-full h-12 px-5 pr-14 rounded-2xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-800 placeholder:text-slate-400 text-sm shadow-sm" />
                    <button type="submit" disabled={!question.trim() || isLoadingAnswer}
                      className="absolute right-2 top-1.5 bottom-1.5 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center transition-all">
                      <Send className="w-4 h-4 text-white" />
                    </button>
                  </form>
                </div>
              </div>
            )
          )}

          {/* CROSS-VIDEO */}
          {mode === 'cross' && (
            videos.length < 2 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <Link2 className="w-14 h-14 text-indigo-300 opacity-60" />
                <h2 className="text-2xl font-bold text-slate-800">Add 2+ videos</h2>
                <p className="text-slate-500 text-sm">Cross-video mode links concepts across multiple videos</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-indigo-700 font-medium">
                      <Link2 className="w-3.5 h-3.5" />
                      Select videos to analyze ({selectedCrossVideos.length} selected)
                    </div>
                    <button 
                      onClick={() => setSelectedCrossVideos(selectedCrossVideos.length === videos.length ? [] : videos.map(v => v.url))}
                      className="text-[10px] text-indigo-600 hover:underline font-semibold"
                    >
                      {selectedCrossVideos.length === videos.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto px-1 py-1">
                    {videos.map(v => (
                      <button
                        key={v.url}
                        onClick={() => setSelectedCrossVideos(prev => 
                          prev.includes(v.url) ? prev.filter(u => u !== v.url) : [...prev, v.url]
                        )}
                        className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1",
                          selectedCrossVideos.includes(v.url)
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        )}
                      >
                        <Youtube className={cn("w-3 h-3", selectedCrossVideos.includes(v.url) ? "text-white" : "text-red-500")} />
                        <span className="truncate max-w-[120px]">{v.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {chatMessages}
                <div className="p-4 border-t border-slate-200/60 bg-white/40 backdrop-blur-sm">
                  <form onSubmit={sendCrossQuery} className="relative">
                    <input value={question} onChange={e => setQuestion(e.target.value)}
                      placeholder={selectedCrossVideos.length > 0 ? "Ask across selected videos..." : "Please select at least one video above..."}
                      disabled={selectedCrossVideos.length === 0}
                      className="w-full h-12 px-5 pr-14 rounded-2xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-800 placeholder:text-slate-400 text-sm shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" />
                    <button type="submit" disabled={!question.trim() || isLoadingAnswer || selectedCrossVideos.length === 0}
                      className="absolute right-2 top-1.5 bottom-1.5 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center transition-all">
                      <Send className="w-4 h-4 text-white" />
                    </button>
                  </form>
                </div>
              </div>
            )
          )}

          {/* QUIZ */}
          {mode === 'quiz' && (
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedVideo ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
                  <BookOpen className="w-12 h-12 text-slate-300" /><p className="text-slate-500">Select a video to generate a quiz</p>
                </div>
              ) : (
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
              )}
            </div>
          )}

          {/* PERSPECTIVES */}
          {mode === 'perspectives' && (
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedVideo ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
                  <Eye className="w-12 h-12 text-slate-300" /><p className="text-slate-500">Select a video to generate perspective summaries</p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-5">
                  <div className="flex items-center justify-between">
                    <div><h2 className="font-bold text-slate-800 text-lg">Multi-Perspective Summary</h2><p className="text-slate-500 text-sm">See this video through 4 different lenses</p></div>
                    <button onClick={loadPerspectives} disabled={isLoadingPerspectives}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all">
                      {isLoadingPerspectives ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4" />Generate</>}
                    </button>
                  </div>
                  {perspectives && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { emoji:'🎓', title:'Student', data: perspectives.student, accent:'blue', extra: <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">📚 <strong>Study Tip:</strong> {perspectives.student.study_tip}</div> },
                        { emoji:'👨‍💻', title:'Developer', data: perspectives.developer, accent:'violet', extra: <div className="p-2.5 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-700">🔨 <strong>Build:</strong> {perspectives.developer.action_item}</div> },
                        { emoji:'📈', title:'Business', data: perspectives.business, accent:'emerald', extra: <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">💼 <strong>Decision:</strong> {perspectives.business.decision}</div> },
                      ].map((p, i) => (
                        <motion.div key={p.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                          className={`bg-white/70 rounded-2xl p-5 border border-${p.accent}-100 shadow-sm`}>
                          <div className="flex items-center gap-2 mb-3"><span className="text-2xl">{p.emoji}</span><h3 className="font-bold text-slate-800">{p.title} Perspective</h3></div>
                          <p className="text-slate-600 text-sm whitespace-pre-line mb-3">{p.data.summary}</p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {p.data.key_concepts.map(c => <span key={c} className={`px-2 py-0.5 rounded-full bg-${p.accent}-50 text-${p.accent}-700 text-xs border border-${p.accent}-100`}>{c}</span>)}
                          </div>
                          {p.extra}
                        </motion.div>
                      ))}
                      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
                        className="bg-white/70 rounded-2xl p-5 border border-amber-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-3"><span className="text-2xl">🧠</span><h3 className="font-bold text-slate-800">Beginner vs Expert</h3></div>
                        <div className="space-y-3">
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100"><div className="text-xs font-bold text-amber-700 mb-1">🌱 Beginner</div><p className="text-slate-600 text-xs">{perspectives.beginner_expert.beginner}</p></div>
                          <div className="p-3 rounded-xl bg-orange-50 border border-orange-100"><div className="text-xs font-bold text-orange-700 mb-1">🔥 Expert</div><p className="text-slate-600 text-xs">{perspectives.beginner_expert.expert}</p></div>
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700"><ArrowRight className="w-3 h-3 inline mr-1" /><strong>Bridge:</strong> {perspectives.beginner_expert.bridge}</div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CONCEPT MAP */}
          {mode === 'concepts' && (
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedVideo ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
                  <Network className="w-12 h-12 text-slate-300" /><p className="text-slate-500">Select a video to generate a concept map</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-5">
                  <div className="flex items-center justify-between">
                    <div><h2 className="font-bold text-slate-800 text-lg">Concept Dependency Map</h2><p className="text-slate-500 text-sm">Visual map of key concepts and prerequisite relationships</p></div>
                    <button onClick={loadConceptGraph} disabled={isLoadingGraph}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all">
                      {isLoadingGraph ? <><Loader2 className="w-4 h-4 animate-spin" />Mapping...</> : <><Network className="w-4 h-4" />Generate Map</>}
                    </button>
                  </div>
                  {conceptGraph && (() => {
                    const pos = getGraphLayout(conceptGraph);
                    return (
                      <div className="space-y-4">
                        <div className="bg-white/70 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          <svg viewBox="0 0 700 440" className="w-full" style={{ minHeight: '360px' }}>
                            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#a5b4fc" /></marker></defs>
                            {conceptGraph.edges.map((e, i) => {
                              const f = pos[e.from], t = pos[e.to]; if (!f || !t) return null;
                              const isH = hoveredNode === e.from || hoveredNode === e.to;
                              return <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={isH ? '#6366f1' : '#c7d2fe'} strokeWidth={isH ? 2 : 1.5} markerEnd="url(#arrow)" strokeDasharray={isH ? '' : '4 2'} />;
                            })}
                            {conceptGraph.nodes.map(n => {
                              const p = pos[n.id]; if (!p) return null;
                              const color = LEVEL_COLORS[n.level % LEVEL_COLORS.length];
                              const bg = LEVEL_BG[n.level % LEVEL_BG.length];
                              const isH = hoveredNode === n.id;
                              return (
                                <g key={n.id} onMouseEnter={() => setHoveredNode(n.id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: 'pointer' }}>
                                  <ellipse cx={p.x} cy={p.y} rx={52} ry={22} fill={isH ? color : bg} stroke={color} strokeWidth={isH ? 2.5 : 1.5} style={{ transition: 'all 0.15s' }} />
                                  <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight={isH ? "700" : "500"} fill={isH ? 'white' : '#1e1b4b'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                    {n.label.length > 14 ? n.label.slice(0, 12) + '…' : n.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        <AnimatePresence>
                          {hoveredNode && (() => {
                            const n = conceptGraph.nodes.find(x => x.id === hoveredNode); if (!n) return null;
                            const prereqs = conceptGraph.edges.filter(e => e.to === n.id).map(e => conceptGraph.nodes.find(x => x.id === e.from)?.label).filter(Boolean);
                            const enables = conceptGraph.edges.filter(e => e.from === n.id).map(e => conceptGraph.nodes.find(x => x.id === e.to)?.label).filter(Boolean);
                            return (
                              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="bg-white/80 rounded-2xl p-4 border border-indigo-100 shadow-md">
                                <div className="font-bold text-slate-800 mb-1">{n.label} <span className="text-xs font-normal text-indigo-500 ml-2">Level {n.level}</span></div>
                                <p className="text-sm text-slate-600 mb-3">{n.description}</p>
                                <div className="flex gap-6 text-xs text-slate-500">
                                  {prereqs.length > 0 && <div><strong className="text-slate-700">Requires:</strong> {prereqs.join(', ')}</div>}
                                  {enables.length > 0 && <div><strong className="text-slate-700">Enables:</strong> {enables.join(', ')}</div>}
                                </div>
                              </motion.div>
                            );
                          })()}
                        </AnimatePresence>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {conceptGraph.nodes.map(n => {
                            const color = LEVEL_COLORS[n.level % LEVEL_COLORS.length];
                            return (
                              <div key={n.id} onMouseEnter={() => setHoveredNode(n.id)} onMouseLeave={() => setHoveredNode(null)}
                                className={cn("p-3 rounded-xl border cursor-pointer transition-all text-xs", hoveredNode === n.id ? "shadow-md scale-[1.02]" : "bg-white/60")}
                                style={{ borderColor: color + '40', background: hoveredNode === n.id ? color + '10' : '' }}>
                                <div className="font-semibold text-slate-800 mb-0.5">{n.label}</div>
                                <div className="text-slate-500 text-[10px]">{n.description}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
