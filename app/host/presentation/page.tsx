'use client';
export const dynamic = 'force-dynamic';
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

  useEffect(() => {
    const id = localStorage.getItem('host_session_id');
    if (!id) {
      window.location.href = '/host';
      return;
    }
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => setSession(data as Session | null));

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
        (payload) => setSession(payload.new as Session)
      )
      .subscribe();

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

  useEffect(() => {
    if (!session?.current_question || !sessionId) return;

    supabase
      .from('responses')
      .select('*')
      .eq('session_id', sessionId)
      .eq('question_id', session.current_question)
      .then(({ data }) => setResponses((data as Response[]) || []));

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
        (payload) => setResponses((prev) => [...prev, payload.new as Response])
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
      <div className="absolute inset-0 bg-gradient-to-b from-navy to-teal-900 opacity-80 pointer-events-none" />
      <div className="relative w-full max-w-6xl">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-teal-300">
              <path d="M12 5.5c-1.5-1.5-3-2-4.5-2C5 3.5 4 5 4 7c0 2 1 3.5 2.5 3.5S9 9 12 9s2 1.5 3.5 1.5S20 9 20 7c0-2-1-3.5-3.5-3.5-1.5 0-3 .5-4.5 2Z" />
              <path d="M12 9c-2 0-3 3-3 6 0 2 1 3 3 3s3-1 3-3c0-3-1-6-3-6Z" />
            </svg>
            <h1 className="text-4xl font-extrabold tracking-tight">PERIO LIVE</h1>
          </div>
          <div className="text-2xl">Participants: <span className="font-bold text-teal-300">{participants.length}</span></div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 md:p-10 border border-white/20">
          <h2 className="text-4xl font-bold mb-4">QUESTION {String(session.current_question).padStart(2, '0')}</h2>
          <p className="text-2xl mb-8">{question.question_text}</p>

          {question.type !== 'text' ? (
            <div className="mb-8">
              <LiveBarChart data={answerCounts} correctAnswer={question.correct_answer} revealAnswer={session.reveal_answer} />
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto mb-8">
              {responses.length === 0 ? (
                <p className="text-white/70 text-center py-8">No answers yet.</p>
              ) : (
                responses.map((resp) => (
                  <div key={resp.id} className="bg-white/10 rounded-xl p-4 border border-white/20">
                    <p className="text-white">{resp.answer}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {session.reveal_answer && question.correct_answer && (
            <div className="text-center">
              <p className="text-3xl font-semibold text-teal-300">Correct Answer: {question.correct_answer}</p>
              {question.explanation && <p className="mt-2 text-xl text-white/90">{question.explanation}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}