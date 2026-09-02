'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [allResponses, setAllResponses] = useState<Response[]>([]);
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [totalQuestions] = useState(QUESTIONS.length);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoCount, setDemoCount] = useState(10);
  const [demoResponses, setDemoResponses] = useState<Record<string, number>>({});
  const [demoActive, setDemoActive] = useState(false);

  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    const storedSessionId = localStorage.getItem('host_session_id');
    if (!storedSessionId) {
      router.push('/host');
      return;
    }
    sessionId.current = storedSessionId;
    fetchSession(storedSessionId);
  }, []);

  const fetchSession = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single();
      if (error) throw error;

      // Explicitly cast data to Session | null
      const sessionData = data as Session | null;
      if (!sessionData) {
        throw new Error('Session not found');
      }

      setSession(sessionData);

      // Load participants
      const { data: participantsData } = await supabase.from('participants').select('*').eq('session_id', id);
      setParticipants(participantsData || []);

      // Load responses for current question if any
      if (sessionData.current_question) {
        const { data: responsesData } = await supabase
          .from('responses')
          .select('*')
          .eq('session_id', id)
          .eq('question_id', sessionData.current_question);
        setResponses(responsesData || []);
      }
    } catch (err) {
      console.error(err);
      alert('Could not load session. Redirecting to host start.');
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const newSession = payload.new as Session;
          setSession(newSession);
          if (newSession.current_question !== session.current_question) {
            setResponses([]);
            if (newSession.current_question) {
              supabase
                .from('responses')
                .select('*')
                .eq('session_id', newSession.id)
                .eq('question_id', newSession.current_question)
                .then(({ data }) => setResponses(data || []));
            }
          }
        }
      )
      .subscribe();

    const participantChannel = supabase
      .channel(`participants-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setParticipants((prev) => [...prev, payload.new as Participant]);
          } else if (payload.eventType === 'DELETE') {
            setParticipants((prev) => prev.filter((p) => p.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setParticipants((prev) =>
              prev.map((p) => (p.id === payload.new.id ? { ...p, ...payload.new } : p))
            );
          }
        }
      )
      .subscribe();

    const responseChannel = supabase
      .channel(`responses-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responses',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const newResp = payload.new as Response;
          if (newResp.question_id === session.current_question) {
            setResponses((prev) => [...prev, newResp]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(responseChannel);
    };
  }, [session?.id, session?.current_question]);

  // Update question object when current_question changes
  useEffect(() => {
    if (session?.current_question) {
      const q = QUESTIONS.find((q) => q.question_number === session.current_question);
      setQuestion(q || QUESTIONS[0]);
    }
  }, [session?.current_question]);

  // Fetch all responses when session ends
  useEffect(() => {
    if (session?.status === 'ended' && session.id) {
      supabase
        .from('responses')
        .select('*')
        .eq('session_id', session.id)
        .then(({ data }) => setAllResponses(data || []));
    }
  }, [session?.status, session?.id]);

  // Host actions
  const nextQuestion = async () => {
    if (!session) return;
    if (session.current_question >= totalQuestions) {
      await updateSession({ status: 'ended' });
      return;
    }
    const next = session.current_question + 1;
    await updateSession({
      current_question: next,
      reveal_answer: false,
      lock_responses: false,
      status: 'active',
    });
  };

  const lockResponses = async () => {
    if (!session) return;
    await updateSession({ lock_responses: true });
  };

  const unlockResponses = async () => {
    if (!session) return;
    await updateSession({ lock_responses: false });
  };

  const revealAnswer = async () => {
    if (!session) return;
    await updateSession({ reveal_answer: true, lock_responses: true });
  };

  const hideAnswer = async () => {
    if (!session) return;
    await updateSession({ reveal_answer: false });
  };

  const restartQuestion = async () => {
    if (!session) return;
    await supabase
      .from('responses')
      .delete()
      .eq('session_id', session.id)
      .eq('question_id', session.current_question);
    await updateSession({ reveal_answer: false, lock_responses: false });
    setResponses([]);
  };

  const endSession = async () => {
    if (!session) return;
    await updateSession({ status: 'ended' });
  };

  const updateSession = async (updates: Partial<Session>) => {
    if (!session) return;
    const { error } = await supabase.from('sessions').update(updates).eq('id', session.id);
    if (error) console.error(error);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  // Demo mode simulation
  const simulateDemo = () => {
    setDemoActive(true);
    const options = question.options;
    const counts: Record<string, number> = {};
    options.forEach((opt) => (counts[opt] = 0));
    const n = demoCount;
    const weights = [0.2, 0.5, 0.2, 0.1]; // typical distribution
    for (let i = 0; i < n; i++) {
      let r = Math.random();
      let idx = 0;
      while (r > weights[idx]) {
        r -= weights[idx];
        idx++;
        if (idx >= weights.length) idx = 0;
      }
      counts[options[idx]]++;
    }
    setDemoResponses(counts);
  };

  const stopDemo = () => {
    setDemoActive(false);
    setDemoResponses({});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAF2F8]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-slate-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAF2F8]">
        <p className="text-slate-600">Session not found. Redirecting...</p>
      </div>
    );
  }

  // Results screen when session ended
  if (session.status === 'ended') {
    return (
      <div className="min-h-screen bg-[#EAF2F8] p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-extrabold text-navy mb-2">SESSION COMPLETE</h1>
            <p className="text-2xl text-teal-600 font-semibold">How did we think?</p>
          </div>

          <div className="space-y-6">
            {QUESTIONS.map((q) => {
              const qResponses = allResponses.filter((r) => r.question_id === q.question_number);
              const total = qResponses.length;
              let correctCount = 0;
              if (q.correct_answer) {
                correctCount = qResponses.filter((r) => r.answer.startsWith(q.correct_answer)).length;
              }
              const percentage = total ? Math.round((correctCount / total) * 100) : 0;
              return (
                <div key={q.question_number} className="card p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-navy">Question {q.question_number}</h3>
                    <span className="text-sm text-slate-500">{total} responses</span>
                  </div>
                  <p className="text-slate-700 mb-3">{q.question_text}</p>
                  {q.type === 'text' ? (
                    <div>
                      <p className="font-semibold text-slate-700">Open‑ended responses ({total}):</p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {qResponses.map((resp) => (
                          <li key={resp.id} className="text-slate-600">{resp.answer}</li>
                        ))}
                      </ul>
                    </div>
                  ) : q.correct_answer ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-teal-600">Correct: {q.correct_answer}</span>
                      <span className="text-slate-500">|</span>
                      <span className="font-semibold">{percentage}% correct</span>
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Poll – no correct answer</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card p-8 mt-8 text-center">
            <h2 className="text-3xl font-bold text-navy mb-4">AUDIENCE SCORE</h2>
            <p className="text-6xl font-extrabold text-teal-600 mb-6">
              {(() => {
                const correctQuestions = QUESTIONS.filter((q) => q.correct_answer);
                const allCorrect = allResponses.filter((r) => {
                  const q = QUESTIONS.find((qq) => qq.question_number === r.question_id);
                  return q?.correct_answer && r.answer.startsWith(q.correct_answer);
                });
                const allWithCorrect = allResponses.filter((r) => {
                  const q = QUESTIONS.find((qq) => qq.question_number === r.question_id);
                  return q?.correct_answer;
                });
                return allWithCorrect.length ? Math.round((allCorrect.length / allWithCorrect.length) * 100) : 0;
              })()}
              %
            </p>
            <p className="text-slate-600">Thank you for participating.</p>
            <div className="mt-8 text-lg font-medium text-navy">
              <p className="mb-1">FROM SITE OPTIMIZATION</p>
              <p className="text-2xl">↓</p>
              <p className="mt-1">TO TREATMENT OPTIMIZATION</p>
              <p className="text-2xl">↓</p>
              <p className="mt-1">BETTER DECISIONS TODAY, HEALTHIER IMPLANTS TOMORROW.</p>
            </div>
          </div>

          <div className="text-center mt-8">
            <button onClick={() => router.push('/host')} className="btn-secondary">Back to Start</button>
          </div>
        </div>
      </div>
    );
  }

  // Active session view
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join?code=${session.code}` : '';

  const currentResponses = demoActive
    ? Object.entries(demoResponses).map(([answer, count]) => ({
        answer,
        count,
        percentage: demoCount ? Math.round((count / demoCount) * 100) : 0,
      }))
    : question.options.map((opt) => {
        const count = responses.filter((r) => r.answer === opt).length;
        const total = responses.length;
        return {
          answer: opt,
          count,
          percentage: total ? Math.round((count / total) * 100) : 0,
        };
      });

  const participantsCount = demoActive ? demoCount : participants.length;
  const answeredCount = demoActive ? demoCount : responses.length;

  return (
    <div className="min-h-screen bg-[#EAF2F8] p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-teal-600">
            <path d="M12 5.5c-1.5-1.5-3-2-4.5-2C5 3.5 4 5 4 7c0 2 1 3.5 2.5 3.5S9 9 12 9s2 1.5 3.5 1.5S20 9 20 7c0-2-1-3.5-3.5-3.5-1.5 0-3 .5-4.5 2Z" />
            <path d="M12 9c-2 0-3 3-3 6 0 2 1 3 3 3s3-1 3-3c0-3-1-6-3-6Z" />
          </svg>
          <div>
            <h1 className="text-3xl font-extrabold text-navy tracking-tight">PERIO LIVE</h1>
            <p className="text-teal-600 font-semibold text-lg">Host Control Room</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={toggleFullscreen} className="btn-secondary flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Fullscreen
          </button>
          <a href="/host/presentation" target="_blank" className="btn-secondary flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-4.553a.75.75 0 00-.53-1.28H14a.75.75 0 000 1.5h2.94L12 11.06l-1.06-1.06-4.94 4.94v-2.94a.75.75 0 00-1.5 0v5a.75.75 0 00.75.75h5a.75.75 0 000-1.5H8.31L13.25 13.5 14.06 14.31 9.1 19.25h2.9a.75.75 0 000 1.5h-5A.75.75 0 016.25 20v-5a.75.75 0 001.5 0v2.94l4.94-4.94L11.75 12 6.8 16.9v-2.9a.75.75 0 00-1.5 0v5" />
            </svg>
            Presentation View
          </a>
          <button onClick={endSession} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors">End Session</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: QR */}
        <div className="card p-6 text-center">
          <h2 className="text-2xl font-bold text-navy mb-4">Join the Discussion</h2>
          <div className="flex justify-center mb-4 bg-white rounded-2xl p-4 shadow-inner">
            <QRCodeComponent value={joinUrl} size={180} />
          </div>
          <p className="text-sm text-slate-600 mb-1">Go to:</p>
          <p className="font-mono text-lg text-teal-700">{typeof window !== 'undefined' ? window.location.origin : ''}/join</p>
          <div className="mt-4">
            <span className="text-4xl font-extrabold tracking-widest bg-slate-100 px-8 py-3 rounded-2xl inline-block shadow-sm">{session.code}</span>
          </div>
          <div className="mt-6">
            <span className="text-3xl font-bold text-navy">{participantsCount}</span>
            <p className="text-slate-500 mt-1">Participants joined</p>
          </div>
        </div>

        {/* Middle: Question */}
        <div className="card p-6 md:col-span-2">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold text-navy">
              QUESTION {String(session.current_question).padStart(2, '0')}
              <span className="text-slate-500 text-lg"> / {totalQuestions}</span>
            </h2>
            <div className="flex gap-2">
              {!demoActive ? (
                <button onClick={simulateDemo} className="btn-secondary text-sm">Demo Mode ({demoCount})</button>
              ) : (
                <button onClick={stopDemo} className="btn-secondary text-sm">Stop Demo</button>
              )}
            </div>
          </div>
          <p className="text-lg md:text-xl mb-6">{question.question_text}</p>

          {/* Question content */}
          {question.type !== 'text' ? (
            <>
              <div className="space-y-2">
                {question.options.map((opt) => (
                  <div key={opt} className={`py-3 px-4 rounded-xl border-2 transition-colors ${
                    session.reveal_answer && question.correct_answer && opt.startsWith(question.correct_answer)
                      ? 'bg-teal-100 border-teal-500 font-semibold'
                      : 'bg-white border-slate-200'
                  }`}>
                    {opt}
                  </div>
                ))}
              </div>
              <div className="mt-6 text-center">
                <span className="text-3xl font-bold text-navy">{answeredCount}</span>
                <span className="text-slate-500"> / {participantsCount} answered</span>
              </div>
              <div className="mt-6">
                <LiveBarChart data={currentResponses} correctAnswer={question.correct_answer} revealAnswer={session.reveal_answer} />
              </div>
            </>
          ) : (
            <div className="mt-6">
              <div className="text-center mb-4">
                <span className="text-3xl font-bold text-navy">{answeredCount}</span>
                <span className="text-slate-500"> / {participantsCount} answered</span>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {responses.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No answers yet. Waiting for responses...</p>
                ) : (
                  responses.map((resp) => (
                    <div key={resp.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                      <p className="text-slate-800">{resp.answer}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {participants.find((p) => p.id === resp.participant_id)?.display_name || 'Anonymous'}
                      </p>
                    </div>
                  ))
                )}
              </div>
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
              {session.current_question >= totalQuestions ? 'End Session & Results' : 'Next Question'}
            </button>
          </div>

          {session.reveal_answer && question.explanation && (
            <div className="mt-6 p-5 bg-lavender rounded-2xl border border-lavender">
              <h3 className="font-bold text-navy text-lg">Explanation</h3>
              <p className="text-slate-700 mt-1">{question.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}