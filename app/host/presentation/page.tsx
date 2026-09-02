'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import LiveBarChart from '@/components/LiveBarChart';
import { QUESTIONS } from '@/lib/questions';

interface Session {
  id: string;
  code: string;
  title: string | null;
  status: 'waiting' | 'active' | 'ended';
  current_question: number;
  reveal_answer: boolean;
  lock_responses: boolean;
  host_user_id: string;
}

interface Participant {
  id: string;
  display_name: string | null;
  user_id: string;
}

interface Response {
  id: string;
  participant_id: string;
  question_id: number;
  answer: string;
  submitted_at: string;
}

export default function PresentationView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Load session ID from localStorage
  useEffect(() => {
    const id = localStorage.getItem('host_session_id');
    if (!id) {
      window.location.href = '/host';
      return;
    }
    setSessionId(id);
  }, []);

  // Fetch session and subscribe to updates
  useEffect(() => {
    if (!sessionId) return;

    // Initial fetch
    supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => setSession(data));

    // Subscribe to session changes
    const sessionSub = supabase
      .channel(`pres-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .subscribe();

    // Participants count
    const participantSub = supabase
      .channel(`pres-participants-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') setParticipants((prev) => [...prev, payload.new as Participant]);
          else if (payload.eventType === 'DELETE') setParticipants((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSub);
      supabase.removeChannel(participantSub);
    };
  }, [sessionId]);

  // Fetch responses for current question and subscribe
  useEffect(() => {
    if (!session?.current_question || !sessionId) return;

    supabase
      .from('responses')
      .select('*')
      .eq('session_id', sessionId)
      .eq('question_id', session.current_question)
      .then(({ data }) => setResponses(data || []));

    const respSub = supabase
      .channel(`pres-responses-${sessionId}-${session.current_question}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responses',
          filter: `session_id=eq.${sessionId} and question_id=eq.${session.current_question}`,
        },
        (payload) => {
          setResponses((prev) => [...prev, payload.new as Response]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(respSub);
    };
  }, [session?.current_question, sessionId]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy text-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-400 mb-4"></div>
          <p className="text-xl">Loading presentation...</p>
        </div>
      </div>
    );
  }

  const question = QUESTIONS.find((q) => q.question_number === session.current_question);
  if (!question) return null;

  const answerCounts = question.options.map((opt) => {
    const count = responses.filter((r) => r.answer === opt).length;
    const total = responses.length;
    return {
      answer: opt,
      count,
      percentage: total ? Math.round((count / total) * 100) : 0,
    };
  });

  return (
    <div className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-8 relative">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy to-teal-900 opacity-70 pointer-events-none" />

      <div className="relative w-full max-w-6xl">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-5xl font-extrabold tracking-tight">PERIO LIVE</h1>
            <p className="text-teal-300 text-xl">Dr. Alghalia Al-Mansoori</p>
          </div>
          <div className="text-2xl">
            Participants: <span className="font-bold text-teal-300">{participants.length}</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 md:p-10 border border-white/20">
          <h2 className="text-4xl font-bold mb-4">
            QUESTION {String(session.current_question).padStart(2, '0')}
          </h2>
          <p className="text-2xl mb-8">{question.question_text}</p>

          <div className="mb-8">
            <LiveBarChart
              data={answerCounts}
              correctAnswer={question.correct_answer}
              revealAnswer={session.reveal_answer}
            />
          </div>

          {session.reveal_answer && question.correct_answer && (
            <div className="text-center">
              <p className="text-3xl font-semibold text-teal-300">
                Correct Answer: {question.correct_answer}
              </p>
              {question.explanation && (
                <p className="mt-2 text-xl text-white/90">{question.explanation}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}