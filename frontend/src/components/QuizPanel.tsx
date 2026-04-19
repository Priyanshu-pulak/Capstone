import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Sparkles,
  CheckCircle,
  XCircle,
  ChevronDown,
  History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api, getApiErrorMessage } from '../api';
import { loadFeatureState, saveFeatureState } from '../featureStorage';
import { normalizeMarkdownText } from '../markdown';
import type { VideoMeta } from '../App';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function renderQuizMarkdown(text: string, textClassName?: string) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <span className={textClassName}>{children}</span>,
        code: ({ children, className, ...props }) => (
          <code
            className={cn(
              'rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.95em] text-indigo-700',
              className,
            )}
            {...props}
          >
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100">
            {children}
          </pre>
        ),
      }}
    >
      {normalizeMarkdownText(text)}
    </ReactMarkdown>
  );
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
type QuizView = 'generate' | 'revise';

const isMCQ = (question: QuizQuestion): question is MCQ => 'options' in question;

const getOptionLetter = (text: string) => {
  const match = text.trim().match(/^([A-D])(?:[\).:-]|\s)/i);
  return match?.[1]?.toUpperCase() ?? null;
};

const stripOptionPrefix = (text: string) =>
  text.trim().replace(/^[A-D](?:[\).:-]|\s)+/i, '').trim();

const normalizeAnswerText = (text: string) =>
  normalizeMarkdownText(stripOptionPrefix(text))
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isCorrectOption = (option: string, answer: string) => {
  const optionLetter = getOptionLetter(option);
  const answerLetter = getOptionLetter(answer);
  if (optionLetter && answerLetter && optionLetter === answerLetter) {
    return true;
  }

  const normalizedOption = normalizeAnswerText(option);
  const normalizedAnswer = normalizeAnswerText(answer);
  return Boolean(normalizedOption && normalizedOption === normalizedAnswer);
};

interface QuizPanelProps {
  currentUser: string;
  selectedVideo: VideoMeta | null;
}

interface QuizAttempt {
  id: string;
  createdAt: string;
  quizType: 'mcq' | 'short';
  numQuestions: number;
  questions: QuizQuestion[];
  selectedAnswers: Record<number, string>;
  revealedAnswers: Record<number, boolean>;
}

interface PersistedQuizState {
  quizType: 'mcq' | 'short';
  numQuestions: number;
  quiz: QuizQuestion[];
  selectedAnswers: Record<number, string>;
  revealedAnswers: Record<number, boolean>;
  quizAttempts?: QuizAttempt[];
  activeAttemptId?: string | null;
}

const createQuizAttemptId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatAttemptDate = (createdAt: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(createdAt));

const getAttemptTitle = (attempt: QuizAttempt) =>
  `${attempt.quizType === 'mcq' ? 'Multiple choice' : 'Short answer'} • ${attempt.numQuestions} questions`;

const createLegacyAttempt = (persisted: PersistedQuizState): QuizAttempt | null => {
  if (!persisted.quiz?.length) return null;

  return {
    id: createQuizAttemptId(),
    createdAt: new Date().toISOString(),
    quizType: persisted.quizType,
    numQuestions: persisted.numQuestions,
    questions: persisted.quiz,
    selectedAnswers: persisted.selectedAnswers ?? {},
    revealedAnswers: persisted.revealedAnswers ?? {},
  };
};

export default function QuizPanel({ currentUser, selectedVideo }: QuizPanelProps) {
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizView, setQuizView] = useState<QuizView>('generate');
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
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
      setQuizView('generate');
      setQuizAttempts([]);
      setActiveAttemptId(null);
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

    const legacyAttempt = persisted ? createLegacyAttempt(persisted) : null;
    const attempts = persisted?.quizAttempts?.length
      ? persisted.quizAttempts
      : legacyAttempt
        ? [legacyAttempt]
        : [];
    const activeAttempt =
      attempts.find((attempt) => attempt.id === persisted?.activeAttemptId) ??
      attempts[0] ??
      null;

    setQuizType(activeAttempt?.quizType ?? persisted?.quizType ?? 'mcq');
    setNumQuestions(activeAttempt?.numQuestions ?? persisted?.numQuestions ?? 5);
    setQuiz(activeAttempt?.questions ?? []);
    setQuizAttempts(attempts);
    setActiveAttemptId(activeAttempt?.id ?? null);
    setSelectedAnswers(activeAttempt?.selectedAnswers ?? {});
    setRevealedAnswers(activeAttempt?.revealedAnswers ?? {});
    setQuizView('generate');
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
      quizAttempts,
      activeAttemptId,
    });
  }, [
    activeAttemptId,
    currentUser,
    hydratedPersistenceKey,
    numQuestions,
    persistenceKey,
    quiz,
    quizAttempts,
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
        force_new: true,
        generation_id: createQuizAttemptId(),
      });
      const questions = res.data.quiz.questions || [];
      const attempt: QuizAttempt = {
        id: createQuizAttemptId(),
        createdAt: new Date().toISOString(),
        quizType,
        numQuestions,
        questions,
        selectedAnswers: {},
        revealedAnswers: {},
      };

      setQuiz(questions);
      setSelectedAnswers({});
      setRevealedAnswers({});
      setActiveAttemptId(attempt.id);
      setQuizAttempts((previous) => [attempt, ...previous].slice(0, 30));
      setQuizView('generate');
    } catch (error) {
      setQuizError(getApiErrorMessage(error, 'Failed to generate quiz. Please try again.'));
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const openQuizAttempt = (attempt: QuizAttempt) => {
    setQuizType(attempt.quizType);
    setNumQuestions(attempt.numQuestions);
    setQuiz(attempt.questions);
    setSelectedAnswers(attempt.selectedAnswers);
    setRevealedAnswers(attempt.revealedAnswers);
    setActiveAttemptId(attempt.id);
    setQuizError(null);
  };

  const syncActiveAttemptProgress = (
    nextSelectedAnswers: Record<number, string>,
    nextRevealedAnswers: Record<number, boolean>,
  ) => {
    if (!activeAttemptId) return;

    setQuizAttempts((previous) =>
      previous.map((attempt) =>
        attempt.id === activeAttemptId
          ? {
              ...attempt,
              selectedAnswers: nextSelectedAnswers,
              revealedAnswers: nextRevealedAnswers,
            }
          : attempt,
      ),
    );
  };

  const answerMCQ = (questionIndex: number, option: string) => {
    const nextSelectedAnswers = {
      ...selectedAnswers,
      [questionIndex]: option,
    };
    const nextRevealedAnswers = {
      ...revealedAnswers,
      [questionIndex]: true,
    };

    setSelectedAnswers(nextSelectedAnswers);
    setRevealedAnswers(nextRevealedAnswers);
    syncActiveAttemptProgress(nextSelectedAnswers, nextRevealedAnswers);
  };

  const revealShortAnswer = (questionIndex: number) => {
    const nextRevealedAnswers = {
      ...revealedAnswers,
      [questionIndex]: true,
    };

    setRevealedAnswers(nextRevealedAnswers);
    syncActiveAttemptProgress(selectedAnswers, nextRevealedAnswers);
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-bold text-slate-800">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              Quiz Practice
            </h2>
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-medium shadow-sm">
              <button
                type="button"
                onClick={() => setQuizView('generate')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all',
                  quizView === 'generate'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate
              </button>
              <button
                type="button"
                onClick={() => setQuizView('revise')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all',
                  quizView === 'revise'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )}
              >
                <History className="h-3.5 w-3.5" />
                Revise ({quizAttempts.length})
              </button>
            </div>
          </div>

          {quizView === 'generate' ? (
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
                    Generate New
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {quizAttempts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                  No generated quizzes yet. Use Generate to create your first quiz.
                </div>
              ) : (
                quizAttempts.map((attempt) => (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => openQuizAttempt(attempt)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50',
                      activeAttemptId === attempt.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200',
                    )}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        {getAttemptTitle(attempt)}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Generated {formatAttemptDate(attempt.createdAt)}
                      </span>
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-600">
                      {activeAttemptId === attempt.id ? 'Open' : 'Revise'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
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
                <div className="text-sm font-medium text-slate-800">
                  {renderQuizMarkdown(question.question, 'text-sm font-medium text-slate-800')}
                </div>
              </div>
              {isMCQ(question) ? (
                <div className="ml-9 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const isRevealed = revealedAnswers[questionIndex];
                    const isCorrect = isCorrectOption(option, question.answer);
                    const isSelected = selectedAnswers[questionIndex] === option;

                    return (
                      <button
                        key={optionIndex}
                        onClick={() => answerMCQ(questionIndex, option)}
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
                          <span className="flex-1">
                            {renderQuizMarkdown(option, 'text-xs')}
                          </span>
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
                    <div className="px-1 text-xs text-slate-500">
                      <span className="mr-1">💡</span>
                      {renderQuizMarkdown(question.explanation, 'text-xs text-slate-500')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="ml-9">
                  {!revealedAnswers[questionIndex] ? (
                    <button
                      onClick={() => revealShortAnswer(questionIndex)}
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
                      <div className="text-xs font-medium text-green-800">
                        {renderQuizMarkdown(question.answer, 'text-xs font-medium text-green-800')}
                      </div>
                      <div className="mt-1 text-xs text-green-600">
                        <span className="mr-1">💡</span>
                        {renderQuizMarkdown(question.explanation, 'text-xs text-green-600')}
                      </div>
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
