import { POSITIONEN, savePlayer as dataSavePlayer, deletePlayer as dataDeletePlayer } from './data.js';
import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabaseDb, supabase } from './supabaseClient.js';
import { isDatabaseAvailable } from './connectionMonitor.js';

let aekAthen = [];
let realMadrid = [];
let ehemalige = [];
let finances = {
    aekAthen: { balance: 0 },
    realMadrid: { balance: 0 }
};
let transactions = [];

const POSITION_ORDER = {
    "TH": 0, "IV": 1, "LV": 2, "RV": 3, "ZDM": 4, "ZM": 5,
    "ZOM": 6, "LM": 7, "RM": 8, "LF": 9, "RF": 10, "ST": 11
};

// --- ACCORDION Panel Zustand ---
let openPanel = null; // "aek", "real", "ehemalige" oder null

// --- Positions-Badge Klasse (für Redesign) ---
function getPositionBadgeClass(pos) {
    if (pos === "TH") return "badge-th";
    if (["IV", "LV", "RV", "ZDM"].includes(pos)) return "badge-def";
    if (["ZM", "ZOM", "LM", "RM"].includes(pos)) return "badge-mid";
    if (["LF", "RF", "ST"].includes(pos)) return "badge-att";
    return "bg-gray-700 text-gray-200 border-gray-600";
}

async function loadPlayersAndFinances(renderFn = renderPlayerLists) {
    try {
        const loadingDiv = document.createElement('div');
        loadingDiv.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Lade Daten...</div>';
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.appendChild(loadingDiv);

        const [playersResult, finResult, transResult] = await Promise.allSettled([
            supabaseDb.select('players', '*'),
            supabaseDb.select('finances', '*'),
            supabaseDb.select('transactions', '*', { 
                order: { column: 'id', ascending: false } 
            })
        ]);

        if (playersResult.status === 'fulfilled' && playersResult.value.data) {
            const players = playersResult.value.data;
            aekAthen = players.filter(p => p.team === "AEK");
            realMadrid = players.filter(p => p.team === "Real");
            ehemalige = players.filter(p => p.team === "Ehemalige");
        }
        if (finResult.status === 'fulfilled' && finResult.value.data) {
            const finData = finResult.value.data;
            finances = {
                aekAthen: finData.find(f => f.team === "AEK") || { balance: 0 },
                realMadrid: finData.find(f => f.team === "Real") || { balance: 0 }
            };
        }
        if (transResult.status === 'fulfilled' && transResult.value.data) {
            transactions = transResult.value.data;
        }

        if (loadingDiv.parentNode) {
            loadingDiv.parentNode.removeChild(loadingDiv);
        }

        renderFn();
    } catch (error) {
        console.error('Error loading data:', error);
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
                <strong>Fehler beim Laden der Daten.</strong> 
                ${isDatabaseAvailable() ? 'Bitte versuchen Sie es erneut.' : 'Keine Datenbankverbindung.'}
                <button onclick="this.parentElement.remove()" class="float-right font-bold text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100">×</button>
            </div>
        `;
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.insertBefore(errorDiv, appDiv.firstChild);
        renderFn();
    }
}

export function renderKaderTab(containerId = "app") {
    const app = document.getElementById(containerId);
    loadPlayersAndFinances(renderPlayerLists);

    app.innerHTML = `
        <div class="w-full px-2">
            <div class="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                <h2 class="text-lg font-semibold dark:text-white">Team-Kader</h2>
            </div>
            <div class="space-y-4">
                ${accordionPanelHtml('AEK', 'aek', 'bg-blue-50 dark:bg-blue-900', 'text-blue-700 dark:text-blue-200')}
                ${accordionPanelHtml('Real', 'real', 'bg-red-50 dark:bg-red-900', 'text-red-700 dark:text-red-200')}
                ${accordionPanelHtml('Ehemalige', 'ehemalige', 'bg-gray-700 dark:bg-gray-700', 'text-gray-700 dark:text-gray-200')}
            </div>
        </div>
    `;
    ['aek', 'real', 'ehemalige'].forEach(team => {
        document.getElementById(`panel-toggle-${team}`)?.addEventListener('click', () => {
            openPanel = openPanel === team ? null : team;
            renderKaderTab(containerId); // Neu rendern, damit Panel-Inhalt sichtbar wird
        });
    });
}

function accordionPanelHtml(team, key, bgClass, textClass) {
    const isOpen = openPanel === key;
    return `
        <div class="${bgClass} rounded-lg border border-gray-300">
            <button id="panel-toggle-${key}" class="flex justify-between items-center w-full px-3 py-3 ${textClass} font-medium transition" style="font-size:1.1rem;">
                <span>${team}</span>
                <span class="ml-2">${isOpen ? "▼" : "▶"}</span>
            </button>
            <div id="panel-content-${key}" class="transition-all duration-200" style="${isOpen ? '' : 'display:none;'}">
                <div class="pt-2 pb-1">
                    <button id="add-player-${key}" class="bg-sky-600 hover:bg-sky-700 text-white w-full px-4 py-3 rounded-lg text-base flex items-center justify-center gap-2 font-semibold transition shadow mb-2">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        <span>Spieler hinzufügen</span>
                    </button>
                    <div id="team-${key}-players" class="space-y-2 mt-2"></div>
                    ${team !== 'Ehemalige' ? `<div class="text-xs mt-2 ${textClass}">Gesamter Marktwert: <span id="${key}-marktwert"></span></div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderPlayerLists() {
    if (openPanel === 'aek' && document.getElementById('team-aek-players')) {
        renderPlayerList('team-aek-players', aekAthen, "AEK");
        const mwSpan = document.getElementById('aek-marktwert');
        if (mwSpan) mwSpan.innerText = getKaderMarktwert(aekAthen).toLocaleString('de-DE') + "M €";
    }
    if (openPanel === 'real' && document.getElementById('team-real-players')) {
        renderPlayerList('team-real-players', realMadrid, "Real");
        const mwSpan = document.getElementById('real-marktwert');
        if (mwSpan) mwSpan.innerText = getKaderMarktwert(realMadrid).toLocaleString('de-DE') + "M €";
    }
    if (openPanel === 'ehemalige' && document.getElementById('team-ehemalige-players')) {
        renderEhemaligeList('team-ehemalige-players');
    }
    // Add Player-Button Handler nur im offenen Panel
    if (openPanel === 'aek' && document.getElementById('add-player-aek')) document.getElementById('add-player-aek').onclick = () => openPlayerForm('AEK');
    if (openPanel === 'real' && document.getElementById('add-player-real')) document.getElementById('add-player-real').onclick = () => openPlayerForm('Real');
    if (openPanel === 'ehemalige' && document.getElementById('add-player-ehemalige')) document.getElementById('add-player-ehemalige').onclick = () => openPlayerForm('Ehemalige');
}

function renderPlayerList(containerId, arr, team) {
    const c = document.getElementById(containerId);
    if (!c) return;
    arr = arr.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    arr.forEach(player => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Positions-Badge
        const posBadge = player.position
            ? `<span class="inline-block rounded-md px-2 py-1 border font-bold text-xs mr-2 ${getPositionBadgeClass(player.position)}">${player.position}</span>`
            : "";

        const d = document.createElement("div");
        d.className = "player-card flex items-center bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-200 min-h-[110px]";
        d.innerHTML = `
          <div class="flex flex-col gap-2 mr-3">
            <button class="edit-btn bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors p-2 rounded-lg flex items-center" title="Bearbeiten">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
              </svg>
            </button>
          </div>
          <div class="flex-1 flex flex-col">
            <p class="font-medium flex items-center">${posBadge}${player.name}</p>
            <p class="font-bold text-sm mt-1">${marktwert}M</p>
          </div>
          <div class="flex flex-col gap-2 ml-3">
            <button class="move-btn bg-gray-400 hover:bg-gray-7000 text-white p-2 rounded-lg flex items-center" title="Zu Ehemalige">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        `;
        d.querySelector('.edit-btn').onclick = () => openPlayerForm(team, player.id);
        d.querySelector('.move-btn').onclick = () => movePlayerWithTransaction(player.id, "Ehemalige");
        c.appendChild(d);
    });
}


function renderEhemaligeList(containerId = "ehemalige-players") {
    const c = document.getElementById(containerId);
    if (!c) return;
    const sorted = ehemalige.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    sorted.forEach((player) => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Positions-Badge
        const posBadge = player.position
            ? `<span class="inline-block rounded-md px-2 py-1 border font-bold text-xs mr-2 ${getPositionBadgeClass(player.position)}">${player.position}</span>`
            : "";

        // Cards: Edit/Löschen links, Infos Mitte, Move zu AEK/Real rechts (blau/rot)
        const d = document.createElement("div");
        d.className = "player-card flex items-center bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-200 min-h-[110px]";
        d.innerHTML = `
          <div class="flex flex-col gap-2 mr-3">
            <button class="edit-btn bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors p-2 rounded-lg flex items-center" title="Bearbeiten">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
              </svg>
            </button>
            <button class="delete-btn bg-gray-700 hover:bg-gray-300 text-gray-600 p-2 rounded-lg flex items-center" title="Löschen">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M10 3h4a2 2 0 012 2v2H8V5a2 2 0 012-2z" />
              </svg>
            </button>
          </div>
          <div class="flex-1 flex flex-col">
            <p class="font-medium flex items-center">${posBadge}${player.name}</p>
            <p class="font-bold text-sm mt-1">${marktwert ? marktwert + "M" : ""}</p>
          </div>
          <div class="flex flex-col gap-2 ml-3">
            <button class="move-aek-btn bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg flex items-center" title="Zu AEK">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="#ffffff">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button class="move-real-btn bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg flex items-center" title="Zu Real">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="#ffffff">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        `;
        d.querySelector('.edit-btn').onclick = () => openPlayerForm('Ehemalige', player.id);
        d.querySelector('.delete-btn').onclick = () => deletePlayerDb(player.id);
        d.querySelector('.move-aek-btn').onclick = () => movePlayerWithTransaction(player.id, 'AEK');
        d.querySelector('.move-real-btn').onclick = () => movePlayerWithTransaction(player.id, 'Real');
        c.appendChild(d);
    });
}

function getKaderMarktwert(arr) {
    return arr.reduce((sum, p) => {
        let v = (typeof p.value === "number" ? p.value : (p.value ? parseFloat(p.value) : 0));
        return sum + v;
    }, 0);
}

async function savePlayer(player) {
    try {
        await dataSavePlayer(player);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function deletePlayerDb(id) {
    try {
        await dataDeletePlayer(id);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function movePlayerWithTransaction(id, newTeam) {
    let all = [...aekAthen, ...realMadrid, ...ehemalige];
    const player = all.find(p => p.id === id);
    if (!player) return;

    const oldTeam = player.team;
    const value = typeof player.value === "number" ? player.value : parseFloat(player.value) || 0;
    const abloese = value * 1000000;
    const now = new Date().toISOString().slice(0, 10);

    // Von TEAM zu Ehemalige: VERKAUF
    if ((oldTeam === "AEK" || oldTeam === "Real") && newTeam === "Ehemalige") {
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerverkauf",
            team: oldTeam,
            amount: abloese,
            info: `Verkauf von ${player.name} (${player.position})`
        }]);
        let finKey = oldTeam === "AEK" ? "aekAthen" : "realMadrid";
        await supabase.from('finances').update({
            balance: (finances[finKey].balance || 0) + abloese
        }).eq('team', oldTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Von Ehemalige zu TEAM: KAUF
    if (oldTeam === "Ehemalige" && (newTeam === "AEK" || newTeam === "Real")) {
        let finKey = newTeam === "AEK" ? "aekAthen" : "realMadrid";
        const konto = finances[finKey].balance || 0;
        if (konto < abloese) {
            alert("Kontostand zu gering für diesen Transfer!");
            return;
        }
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerkauf",
            team: newTeam,
            amount: -abloese,
            info: `Kauf von ${player.name} (${player.position})`
        }]);
        await supabase.from('finances').update({
            balance: konto - abloese
        }).eq('team', newTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Innerhalb Teams oder Ehemalige zu Ehemalige: Nur Move
    await movePlayerToTeam(id, newTeam);
}

async function movePlayerToTeam(id, newTeam) {
    const { error } = await supabase.from('players').update({ team: newTeam }).eq('id', id);
    if (error) alert('Fehler beim Verschieben: ' + error.message);
}

async function saveTransactionAndFinance(team, type, amount, info = "") {
    const now = new Date().toISOString().slice(0, 10);
    await supabase.from('transactions').insert([{ date: now, type, team, amount, info }]);
    const finKey = team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    updateObj.balance = (finances[finKey].balance || 0) + amount;
    await supabase.from('finances').update(updateObj).eq('team', team);
}

function openPlayerForm(team, id) {
    let player = null;
    let edit = false;
    if (id) {
        let all = [...aekAthen, ...realMadrid, ...ehemalige];
        player = all.find(p => p.id === id);
        if (player) edit = true;
    }
    showModal(`
        <form id="player-form" class="space-y-4 w-full">
            <div class="space-y-4">
                <input type="text" name="name" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent" placeholder="Name" value="${player ? player.name : ""}" required>
                <select name="position" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent" required>
                    <option value="">Position wählen</option>
                    ${POSITIONEN.map(pos => `<option${player && player.position === pos ? " selected" : ""}>${pos}</option>`).join("")}
                </select>
                <input type="number" min="0" step="0.1" name="value" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent" placeholder="Marktwert (M)" value="${player && player.value !== undefined ? player.value : ""}" required>
            </div>
            <div class="flex gap-3 pt-4">
                <button type="submit" class="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 flex gap-2 items-center justify-center shadow-lg hover:shadow-xl active:scale-95">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? "Speichern" : "Anlegen"}
                </button>
                <button type="button" class="bg-slate-600 hover:bg-slate-700 text-slate-100 w-full px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 active:scale-95" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);
    document.getElementById("player-form").onsubmit = (e) => submitPlayerForm(e, team, player ? player.id : null);
}

async function submitPlayerForm(event, team, id) {
    event.preventDefault();
    const form = event.target;
    const name = form.name.value;
    const position = form.position.value;
    const value = parseFloat(form.value.value);

    try {
        if (!id && (team === "AEK" || team === "Real")) {
            let fin = team === "AEK" ? finances.aekAthen : finances.realMadrid;
            if (fin.balance < value * 1000000) {
                alert("Kontostand zu gering!");
                return;
            }
            try {
                await saveTransactionAndFinance(team, "Spielerkauf", -value * 1000000, `Kauf von ${name} (${position})`);
            } catch (error) {
                console.warn("Transaction save failed (demo mode):", error);
                // Continue with player save even if transaction fails in demo mode
            }
        }
        if (id) {
            await savePlayer({ id, name, position, value, team });
            showSuccessAndCloseModal(`Spieler ${name} erfolgreich aktualisiert`);
        } else {
            await savePlayer({ name, position, value, team });
            showSuccessAndCloseModal(`Spieler ${name} erfolgreich hinzugefügt`);
        }
    } catch (error) {
        console.error("Error submitting player form:", error);
        alert("Fehler beim Speichern des Spielers: " + error.message);
    }
}

export { deletePlayerDb };

export function resetKaderState() {
    aekAthen = [];
    realMadrid = [];
    ehemalige = [];
    finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
    transactions = [];
    openPanel = null;
}