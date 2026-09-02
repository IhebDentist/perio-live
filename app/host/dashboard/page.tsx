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