export type ApplicationStatus =
  | 'drafted'
  | 'approved'
  | 'submitted'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'archived';

export interface FormField {
  type: 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'file';
  label: string;
  required: boolean;
  value?: string;
  options?: string[];
}

export interface ApplicationDraft {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  resumeVersionId: string;
  status: ApplicationStatus;
  matchScore: number;
  coverLetter?: string;
  formStructure: FormField[];
  answers: Record<string, string>;
  missingSkills: string[];
  createdAt: string;
  approvedAt?: string;
  submittedAt?: string;
  responseTimedays?: number;
  notes?: string;
}
