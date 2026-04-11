import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Sparkles,
  CheckCircle,
  XCircle,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api, getApiErrorMessage } from '../api';
import { loadFeatureState, saveFeatureState } from '../featureStorage';
import type { VideoMeta } from '../App';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MCQ {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface ShortQ {
  question: string;
  answer: string;
  explanation: string;
}

type QuizQuestion = MCQ | ShortQ;

const isMCQ = (question: QuizQuestion): question is MCQ => 'options' in question;

interface QuizPanelProps {
  currentUser: string;
  selectedVideo: VideoMeta | null;
}

interface PersistedQuizState {
  quizType: 'mcq' | 'short';
  numQuestions: number;
  quiz: QuizQuestion[];
  selectedAnswers: Record<number, string>;
  revealedAnswers: Record<number, boolean>;
}

export default function QuizPanel({ currentUser, selectedVideo }: QuizPanelProps) {
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [hydratedPersistenceKey, setHydratedPersistenceKey] = useState<string | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  const selectedVideoUrl = selectedVideo?.url ?? null;
  const persistenceKey = selectedVideoUrl ? `quiz:${currentUser}:${selectedVideoUrl}` : null;

  useEffect(() => {
    if (!selectedVideoUrl) {
      setQuizType('mcq');
      setNumQuestions(5);
      setQuiz([]);
      setSelectedAnswers({});
      setRevealedAnswers({});
      setQuizError(null);
      setHydratedPersistenceKey(null);
      return;
    }

    const persisted = loadFeatureState<PersistedQuizState>(
      currentUser,
      'quiz',
      selectedVideoUrl,
    );

    setQuizType(persisted?.quizType ?? 'mcq');
    setNumQuestions(persisted?.numQuestions ?? 5);
    setQuiz(persisted?.quiz ?? []);
    setSelectedAnswers(persisted?.selectedAnswers ?? {});
    setRevealedAnswers(persisted?.revealedAnswers ?? {});
    setQuizError(null);
    setHydratedPersistenceKey(persistenceKey);
  }, [currentUser, persistenceKey, selectedVideoUrl]);

  useEffect(() => {
    if (!selectedVideoUrl || !persistenceKey || hydratedPersistenceKey !== persistenceKey) {
      return;
    }

    saveFeatureState<PersistedQuizState>(currentUser, 'quiz', selectedVideoUrl, {
      quizType,
      numQuestions,
      quiz,
      selectedAnswers,
      revealedAnswers,
    });
  }, [
    currentUser,
    hydratedPersistenceKey,
    numQuestions,
    persistenceKey,
    quiz,
    quizType,
    revealedAnswers,
    selectedAnswers,
    selectedVideoUrl,
  ]);

  const generateQuiz = async () => {
    if (!selectedVideoUrl) return;

    setQuizError(null);
    setIsGeneratingQuiz(true);
    try {
      const res = await api.post('/quiz', {
        video_url: selectedVideoUrl,
        num_questions: numQuestions,
        quiz_type: quizType,
      });
      setQuiz(res.data.quiz.questions || []);
      setSelectedAnswers({});
      setRevealedAnswers({});
    } catch (error) {
      setQuizError(getApiErrorMessage(error, 'Failed to generate quiz. Please try again.'));
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  if (!selectedVideo) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <BookOpen className="h-12 w-12 text-slate-300" />
          <p className="text-slate-500">Select a video to generate a quiz</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800">
            <BookOpen className="h-4 w-4 text-indigo-600" />
            Generate Quiz
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Type</label>
              <select
                value={quizType}
                onChange={(event) => setQuizType(event.target.value as 'mcq' | 'short')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="mcq">Multiple Choice</option>
                <option value="short">Short Answer</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Count</label>
              <select
                value={numQuestions}
                onChange={(event) => setNumQuestions(Number(event.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {[3, 5, 8, 10].map((count) => (
                  <option key={count}>{count}</option>
                ))}
              </select>
            </div>
            <button
              onClick={generateQuiz}
              disabled={isGeneratingQuiz}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/20 transition-all hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {isGeneratingQuiz ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </button>
          </div>
          {quizError && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {quizError}
            </div>
          )}
        </div>

        <AnimatePresence>
          {quiz.map((question, questionIndex) => (
            <motion.div
              key={questionIndex}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: questionIndex * 0.06 }}
              className="space-y-3 rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm"
            >
              <div className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {questionIndex + 1}
                </span>
                <p className="text-sm font-medium text-slate-800">{question.question}</p>
              </div>
              {isMCQ(question) ? (
                <div className="ml-9 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const isRevealed = revealedAnswers[questionIndex];
                    const isCorrect = option === question.answer;
                    const isSelected = selectedAnswers[questionIndex] === option;

                    return (
                      <button
                        key={optionIndex}
                        onClick={() => {
                          setSelectedAnswers((previous) => ({
                            ...previous,
                            [questionIndex]: option,
                          }));
                          setRevealedAnswers((previous) => ({
                            ...previous,
                            [questionIndex]: true,
                          }));
                        }}
                        className={cn(
                          'w-full rounded-xl border px-4 py-2.5 text-left text-xs transition-all',
                          !isRevealed &&
                            'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50',
                          isRevealed && isCorrect && 'border-green-400 bg-green-50 text-green-800',
                          isRevealed &&
                            isSelected &&
                            !isCorrect &&
                            'border-red-400 bg-red-50 text-red-700',
                          isRevealed &&
                            !isSelected &&
                            !isCorrect &&
                            'border-slate-100 bg-white text-slate-400',
                        )}
                      >
                        <span className="flex items-center justify-between">
                          {option}
                          {isRevealed && isCorrect && (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          )}
                          {isRevealed && isSelected && !isCorrect && (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {revealedAnswers[questionIndex] && (
                    <p className="px-1 text-xs text-slate-500">💡 {question.explanation}</p>
                  )}
                </div>
              ) : (
                <div className="ml-9">
                  {!revealedAnswers[questionIndex] ? (
                    <button
                      onClick={() =>
                        setRevealedAnswers((previous) => ({
                          ...previous,
                          [questionIndex]: true,
                        }))
                      }
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      Reveal Answer
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="rounded-xl border border-green-200 bg-green-50 p-3"
                    >
                      <p className="text-xs font-medium text-green-800">{question.answer}</p>
                      <p className="mt-1 text-xs text-green-600">💡 {question.explanation}</p>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
