'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import QRCodeComponent from '@/components/QRCode';
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

export default function HostDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [loading, setLoading] = useState(true);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('host_session_id');
    if (!stored) {
      router.push('/host');
      return;
    }
    sessionId.current = stored;
    fetchSession(stored);
  }, []);

  const fetchSession = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single();
      if (error) throw error;
      setSession(data as Session);

      const { data: participantsData } = await supabase.from('participants').select('*').eq('session_id', id);
      setParticipants(participantsData as Participant[] || []);

      if (data.current_question) {
        const { data: responsesData } = await supabase
          .from('responses')
          .select('*')
          .eq('session_id', id)
          .eq('question_id', data.current_question);
        setResponses(responsesData as Response[] || []);
      }
    } catch (err) {
      console.error(err);
      alert('Could not load session.');
      router.push('/host');
    } finally {
      setLoading(false);
    }
  };

  // Realtime subscriptions
  useEffect(() => {
    if (!session?.id) return;
    const sessionChannel = supabase
      .channel(`session-${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new as Session);
      })
      .subscribe();

    const participantChannel = supabase
      .channel(`participants-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${session.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setParticipants(prev => [...prev, payload.new as Participant]);
        else if (payload.eventType === 'DELETE') setParticipants(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .subscribe();

    const responseChannel = supabase
      .channel(`responses-${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'responses', filter: `session_id=eq.${session.id}` }, (payload) => {
        const newResp = payload.new as Response;
        if (newResp.question_id === session.current_question) setResponses(prev => [...prev, newResp]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(responseChannel);
    };
  }, [session?.id, session?.current_question]);

  // Update question
  useEffect(() => {
    if (session?.current_question) {
      const q = QUESTIONS.find(q => q.question_number === session.current_question);
      setQuestion(q || QUESTIONS[0]);
    }
  }, [session?.current_question]);

  // Actions
  const nextQuestion = async () => {
    if (!session) return;
    if (session.current_question >= QUESTIONS.length) {
      await updateSession({ status: 'ended' });
      return;
    }
    const next = session.current_question + 1;
    await updateSession({ current_question: next, reveal_answer: false, lock_responses: false, status: 'active' });
  };

  const lockResponses = async () => { if (!session) return; await updateSession({ lock_responses: true }); };
  const unlockResponses = async () => { if (!session) return; await updateSession({ lock_responses: false }); };
  const revealAnswer = async () => { if (!session) return; await updateSession({ reveal_answer: true, lock_responses: true }); };
  const hideAnswer = async () => { if (!session) return; await updateSession({ reveal_answer: false }); };
  const restartQuestion = async () => {
    if (!session) return;
    await supabase.from('responses').delete().eq('session_id', session.id).eq('question_id', session.current_question);
    await updateSession({ reveal_answer: false, lock_responses: false });
    setResponses([]);
  };
  const endSession = async () => { if (!session) return; await updateSession({ status: 'ended' }); };

  const updateSession = async (updates: Partial<Session>) => {
    if (!session) return;
    const { error } = await supabase.from('sessions').update(updates).eq('id', session.id);
    if (error) console.error(error);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#EAF2F8]">Loading session...</div>;
  }

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center bg-[#EAF2F8]">Session not found. Redirecting...</div>;
  }

  // Results screen
  if (session.status === 'ended') {
    return (
      <div className="min-h-screen bg-[#EAF2F8] p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-extrabold text-navy mb-4">SESSION COMPLETE</h1>
          <p className="text-xl text-slate-600">Thank you for participating.</p>
          <button onClick={() => router.push('/host')} className="btn-secondary mt-6">Back to Start</button>
        </div>
      </div>
    );
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join?code=${session.code}` : '';

  const currentResponses = question.options.map(opt => {
    const count = responses.filter(r => r.answer === opt).length;
    const total = responses.length;
    return { answer: opt, count, percentage: total ? Math.round((count / total) * 100) : 0 };
  });

  return (
    <div className="min-h-screen bg-[#EAF2F8] p-4 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">PERIO LIVE</h1>
          <p className="text-teal-600 font-semibold">Host Control Room</p>
        </div>
        <div className="flex gap-2">
          <button onClick={endSession} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl">End Session</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: QR */}
        <div className="card p-6 text-center">
          <h2 className="text-2xl font-bold text-navy mb-4">Join the Discussion</h2>
          <div className="flex justify-center mb-4">
            <QRCodeComponent value={joinUrl} size={180} />
          </div>
          <p className="text-sm text-slate-600">Go to:</p>
          <p className="font-mono text-lg text-teal-700">{window.location.origin}/join</p>
          <div className="mt-4">
            <span className="text-4xl font-extrabold tracking-widest bg-slate-100 px-8 py-3 rounded-2xl">{session.code}</span>
          </div>
          <div className="mt-6">
            <span className="text-3xl font-bold text-navy">{participants.length}</span>
            <p className="text-slate-500">Participants joined</p>
          </div>
        </div>

        {/* Middle: Question */}
        <div className="card p-6 md:col-span-2">
          <h2 className="text-2xl font-bold text-navy mb-4">
            QUESTION {String(session.current_question).padStart(2, '0')}
            <span className="text-slate-500 text-lg"> / {QUESTIONS.length}</span>
          </h2>
          <p className="text-lg mb-6">{question.question_text}</p>

          {question.type !== 'text' ? (
            <>
              <div className="space-y-2">
                {question.options.map(opt => (
                  <div key={opt} className={`py-3 px-4 rounded-xl border-2 ${session.reveal_answer && question.correct_answer && opt.startsWith(question.correct_answer) ? 'bg-teal-100 border-teal-500' : 'bg-white border-slate-200'}`}>
                    {opt}
                  </div>
                ))}
              </div>
              <div className="mt-6 text-center">
                <span className="text-3xl font-bold text-navy">{responses.length}</span>
                <span className="text-slate-500"> / {participants.length} answered</span>
              </div>
              <div className="mt-6">
                <LiveBarChart data={currentResponses} correctAnswer={question.correct_answer} revealAnswer={session.reveal_answer} />
              </div>
            </>
          ) : (
            <div className="mt-6 space-y-3 max-h-80 overflow-y-auto">
              {responses.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No answers yet.</p>
              ) : (
                responses.map(resp => (
                  <div key={resp.id} className="bg-white rounded-xl p-4 border border-slate-200">
                    <p className="text-slate-800">{resp.answer}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Controls */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            {!session.lock_responses ? (
              <button onClick={lockResponses} className="btn-secondary">Lock Responses</button>
            ) : (
              <button onClick={unlockResponses} className="btn-secondary">Unlock Responses</button>
            )}
            {!session.reveal_answer && question.correct_answer ? (
              <button onClick={revealAnswer} className="btn-primary">Reveal Answer</button>
            ) : session.reveal_answer ? (
              <button onClick={hideAnswer} className="btn-secondary">Hide Answer</button>
            ) : null}
            <button onClick={restartQuestion} className="btn-secondary">Restart Question</button>
            <button onClick={nextQuestion} className="btn-primary">
              {session.current_question >= QUESTIONS.length ? 'End Session & Results' : 'Next Question'}
            </button>
          </div>

          {session.reveal_answer && question.explanation && (
            <div className="mt-6 p-5 bg-lavender rounded-2xl">
              <h3 className="font-bold text-navy">Explanation</h3>
              <p className="text-slate-700">{question.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}