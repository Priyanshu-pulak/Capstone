import React, { useState, useRef, useEffect } from 'react';
import { Send, Youtube, MessageSquare, Sparkles, Loader2, Video, Plus, Link2, BookOpen, CheckCircle, XCircle, ChevronDown, Trash2, Network, Eye, ArrowRight, LogOut, User as UserIcon, Lock, Mail, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { api, getApiErrorMessage } from './api';
import AuthPage from './components/AuthPage';
import Sidebar from './components/SideBar';
import ChatPanel from './components/ChatPanel';
import QuizPanel from './components/QuizPanel';
import PerspectivesPanel from './components/PerspectivesPanel';
import ConceptMapPanel from './components/ConceptMapPanel';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export interface Message { role: 'user' | 'assistant'; content: string; source?: string; }
export interface VideoMeta { video_id: string; url: string; title: string; }
export type Mode = 'chat' | 'cross' | 'quiz' | 'perspectives' | 'concepts';

interface PersistedChatState {
  videoChatHistories: Record<string, Message[]>;
  videoQuestionDrafts: Record<string, string>;
  crossChatHistory: Message[];
  crossQuestion: string;
}

const getChatStorageKey = (username: string) => `vq_chat_state:${username}`;

const emptyChatState = (): PersistedChatState => ({
  videoChatHistories: {},
  videoQuestionDrafts: {},
  crossChatHistory: [],
  crossQuestion: '',
});


const LEVEL_COLORS = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e'];
const LEVEL_BG = ['#eef2ff','#f5f3ff','#faf5ff','#fdf4ff','#fdf2f8','#fff1f2'];



export default function VidQueryApp() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [mode, setMode] = useState<Mode>('chat');
  const [videos, setVideos] = useState<VideoMeta[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoMeta | null>(null);
  const [selectedCrossVideos, setSelectedCrossVideos] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [removingVideoUrl, setRemovingVideoUrl] = useState<string | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  const [videoChatHistories, setVideoChatHistories] = useState<Record<string, Message[]>>({});
  const [videoQuestionDrafts, setVideoQuestionDrafts] = useState<Record<string, string>>({});
  const [crossChatHistory, setCrossChatHistory] = useState<Message[]>([]);
  const [crossQuestion, setCrossQuestion] = useState('');
  const [hasHydratedChatState, setHasHydratedChatState] = useState(false);
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);

  const selectedVideoUrl = selectedVideo?.url ?? null;
  const selectedVideoChatHistory = selectedVideoUrl ? (videoChatHistories[selectedVideoUrl] ?? []) : [];
  const selectedVideoQuestion = selectedVideoUrl ? (videoQuestionDrafts[selectedVideoUrl] ?? '') : '';

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => {
        const username = res.data.username as string;
        localStorage.setItem('vq_username', username);
        localStorage.removeItem('vq_token');
        setCurrentUser(username);
      })
      .catch(() => {
        localStorage.removeItem('vq_username');
        localStorage.removeItem('vq_token');
        setCurrentUser(null);
      })
      .finally(() => {
        setIsRestoringSession(false);
      });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    api.get('/history').then(res => {
      if (res.data.videos?.length) {
        setVideos(res.data.videos);
        setSelectedVideo(res.data.videos[0]);
      }
    }).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setVideoChatHistories({});
      setVideoQuestionDrafts({});
      setCrossChatHistory([]);
      setCrossQuestion('');
      setHasHydratedChatState(false);
      return;
    }

    const storageKey = getChatStorageKey(currentUser);
    const rawState = localStorage.getItem(storageKey);
    if (!rawState) {
      const emptyState = emptyChatState();
      setVideoChatHistories(emptyState.videoChatHistories);
      setVideoQuestionDrafts(emptyState.videoQuestionDrafts);
      setCrossChatHistory(emptyState.crossChatHistory);
      setCrossQuestion(emptyState.crossQuestion);
      setHasHydratedChatState(true);
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as Partial<PersistedChatState>;
      setVideoChatHistories(parsedState.videoChatHistories ?? {});
      setVideoQuestionDrafts(parsedState.videoQuestionDrafts ?? {});
      setCrossChatHistory(parsedState.crossChatHistory ?? []);
      setCrossQuestion(parsedState.crossQuestion ?? '');
    } catch {
      localStorage.removeItem(storageKey);
      const emptyState = emptyChatState();
      setVideoChatHistories(emptyState.videoChatHistories);
      setVideoQuestionDrafts(emptyState.videoQuestionDrafts);
      setCrossChatHistory(emptyState.crossChatHistory);
      setCrossQuestion(emptyState.crossQuestion);
    } finally {
      setHasHydratedChatState(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !hasHydratedChatState) return;

    localStorage.setItem(
      getChatStorageKey(currentUser),
      JSON.stringify({
        videoChatHistories,
        videoQuestionDrafts,
        crossChatHistory,
        crossQuestion,
      } satisfies PersistedChatState),
    );
  }, [
    crossChatHistory,
    crossQuestion,
    currentUser,
    hasHydratedChatState,
    videoChatHistories,
    videoQuestionDrafts,
  ]);

  const handleAuth = (username: string) => {
    localStorage.setItem('vq_username', username);
    localStorage.removeItem('vq_token');
    setCurrentUser(username);
    setIsRestoringSession(false);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear local auth state even if the backend is unavailable.
    }
    localStorage.removeItem('vq_token');
    localStorage.removeItem('vq_username');
    setCurrentUser(null);
    setVideos([]);
    setSelectedVideo(null);
    setSelectedCrossVideos([]);
    setUrlInput('');
    setSidebarError(null);
    setVideoChatHistories({});
    setVideoQuestionDrafts({});
    setCrossChatHistory([]);
    setCrossQuestion('');
    setHasHydratedChatState(false);
    setIsRestoringSession(false);
  };

  if (isRestoringSession) {
    return (
      <div
        className="min-h-screen flex items-center justify-center gap-3 text-slate-600"
        style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #ddd6fe 100%)' }}
      >
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        <span className="text-sm font-medium">Restoring your session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const addVideo = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) return;

    setSidebarError(null);
    setIsProcessing(true);
    try {
      const res = await api.post('/process', { video_url: trimmedUrl });
      const nv: VideoMeta = {
        video_id: res.data.video_id,
        url: trimmedUrl,
        title: res.data.title || `Video ${res.data.video_id?.slice(0,8)}...`,
      };
      setVideos(prev => [...prev.filter(v => v.url !== trimmedUrl), nv]);
      setSelectedVideo(nv);
      setUrlInput('');
      setVideoChatHistories(prev => ({
        ...prev,
        [nv.url]: [
          ...(prev[nv.url] ?? []),
          { role: 'assistant', content: '✅ Video processed! Ask me anything about it.' },
        ],
      }));
      setVideoQuestionDrafts(prev => ({
        ...prev,
        [nv.url]: '',
      }));
    } catch (error) {
      setSidebarError(
        getApiErrorMessage(
          error,
          'Failed to process video. Check the URL and make sure the backend is running.',
        ),
      );
    } finally { setIsProcessing(false); }
  };

  const removeVideo = async (url: string) => {
    if (removingVideoUrl) return;
    setSidebarError(null);
    setRemovingVideoUrl(url);
    try {
      await api.post('/videos/delete', { video_url: url });
      setVideos(prev => {
        const remaining = prev.filter(v => v.url !== url);
        if (selectedVideo?.url === url) setSelectedVideo(remaining[0] ?? null);
        return remaining;
      });
      setSelectedCrossVideos(prev => prev.filter(videoUrl => videoUrl !== url));
      setVideoChatHistories(prev => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      setVideoQuestionDrafts(prev => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
    } catch (error) {
      setSidebarError(
        getApiErrorMessage(error, 'Failed to remove video. Please try again.'),
      );
    } finally {
      setRemovingVideoUrl(null);
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideo || !selectedVideoUrl || !selectedVideoQuestion.trim() || isLoadingAnswer) return;
    const q = selectedVideoQuestion;

    setVideoQuestionDrafts(prev => ({
      ...prev,
      [selectedVideoUrl]: '',
    }));
    setVideoChatHistories(prev => ({
      ...prev,
      [selectedVideoUrl]: [...(prev[selectedVideoUrl] ?? []), { role: 'user', content: q }],
    }));
    setIsLoadingAnswer(true);
    try {
      const res = await api.post('/query', { video_url: selectedVideoUrl, question: q });
      setVideoChatHistories(prev => ({
        ...prev,
        [selectedVideoUrl]: [...(prev[selectedVideoUrl] ?? []), { role: 'assistant', content: res.data.answer }],
      }));
    } catch (error) {
      const message = getApiErrorMessage(error, 'Sorry, an error occurred.');
      setVideoChatHistories(prev => ({
        ...prev,
        [selectedVideoUrl]: [...(prev[selectedVideoUrl] ?? []), { role: 'assistant', content: message }],
      }));
    }
    finally { setIsLoadingAnswer(false); }
  };

  const sendCrossQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crossQuestion.trim() || isLoadingAnswer) return;
    if (selectedCrossVideos.length < 1) {
      setCrossChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Please select at least one video for cross-video analysis.',
          source: 'cross-video',
        },
      ]);
      return;
    }
    const q = crossQuestion;
    setCrossQuestion('');
    setCrossChatHistory(prev => [...prev, { role: 'user', content: q }]);
    setIsLoadingAnswer(true);
    try {
      const res = await api.post('/query/cross', { 
        question: q,
        video_urls: selectedCrossVideos 
      });
      setCrossChatHistory(prev => [...prev, { role: 'assistant', content: res.data.answer, source: 'cross-video' }]);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Sorry, an error occurred.');
      setCrossChatHistory(prev => [...prev, { role: 'assistant', content: message, source: 'cross-video' }]);
    }
    finally { setIsLoadingAnswer(false); }
  };

  const updateSelectedVideoQuestion = (value: string) => {
    if (!selectedVideoUrl) return;
    setVideoQuestionDrafts(prev => ({
      ...prev,
      [selectedVideoUrl]: value,
    }));
  };


  const tabs: { id: Mode; icon: React.ElementType; label: string }[] = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'cross', icon: Link2, label: 'Cross-Video' },
    { id: 'quiz', icon: BookOpen, label: 'Quiz' },
    { id: 'perspectives', icon: Eye, label: 'Perspectives' },
    { id: 'concepts', icon: Network, label: 'Concept Map' },
  ];

  

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
        <Sidebar 
          videos={videos}
          selectedVideo={selectedVideo}
          onSelectVideo={(v) => setSelectedVideo(v)}
          onRemoveVideo={removeVideo}
          urlInput={urlInput}
          onUrlInputChange={(url) => {
            setUrlInput(url);
            if (sidebarError) {
              setSidebarError(null);
            }
          }}
          onAddVideo={addVideo}
          isProcessing={isProcessing}
          removingVideoUrl={removingVideoUrl}
          mode={mode}
          errorMessage={sidebarError}
        />

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
              <ChatPanel 
                mode={mode}
                chatHistory={selectedVideoChatHistory}
                question={selectedVideoQuestion}
                onQuestionChange={updateSelectedVideoQuestion}
                onSend={sendChat}
                isLoading={isLoadingAnswer}
                selectedVideo={selectedVideo}
                selectedCrossVideosCount={selectedCrossVideos.length}
              />
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
                {/* THIS IS THE MENU THAT GOT WIPED OUT! */}
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
                
                <ChatPanel 
                  mode={mode}
                  chatHistory={crossChatHistory}
                  question={crossQuestion}
                  onQuestionChange={setCrossQuestion}
                  onSend={sendCrossQuery}
                  isLoading={isLoadingAnswer}
                  selectedVideo={selectedVideo}
                  selectedCrossVideosCount={selectedCrossVideos.length}
                />
              </div>
            )
          )}

          {/* QUIZ */}
          {mode === 'quiz' && (
            <QuizPanel currentUser={currentUser} selectedVideo={selectedVideo} />
          )}

          {/* PERSPECTIVES */}
          {mode === 'perspectives' && (
            <PerspectivesPanel currentUser={currentUser} selectedVideo={selectedVideo} />
          )}

          {/* CONCEPT MAP */}
          {mode === 'concepts' && (
            <ConceptMapPanel currentUser={currentUser} selectedVideo={selectedVideo} />
          )}

        </main>
      </div>
    </div>
  );
}
