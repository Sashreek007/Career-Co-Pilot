export type InterviewType =
  | 'technical_coding'
  | 'system_design'
  | 'behavioral'
  | 'product_case'
  | 'mixed';

export type QuestionCategory = 'technical' | 'behavioral' | 'company_specific';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface InterviewQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  contextNotes?: string;
  skills: string[];
}

export interface AnswerDraft {
  questionId: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

export interface MockScore {
  sessionId: string;
  questionId: string;
  structureScore: number;   // 1-5
  relevanceScore: number;
  technicalDepth: number;
  specificity: number;
  clarity: number;
  finalScore: number;
  suggestions: string[];
  createdAt: string;
}

export interface InterviewKit {
  id: string;
  applicationId: string;
  jobTitle: string;
  company: string;
  interviewType: InterviewType;
  questions: InterviewQuestion[];
  answerDrafts: AnswerDraft[];
  mockScores: MockScore[];
  createdAt: string;
}
