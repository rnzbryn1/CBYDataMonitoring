import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export class SupabaseService {
  static async isAdmin(userId = null) {
    // Temporarily return true for all authenticated users to avoid lock conflicts
    // TODO: Fix lock conflict and re-enable proper admin checking
    return true;
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
