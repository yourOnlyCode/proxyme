import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  ensureProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  ensureProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuringProfile = useRef(false);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          // Common when local storage has an old/invalid refresh token.
          console.warn('auth.getSession error:', error.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
        } else {
          setSession(data.session);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // If refresh fails, clear the local session so we don't spam errors or get stuck.
      if (event === 'TOKEN_REFRESH_FAILED') {
        console.warn('Supabase auth token refresh failed; clearing local session.');
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore; we mainly want local storage cleared.
        }
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const ensureProfile = async () => {
    if (!session?.user?.id) return;
    if (ensuringProfile.current) return;

    ensuringProfile.current = true;
    try {
      const userId = session.user.id;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // Create profile row if it doesn't exist yet (prevents onboarding loops / PGRST116).
      if (!data) {
        const { error: insertError } = await supabase.from('profiles').insert({ id: userId });
        if (insertError) throw insertError;
      }
    } finally {
      ensuringProfile.current = false;
    }
  };

  // Whenever a session is established, make sure the profile row exists.
  useEffect(() => {
    if (!session?.user?.id) return;
    void ensureProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, ensureProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

