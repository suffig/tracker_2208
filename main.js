import { supabase, supabaseDb, usingFallback } from './supabaseClient.js';
import { connectionMonitor, isDatabaseAvailable } from './connectionMonitor.js';
import { dataManager } from './dataManager.js';
import { loadingManager, ErrorHandler, eventBus } from './utils.js';

import { signUp, signIn, signOut } from './auth.js';
import { renderKaderTab } from './kader.js';
import { renderBansTab } from './bans.js';
import { renderMatchesTab } from './matches.js';
import { renderStatsTab } from './stats.js';
import { renderFinanzenTab } from './finanzen.js';
import { renderSpielerTab } from './spieler.js';

// --- NEU: Reset-Functions für alle Module importieren ---
import { resetKaderState } from './kader.js';
import { resetBansState } from './bans.js';
import { resetFinanzenState } from './finanzen.js';
import { resetMatchesState } from './matches.js';
// Falls du sie hast:
import { resetStatsState } from './stats.js';
import { resetSpielerState } from './spieler.js';

let currentTab = "squad";
let liveSyncInitialized = false;
let tabButtonsInitialized = false;
let realtimeChannel = null;
let isAppVisible = true;
let inactivityCleanupTimer = null;

console.log("main.js gestartet");

// --- Connection status indicator with enhanced messaging ---
function updateConnectionStatus(status) {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer';
        indicator.title = 'Klicken für Details';
        document.body.appendChild(indicator);
        
        // Add click handler for detailed status
        indicator.addEventListener('click', showConnectionDetails);
    }
    
    // Clear previous classes
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '').replace(/text-\w+-\d+/g, '');
    
    if (status.connected) {
        const baseClass = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer';
        
        if (status.connectionType === 'fallback') {
            indicator.textContent = status.reconnected ? 'Demo-Modus wiederhergestellt' : 'Demo-Modus';
            indicator.className = baseClass + ' bg-blue-500 text-white';
            indicator.title = 'Demo-Modus aktiv - Simulierte Daten. Klicken für Details.';
        } else {
            indicator.textContent = status.reconnected ? 'Verbindung wiederhergestellt' : 'Online';
            indicator.className = baseClass + ' bg-green-500 text-white';
            indicator.title = 'Datenbankverbindung aktiv. Klicken für Details.';
        }
        
        if (status.reconnected) {
            // Show temporary success message
            setTimeout(() => {
                if (status.connectionType === 'fallback') {
                    indicator.textContent = 'Demo-Modus';
                } else {
                    indicator.textContent = 'Online';
                }
            }, 3000);
        }
    } else {
        const baseClass = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer';
        
        if (status.networkOffline) {
            indicator.textContent = 'Offline';
            indicator.className = baseClass + ' bg-gray-7000 text-white';
            indicator.title = 'Keine Internetverbindung. Klicken für Details.';
        } else if (status.sessionExpired) {
            indicator.textContent = 'Session abgelaufen';
            indicator.className = baseClass + ' bg-red-700 text-white';
            indicator.title = 'Bitte neu anmelden. Klicken für Details.';
        } else if (status.reconnecting) {
            indicator.textContent = `Verbinde... (${status.attempt || 0}/5)`;
            indicator.className = baseClass + ' bg-yellow-500 text-white';
            indicator.title = 'Wiederverbindung läuft... Klicken für Details.';
        } else if (status.maxAttemptsReached) {
            indicator.textContent = 'Verbindung unterbrochen';
            indicator.className = baseClass + ' bg-red-500 text-white';
            indicator.title = 'Maximale Wiederverbindungsversuche erreicht. Klicken für Details.';
        } else {
            indicator.textContent = 'Verbindung verloren';
            indicator.className = baseClass + ' bg-red-500 text-white';
            indicator.title = 'Datenbankverbindung verloren. Klicken für Details.';
        }
    }
    
    // Store current status for details view
    indicator.dataset.status = JSON.stringify(status);
}

// Show detailed connection information in a modal
function showConnectionDetails() {
    const indicator = document.getElementById('connection-status');
    if (!indicator || !indicator.dataset.status) return;
    
    try {
        const status = JSON.parse(indicator.dataset.status);
        const diagnostics = connectionMonitor.getDiagnostics();
        
        // Create modal HTML
        const modalHTML = `
            <div class="modal" id="connection-details-modal">
                <div class="modal-content">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-gray-100">Verbindungsstatus</h3>
                        <button onclick="closeConnectionDetails()" class="text-gray-500 hover:text-gray-700">✕</button>
                    </div>
                    
                    <div class="space-y-4">
                        <!-- Connection Status -->
                        <div class="bg-gray-700 p-3 rounded-lg">
                            <div class="flex items-center justify-between">
                                <span class="font-medium">Status:</span>
                                <span class="px-2 py-1 rounded text-sm ${status.connected ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'}">
                                    ${status.connected ? '✅ Verbunden' : '❌ Getrennt'}
                                </span>
                            </div>
                            <div class="flex items-center justify-between mt-2">
                                <span class="font-medium">Typ:</span>
                                <span class="text-sm text-gray-600">${getConnectionTypeText(diagnostics.connectionType)}</span>
                            </div>
                        </div>
                        
                        <!-- Error Message -->
                        ${status.message ? `
                            <div class="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                                <div class="font-medium text-yellow-800">Nachricht:</div>
                                <div class="text-sm text-yellow-700">${status.message}</div>
                            </div>
                        ` : ''}
                        
                        <!-- Metrics -->
                        ${diagnostics.metrics.totalConnections > 0 ? `
                            <div class="bg-blue-50 p-3 rounded-lg">
                                <div class="font-medium text-blue-800 mb-2">Verbindungsstatistiken:</div>
                                <div class="text-sm text-blue-700 space-y-1">
                                    <div>Erfolgsrate: ${diagnostics.metrics.successRate}%</div>
                                    <div>Durchschnittliche Antwortzeit: ${Math.round(diagnostics.metrics.averageResponseTime)}ms</div>
                                    <div>Letzte Antwortzeit: ${Math.round(diagnostics.metrics.lastResponseTime)}ms</div>
                                    <div>Verbindungsgeschwindigkeit: ${getSpeedText(diagnostics.connectionSpeed)}</div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Recommendations -->
                        ${diagnostics.recommendations.length > 0 ? `
                            <div class="bg-indigo-50 p-3 rounded-lg">
                                <div class="font-medium text-indigo-800 mb-2">Empfehlungen:</div>
                                <ul class="text-sm text-indigo-700 space-y-1">
                                    ${diagnostics.recommendations.map(rec => `<li>• ${rec}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        
                        <!-- Actions -->
                        <div class="flex space-x-2 pt-2">
                            <button onclick="testConnection()" class="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600">
                                🔄 Verbindung testen
                            </button>
                            <button onclick="retryConnection()" class="flex-1 bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600">
                                🔌 Neu verbinden
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal
        const existingModal = document.getElementById('connection-details-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add new modal
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Error showing connection details:', error);
    }
}

function getConnectionTypeText(type) {
    switch (type) {
        case 'real': return '🔗 Echte Datenbankverbindung';
        case 'fallback': return '🔄 Demo-Modus (Simulierte Daten)';
        case 'offline': return '📴 Offline';
        case 'expired': return '🔐 Session abgelaufen';
        case 'disconnected': return '❌ Verbindung unterbrochen';
        default: return '❓ Unbekannt';
    }
}

function getSpeedText(speed) {
    switch (speed) {
        case 'fast': return '🚀 Schnell (<100ms)';
        case 'medium': return '⚡ Mittel (100-500ms)';
        case 'slow': return '🐌 Langsam (500ms-1s)';
        case 'very-slow': return '🦴 Sehr langsam (>1s)';
        default: return '❓ Unbekannt';
    }
}

function closeConnectionDetails() {
    const modal = document.getElementById('connection-details-modal');
    if (modal) {
        modal.remove();
    }
}

async function testConnection() {
    const testButton = document.querySelector('[onclick="testConnection()"]');
    if (testButton) {
        testButton.textContent = '🔄 Teste...';
        testButton.disabled = true;
    }
    
    try {
        const connected = await connectionMonitor.checkConnection();
        if (testButton) {
            testButton.textContent = connected ? '✅ Erfolgreich' : '❌ Fehlgeschlagen';
            setTimeout(() => {
                testButton.textContent = '🔄 Verbindung testen';
                testButton.disabled = false;
            }, 2000);
        }
    } catch (error) {
        if (testButton) {
            testButton.textContent = '❌ Fehler';
            setTimeout(() => {
                testButton.textContent = '🔄 Verbindung testen';
                testButton.disabled = false;
            }, 2000);
        }
    }
}

async function retryConnection() {
    const retryButton = document.querySelector('[onclick="retryConnection()"]');
    if (retryButton) {
        retryButton.textContent = '🔄 Verbinde...';
        retryButton.disabled = true;
    }
    
    // Reset connection attempts and try again
    connectionMonitor.reconnectAttempts = 0;
    connectionMonitor.reconnectDelay = 1000;
    
    await connectionMonitor.attemptReconnection();
    
    if (retryButton) {
        setTimeout(() => {
            retryButton.textContent = '🔌 Neu verbinden';
            retryButton.disabled = false;
        }, 2000);
    }
    
    // Close modal after retry
    setTimeout(closeConnectionDetails, 1000);
}

// --- Session expiry UI handler (for supabaseClient.js event dispatch) ---
window.addEventListener('supabase-session-expired', () => {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    indicator.textContent = 'Session abgelaufen – bitte neu anmelden';
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-700 text-white';
});

// Handle app visibility changes to prevent crashes during inactivity
function handleVisibilityChange() {
    const wasVisible = isAppVisible;
    isAppVisible = !document.hidden;

    if (!isAppVisible && wasVisible) {
        inactivityCleanupTimer = setTimeout(() => {
            cleanupRealtimeSubscriptions();
            connectionMonitor.pauseHealthChecks();
        }, 5 * 60 * 1000);
    } else if (isAppVisible && !wasVisible) {
        if (inactivityCleanupTimer) {
            clearTimeout(inactivityCleanupTimer);
            inactivityCleanupTimer = null;
        }
        connectionMonitor.resumeHealthChecks();
        supabase.auth.getSession().then(({data: {session}}) => {
            if(session) {
                // NEU: Reset aller lokalen Daten-States
				tabButtonsInitialized = false;
                liveSyncInitialized = false;
                if (typeof resetKaderState === "function") resetKaderState();
                if (typeof resetBansState === "function") resetBansState();
                if (typeof resetFinanzenState === "function") resetFinanzenState();
                if (typeof resetMatchesState === "function") resetMatchesState();
                if (typeof resetStatsState === "function") resetStatsState();
                if (typeof resetSpielerState === "function") resetSpielerState();
                setupTabButtons();
                subscribeAllLiveSync();
                renderCurrentTab(); // <-- erzwingt Daten-Reload!
            } else {
                renderLoginArea();
            }
        });
    }
}

function cleanupRealtimeSubscriptions() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
        liveSyncInitialized = false;
    }
}

function showTabLoader(show = true) {
    const loader = document.getElementById('tab-loader');
    if (loader) {
        loader.style.display = show ? "flex" : "none";
    }
    
    // Use centralized loading manager
    if (show) {
        loadingManager.show('tab-loading');
    } else {
        loadingManager.hide('tab-loading');
    }
}

// --- Bottom Navbar Indicator ---
function updateBottomNavActive(tab) {
    try {
        document.querySelectorAll('.nav-indicator').forEach(ind => {
            ind.className = 'nav-indicator';
        });
        
        const navElement = document.getElementById(`nav-${tab}`);
        const indicator = navElement?.querySelector('.nav-indicator');
        if (indicator) {
            indicator.classList.add('active', `indicator-${tab}`);
        }
    } catch (error) {
        console.error('Error updating bottom nav:', error);
    }
}

async function switchTab(tab) {
    try {
        currentTab = tab;
        
        // Update bottom navigation only
        updateBottomNavActive(tab);
        showTabLoader(true);
        
        // Add small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await renderCurrentTab();
        showTabLoader(false);
    } catch (error) {
        console.error('Error switching tab:', error);
        ErrorHandler.showUserError('Fehler beim Wechseln des Tabs');
        showTabLoader(false);
    }
}

async function renderCurrentTab() {
    const appDiv = document.getElementById("app");
    if (!appDiv) {
        console.error('App container not found');
        return;
    }
    
    try {
        appDiv.innerHTML = "";
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            appDiv.innerHTML = `<div class="text-red-700 dark:text-red-300 text-center py-6">Nicht angemeldet. Bitte einloggen.</div>`;
            return;
        }
        
        console.log("renderCurrentTab mit currentTab:", currentTab);
        
        // Use a more structured approach for tab rendering
        const tabRenderers = {
            'squad': () => renderKaderTab("app"),
            'bans': () => renderBansTab("app"),
            'matches': () => renderMatchesTab("app"),
            'stats': () => renderStatsTab("app"),
            'finanzen': () => renderFinanzenTab("app"),
            'spieler': () => renderSpielerTab("app")
        };
        
        const renderer = tabRenderers[currentTab];
        if (renderer) {
            await renderer();
        } else {
            console.warn(`No renderer found for tab: ${currentTab}`);
            appDiv.innerHTML = `<div class="text-yellow-700 text-center py-6">Unbekannter Tab: ${currentTab}</div>`;
        }
    } catch (error) {
        console.error('Error rendering tab:', error);
        ErrorHandler.handleDatabaseError(error, 'Tab laden');
        appDiv.innerHTML = `<div class="text-red-700 dark:text-red-300 text-center py-6">Fehler beim Laden des Tabs. Bitte versuchen Sie es erneut.</div>`;
    }
}

function setupTabButtons() {
    // Since we're only using bottom navigation, no desktop tab setup needed
    tabButtonsInitialized = true;
}

// Bottom Navigation für Mobile Geräte
function setupBottomNav() {
    document.getElementById("nav-squad")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("nav-matches")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("nav-bans")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("nav-finanzen")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("nav-stats")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("nav-spieler")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
}
window.addEventListener('DOMContentLoaded', setupBottomNav);

function subscribeAllLiveSync() {
	cleanupRealtimeSubscriptions();
    liveSyncInitialized = false; // <-- redundantes Reset, schadet aber nicht!
    if (liveSyncInitialized || !isAppVisible) return;
    realtimeChannel = supabase
        .channel('global_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, () => renderCurrentTab())
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                liveSyncInitialized = true;
            } else if (status === 'CHANNEL_ERROR') {
                liveSyncInitialized = false;
                if (isAppVisible) setTimeout(() => {
                    if (!liveSyncInitialized && isAppVisible) subscribeAllLiveSync();
                }, 5000);
            } else if (status === 'CLOSED') {
                liveSyncInitialized = false;
                if (isDatabaseAvailable() && isAppVisible) setTimeout(() => {
                    if (isAppVisible) subscribeAllLiveSync();
                }, 2000);
            }
        });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
			alert('Du wurdest ausgeloggt!');
            await signOut();
            let tries = 0;
            while (tries < 20) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) break;
                await new Promise(res => setTimeout(res, 100));
                tries++;
            }
            // window.location.reload(); // Entfernt!
            liveSyncInitialized = false;
            tabButtonsInitialized = false;
            cleanupRealtimeSubscriptions();
            if (inactivityCleanupTimer) {
                clearTimeout(inactivityCleanupTimer);
                inactivityCleanupTimer = null;
            }
            connectionMonitor.removeListener(updateConnectionStatus);
            renderLoginArea();
        };
    }
}

async function renderLoginArea() {
	console.log("renderLoginArea aufgerufen");
    const loginDiv = document.getElementById('login-area');
    const appContainer = document.querySelector('.app-container');
    if (!loginDiv || !appContainer) {
        document.body.innerHTML = `<div style="color:red;padding:2rem;text-align:center">
          Kritischer Fehler: UI-Container nicht gefunden.<br>
          Bitte Seite neu laden oder Admin kontaktieren.
        </div>`;
        return;
    }
    const logoutBtn = document.getElementById('logout-btn');
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log("Current session:", session ? "Active" : "None", session?.user?.email || "No user");
        
        if (session) {
            console.log("✅ User authenticated, showing main app");
            loginDiv.innerHTML = "";
            appContainer.style.display = '';
            if (logoutBtn) logoutBtn.style.display = "";
            setupLogoutButton();
            setupTabButtons();
            connectionMonitor.addListener(updateConnectionStatus);
            if (!tabButtonsInitialized) {
                switchTab(currentTab);
            } else {
                renderCurrentTab();
            }
            subscribeAllLiveSync();
        } else {
            console.log("❌ No session, showing login form");
            // Das Loginformular NICHT komplett neu bauen, sondern Felder erhalten!
            let emailValue = "";
            let pwValue = "";
            if (document.getElementById('email')) emailValue = document.getElementById('email').value;
            if (document.getElementById('pw')) pwValue = document.getElementById('pw').value;
            loginDiv.innerHTML = `
                <div class="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 py-8">
                    <div class="w-full">
                        <div class="flex flex-col items-center mb-8">
                            <img src="assets/logo.png" alt="Logo" class="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 mb-4" />
                            <h1 class="text-2xl sm:text-3xl font-bold text-gray-100 text-center">FIFA Statistik-Tracker</h1>
                            <p class="text-gray-400 text-center mt-2">Melden Sie sich an, um fortzufahren</p>
                        </div>
                        <form id="loginform" class="login-area flex flex-col gap-6">
                            <div class="space-y-4">
                                <input 
                                    type="email" 
                                    id="email" 
                                    required 
                                    placeholder="E-Mail" 
                                    autocomplete="email"
                                    class="w-full rounded-lg border-2 border-gray-600 bg-gray-800 text-gray-100 placeholder-gray-400 px-4 py-4 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all duration-200 outline-none" 
                                    value="${emailValue}" />
                                <input 
                                    type="password" 
                                    id="pw" 
                                    required 
                                    placeholder="Passwort" 
                                    autocomplete="current-password"
                                    class="w-full rounded-lg border-2 border-gray-600 bg-gray-800 text-gray-100 placeholder-gray-400 px-4 py-4 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all duration-200 outline-none" 
                                    value="${pwValue}" />
                            </div>
                            <button
                                type="submit"
                                class="login-btn w-full bg-blue-600 text-white font-bold text-xl py-4 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all duration-150 outline-none ring-2 ring-transparent focus:ring-blue-300 border-2 border-blue-600 hover:border-blue-700 min-h-[56px]">
                                <i class="fas fa-sign-in-alt mr-2"></i> Anmelden
                            </button>
                        </form>
                    </div>
                </div>
            `;
            appContainer.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = "none";
            liveSyncInitialized = false;
            tabButtonsInitialized = false;
            cleanupRealtimeSubscriptions();
            if (inactivityCleanupTimer) {
                clearTimeout(inactivityCleanupTimer);
                inactivityCleanupTimer = null;
            }
            connectionMonitor.removeListener(updateConnectionStatus);
            
            // Setup login form handler with better event management
            const loginForm = document.getElementById('loginform');
            if (loginForm) {
                // Remove any existing listeners by cloning the form
                const newForm = loginForm.cloneNode(true);
                loginForm.parentNode.replaceChild(newForm, loginForm);
                
                newForm.onsubmit = async e => {
                    e.preventDefault();
                    const emailInput = document.getElementById('email');
                    const passwordInput = document.getElementById('pw');
                    const loginBtn = document.querySelector('.login-btn');
                    
                    if (!emailInput || !passwordInput) {
                        console.error("Login form inputs not found");
                        return;
                    }
                    
                    console.log("🔑 Attempting login with:", emailInput.value);
                    
                    // Show loading state
                    if (loginBtn) {
                        loginBtn.disabled = true;
                        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Anmelden...';
                    }
                    
                    try {
                        await signIn(emailInput.value, passwordInput.value);
                        console.log("✅ Login successful, waiting for auth state change");
                    } catch (error) {
                        console.error("❌ Login failed:", error);
                        if (loginBtn) {
                            loginBtn.disabled = false;
                            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Anmelden';
                        }
                    }
                };
            }
        }
    } catch (error) {
        console.error("Error in renderLoginArea:", error);
        // Show error state
        loginDiv.innerHTML = `
            <div class="text-center text-red-600 p-4">
                <h3>Anmeldefehler</h3>
                <p>Es gab ein Problem beim Laden der Anmeldung: ${error.message}</p>
                <button onclick="location.reload()" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded">
                    Seite neu laden
                </button>
            </div>
        `;
    }
}

// Enhanced auth state change listener
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`🔐 Auth state changed: ${event}`, session?.user?.email || 'No user');
    
    // Add a small delay to ensure DOM is ready
    setTimeout(async () => {
        try {
            await renderLoginArea();
        } catch (error) {
            console.error('Error handling auth state change:', error);
        }
    }, 100);
});
window.addEventListener('DOMContentLoaded', async () => {
	console.log("DOMContentLoaded!");
    
    // Show fallback status if using fallback mode
    if (usingFallback) {
        showFallbackStatus();
    }
    
    await renderLoginArea();
});

// Show fallback status indicator
function showFallbackStatus() {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    indicator.textContent = 'Demo-Modus (Supabase nicht konfiguriert)';
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-blue-500 text-white cursor-pointer';
    
    // Add click handler to show configuration help
    indicator.onclick = () => {
        alert(`Demo-Modus aktiv\n\nUm eine echte Supabase-Verbindung zu verwenden:\n\n1. Ersetzen Sie SUPABASE_URL in supabaseClient.js\n2. Ersetzen Sie SUPABASE_ANON_KEY in supabaseClient.js\n3. Stellen Sie sicher, dass die Supabase CDN geladen werden kann\n\nMomentan werden keine echten Daten geladen.`);
    };
}

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
    cleanupRealtimeSubscriptions();
    if (inactivityCleanupTimer) {
        clearTimeout(inactivityCleanupTimer);
    }
    connectionMonitor.destroy();
});