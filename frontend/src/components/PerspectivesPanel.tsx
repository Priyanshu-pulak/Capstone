import React, { useState } from 'react';
import { Eye, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../api';
import type { VideoMeta } from '../App';

interface PerspectiveData {
  student: { summary: string; key_concepts: string[]; study_tip: string; };
  developer: { summary: string; key_concepts: string[]; action_item: string; };
  business: { summary: string; key_concepts: string[]; decision: string; };
  beginner_expert: { beginner: string; expert: string; bridge: string; };
}

interface PerspectivesPanelProps {
  selectedVideo: VideoMeta | null;
}

export default function PerspectivesPanel({ selectedVideo }: PerspectivesPanelProps) {
  const [perspectives, setPerspectives] = useState<PerspectiveData | null>(null);
  const [isLoadingPerspectives, setIsLoadingPerspectives] = useState(false);

  const loadPerspectives = async () => {
    if (!selectedVideo) return;
    setIsLoadingPerspectives(true); setPerspectives(null);
    try {
      const res = await api.post('/summary/perspectives', { video_url: selectedVideo.url });
      setPerspectives(res.data.perspectives);
    } catch { 
      alert('Failed to generate perspectives.'); 
    } finally { 
      setIsLoadingPerspectives(false); 
    }
  };

  if (!selectedVideo) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
          <Eye className="w-12 h-12 text-slate-300" />
          <p className="text-slate-500">Select a video to generate perspective summaries</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Multi-Perspective Summary</h2>
            <p className="text-slate-500 text-sm">See this video through 4 different lenses</p>
          </div>
          <button onClick={loadPerspectives} disabled={isLoadingPerspectives}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all">
            {isLoadingPerspectives ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4" />Generate</>}
          </button>
        </div>
        
        {perspectives && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { emoji: '🎓', title: 'Student', data: perspectives.student, accent: 'blue', extra: <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">📚 <strong>Study Tip:</strong> {perspectives.student.study_tip}</div> },
              { emoji: '👨‍💻', title: 'Developer', data: perspectives.developer, accent: 'violet', extra: <div className="p-2.5 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-700">🔨 <strong>Build:</strong> {perspectives.developer.action_item}</div> },
              { emoji: '📈', title: 'Business', data: perspectives.business, accent: 'emerald', extra: <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">💼 <strong>Decision:</strong> {perspectives.business.decision}</div> },
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
    </div>
  );
}