'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
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
  session_id: string;
  user_id: string;
  display_name: string | null;
  joined_at: string;
  last_seen: string;
}

export default function JoinPage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const [step, setStep] = useState<'enter' | 'name' | 'waiting' | 'answer' | 'submitted' | 'ended'>('enter');
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const storedParticipantId = localStorage.getItem('participant_id');
    const storedSessionId = localStorage.getItem('participant_session_id');
    if (storedParticipantId && storedSessionId) {
      supabase
        .from('participants')
        .select('*')
        .eq('id', storedParticipantId)
        .single()
        .then(({ data }) => {
          if (data) {
            setParticipant(data as Participant);
            fetchSession(storedSessionId);
            setStep('waiting');
          }
        });
    }
  }, []);

  const fetchSession = async (sessionId: string) => {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    const sessionData = data as Session | null;
    if (sessionData) {
      setSession(sessionData);
      if (sessionData.status === 'ended') setStep('ended');
      else if (sessionData.status === 'active' && sessionData.current_question) {
        setStep('answer');
        loadQuestion(sessionData.current_question);
      } else {
        setStep('waiting');
      }
    }
  };

  const loadQuestion = (questionNumber: number) => {
    const q = QUESTIONS.find((q) => q.question_number === questionNumber);
    setCurrentQuestion(q || null);
    setSelectedAnswer(null);
    setTextAnswer('');
  };

  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`participant-session-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const newSession = payload.new as Session;
          setSession(newSession);
          if (newSession.status === 'ended') setStep('ended');
          else if (newSession.status === 'active' && newSession.current_question) {
            loadQuestion(newSession.current_question);
            setStep('answer');
          } else {
            setStep('waiting');
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, session?.current_question]);

  const joinSession = async () => {
    if (!code.trim() || code.length !== 4) {
      setError('Please enter the 4-digit code.');
      return;
    }
    setError('');

    const { data: sessionDataRaw, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('code', code.trim())
      .single();
    if (sessionError || !sessionDataRaw) {
      setError('Invalid session code.');
      return;
    }
    const sessionData = sessionDataRaw as Session;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    let user = authData.user;
    if (!user) {
      const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError('Authentication failed. Please try again.');
        return;
      }
      user = signInData.user;
    }
    if (!user) {
      setError('Authentication failed.');
      return;
    }

    const { data: participantDataRaw, error: participantError } = await supabase
      .from('participants')
      .insert({
        session_id: sessionData.id,
        user_id: user.id,
        display_name: name.trim() || null,
      })
      .select()
      .single();

    if (participantError) {
      const { data: existingRaw } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionData.id)
        .eq('user_id', user.id)
        .single();
      if (existingRaw) {
        const existing = existingRaw as Participant;
        setParticipant(existing);
        setSession(sessionData);
        localStorage.setItem('participant_id', existing.id);
        localStorage.setItem('participant_session_id', sessionData.id);
        fetchSession(sessionData.id);
        return;
      }
      setError('Failed to join session. Please try again.');
      return;
    }

    const participantData = participantDataRaw as Participant;
    setParticipant(participantData);
    setSession(sessionData);
    localStorage.setItem('participant_id', participantData.id);
    localStorage.setItem('participant_session_id', sessionData.id);
    fetchSession(sessionData.id);
  };

  const submitAnswer = async (answer: string) => {
    if (!session || !participant || !currentQuestion) return;
    if (session.lock_responses) return;

    const { data: existing } = await supabase
      .from('responses')
      .select('id')
      .eq('session_id', session.id)
      .eq('participant_id', participant.id)
      .eq('question_id', currentQuestion.question_number)
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase
      .from('responses')
      .insert({
        session_id: session.id,
        participant_id: participant.id,
        question_id: currentQuestion.question_number,
        answer,
      });
    if (error) {
      if (error.code !== '23505') console.error(error);
    } else {
      setSelectedAnswer(answer);
      setStep('submitted');
    }
  };

  const submitTextAnswer = async () => {
    if (!textAnswer.trim()) return;
    await submitAnswer(textAnswer.trim());
    setTextAnswer('');
  };

  if (step === 'enter' || step === 'name') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#EAF2F8]">
        <div className="card w-full max-w-md p-8 rounded-2xl shadow-2xl">
          <div className="mb-4 flex justify-center">
            <Image
              src="/images/perio-banner.png"
              alt="Perio Live"
              width={300}
              height={120}
              className="rounded-xl object-cover"
              priority
            />
          </div>

          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-teal-600">
                <path d="M12 5.5c-1.5-1.5-3-2-4.5-2C5 3.5 4 5 4 7c0 2 1 3.5 2.5 3.5S9 9 12 9s2 1.5 3.5 1.5S20 9 20 7c0-2-1-3.5-3.5-3.5-1.5 0-3 .5-4.5 2Z" />
                <path d="M12 9c-2 0-3 3-3 6 0 2 1 3 3 3s3-1 3-3c0-3-1-6-3-6Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-navy">PERIO LIVE</h1>
            <p className="text-teal-600 font-semibold">Dr. Alghalia Al-Mansoori</p>
            <p className="text-slate-500 text-sm">Interactive CPD Audience Response</p>
          </div>

          {step === 'enter' ? (
            <>
              <label className="block text-sm font-medium text-slate-700 mb-2">Enter the session code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full text-center text-3xl tracking-widest py-4 border border-slate-300 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all"
                placeholder="1234"
              />
              <button onClick={() => setStep('name')} className="btn-primary w-full py-4 text-lg">Continue</button>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-slate-700 mb-2">What's your name? (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-lg py-3 px-4 border border-slate-300 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all"
                placeholder="Your name"
              />
              <button onClick={joinSession} className="btn-primary w-full py-4 text-lg">Join Session</button>
            </>
          )}
          {error && <p className="text-red-600 mt-4 text-center text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#EAF2F8]">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-teal-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">You're in!</h2>
          <p className="text-slate-600">Watch the presentation screen for the next question.</p>
        </div>
      </div>
    );
  }

  if (step === 'ended') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#EAF2F8]">
        <div className="card w-full max-w-md p-8 text-center">
          <h2 className="text-2xl font-bold text-navy mb-4">Session Complete</h2>
          <p className="text-slate-600">Thank you for participating!</p>
        </div>
      </div>
    );
  }

  if (step === 'answer' || step === 'submitted') {
    if (!currentQuestion) return <div>Loading question...</div>;
    const isLocked = session?.lock_responses;
    const isRevealed = session?.reveal_answer;
    const isTextQuestion = currentQuestion.type === 'text';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#EAF2F8]">
        <div className="card w-full max-w-lg p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-navy mb-2">
              QUESTION {String(currentQuestion.question_number).padStart(2, '0')}
            </h2>
            <p className="text-lg md:text-xl text-slate-800">{currentQuestion.question_text}</p>
          </div>

          {step === 'answer' ? (
            isTextQuestion ? (
              <div className="space-y-4">
                <textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  rows={4}
                  placeholder="Type your answer here..."
                  className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-200 transition-all resize-none"
                  disabled={isLocked}
                />
                <button
                  onClick={submitTextAnswer}
                  disabled={isLocked || !textAnswer.trim()}
                  className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Answer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {currentQuestion.options.map((opt: string) => (
                  <button
                    key={opt}
                    onClick={() => submitAnswer(opt)}
                    disabled={isLocked || !!selectedAnswer}
                    className={`w-full text-left py-4 px-5 rounded-2xl border-2 transition-all duration-200 ${
                      selectedAnswer === opt
                        ? 'bg-teal-500 text-white border-teal-500 shadow-lg transform scale-[1.02]'
                        : isLocked
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-teal-50 hover:border-teal-300 border-slate-200'
                    }`}
                  >
                    <span className="font-medium">{opt}</span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <div className="mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-teal-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-2xl font-semibold text-teal-600 mb-2">Answer submitted ✓</p>
              <p className="text-slate-500">Wait for the presenter to reveal the correct answer.</p>
            </div>
          )}

          {isRevealed && currentQuestion.correct_answer && (
            <div className="mt-6 p-5 bg-lavender rounded-2xl border border-lavender">
              <p className="font-bold text-navy text-lg">Correct Answer: {currentQuestion.correct_answer}</p>
              {currentQuestion.explanation && <p className="mt-2 text-slate-700">{currentQuestion.explanation}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}