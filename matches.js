import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { decrementBansAfterMatch } from './bans.js';
import { dataManager } from './dataManager.js';
import { loadingManager, ErrorHandler, Performance, DOM } from './utils.js';
import { supabase } from './supabaseClient.js';

// Optimized data management with caching
class MatchesDataManager {
    constructor() {
        this.matches = [];
        this.aekAthen = [];
        this.realMadrid = [];
        this.bans = [];
        this.finances = {
            aekAthen: { balance: 0 },
            realMadrid: { balance: 0 }
        };
        this.spielerDesSpiels = [];
        this.transactions = [];
        this.matchesInitialized = false;
        this.matchesChannel = null;
        this.lastLoadTime = 0;
        this.loadingPromise = null;
    }

    // Debounced data loading to prevent excessive calls
    loadAllData = Performance.debounce(async (renderFn = null) => {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this._loadAllDataInternal(renderFn);
        try {
            await this.loadingPromise;
        } finally {
            this.loadingPromise = null;
        }
    }, 100);

    async _loadAllDataInternal(renderFn) {
        const loadingKey = 'matches-data';
        loadingManager.show(loadingKey);

        try {
            const data = await dataManager.loadAllAppData();
            
            this.matches = data.matches || [];
            
            // Filter players by team
            const allPlayers = data.players || [];
            this.aekAthen = allPlayers.filter(p => p.team === "AEK");
            this.realMadrid = allPlayers.filter(p => p.team === "Real");
            
            this.bans = data.bans || [];
            
            // Process finances
            const financesData = data.finances || [];
            this.finances = {
                aekAthen: financesData.find(f => f.team === "AEK") || { balance: 0 },
                realMadrid: financesData.find(f => f.team === "Real") || { balance: 0 }
            };
            
            this.spielerDesSpiels = data.spieler_des_spiels || [];
            this.transactions = data.transactions || [];
            
            this.lastLoadTime = Date.now();
            
            if (renderFn) {
                renderFn();
            }
        } catch (error) {
            ErrorHandler.handleDatabaseError(error, 'Matches-Daten laden');
        } finally {
            loadingManager.hide(loadingKey);
        }
    }

    subscribeToChanges(renderFn = null) {
        if (this.matchesChannel) return;
        
        try {
            this.matchesChannel = supabase
                .channel('matches_live')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, 
                    () => this.loadAllData(renderFn))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, 
                    () => this.loadAllData(renderFn))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, 
                    () => this.loadAllData(renderFn))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, 
                    () => this.loadAllData(renderFn))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, 
                    () => this.loadAllData(renderFn))
                .subscribe();
        } catch (error) {
            console.error('Error subscribing to changes:', error);
        }
    }

    unsubscribe() {
        if (this.matchesChannel) {
            supabase.removeChannel(this.matchesChannel);
            this.matchesChannel = null;
        }
    }

    reset() {
        this.matches = [];
        this.aekAthen = [];
        this.realMadrid = [];
        this.bans = [];
        this.finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
        this.spielerDesSpiels = [];
        this.transactions = [];
        this.matchesInitialized = false;
        this.lastLoadTime = 0;
        this.unsubscribe();
    }
}

// Create singleton instance
const matchesData = new MatchesDataManager();

// Hilfsfunktion: App-Matchnummer (laufende Nummer, wie Übersicht) - optimized
export function getAppMatchNumber(matchId) {
    if (!matchId || !matchesData.matches.length) return null;
    
    // matches ist absteigend sortiert (neueste zuerst)
    const idx = matchesData.matches.findIndex(m => m.id === matchId);
    return idx >= 0 ? matchesData.matches.length - idx : null;
}

export async function renderMatchesTab(containerId = "app") {
    console.log("renderMatchesTab aufgerufen!", { containerId });
    
    const app = DOM.getElementById(containerId);
    if (!app) {
        console.error(`Container ${containerId} not found`);
        return;
    }

    app.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between mb-4 gap-2">
            <h2 class="text-lg font-semibold">Matches</h2>
            <button id="add-match-btn" class="bg-green-600 text-white w-full sm:w-auto px-4 py-2 rounded-lg text-base flex items-center justify-center gap-2 active:scale-95 transition">
                <i class="fas fa-plus"></i> <span>Match hinzufügen</span>
            </button>
        </div>
        <div id="matches-list" class="space-y-3">
            <div class="flex items-center justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span class="ml-2 text-gray-600">Lädt Matches...</span>
            </div>
        </div>
    `;

    // Attach event listener safely
    const addMatchBtn = DOM.getElementById("add-match-btn");
    if (addMatchBtn) {
        addMatchBtn.onclick = () => openMatchForm();
    }

    // Subscribe to real-time changes
    matchesData.subscribeToChanges(renderMatchesList);
    
    // Load data
    await matchesData.loadAllData(renderMatchesList);
}

let matchViewDate = new Date().toISOString().slice(0, 10); // Standard: heute

// Optimized match list rendering with better error handling
function renderMatchesList() {
    const container = DOM.getElementById('matches-list');
    if (!container) {
        console.warn("Element #matches-list nicht gefunden!");
        return;
    }

    try {
        if (!matchesData.matches.length) {
            container.innerHTML = `<div class="text-gray-400 text-sm text-center py-4">Noch keine Matches eingetragen.</div>`;
            return;
        }

        // Alle Daten nach Datum gruppieren - optimized
        const uniqueDates = [...new Set(matchesData.matches.map(m => m.date))].sort((a, b) => b.localeCompare(a));
        
        // matchViewDate initialisieren, falls leer
        if (!matchViewDate && uniqueDates.length) {
            matchViewDate = uniqueDates[0];
        }

        // Nur Matches des aktuellen Tages anzeigen
        const filteredMatches = matchesData.matches.filter(m => m.date === matchViewDate);

        // Überschrift mit Datum, schön formatiert
        const dateStr = matchViewDate ? matchViewDate.split('-').reverse().join('.') : '';
        let html = `<div class="text-center font-semibold text-base mb-2">Spiele am <span class="text-sky-700 dark:text-sky-400">${dateStr}</span></div>`;

        if (!filteredMatches.length) {
            html += `<div class="text-gray-400 text-sm text-center py-4">Keine Spiele für diesen Tag.</div>`;
        } else {
            html += filteredMatches.map(match => {
                // Durchgehende Nummerierung, unabhängig vom Tag!
                const nr = matchesData.matches.length - matchesData.matches.findIndex(m => m.id === match.id);
                return matchHtml(match, nr);
            }).join('');
        }

        // Navigation Buttons - optimized
        html += renderNavigationButtons(uniqueDates);
        
        DOM.setSafeHTML(container, html);
        
        // Attach event listeners safely
        attachMatchEventListeners(uniqueDates);
        
    } catch (error) {
        console.error('Error rendering matches list:', error);
        ErrorHandler.showUserError('Fehler beim Anzeigen der Matches');
        container.innerHTML = `<div class="text-red-500 text-center py-4">Fehler beim Laden der Matches</div>`;
    }
}

// Separate function for navigation buttons
function renderNavigationButtons(uniqueDates) {
    const currIdx = uniqueDates.indexOf(matchViewDate);
    let navHtml = `<div class="flex gap-2 justify-center mt-4">`;
    
    if (currIdx < uniqueDates.length - 1) {
        navHtml += `<button id="older-matches-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors hover:bg-gray-400">Ältere Spiele anzeigen</button>`;
    }
    if (currIdx > 0) {
        navHtml += `<button id="newer-matches-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors hover:bg-gray-400">Neuere Spiele anzeigen</button>`;
    }
    
    navHtml += `</div>`;
    return navHtml;
}

// Separate function for event listeners
function attachMatchEventListeners(uniqueDates) {
    const currIdx = uniqueDates.indexOf(matchViewDate);
    
    // Navigation button handlers
    if (currIdx < uniqueDates.length - 1) {
        const olderBtn = DOM.getElementById('older-matches-btn');
        if (olderBtn) {
            olderBtn.onclick = () => {
                matchViewDate = uniqueDates[currIdx + 1];
                renderMatchesList();
            };
        }
    }
    
    if (currIdx > 0) {
        const newerBtn = DOM.getElementById('newer-matches-btn');
        if (newerBtn) {
            newerBtn.onclick = () => {
                matchViewDate = uniqueDates[currIdx - 1];
                renderMatchesList();
            };
        }
    }

    // Match action buttons
    document.querySelectorAll('.edit-match-btn').forEach(btn => {
        btn.onclick = () => {
            const matchId = parseInt(btn.getAttribute('data-id'));
            if (matchId) {
                openMatchForm(matchId);
            }
        };
    });
    
    document.querySelectorAll('.delete-match-btn').forEach(btn => {
        btn.onclick = () => {
            const matchId = parseInt(btn.getAttribute('data-id'));
            if (matchId) {
                deleteMatch(matchId);
            }
        };
    });
}

function matchHtml(match, nr) {
    function goalsHtml(goals) {
        if (!goals || !goals.length) return `<span class="text-gray-400 text-xs">(keine Torschützen)</span>`;
        return goals
            .map(g => `<span class="inline-block bg-gray-700 dark:bg-gray-600 text-gray-200 dark:text-gray-300 rounded px-2 mx-0.5">${g.player} (${g.count})</span>`)
            .join('');
    }
    function prizeHtml(amount, team) {
        const isPos = amount >= 0;
        const tClass = team === "AEK" ? "bg-blue-800 dark:bg-blue-900" : "bg-red-800 dark:bg-red-900";
        const color = isPos ? "text-green-200 dark:text-green-300" : "text-red-200 dark:text-red-300";
        return `<span class="inline-block px-2 rounded ${tClass} ${color} font-bold">${isPos ? '+' : ''}${amount.toLocaleString('de-DE')} €</span>`;
    }
    return `
    <div class="bg-gray-800 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-2 mt-1 text-gray-100 dark:text-gray-100">
      <div class="flex justify-between items-center mb-1">
        <div>
          <span class="font-bold">#${nr} ${match.date}:</span>
          <span>${match.teama} <b>${match.goalsa}</b> : <b>${match.goalsb}</b> ${match.teamb}</span>
        </div>
        <div class="flex gap-2">
          <button class="edit-match-btn bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center justify-center active:scale-95 transition" title="Bearbeiten" data-id="${match.id}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="delete-match-btn bg-red-500 text-white px-3 py-1 rounded-md text-sm flex items-center justify-center active:scale-95 transition" title="Löschen" data-id="${match.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="text-xs mb-1">
        <b>${match.teama} Torschützen:</b> ${goalsHtml(match.goalslista || [])}
      </div>
      <div class="text-xs mb-1">
        <b>${match.teamb} Torschützen:</b> ${goalsHtml(match.goalslistb || [])}
      </div>
      <div class="text-xs">
        <b>${match.teama} Karten:</b> <span class="inline-block bg-yellow-800 dark:bg-yellow-900 text-yellow-200 dark:text-yellow-300 rounded px-2 mx-0.5 text-xs">Gelb: ${match.yellowa || 0}</span>
        <span class="inline-block bg-red-800 dark:bg-red-900 text-red-200 dark:text-red-300 rounded px-2 mx-0.5 text-xs">Rot: ${match.reda || 0}</span>
      </div>
      <div class="text-xs">
        <b>${match.teamb} Karten:</b> <span class="inline-block bg-yellow-800 dark:bg-yellow-900 text-yellow-200 dark:text-yellow-300 rounded px-2 mx-0.5 text-xs">Gelb: ${match.yellowb || 0}</span>
        <span class="inline-block bg-red-800 dark:bg-red-900 text-red-200 dark:text-red-300 rounded px-2 mx-0.5 text-xs">Rot: ${match.redb || 0}</span>
      </div>
      <div class="text-xs mt-2">
        <b>Preisgelder:</b>
        ${prizeHtml(match.prizeaek ?? 0, "AEK")}
        ${prizeHtml(match.prizereal ?? 0, "Real")}
      </div>
      <div class="text-xs mt-1">
        <b>Spieler des Spiels:</b> ${match.manofthematch ? match.manofthematch : '<span class="text-gray-400">-</span>'}
      </div>
    </div>
    `;
}

// Helper function to get SdS count for a player - moved outside for global access
function getSdsCount(playerName, team) {
    const sdsEntry = matchesData.spielerDesSpiels.find(sds => 
        sds.name === playerName && sds.team === team
    );
    return sdsEntry ? (sdsEntry.count || 0) : 0;
}

// --- MODERNES, KOMPAKTES POPUP, ABER MIT ALLER ALTER LOGIK ---
// Optimized match form with better error handling and validation
function openMatchForm(id) {
    try {
        let match = null, edit = false;
        
        if (typeof id === "number") {
            match = matchesData.matches.find(m => m.id === id);
            edit = !!match;
        }

        // Validate player data is available
        if (!matchesData.aekAthen.length && !matchesData.realMadrid.length) {
            ErrorHandler.showUserError('Keine Spielerdaten verfügbar. Bitte laden Sie die Seite neu.');
            return;
        }

        // Spieler-Optionen SORTIERT nach SdS-Anzahl (absteigend), dann nach Toren (absteigend) - safely
        const aekSorted = [...matchesData.aekAthen].sort((a, b) => {
            const aSdsCount = getSdsCount(a.name, "AEK");
            const bSdsCount = getSdsCount(b.name, "AEK");
            if (aSdsCount !== bSdsCount) return bSdsCount - aSdsCount; // Sort by SdS count first
            const aGoals = a.goals || 0;
            const bGoals = b.goals || 0;
            return bGoals - aGoals; // Then by goals
        });
        const realSorted = [...matchesData.realMadrid].sort((a, b) => {
            const aSdsCount = getSdsCount(a.name, "Real");
            const bSdsCount = getSdsCount(b.name, "Real");
            if (aSdsCount !== bSdsCount) return bSdsCount - aSdsCount; // Sort by SdS count first
            const aGoals = a.goals || 0;
            const bGoals = b.goals || 0;
            return bGoals - aGoals; // Then by goals
        });
        
        const aekSpieler = aekSorted.map(p => {
            const goals = p.goals || 0;
            return `<option value="${DOM.sanitizeForAttribute(p.name)}">${DOM.sanitizeForHTML(p.name)} (${goals} Tore)</option>`;
        }).join('');
        
        const realSpieler = realSorted.map(p => {
            const goals = p.goals || 0;
            return `<option value="${DOM.sanitizeForAttribute(p.name)}">${DOM.sanitizeForHTML(p.name)} (${goals} Tore)</option>`;
        }).join('');

        const goalsListA = match?.goalslista || [];
        const goalsListB = match?.goalslistb || [];
        const manofthematch = match?.manofthematch || "";
        const dateVal = match ? match.date : (new Date()).toISOString().slice(0,10);

        // Validate date
        if (!dateVal || !dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
            ErrorHandler.showUserError('Ungültiges Datum');
            return;
        }

        // Show modal with enhanced form
        showModal(generateMatchFormHTML(edit, dateVal, match, aekSpieler, realSpieler, aekSorted, realSorted, goalsListA, goalsListB, manofthematch));
        
        // Attach event handlers safely with a small delay to ensure DOM is ready
        setTimeout(() => {
            attachMatchFormEventHandlers(edit, match?.id, aekSpieler, realSpieler);
        }, 50);
        
    } catch (error) {
        console.error('Error opening match form:', error);
        ErrorHandler.showUserError('Fehler beim Öffnen des Match-Formulars');
    }
}

// Helper function to generate form HTML
function generateMatchFormHTML(edit, dateVal, match, aekSpieler, realSpieler, aekSorted, realSorted, goalsListA, goalsListB, manofthematch) {
    return `
    <form id="match-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-gray-800 text-gray-100 rounded-2xl shadow-lg py-6 relative w-full" style="max-width:98vw;">
        <h3 class="font-bold text-lg mb-2 text-center text-gray-100">${edit ? "Match bearbeiten" : "Match hinzufügen"}</h3>
        <div class="flex flex-col gap-3 items-center mb-2">
            <div class="flex flex-row items-center gap-2 w-full justify-center">
                <button type="button" id="show-date" class="flex items-center gap-1 text-sm font-semibold text-gray-300 hover:text-sky-400 border border-gray-600 rounded-lg px-3 py-2 bg-gray-700 focus:outline-none transition-colors" tabindex="0">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span id="date-label">${dateVal.split('-').reverse().join('.')}</span>
                </button>
                <input type="date" name="date" id="date-input" class="hidden" value="${dateVal}" required>
            </div>
            <div class="flex flex-row items-center gap-3 w-full justify-center">
                <div class="flex flex-col items-center">
                    <span class="font-bold text-blue-400 text-base">AEK</span>
                </div>
                <input type="number" min="0" max="50" name="goalsa" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-3 w-16 text-center text-base focus:ring-2 focus:ring-sky-500" required placeholder="Tore" value="${match ? match.goalsa : ""}">
                <span class="font-bold text-lg text-gray-100">:</span>
                <input type="number" min="0" max="50" name="goalsb" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-3 w-16 text-center text-base focus:ring-2 focus:ring-sky-500" required placeholder="Tore" value="${match ? match.goalsb : ""}">
                <div class="flex flex-col items-center">
                    <span class="font-bold text-red-400 text-base">Real</span>
                </div>
            </div>
        </div>
        
        <div id="scorersA-block" class="bg-gray-700 border border-gray-600 p-3 rounded-lg">
            <b class="text-blue-400">Torschützen AEK</b>
            <div id="scorersA">${scorerFields("goalslista", goalsListA, aekSpieler)}</div>
            <button type="button" id="addScorerA" class="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-base shadow transition active:scale-95">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Torschütze hinzufügen</span>
            </button>
        </div>
        
        <div id="scorersB-block" class="bg-gray-700 border border-gray-600 p-3 rounded-lg">
            <b class="text-red-400">Torschützen Real</b>
            <div id="scorersB">
                ${scorerFields("goalslistb", goalsListB, realSpieler)}
            </div>
            <button type="button" id="addScorerB" class="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold py-2 px-4 rounded-lg text-base shadow transition active:scale-95">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Torschütze hinzufügen</span>
            </button>
        </div>
        
        <div class="bg-gray-700 border border-gray-600 p-3 rounded-lg">
            <b class="text-blue-400">Karten AEK</b>
            <div class="flex space-x-2 items-center mb-1 mt-2">
                <label class="text-gray-300">🟨</label>
                <input type="number" min="0" max="20" name="yellowa" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="${match?.yellowa || 0}">
                <label class="text-gray-300">🟥</label>
                <input type="number" min="0" max="11" name="reda" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="${match?.reda || 0}">
            </div>
        </div>
        
        <div class="bg-gray-700 border border-gray-600 p-3 rounded-lg">
            <b class="text-red-400">Karten Real</b>
            <div class="flex space-x-2 items-center mb-1 mt-2">
                <label class="text-gray-300">🟨</label>
                <input type="number" min="0" max="20" name="yellowb" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="${match?.yellowb || 0}">
                <label class="text-gray-300">🟥</label>
                <input type="number" min="0" max="11" name="redb" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="${match?.redb || 0}">
            </div>
        </div>
        
        <div class="bg-gray-700 border border-gray-600 p-3 rounded-lg">
            <label class="font-semibold text-gray-100 block mb-2">Spieler des Spiels (SdS):</label>
            
            <!-- Team Filter Toggle with enhanced visual indicators -->
            <div class="mb-3 flex gap-2">
                <button type="button" id="sds-filter-all" class="sds-filter-btn bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border-2 border-transparent flex items-center gap-1">
                    <span class="w-3 h-3 bg-gray-400 rounded-full flex-shrink-0 indicator-circle"></span>
                    Alle
                </button>
                <button type="button" id="sds-filter-aek" class="sds-filter-btn bg-gray-600 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border-2 border-transparent flex items-center gap-1">
                    <span class="w-3 h-3 bg-blue-400 rounded-full flex-shrink-0 indicator-circle"></span>
                    AEK
                </button>
                <button type="button" id="sds-filter-real" class="sds-filter-btn bg-gray-600 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border-2 border-transparent flex items-center gap-1">
                    <span class="w-3 h-3 bg-red-400 rounded-full flex-shrink-0 indicator-circle"></span>
                    Real
                </button>
            </div>
            
            <select name="manofthematch" id="manofthematch-select" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-3 w-full h-12 text-base">
                <option value="">Keiner</option>
                ${aekSorted.map(p => {
                    const sdsCount = getSdsCount(p.name, "AEK");
                    return `<option value="${DOM.sanitizeForAttribute(p.name)}" data-team="AEK"${manofthematch===p.name?' selected':''}>${DOM.sanitizeForHTML(p.name)} (AEK, ${sdsCount} SdS)</option>`;
                }).join('')}
                ${realSorted.map(p => {
                    const sdsCount = getSdsCount(p.name, "Real");
                    return `<option value="${DOM.sanitizeForAttribute(p.name)}" data-team="Real"${manofthematch===p.name?' selected':''}>${DOM.sanitizeForHTML(p.name)} (Real, ${sdsCount} SdS)</option>`;
                }).join('')}
            </select>
        </div>
        
        <div class="flex gap-2">
            <button type="submit" class="bg-green-600 hover:bg-green-700 text-white w-full px-4 py-2 rounded-lg text-base active:scale-95 transition">${edit ? "Speichern" : "Anlegen"}</button>
            <button type="button" class="bg-gray-600 hover:bg-gray-700 text-gray-100 w-full px-4 py-2 rounded-lg text-base transition-colors" onclick="window.hideModal()">Abbrechen</button>
        </div>
    </form>
    `;
}

// Helper functions for DOM safety
DOM.sanitizeForHTML = function(str) {
    if (!str) return '';
    return str.replace(/[<>&"']/g, function(match) {
        const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
        return escapeMap[match];
    });
};

DOM.sanitizeForAttribute = function(str) {
    if (!str) return '';
    return str.replace(/[<>&"']/g, function(match) {
        const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
        return escapeMap[match];
    });
};

// Helper function to attach event handlers to the match form
function attachMatchFormEventHandlers(edit, id, aekSpieler, realSpieler) {
    // Datum-Show/Hide (wie gehabt)
    document.getElementById('show-date').onclick = function() {
        document.getElementById('date-input').classList.toggle('hidden');
        document.getElementById('date-input').focus();
    };
    document.getElementById('date-input').onchange = function() {
        document.getElementById('date-label').innerText = this.value.split('-').reverse().join('.');
        this.classList.add('hidden');
    };

    // --- Restliche Logik ---
    function addScorerHandler(scorersId, name, spielerOpts) {
        const container = document.getElementById(scorersId);
        const div = document.createElement("div");
        div.className = "flex space-x-2 mb-2 scorer-row mt-2";
        div.innerHTML = `
            <select name="${name}-player" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 h-10 text-base" style="min-width:100px;">
                <option value="">Spieler</option>
                ${spielerOpts}
            </select>
            <input type="number" min="1" name="${name}-count" placeholder="Tore" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="1">
            <button type="button" class="remove-goal-btn bg-red-600 hover:bg-red-700 text-white px-2 rounded" title="Entfernen">-</button>
        `;
        div.querySelector('.remove-goal-btn').onclick = function() {
            if(container.querySelectorAll('.scorer-row').length > 1)
                div.remove();
        };
        container.appendChild(div);
    }
    document.querySelectorAll("#scorersA .remove-goal-btn").forEach(btn => {
        btn.onclick = function() {
            const parent = document.getElementById('scorersA');
            if(parent.querySelectorAll('.scorer-row').length > 1)
                btn.closest('.scorer-row').remove();
        };
    });
    document.querySelectorAll("#scorersB .remove-goal-btn").forEach(btn => {
        btn.onclick = function() {
            const parent = document.getElementById('scorersB');
            if(parent.querySelectorAll('.scorer-row').length > 1)
                btn.closest('.scorer-row').remove();
        };
    });
    document.getElementById("addScorerA").onclick = () => addScorerHandler("scorersA", "goalslista", aekSpieler);
    document.getElementById("addScorerB").onclick = () => addScorerHandler("scorersB", "goalslistb", realSpieler);

    function toggleScorerFields() {
        const goalsA = parseInt(document.querySelector('input[name="goalsa"]').value) || 0;
        const goalsB = parseInt(document.querySelector('input[name="goalsb"]').value) || 0;
        const scorersABlock = document.getElementById('scorersA-block');
        const scorersBBlock = document.getElementById('scorersB-block');
        scorersABlock.style.display = goalsA > 0 ? '' : 'none';
        scorersBBlock.style.display = goalsB > 0 ? '' : 'none';
    }
    document.querySelector('input[name="goalsa"]').addEventListener('input', toggleScorerFields);
    document.querySelector('input[name="goalsb"]').addEventListener('input', toggleScorerFields);
    toggleScorerFields();

    // Team filtering for "Spieler des Spiels" dropdown
    function filterSdsDropdown(team) {
        const select = document.getElementById('manofthematch-select');
        if (!select) {
            console.error('manofthematch-select element not found');
            return;
        }
        
        const options = select.querySelectorAll('option');
        
        // Update button states with enhanced visual feedback
        document.querySelectorAll('.sds-filter-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-600', 'bg-red-600', 'bg-gray-400', 'border-blue-400', 'border-red-400', 'border-gray-400', 'shadow-lg');
            btn.classList.add('bg-gray-600', 'border-transparent');
            // Reset indicator circles to default colors
            const indicator = btn.querySelector('.indicator-circle');
            if (indicator) {
                indicator.classList.remove('bg-white', 'bg-blue-100', 'bg-red-100', 'bg-gray-100', 'border', 'border-white');
            }
        });
        
        // Set active button styling with clearer indicators
        const activeBtn = document.getElementById(`sds-filter-${team}`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'shadow-lg');
            activeBtn.classList.remove('bg-gray-600', 'border-transparent');
            const indicator = activeBtn.querySelector('.indicator-circle');
            
            if (team === 'aek') {
                activeBtn.classList.add('bg-blue-600', 'border-blue-400');
                // Make indicator more visible on blue background
                if (indicator) {
                    indicator.classList.remove('bg-blue-400');
                    indicator.classList.add('bg-white', 'border', 'border-blue-200');
                }
            } else if (team === 'real') {
                activeBtn.classList.add('bg-red-600', 'border-red-400');
                // Make indicator more visible on red background
                if (indicator) {
                    indicator.classList.remove('bg-red-400');
                    indicator.classList.add('bg-white', 'border', 'border-red-200');
                }
            } else if (team === 'all') {
                activeBtn.classList.add('bg-gray-400', 'border-gray-400');
                // Make indicator more visible on gray background
                if (indicator) {
                    indicator.classList.remove('bg-gray-400');
                    indicator.classList.add('bg-white', 'border', 'border-gray-200');
                }
            }
        }
        
        // Filter options
        options.forEach(option => {
            if (option.value === '') {
                option.style.display = ''; // Always show "Keiner" option
                return;
            }
            
            if (team === 'all') {
                option.style.display = '';
            } else {
                const optionTeam = option.getAttribute('data-team');
                // Fix case-insensitive comparison
                option.style.display = optionTeam && optionTeam.toLowerCase() === team.toLowerCase() ? '' : 'none';
            }
        });
    }
    
    // Add event listeners for team filter buttons with error checking
    const allBtn = document.getElementById('sds-filter-all');
    const aekBtn = document.getElementById('sds-filter-aek');
    const realBtn = document.getElementById('sds-filter-real');
    
    if (allBtn && aekBtn && realBtn) {
        allBtn.addEventListener('click', () => filterSdsDropdown('all'));
        aekBtn.addEventListener('click', () => filterSdsDropdown('aek'));
        realBtn.addEventListener('click', () => filterSdsDropdown('real'));
        
        // Initialize with "All" filter
        filterSdsDropdown('all');
    } else {
        console.error('Team filter buttons not found:', { allBtn, aekBtn, realBtn });
    }

    document.getElementById("match-form").onsubmit = (e) => submitMatchForm(e, id);
}

function scorerFields(name, arr, spielerOpts) {
    if (!arr.length) arr = [{ player: "", count: 1 }];
    return arr.map((g, i) => `
        <div class="flex space-x-2 mb-2 scorer-row mt-2">
            <select name="${name}-player" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 h-10 text-base" style="min-width:100px;">
                <option value="">Spieler</option>
                ${spielerOpts.replace(`value="${g.player}"`, `value="${g.player}" selected`)}
            </select>
            <input type="number" min="1" name="${name}-count" placeholder="Tore" class="border border-gray-600 bg-gray-700 text-gray-100 rounded-lg p-2 w-16 h-10 text-base" value="${g.count||1}">
            <button type="button" class="remove-goal-btn bg-red-600 hover:bg-red-700 text-white px-2 rounded" title="Entfernen" ${arr.length===1 ? 'disabled' : ''}>-</button>
        </div>
    `).join('');
}

async function updatePlayersGoals(goalslist, team) {
    for (const scorer of goalslist) {
        if (!scorer.player) continue;
        // Spieler laden, aktueller Stand
        const { data: player } = await supabase.from('players').select('goals').eq('name', scorer.player).eq('team', team).single();
        let newGoals = scorer.count;
        if (player && typeof player.goals === 'number') {
            newGoals = player.goals + scorer.count;
        }
        await supabase.from('players').update({ goals: newGoals }).eq('name', scorer.player).eq('team', team);
    }
}

async function submitMatchForm(event, id) {
    event.preventDefault();
    const form = event.target;
    const date = form.date.value;
    const teama = "AEK";
    const teamb = "Real";
    const goalsa = parseInt(form.goalsa.value);
    const goalsb = parseInt(form.goalsb.value);
    const yellowa = parseInt(form.yellowa.value) || 0;
    const reda = parseInt(form.reda.value) || 0;
    const yellowb = parseInt(form.yellowb.value) || 0;
    const redb = parseInt(form.redb.value) || 0;
    const manofthematch = form.manofthematch.value || "";

    function getScorers(group, name) {
        return Array.from(group.querySelectorAll('.scorer-row')).map(d => ({
            player: d.querySelector(`select[name="${name}-player"]`).value,
            count: parseInt(d.querySelector(`input[name="${name}-count"]`).value) || 1
        })).filter(g => g.player);
    }

    let goalslista = [];
    let goalslistb = [];
    if (goalsa > 0) {
        const groupA = form.querySelector("#scorersA");
        goalslista = getScorers(groupA, "goalslista");
        const sumA = goalslista.reduce((sum, g) => sum + (g.count || 0), 0);
        if (sumA > goalsa) {
            alert(`Die Summe der Torschützen-Tore für ${teama} (${sumA}) darf nicht größer als die Gesamtanzahl der Tore (${goalsa}) sein!`);
            return;
        }
    }
    if (goalsb > 0) {
        const groupB = form.querySelector("#scorersB");
        goalslistb = getScorers(groupB, "goalslistb");
        const sumB = goalslistb.reduce((sum, g) => sum + (g.count || 0), 0);
        if (sumB > goalsb) {
            alert(`Die Summe der Torschützen-Tore für ${teamb} (${sumB}) darf nicht größer als die Gesamtanzahl der Tore (${goalsb}) sein!`);
            return;
        }
    }

    // Preisgeld-Berechnung
    let prizeaek = 0, prizereal = 0;
    let winner = null, loser = null;
    if (goalsa > goalsb) { winner = "AEK"; loser = "Real"; }
    else if (goalsa < goalsb) { winner = "Real"; loser = "AEK"; }

    if (winner && loser) {
        if (winner === "AEK") {
            prizeaek = 1000000 - (goalsb*50000) - (yellowa*20000) - (reda*50000);
            prizereal = - (500000 + goalsa*50000 + yellowb*20000 + redb*50000);
        } else {
            prizereal = 1000000 - (goalsa*50000) - (yellowb*20000) - (redb*50000);
            prizeaek = - (500000 + goalsb*50000 + yellowa*20000 + reda*50000);
        }
    }
    // SdS Bonus
    let sdsBonusAek = 0, sdsBonusReal = 0;
    if (manofthematch) {
        if (aekAthen.find(p => p.name === manofthematch)) sdsBonusAek = 100000;
        if (realMadrid.find(p => p.name === manofthematch)) sdsBonusReal = 100000;
    }

    // Spieler des Spiels-Statistik (Tabelle spieler_des_spiels)
    if (manofthematch) {
        let t = aekAthen.find(p => p.name === manofthematch) ? "AEK" : "Real";
        const { data: existing } = await supabase.from('spieler_des_spiels').select('*').eq('name', manofthematch).eq('team', t);
        if (existing && existing.length > 0) {
            await supabase.from('spieler_des_spiels').update({ count: existing[0].count + 1 }).eq('id', existing[0].id);
        } else {
            await supabase.from('spieler_des_spiels').insert([{ name: manofthematch, team: t, count: 1 }]);
        }
    }

    // Edit-Modus: Vorherigen Match löschen (und zugehörige Transaktionen an diesem Tag!)
    if (id && matches.find(m => m.id === id)) {
        const { data: matchOld } = await supabase.from('matches').select('date').eq('id', id).single();
        if (matchOld && matchOld.date) {
            await supabase.from('transactions').delete().or(`type.eq.Preisgeld,type.eq.Bonus SdS,type.eq.Echtgeld-Ausgleich`).eq('date', matchOld.date);
        }
        await supabase.from('matches').delete().eq('id', id);
    }

    // Save Match (JSON für goalslista/goalslistb)
    const insertObj = {
        date,
        teama,
        teamb,
        goalsa,
        goalsb,
        goalslista,
        goalslistb,
        yellowa,
        reda,
        yellowb,
        redb,
        manofthematch,
        prizeaek,
        prizereal
    };

    // Insert Match und ID zurückgeben
    const { data: inserted, error } = await supabase
        .from('matches')
        .insert([insertObj])
        .select('id')
        .single();
    if (error) {
        alert('Fehler beim Insert: ' + error.message);
        console.error(error);
        return;
    }
    const matchId = inserted?.id;

    // Nach Insert: ALLE Daten laden (damit matches aktuell ist)
    await loadAllData(() => {});

    // Hole App-Matchnummer (laufende Nummer)
    const appMatchNr = getAppMatchNumber(matchId);

    // Spieler-Tore aufaddieren!
    if (goalsa > 0) await updatePlayersGoals(goalslista, "AEK");
    if (goalsb > 0) await updatePlayersGoals(goalslistb, "Real");

    await decrementBansAfterMatch();

    // Transaktionen buchen (Preisgelder & SdS Bonus, inkl. Finanzen update)
    const now = new Date().toISOString().slice(0,10);

    async function getTeamFinance(team) {
        const { data } = await supabase.from('finances').select('balance').eq('team', team).single();
        return (data && typeof data.balance === "number") ? data.balance : 0;
    }

    // Preisgelder buchen & neuen Kontostand berechnen (niemals unter 0)
    let aekOldBalance = await getTeamFinance("AEK");
    let realOldBalance = await getTeamFinance("Real");
    let aekNewBalance = aekOldBalance + (prizeaek || 0) + (sdsBonusAek || 0);
    let realNewBalance = realOldBalance + (prizereal || 0) + (sdsBonusReal || 0);

    // 1. SdS Bonus
    if (sdsBonusAek) {
        aekOldBalance += sdsBonusAek;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Bonus SdS",
            team: "AEK",
            amount: sdsBonusAek,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: aekOldBalance }).eq('team', "AEK");
    }
    if (sdsBonusReal) {
        realOldBalance += sdsBonusReal;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Bonus SdS",
            team: "Real",
            amount: sdsBonusReal,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: realOldBalance }).eq('team', "Real");
    }

    // 2. Preisgeld
    if (prizeaek !== 0) {
        aekOldBalance += prizeaek;
        if (aekOldBalance < 0) aekOldBalance = 0;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Preisgeld",
            team: "AEK",
            amount: prizeaek,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: aekOldBalance }).eq('team', "AEK");
    }
    if (prizereal !== 0) {
        realOldBalance += prizereal;
        if (realOldBalance < 0) realOldBalance = 0;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Preisgeld",
            team: "Real",
            amount: prizereal,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: realOldBalance }).eq('team', "Real");
    }

    // --- Berechne für beide Teams den Echtgeldbetrag nach deiner Formel ---
    function calcEchtgeldbetrag(balance, preisgeld, sdsBonus) {
        let konto = balance;
        if (sdsBonus) konto += 100000;
        let zwischenbetrag = (Math.abs(preisgeld) - konto) / 100000;
        if (zwischenbetrag < 0) zwischenbetrag = 0;
        return 5 + Math.round(zwischenbetrag);
    }

    if (winner && loser) {
        const debts = {
            AEK: finances.aekAthen.debt || 0,
            Real: finances.realMadrid.debt || 0,
        };
        const aekSds = manofthematch && aekAthen.find(p => p.name === manofthematch) ? 1 : 0;
        const realSds = manofthematch && realMadrid.find(p => p.name === manofthematch) ? 1 : 0;

        const aekBetrag = calcEchtgeldbetrag(aekOldBalance, prizeaek, aekSds);
        const realBetrag = calcEchtgeldbetrag(realOldBalance, prizereal, realSds);

        let gewinner = winner === "AEK" ? "AEK" : "Real";
        let verlierer = loser === "AEK" ? "AEK" : "Real";
        let gewinnerBetrag = gewinner === "AEK" ? aekBetrag : realBetrag;
        let verliererBetrag = verlierer === "AEK" ? aekBetrag : realBetrag;

        let gewinnerDebt = debts[gewinner];
        let verliererDebt = debts[verlierer];

        let verrechnet = Math.min(gewinnerDebt, verliererBetrag * 1);
        let neuerGewinnerDebt = Math.max(0, gewinnerDebt - verrechnet);
        let restVerliererBetrag = verliererBetrag * 1 - verrechnet;

        let neuerVerliererDebt = verliererDebt + Math.max(0, restVerliererBetrag);

        await supabase.from('finances').update({ debt: neuerGewinnerDebt }).eq('team', gewinner);

        if (restVerliererBetrag > 0) {
            await supabase.from('transactions').insert([{
                date: now,
                type: "Echtgeld-Ausgleich",
                team: verlierer,
                amount: Math.max(0, restVerliererBetrag),
                match_id: matchId,
                info: `Match #${appMatchNr}`
            }]);
            await supabase.from('finances').update({ debt: neuerVerliererDebt }).eq('team', verlierer);
        }

        if (verrechnet > 0) {
            await supabase.from('transactions').insert([{
                date: now,
                type: "Echtgeld-Ausgleich (getilgt)",
                team: gewinner,
                amount: -verrechnet,
                match_id: matchId,
                info: `Match #${appMatchNr}`
            }]);
        }
    }

    const matchDisplayText = id ? "Match erfolgreich aktualisiert" : `Match ${teama} vs ${teamb} (${goalsa}:${goalsb}) erfolgreich hinzugefügt`;
    showSuccessAndCloseModal(matchDisplayText);
    // Kein manuelles Neuladen nötig – Live-Sync!
}

// ---------- DELETE ----------

async function deleteMatch(id) {
    // 1. Hole alle Infos des Matches
    const { data: match } = await supabase
        .from('matches')
        .select('date,prizeaek,prizereal,goalslista,goalslistb,manofthematch,yellowa,reda,yellowb,redb')
        .eq('id', id)
        .single();

    if (!match) return;

    // 2. Transaktionen zu diesem Match löschen (inkl. Echtgeld-Ausgleich)
    await supabase
        .from('transactions')
        .delete()
        .or(`type.eq.Preisgeld,type.eq.Bonus SdS,type.eq.Echtgeld-Ausgleich,type.eq.Echtgeld-Ausgleich (getilgt)`)
        .eq('match_id', id);

    // 3. Finanzen zurückrechnen (niemals unter 0!)
    if (typeof match.prizeaek === "number" && match.prizeaek !== 0) {
        const { data: aekFin } = await supabase.from('finances').select('balance').eq('team', 'AEK').single();
        let newBal = (aekFin?.balance || 0) - match.prizeaek;
        if (newBal < 0) newBal = 0;
        await supabase.from('finances').update({
            balance: newBal
        }).eq('team', 'AEK');
    }
    if (typeof match.prizereal === "number" && match.prizereal !== 0) {
        const { data: realFin } = await supabase.from('finances').select('balance').eq('team', 'Real').single();
        let newBal = (realFin?.balance || 0) - match.prizereal;
        if (newBal < 0) newBal = 0;
        await supabase.from('finances').update({
            balance: newBal
        }).eq('team', 'Real');
    }
    // Bonus SdS rückrechnen
    const { data: bonusTrans } = await supabase.from('transactions')
        .select('team,amount')
        .eq('match_id', id)
        .eq('type', 'Bonus SdS');
    if (bonusTrans) {
        for (const t of bonusTrans) {
            const { data: fin } = await supabase.from('finances').select('balance').eq('team', t.team).single();
            let newBal = (fin?.balance || 0) - t.amount;
            if (newBal < 0) newBal = 0;
            await supabase.from('finances').update({
                balance: newBal
            }).eq('team', t.team);
        }
    }

    // 4. Spieler-Tore abziehen
    const removeGoals = async (goalslist, team) => {
        if (!goalslist || !Array.isArray(goalslist)) return;
        for (const scorer of goalslist) {
            if (!scorer.player) continue;
            const { data: player } = await supabase.from('players').select('goals').eq('name', scorer.player).eq('team', team).single();
            let newGoals = (player?.goals || 0) - scorer.count;
            if (newGoals < 0) newGoals = 0;
            await supabase.from('players').update({ goals: newGoals }).eq('name', scorer.player).eq('team', team);
        }
    };
    await removeGoals(match.goalslista, "AEK");
    await removeGoals(match.goalslistb, "Real");

    // 5. Spieler des Spiels rückgängig machen
    if (match.manofthematch) {
        let sdsTeam = null;
        if (match.goalslista && match.goalslista.find(g => g.player === match.manofthematch)) sdsTeam = "AEK";
        else if (match.goalslistb && match.goalslistb.find(g => g.player === match.manofthematch)) sdsTeam = "Real";
        else {
            const { data: p } = await supabase.from('players').select('team').eq('name', match.manofthematch).single();
            sdsTeam = p?.team;
        }
        if (sdsTeam) {
            const { data: sds } = await supabase.from('spieler_des_spiels').select('count').eq('name', match.manofthematch).eq('team', sdsTeam).single();
            if (sds) {
                const newCount = Math.max(0, sds.count - 1);
                await supabase.from('spieler_des_spiels').update({ count: newCount }).eq('name', match.manofthematch).eq('team', sdsTeam);
            }
        }
    }

    // 6. Karten zurücksetzen (Spieler-Kartenzähler updaten, falls du sowas hast)
    // Falls du Karten pro Spieler speicherst, musst du analog zu removeGoals abziehen!

    // 7. Match löschen
    await supabase.from('matches').delete().eq('id', id);
    // Kein manuelles Neuladen nötig – Live-Sync!
}

export function resetMatchesState() {
    matches = [];
    aekAthen = [];
    realMadrid = [];
    bans = [];
    finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
    spielerDesSpiels = [];
    transactions = [];
    matchesInitialized = false;
    if (matchesChannel && typeof matchesChannel.unsubscribe === "function") {
        try { matchesChannel.unsubscribe(); } catch (e) {}
    }
    matchesChannel = undefined;
}

export {matchesData as matches};