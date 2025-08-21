import { supabase, supabaseDb } from './supabaseClient.js';
import { connectionMonitor, isDatabaseAvailable } from './connectionMonitor.js';
import { dataManager } from './dataManager.js';
import { loadingManager, ErrorHandler, eventBus } from './utils.js';

console.log("Simplified main.js loaded successfully!");

// Create a basic auth system without importing the problematic auth.js
const auth = {
  signIn: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      console.log('Login successful');
    } catch (error) {
      console.error('Login error:', error);
    }
  },
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
};

// Basic login form handling
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded!");
  
  const loginArea = document.getElementById('login-area');
  const appContainer = document.querySelector('.app-container');
  
  if (loginArea && appContainer) {
    loginArea.innerHTML = `
      <div class="flex flex-col items-center mb-3">
        <img src="assets/logo.png" alt="Logo" class="w-60 h-60 mb-2" />
      </div>
      <form id="loginform" class="login-area flex flex-col gap-4">
        <input type="email" id="email" required placeholder="E-Mail" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" />
        <input type="password" id="pw" required placeholder="Passwort" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" />
        <button type="submit" class="bg-blue-600 text-white font-bold text-lg md:text-xl py-4 w-full rounded-2xl shadow-lg hover:bg-fuchsia-500 active:scale-95 transition-all duration-150">
          <i class="fas fa-sign-in-alt mr-2"></i> Login
        </button>
      </form>
    `;
    
    document.getElementById('loginform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('pw').value;
      await auth.signIn(email, password);
    });
    
    appContainer.style.display = 'none';
  }
  
  // Handle auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      loginArea.innerHTML = '';
      appContainer.style.display = '';
      
      // Show a simple logged in message
      const appDiv = document.getElementById('app');
      if (appDiv) {
        appDiv.innerHTML = `
          <div class="text-center py-8">
            <h1 class="text-2xl font-bold mb-4">FIFA Statistik-Tracker</h1>
            <p class="mb-4">Erfolgreich angemeldet!</p>
            <button id="logout-btn" class="bg-red-500 text-white px-4 py-2 rounded">
              Abmelden
            </button>
          </div>
        `;
        
        document.getElementById('logout-btn').addEventListener('click', auth.signOut);
      }
    } else {
      appContainer.style.display = 'none';
      loginArea.style.display = '';
    }
  });
});