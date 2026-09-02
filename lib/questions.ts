export interface Question {
  question_number: number;
  question_text: string;
  options: string[];
  correct_answer: string | null;
  explanation?: string | null;
  type?: 'mcq' | 'text';
}

export const QUESTIONS: Question[] = [
  {
    question_number: 1,
    question_text: "Before revealing the evidence — what do you think contributes most to peri-implantitis risk?",
    options: [
      "A. Patient-related factors",
      "B. Biofilm/plaque alone",
      "C. Surgical factors",
      "D. Prosthetic factors",
      "E. A combination of these"
    ],
    correct_answer: null,
    explanation: null,
    type: 'mcq'
  },
  {
    question_number: 2,
    question_text: "To what extent do you agree that peri-implantitis should be considered a clinician-initiated complication rather than primarily a plaque-induced disease?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 3,
    question_text: "How might our surgical and prosthetic decisions be modified to reduce the risk of exposing the micro-rough implant surface?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 4,
    question_text: "When planning implant treatment, which clinician-controlled risk factors do you think are most important to address, and why?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 5,
    question_text: "Based on the BOOST study findings, how could controlling residual inflammation before periodontal regenerative surgery influence healing and long-term outcomes?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 6,
    question_text: "Do you think local doxycycline before regenerative surgery should influence routine clinical practice? Why or why not, and what additional evidence would you want before adopting it?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  }
];