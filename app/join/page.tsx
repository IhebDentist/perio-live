'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';   // <-- added import
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { QUESTIONS } from '@/lib/questions';

export default function JoinPage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const [step, setStep] = useState<'enter' | 'name' | 'waiting' | 'answer' | 'submitted' | 'ended'>('enter');
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [session, setSession] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const storedParticipantId = localStorage.getItem('participant_id');
    const storedSessionId = localStorage.getItem('participant_session_id');
    if (storedParticipantId && storedSessionId) {
      supabase.from('participants').select('*').eq('id', storedParticipantId).single().then(({ data }) => {
        if (data) {
          setParticipant(data);
          fetchSession(storedSessionId);
          setStep('waiting');
        }
      });
    }
  }, []);

  const fetchSession = async (sessionId: string) => {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    if (data) {
      setSession(data);
      if (data.status === 'ended') setStep('ended');
      else if (data.status === 'active' && data.current_question) {
        setStep('answer');
        loadQuestion(data.current_question);
      } else {
        setStep('waiting');
      }
    }
  };

  const loadQuestion = (questionNumber: number) => {
    const q = QUESTIONS.find(q => q.question_number === questionNumber);
    setCurrentQuestion(q || null);
    setSelectedAnswer(null);
    setTextAnswer('');
  };

  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`participant-session-${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` }, (payload) => {
        const newSession = payload.new;
        setSession(newSession);
        if (newSession.status === 'ended') setStep('ended');
        else if (newSession.status === 'active' && newSession.current_question) {
          loadQuestion(newSession.current_question);
          setStep('answer');
        } else {
          setStep('waiting');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, session?.current_question]);

  const joinSession = async () => {
    if (!code.trim() || code.length !== 4) { setError('Please enter the 4-digit code.'); return; }
    setError('');
    const { data: sessionData, error: sessionError } = await supabase.from('sessions').select('*').eq('code', code.trim()).single();
    if (sessionError || !sessionData) { setError('Invalid session code.'); return; }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    let user = authData.user;
    if (!user) {
      const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) { setError('Authentication failed. Please try again.'); return; }
      user = signInData.user;
    }
    if (!user) { setError('Authentication failed.'); return; }

    const { data: participantData, error: participantError } = await supabase
      .from('participants')
      .insert({ session_id: sessionData.id, user_id: user.id, display_name: name.trim() || null })
      .select()
      .single();

    if (participantError) {
      const { data: existing } = await supabase.from('participants').select('*').eq('session_id', sessionData.id).eq('user_id', user.id).single();
      if (existing) {
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
      .insert({ session_id: session.id, participant_id: participant.id, question_id: currentQuestion.question_number, answer });
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
          {/* Hero image (same as host, can be different) */}
          <div className="mb-4 flex justify-center">
            <Image
              src="/images/perio-banner.png"   // <-- change to your image path if needed
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

  // ... rest of the component remains unchanged (waiting, ended, answer, submitted)
  // The remaining code from the previous full version of app/join/page.tsx should follow here.
  // For brevity, I'm not repeating it, but ensure you copy the rest from the earlier complete file.

  // The following is a placeholder; you must include the waiting, ended, and answer/submitted sections as before.
  // (In your actual file, those sections are already present – just keep them.)

  // =================================================================
  // DO NOT DELETE THE REST OF THE FILE – paste the old content below.
  // =================================================================

  // For reference, the old code continues with:
  // if (step === 'waiting') { ... }
  // if (step === 'ended') { ... }
  // if (step === 'answer' || step === 'submitted') { ... }
  // return null;
}