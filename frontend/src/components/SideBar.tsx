import React from 'react';
import { Loader2, Plus, Youtube, Trash2, Link2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { VideoMeta, Mode } from '../App'; 

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface SidebarProps {
  videos: VideoMeta[];
  selectedVideo: VideoMeta | null;
  onSelectVideo: (v: VideoMeta) => void;
  onRemoveVideo: (url: string) => Promise<void>;
  urlInput: string;
  onUrlInputChange: (url: string) => void;
  onAddVideo: () => void;
  isProcessing: boolean;
  removingVideoUrl: string | null;
  mode: Mode;
}

export default function Sidebar({
  videos, selectedVideo, onSelectVideo, onRemoveVideo,
  urlInput, onUrlInputChange, onAddVideo, isProcessing, removingVideoUrl, mode
}: SidebarProps) {
  return (
    <aside className="w-64 bg-white/50 backdrop-blur-md border-r border-slate-200/60 flex flex-col p-4 gap-3 overflow-y-auto flex-shrink-0">
      <div className="font-semibold text-slate-700 text-xs uppercase tracking-wider">Videos ({videos.length})</div>
      <div className="flex gap-2">
        <input value={urlInput} onChange={e => onUrlInputChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddVideo()}
          placeholder="YouTube URL..."
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
        <button onClick={onAddVideo} disabled={isProcessing || !urlInput}
          className="w-8 h-8 flex-shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center transition-all">
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Plus className="w-3.5 h-3.5 text-white" />}
        </button>
      </div>
      {videos.length === 0
        ? <div className="text-xs text-slate-400 text-center py-6">Add a YouTube video to start</div>
        : (<div className="flex flex-col gap-1.5">
          {videos.map(v => (
            (() => {
              const isRemovingThisVideo = removingVideoUrl === v.url;
              return (
            <div key={v.url} onClick={() => onSelectVideo(v)}
              className={cn("flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all group",
                selectedVideo?.url === v.url ? "bg-indigo-600 text-white" : "bg-white hover:bg-slate-50 border border-slate-100")}>
              <Youtube className={cn("w-3.5 h-3.5 flex-shrink-0", selectedVideo?.url === v.url ? "text-white" : "text-red-500")} />
              <div className="flex-1 min-w-0">
                <div className={cn("text-xs font-medium truncate", selectedVideo?.url === v.url ? "text-white" : "text-slate-700")}>{v.title}</div>
                <div className={cn("text-[10px]", selectedVideo?.url === v.url ? "text-indigo-200" : "text-slate-400")}>ID: {v.video_id}</div>
              </div>
              <button
                onClick={async e => {
                  e.stopPropagation();
                  await onRemoveVideo(v.url);
                }}
                disabled={Boolean(removingVideoUrl)}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center transition-all rounded disabled:opacity-40"
              >
                {isRemovingThisVideo
                  ? <Loader2 className={cn("w-3 h-3 animate-spin", selectedVideo?.url === v.url ? "text-white/70" : "text-red-400")} />
                  : <Trash2 className={cn("w-3 h-3", selectedVideo?.url === v.url ? "text-white/70" : "text-red-400")} />}
              </button>
            </div>
              );
            })()
          ))}
        </div>)}
      {mode === 'cross' && videos.length > 1 && (
        <div className="mt-auto p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
          <Link2 className="w-3 h-3 inline mr-1" />Querying <strong>{videos.length}</strong> videos
        </div>
      )}
    </aside>
  );
}
