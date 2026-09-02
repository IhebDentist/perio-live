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
    question_text: "BOOST gave local doxycycline before surgery to otherwise well-controlled patients. Smart site-optimization, or antimicrobial overuse? Where's your line?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 3,
    question_text: "This RCT had 30 patients per arm at one center. Does it change your protocol tomorrow, or are you waiting for more evidence?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 4,
    question_text: "~71% of peri-implantitis cases are linked to clinician decisions, not biofilm alone. Does this change how you talk to patients about their role — or does it shift blame too far onto the clinician?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 5,
    question_text: "Should BOOST-style local 'priming' be tested before implant placement, not just before periodontal regeneration? What's the risk of extrapolating it?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  },
  {
    question_number: 6,
    question_text: "If you could change only ONE clinician-controlled factor in your own practice starting Monday — implant position, emergence angle, cementation, or platform switching — which one, and why?",
    options: [],
    correct_answer: null,
    explanation: null,
    type: 'text'
  }
];