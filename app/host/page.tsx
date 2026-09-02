'use client';
import { useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { generateSessionCode } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function HostLanding() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const startNewSession = async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      let user = authData.user;
      if (!user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
        user = signInData.user;
      }
      if (!user) throw new Error('Unable to authenticate host');

      const code = generateSessionCode();
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          code,
          title: 'Peri-Implantitis CPD',
          host_user_id: user.id,
          status: 'waiting',
          current_question: 1,
        })
        .select()
        .single();

      if (error) throw error;

      localStorage.setItem('host_session_id', session.id);
      localStorage.setItem('host_user_id', user.id);

      router.push('/host/dashboard');
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + (err.message || 'Failed to create session. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-[#EAF2F8]">
      <div className="card max-w-xl w-full p-8 md:p-10 text-center">
        {/* Hero image */}
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/perio-banner.png"
            alt="Perio Live banner"
            width={500}
            height={200}
            className="rounded-xl object-cover"
            priority
          />
        </div>

        {/* Tooth icon + title */}
        <div className="flex justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 text-teal-600">
            <path d="M12 5.5c-1.5-1.5-3-2-4.5-2C5 3.5 4 5 4 7c0 2 1 3.5 2.5 3.5S9 9 12 9s2 1.5 3.5 1.5S20 9 20 7c0-2-1-3.5-3.5-3.5-1.5 0-3 .5-4.5 2Z" />
            <path d="M12 9c-2 0-3 3-3 6 0 2 1 3 3 3s3-1 3-3c0-3-1-6-3-6Z" />
          </svg>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-navy mb-2 tracking-tight">PERIO LIVE</h1>
        <p className="text-xl text-teal-600 font-semibold mb-1">Dr. Alghalia Al-Mansoori</p>
        <p className="text-slate-500 mb-6">Interactive CPD Audience Response</p>

        <div className="border-t border-slate-200 pt-6 mb-6">
          <p className="text-sm text-slate-500 uppercase tracking-widest">
            From Site Optimization to Treatment Optimization
          </p>
        </div>

        <button
          onClick={startNewSession}
          disabled={loading}
          className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating session...
            </>
          ) : (
            'START NEW SESSION'
          )}
        </button>
      </div>
    </div>
  );
}