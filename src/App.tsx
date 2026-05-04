/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Moon, 
  Sun, 
  Timer, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RotateCcw, 
  BarChart3, 
  Lightbulb,
  Clock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  History,
  Trash2,
  Home
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ALL_QUESTIONS, EXAM_TIME_SECONDS, QUESTION_TIME_SECONDS } from './constants';
import { 
  Difficulty, 
  Question, 
  ShuffledOption, 
  WrongAnswer, 
  QuizResult, 
  Screen 
} from './types';
import { cn } from './lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// --- Audio Helper ---
const playSound = (type: 'correct' | 'wrong' | 'finish' | 'timeout') => {
  const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
  if (!AudioContextClass) return;
  
  const audioCtx = new AudioContextClass();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  if (type === 'correct') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); 
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'wrong' || type === 'timeout') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'finish') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  }
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<ShuffledOption[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });

  const [examTime, setExamTime] = useState(EXAM_TIME_SECONDS);
  const [questionTime, setQuestionTime] = useState(QUESTION_TIME_SECONDS);
  const [history, setHistory] = useState<QuizResult[]>(() => {
    const saved = localStorage.getItem('quizHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const examIntervalRef = useRef<number | null>(null);
  const questionIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const startQuiz = (level: Difficulty) => {
    const filtered = ALL_QUESTIONS.filter(q => q.difficulty === level);
    const selected = [...filtered].sort(() => Math.random() - 0.5).slice(0, 10);
    
    setDifficulty(level);
    setQuestions(selected);
    setCurrentIndex(0);
    setScore(0);
    setWrongAnswers([]);
    setExamTime(EXAM_TIME_SECONDS);
    setQuestionTime(QUESTION_TIME_SECONDS);
    setScreen('quiz');
    
    startExamTimer();
    loadQuestion(selected[0]);
  };

  const loadQuestion = (q: Question) => {
    setIsAnswered(false);
    setQuestionTime(QUESTION_TIME_SECONDS);
    
    const shuffled = q.options.map((text, idx) => ({
      text,
      isCorrect: idx === q.correct
    })).sort(() => Math.random() - 0.5);
    
    setShuffledOptions(shuffled);
    startQuestionTimer();
  };

  const startExamTimer = () => {
    if (examIntervalRef.current) clearInterval(examIntervalRef.current);
    examIntervalRef.current = window.setInterval(() => {
      setExamTime(prev => {
        if (prev <= 1) {
          clearInterval(examIntervalRef.current!);
          finishQuiz(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startQuestionTimer = () => {
    if (questionIntervalRef.current) clearInterval(questionIntervalRef.current);
    questionIntervalRef.current = window.setInterval(() => {
      setQuestionTime(prev => {
        if (prev <= 1) {
          clearInterval(questionIntervalRef.current!);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleTimeout = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    playSound('timeout');
    
    const q = questions[currentIndex];
    const correctOption = shuffledOptions.find(o => o.isCorrect);
    
    setWrongAnswers(prev => [...prev, {
      question: q.question,
      myAnswer: 'انتهى الوقت ولم تُجب',
      correctAnswer: correctOption?.text || '',
      explanation: q.explanation
    }]);
  };

  const handleAnswer = (option: ShuffledOption) => {
    if (isAnswered) return;
    setIsAnswered(true);
    clearInterval(questionIntervalRef.current!);

    if (option.isCorrect) {
      setScore(prev => prev + 1);
      playSound('correct');
    } else {
      playSound('wrong');
      const q = questions[currentIndex];
      const correctOption = shuffledOptions.find(o => o.isCorrect);
      setWrongAnswers(prev => [...prev, {
        question: q.question,
        myAnswer: option.text,
        correctAnswer: correctOption?.text || '',
        explanation: q.explanation
      }]);
    }
  };

  const nextQuestion = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < questions.length) {
      setCurrentIndex(nextIdx);
      loadQuestion(questions[nextIdx]);
    } else {
      finishQuiz(false);
    }
  };

  const finishQuiz = (isTimeOut: boolean) => {
    clearInterval(examIntervalRef.current!);
    clearInterval(questionIntervalRef.current!);
    playSound('finish');
    
    const newResult: QuizResult = {
      date: new Date().toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' }),
      score: score,
      total: questions.length,
      level: difficulty === 'easy' ? 'سهل' : (difficulty === 'medium' ? 'متوسط' : 'صعب')
    };

    const newHistory = [...history, newResult];
    setHistory(newHistory);
    localStorage.setItem('quizHistory', JSON.stringify(newHistory));
    setScreen('result');
  };

  const resetQuiz = () => {
    setScreen('start');
  };

  const clearHistory = () => {
    if (confirm('هل أنت متأكد من مسح جميع النتائج؟')) {
      setHistory([]);
      localStorage.removeItem('quizHistory');
    }
  };

  // --- Animation Variants ---
  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 flex flex-col">
      
      {/* Top Header Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            📊
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">التحضير للامتحان</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">مقياس: تحليل البيانات</p>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          {screen === 'quiz' && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-bold uppercase">الوقت الكلي المتبقي</span>
              <span className="text-xl font-mono font-bold text-slate-700 dark:text-slate-300">
                {Math.floor(examTime / 60).toString().padStart(2, '0')}:{(examTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
          <div className="hidden md:block h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400"
            aria-label="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-6 h-6 text-yellow-400" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Progress Tracker */}
      {screen === 'quiz' && (
        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 relative z-10">
          <motion.div 
            className="absolute top-0 right-0 h-full bg-brand" 
            initial={{ width: 0 }}
            animate={{ width: `${(currentIndex / questions.length) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      {/* Main Content Layout */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto h-full">
          <AnimatePresence mode="wait">
            {screen === 'start' && (
              <motion.div 
                key="start"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center min-h-[70vh] max-w-2xl mx-auto text-center"
              >
                <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-[24px] flex items-center justify-center text-4xl mb-6 shadow-sm">
                  📚
                </div>
                <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4 leading-tight">ابدأ رحلة التحضير الممتعة</h1>
                <p className="text-lg text-slate-500 dark:text-slate-400 mb-10 max-w-md">اختر مستوى الصعوبة المناسب لك لاختبار معلوماتك في مقياس تحليل البيانات.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10">
                  <button 
                    onClick={() => startQuiz('easy')}
                    className="group bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-green-200 dark:hover:border-green-900 transition-all text-center"
                  >
                    <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <span className="w-4 h-4 rounded-full bg-green-500"></span>
                    </div>
                    <span className="block font-bold text-slate-700 dark:text-slate-200">سهل</span>
                  </button>
                  <button 
                    onClick={() => startQuiz('medium')}
                    className="group bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-yellow-200 dark:hover:border-yellow-900 transition-all text-center"
                  >
                    <div className="w-12 h-12 bg-yellow-50 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
                    </div>
                    <span className="block font-bold text-slate-700 dark:text-slate-200">متوسط</span>
                  </button>
                  <button 
                    onClick={() => startQuiz('hard')}
                    className="group bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-red-200 dark:hover:border-red-900 transition-all text-center"
                  >
                    <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <span className="w-4 h-4 rounded-full bg-red-500"></span>
                    </div>
                    <span className="block font-bold text-slate-700 dark:text-slate-200">صعب</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <button 
                    onClick={() => setScreen('progress')}
                    className="inline-flex items-center gap-2 py-3 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-bold shadow-lg hover:opacity-90 transition-all active:scale-95"
                  >
                    <BarChart3 className="w-5 h-5" />
                    عرض سجل التقدم
                  </button>
                </div>

                <div className="mt-16 text-[10px] text-slate-400 uppercase tracking-widest font-bold flex flex-col gap-1 items-center">
                  <span>تم التطوير من طرف Sellami Samir</span>
                  <span>باستخدام الذكاء الاصطناعي 🤖</span>
                </div>
              </motion.div>
            )}

            {screen === 'quiz' && (
              <motion.div 
                key="quiz"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid grid-cols-12 gap-8 h-full"
              >
                {/* Sidebar Info */}
                <aside className="hidden lg:flex col-span-3 flex-col gap-6">
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">المستوى الحالي</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-3 h-3 rounded-full",
                        difficulty === 'easy' ? "bg-green-500" : difficulty === 'medium' ? "bg-yellow-500" : "bg-red-500"
                      )}></span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {difficulty === 'easy' ? 'سهل' : difficulty === 'medium' ? 'متوسط' : 'صعب'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">تقدم الأسئلة</span>
                    <div className="text-2xl font-bold text-slate-800 dark:text-white">
                      {(currentIndex + 1).toString().padStart(2, '0')} <span className="text-slate-300 dark:text-slate-600 text-lg">/ 10</span>
                    </div>
                    <div className="flex gap-1 mt-4">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            i < currentIndex ? "bg-green-500" : i === currentIndex ? "bg-blue-500" : "bg-slate-100 dark:bg-slate-800"
                          )}
                        ></div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto">
                    <div className="bg-slate-900 dark:bg-slate-800 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                      <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-blue-500 opacity-20 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                      <p className="text-[10px] text-blue-300 font-bold mb-1 uppercase tracking-widest">مطوّر التطبيق</p>
                      <p className="text-xl font-bold leading-tight">سلامي سمير</p>
                      <p className="text-[10px] text-slate-400 mt-2 italic font-medium">Sellami Samir</p>
                    </div>
                  </div>
                </aside>

                {/* Quiz Area */}
                <section className="col-span-12 lg:col-span-9 flex flex-col gap-6">
                  <div className="bg-white dark:bg-slate-900 p-6 md:p-10 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
                    <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                      <div className="max-w-2xl">
                        <span className="text-brand font-bold text-xs uppercase tracking-widest mb-2 block">سؤال {(currentIndex + 1).toString().padStart(2, '0')}</span>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white leading-tight">
                          {questions[currentIndex]?.question}
                        </h2>
                      </div>
                      <div className={cn(
                        "flex flex-col items-center px-5 py-2 rounded-2xl border transition-all shrink-0",
                        questionTime <= 10 
                          ? "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/50 animate-pulse" 
                          : "bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/50"
                      )}>
                        <span className={cn("text-[10px] font-bold uppercase", questionTime <= 10 ? "text-red-400" : "text-orange-400")}>المؤقت</span>
                        <span className={cn("text-3xl font-mono font-bold", questionTime <= 10 ? "text-red-600" : "text-orange-600")}>{questionTime}s</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {shuffledOptions.map((opt, idx) => (
                        <button
                          key={idx}
                          disabled={isAnswered}
                          onClick={() => handleAnswer(opt)}
                          className={cn(
                            "group p-5 rounded-2xl border-2 text-right transition-all flex justify-between items-center",
                            !isAnswered && "border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-medium hover:border-blue-200 dark:hover:border-blue-900 hover:bg-slate-50 dark:hover:bg-slate-900/50",
                            isAnswered && opt.isCorrect && "bg-green-50 dark:bg-green-950/20 border-green-500 text-green-700 dark:text-green-400 font-bold",
                            isAnswered && !opt.isCorrect && (questions[currentIndex].options[questions[currentIndex].correct] !== opt.text ? "opacity-40 grayscale border-slate-100 dark:border-slate-800" : ""),
                            isAnswered && !opt.isCorrect && wrongAnswers.some(w => w.myAnswer === opt.text && w.question === questions[currentIndex].question) && "bg-red-50 dark:bg-red-950/20 border-red-500 text-red-700 dark:text-red-400 font-bold"
                          )}
                        >
                          {opt.text}
                          {isAnswered && opt.isCorrect && <CheckCircle2 className="w-5 h-5" />}
                          {isAnswered && !opt.isCorrect && wrongAnswers.some(w => w.myAnswer === opt.text && w.question === questions[currentIndex].question) && <XCircle className="w-5 h-5" />}
                        </button>
                      ))}
                    </div>

                    {/* Explanation Box */}
                    <AnimatePresence>
                      {isAnswered && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-blue-50 dark:bg-blue-950/20 border-r-4 border-blue-500 p-6 rounded-xl mb-8"
                        >
                          <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                            <Lightbulb className="w-5 h-5" />
                            <span className="font-bold text-sm">التفسير الإحصائي</span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                            {questions[currentIndex]?.explanation}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Action Buttons */}
                    <div className="mt-auto flex flex-col md:flex-row justify-between items-center gap-4">
                      {!isAnswered ? (
                        <button 
                          onClickCapture={(e) => {
                            e.stopPropagation();
                            if (!isAnswered) {
                              const q = questions[currentIndex];
                              const correctOpt = shuffledOptions.find(o => o.isCorrect);
                              if (correctOpt) handleAnswer({ ...correctOpt, isCorrect: true } as ShuffledOption);
                            }
                          }}
                          className="text-slate-400 dark:text-slate-500 font-bold text-sm hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          إظهار الإجابة والمساعدة 💡
                        </button>
                      ) : <div className="hidden md:block"></div>}
                      
                      {isAnswered && (
                        <button 
                          onClick={nextQuestion}
                          className="w-full md:w-auto bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                          <span>{currentIndex === questions.length - 1 ? 'إنهاء الامتحان' : 'السؤال التالي'}</span>
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {screen === 'result' && (
              <motion.div 
                key="result"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-3xl mx-auto flex flex-col items-center"
              >
                <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-[32px] flex items-center justify-center text-5xl mb-8 shadow-sm">
                  🏆
                </div>
                <h1 className="text-4xl font-black mb-2">انتهى التحدي!</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8">إليك ملخص أدائك في الاختبار.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-10">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">النتيجة النهائية</span>
                    <div className="text-6xl font-black text-brand mb-2">{score} <span className="text-slate-200 dark:text-slate-700 text-3xl">/ 10</span></div>
                    <div className="flex items-center justify-center gap-2">
                       {score >= 7 ? <span className="text-green-500 font-bold">أداء متميز!</span> : score >= 5 ? <span className="text-yellow-500 font-bold">أداء جيد</span> : <span className="text-red-500 font-bold">تحتاج للمراجعة</span>}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center gap-4">
                    <div className="flex justify-between items-center">
                       <span className="text-slate-500 font-medium">المستوى:</span>
                       <span className="font-bold">{difficulty === 'easy' ? 'سهل' : difficulty === 'medium' ? 'متوسط' : 'صعب'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-slate-500 font-medium">الوقت المستهلك:</span>
                       <span className="font-bold">{Math.floor((EXAM_TIME_SECONDS - examTime) / 60)}د { (EXAM_TIME_SECONDS - examTime) % 60}ث</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-slate-500 font-medium">الأخطاء:</span>
                       <span className="font-bold text-red-500">{wrongAnswers.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 w-full mb-10">
                   <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                     <History className="w-6 h-6 text-brand" />
                     مراجعة الأخطاء
                   </h3>
                   {wrongAnswers.length === 0 ? (
                     <div className="py-10 text-center text-slate-400 italic">لا توجد أخطاء لمراجعتها، عمل رائع!</div>
                   ) : (
                     <div className="space-y-8 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                       {wrongAnswers.map((item, idx) => (
                         <div key={idx} className="border-r-4 border-slate-100 dark:border-slate-800 pr-6 group">
                           <p className="font-bold text-lg mb-4 leading-snug group-hover:text-brand transition-colors">{item.question}</p>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                             <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50">
                               <span className="text-[10px] uppercase font-bold text-red-400 block mb-1">إجابتك</span>
                               <span className="font-bold text-red-700 dark:text-red-400">{item.myAnswer}</span>
                             </div>
                             <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-xl border border-green-100 dark:border-green-900/50">
                               <span className="text-[10px] uppercase font-bold text-green-400 block mb-1">الإجابة الصحيحة</span>
                               <span className="font-bold text-green-700 dark:text-green-400">{item.correctAnswer}</span>
                             </div>
                           </div>
                           <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-2xl text-sm italic py-4">
                              <span className="font-bold text-blue-600 dark:text-blue-400 not-italic ml-1">💡 التفسير:</span> {item.explanation}
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                <div className="flex gap-4 w-full max-w-md">
                  <button 
                    onClick={resetQuiz}
                    className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[20px] font-bold shadow-xl shadow-slate-200 dark:shadow-none hover:opacity-90 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Home className="w-5 h-5" />
                    الرئيسية
                  </button>
                  <button 
                    onClick={() => startQuiz(difficulty)}
                    className="flex-1 py-4 border-2 border-slate-200 dark:border-slate-800 rounded-[20px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <RotateCcw className="w-5 h-5" />
                    إعادة المحاولة
                  </button>
                </div>
              </motion.div>
            )}

            {screen === 'progress' && (
              <motion.div 
                key="progress"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-4xl mx-auto"
              >
                <div className="flex justify-between items-center mb-10">
                   <div>
                     <h1 className="text-3xl font-black">سجل التطور</h1>
                     <p className="text-slate-500 dark:text-slate-400">تتبع أداءك في جميع الاختبارات السابقة.</p>
                   </div>
                   <button 
                    onClick={() => setScreen('start')}
                    className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
                   >
                     <ChevronRight className="w-6 h-6" />
                   </button>
                </div>

                {history.length > 0 ? (
                  <div className="grid grid-cols-1 gap-8">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                      <Line 
                        data={{
                          labels: history.map((h, i) => `م ${i+1}\n${h.level}`),
                          datasets: [{
                            label: 'النقاط',
                            data: history.map(h => h.score),
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 6,
                            pointBackgroundColor: '#fff',
                            pointBorderWidth: 3
                          }]
                        }}
                        options={{
                          responsive: true,
                          scales: {
                            y: { min: 0, max: 10, ticks: { stepSize: 2, color: isDarkMode ? '#64748b' : '#94a3b8' }, grid: { color: isDarkMode ? '#1e293b' : '#f1f5f9' } },
                            x: { ticks: { color: isDarkMode ? '#64748b' : '#94a3b8' }, grid: { display: false } }
                          },
                          plugins: {
                            legend: { display: false }
                          }
                        }}
                      />
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                       <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                          <h3 className="font-bold text-lg">سجل الجلسات</h3>
                          <button 
                            onClick={clearHistory}
                            className="text-red-500 text-xs font-bold hover:underline"
                          >
                            مسح الكل 🗑️
                          </button>
                       </div>
                       <div className="max-h-[40vh] overflow-y-auto custom-scrollbar">
                         {history.slice().reverse().map((h, i) => (
                           <div key={i} className="px-8 py-5 border-b border-slate-50 dark:border-slate-950 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors">
                             <div>
                               <p className="font-bold text-slate-800 dark:text-slate-200">{h.level}</p>
                               <p className="text-[10px] text-slate-400 font-medium">{h.date}</p>
                             </div>
                             <div className="flex items-center gap-4">
                               <div className="text-right">
                                  <div className="text-xl font-black text-brand">{h.score} <span className="text-xs text-slate-300 dark:text-slate-700">/ {h.total}</span></div>
                               </div>
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 p-20 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center opacity-70">
                     <TrendingUp className="w-20 h-20 text-slate-200 dark:text-slate-800 mb-6" />
                     <p className="text-xl font-bold mb-2">السجل فارغ تماماً</p>
                     <p className="text-slate-400 mb-8 max-w-xs">ابدأ خوض اختباراتك الأولى لتظهر إحصائياتك ورسم بياني لمستواك هنا.</p>
                     <button 
                      onClick={() => setScreen('start')}
                      className="py-3 px-8 bg-brand text-white rounded-full font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                     >
                       ابدأ أول اختبار الآن
                     </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] left-[-5%] w-[30vw] h-[30vw] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-slate-200/30 dark:bg-slate-800/10 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
}
