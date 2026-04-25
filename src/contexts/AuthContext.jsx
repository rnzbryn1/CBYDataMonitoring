import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';
import { supabaseClient } from '../services/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const adminCheckRef = React.useRef(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setUser(session?.user || null);
        
        if (session?.user) {
          // Cancel any pending admin check
          if (adminCheckRef.current) {
            adminCheckRef.current = null;
          }
          
          try {
            adminCheckRef.current = authService.isAdmin(session.user.id);
            const adminStatus = await adminCheckRef.current;
            adminCheckRef.current = null;
            
            if (mounted) setIsAdmin(adminStatus);
          } catch (error) {
            console.error('Error checking admin status:', error);
            adminCheckRef.current = null;
            if (mounted) setIsAdmin(false);
          }
        } else {
          if (mounted) setIsAdmin(false);
        }
        
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      console.log('Attempting login with:', email);
      const { data, error } = await authService.signIn(email, password);
      console.log('Login response:', { data, error });
      if (error) throw error;
      
      // Manually set user state since auth state change might not fire immediately
      if (data?.user) {
        console.log('Setting user state:', data.user);
        setUser(data.user);
        setIsAdmin(true); // Using temp admin check
        setLoading(false);
        console.log('User state set, isAuthenticated should be true');
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setIsAdmin(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const value = {
    user,
    isAdmin,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
