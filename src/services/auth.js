import { SupabaseService, supabaseClient } from './supabase';

export const authService = {
  async isAuthenticated() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return !!user;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  },

  async isAdmin() {
    try {
      return await SupabaseService.isAdmin();
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  },

  async getCurrentUser() {
    return await SupabaseService.getCurrentUser();
  },

  async signIn(email, password) {
    return await SupabaseService.signIn(email, password);
  },

  async signOut() {
    return await SupabaseService.signOut();
  },

  onAuthStateChange(callback) {
    return SupabaseService.onAuthStateChange(callback);
  }
};
