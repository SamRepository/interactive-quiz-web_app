/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  difficulty: Difficulty;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface ShuffledOption {
  text: string;
  isCorrect: boolean;
}

export interface WrongAnswer {
  question: string;
  myAnswer: string;
  correctAnswer: string;
  explanation: string;
}

export interface QuizResult {
  date: string;
  score: number;
  total: number;
  level: string;
}

export type Screen = 'start' | 'quiz' | 'result' | 'progress';
