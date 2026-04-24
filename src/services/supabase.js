import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export class SupabaseService {
  static async isAdmin() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return false;
      
      const { data: profile } = await supabaseClient
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      return profile?.role === 'admin';
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  static async getCurrentUser() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  static async signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  }

  static async signOut() {
    return await supabaseClient.auth.signOut();
  }

  static async onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
  }
}
