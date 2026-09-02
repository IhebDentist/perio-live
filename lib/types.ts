export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          code: string;
          title: string | null;
          host_user_id: string;
          status: 'waiting' | 'active' | 'ended';
          current_question: number;
          reveal_answer: boolean;
          lock_responses: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          title?: string | null;
          host_user_id: string;
          status?: 'waiting' | 'active' | 'ended';
          current_question?: number;
          reveal_answer?: boolean;
          lock_responses?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          title?: string | null;
          host_user_id?: string;
          status?: 'waiting' | 'active' | 'ended';
          current_question?: number;
          reveal_answer?: boolean;
          lock_responses?: boolean;
          created_at?: string;
        };
      };
      participants: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          display_name: string | null;
          joined_at: string;
          last_seen: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          display_name?: string | null;
          joined_at?: string;
          last_seen?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          display_name?: string | null;
          joined_at?: string;
          last_seen?: string;
        };
      };
      responses: {
        Row: {
          id: string;
          session_id: string;
          participant_id: string;
          question_id: number;
          answer: string;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          participant_id: string;
          question_id: number;
          answer: string;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          participant_id?: string;
          question_id?: number;
          answer?: string;
          submitted_at?: string;
        };
      };
      questions: {
        Row: {
          id: number;
          question_number: number;
          question_text: string;
          options: Json;
          correct_answer: string | null;
          explanation: string | null;
        };
        Insert: {
          id?: number;
          question_number: number;
          question_text: string;
          options: Json;
          correct_answer?: string | null;
          explanation?: string | null;
        };
        Update: {
          id?: number;
          question_number?: number;
          question_text?: string;
          options?: Json;
          correct_answer?: string | null;
          explanation?: string | null;
        };
      };
    };
  };
}