import React, { useEffect, useState } from 'react';
import { Network, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api, getApiErrorMessage } from '../api';
import { loadFeatureState, saveFeatureState } from '../featureStorage';
import MarkdownText from './MarkdownText';
import type { VideoMeta } from '../App';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface GraphNode { id: string; label: string; level: number; description: string; }
interface GraphEdge { from: string; to: string; label: string; }
interface ConceptGraph { nodes: GraphNode[]; edges: GraphEdge[]; }

const LEVEL_COLORS = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e'];
const LEVEL_BG = ['#eef2ff','#f5f3ff','#faf5ff','#fdf4ff','#fdf2f8','#fff1f2'];

interface ConceptMapPanelProps {
  currentUser: string;
  selectedVideo: VideoMeta | null;
}

export default function ConceptMapPanel({
  currentUser,
  selectedVideo,
}: ConceptMapPanelProps) {
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hydratedPersistenceKey, setHydratedPersistenceKey] = useState<string | null>(null);
  const [conceptGraphError, setConceptGraphError] = useState<string | null>(null);

  const selectedVideoUrl = selectedVideo?.url ?? null;
  const persistenceKey = selectedVideoUrl
    ? `concept-map:${currentUser}:${selectedVideoUrl}`
    : null;

  useEffect(() => {
    if (!selectedVideoUrl) {
      setConceptGraph(null);
      setHoveredNode(null);
      setConceptGraphError(null);
      setHydratedPersistenceKey(null);
      return;
    }

    const persisted = loadFeatureState<ConceptGraph>(
      currentUser,
      'concept-map',
      selectedVideoUrl,
    );

    setConceptGraph(persisted);
    setHoveredNode(null);
    setConceptGraphError(null);
    setHydratedPersistenceKey(persistenceKey);
  }, [currentUser, persistenceKey, selectedVideoUrl]);

  useEffect(() => {
    if (
      !conceptGraph ||
      !selectedVideoUrl ||
      !persistenceKey ||
      hydratedPersistenceKey !== persistenceKey
    ) {
      return;
    }

    saveFeatureState<ConceptGraph>(
      currentUser,
      'concept-map',
      selectedVideoUrl,
      conceptGraph,
    );
  }, [
    conceptGraph,
    currentUser,
    hydratedPersistenceKey,
    persistenceKey,
    selectedVideoUrl,
  ]);

  const loadConceptGraph = async () => {
    if (!selectedVideoUrl) return;
    setConceptGraphError(null);
    setIsLoadingGraph(true);
    try {
      const res = await api.post('/concept-graph', { video_url: selectedVideoUrl });
      setConceptGraph(res.data.graph);
      setHoveredNode(null);
    } catch (error) {
      setConceptGraphError(
        getApiErrorMessage(error, 'Failed to generate concept graph. Please try again.'),
      );
    } finally { 
      setIsLoadingGraph(false); 
    }
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

  if (!selectedVideo) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center py-20">
          <Network className="w-12 h-12 text-slate-300" />
          <p className="text-slate-500">Select a video to generate a concept map</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Concept Dependency Map</h2>
            <p className="text-slate-500 text-sm">Visual map of key concepts and prerequisite relationships</p>
          </div>
          <button onClick={loadConceptGraph} disabled={isLoadingGraph}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all">
            {isLoadingGraph ? <><Loader2 className="w-4 h-4 animate-spin" />Mapping...</> : <><Network className="w-4 h-4" />Generate Map</>}
          </button>
        </div>
        {conceptGraphError && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {conceptGraphError}
          </div>
        )}
        
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
                      <div className="text-sm text-slate-600 mb-3">
                        <MarkdownText text={n.description} />
                      </div>
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
                      <div className="text-slate-500 text-[10px]">
                        <MarkdownText text={n.description} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
