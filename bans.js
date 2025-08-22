import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabase } from './supabaseClient.js';

// --- Helper-Funktion: Spieler für Team laden ---
async function getPlayersByTeam(team) {
    const { data, error } = await supabase.from('players').select('*').eq('team', team);
    if (error) {
        console.warn('Fehler beim Laden der Spieler:', error.message);
        return [];
    }
    return data || [];
}

let bans = [];
let playersCache = [];

const BAN_TYPES = [
    { value: "Gelb-Rote Karte", label: "Gelb-Rote Karte", duration: 1 },
    { value: "Rote Karte", label: "Rote Karte", duration: 2 },
    { value: "Verletzung", label: "Verletzung", duration: 3 }
];
const ALLOWED_BAN_COUNTS = [1, 2, 3, 4, 5, 6];

export async function loadBansAndRender(renderFn = renderBansLists) {
    const [{ data: bansData, error: errorBans }, { data: playersData, error: errorPlayers }] = await Promise.all([
        supabase.from('bans').select('*'),
        supabase.from('players').select('*')
    ]);
    if (errorBans) {
        alert('Fehler beim Laden der Sperren: ' + errorBans.message);
        bans = [];
    } else {
        bans = bansData || [];
    }
    if (errorPlayers) {
        alert('Fehler beim Laden der Spieler: ' + errorPlayers.message);
        playersCache = [];
    } else {
        playersCache = playersData || [];
    }
    renderFn();
}

export function renderBansTab(containerId = "app") {
	console.log("renderBansTab aufgerufen!", { containerId });
    const app = document.getElementById(containerId);

    app.innerHTML = `
        <div class="mb-4">
            <h2 class="text-lg font-semibold dark:text-white">Sperren</h2>
            <div class="flex space-x-2 mt-4 mb-6">
                <button id="add-ban-btn" class="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white px-4 py-3 rounded-lg text-base flex items-center gap-2 font-semibold transition shadow">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    Sperre hinzufügen
                </button>
            </div>
            <div>
                <h3 class="font-bold text-base mb-2 dark:text-white">Aktive Sperren</h3>
                <div id="bans-active-list" class="mb-8"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 class="font-bold text-base mb-2 text-blue-800 dark:text-blue-400">Vergangene Sperren AEK</h3>
                    <div id="bans-history-aek"></div>
                </div>
                <div>
                    <h3 class="font-bold text-base mb-2 text-red-800 dark:text-red-400">Vergangene Sperren Real</h3>
                    <div id="bans-history-real"></div>
                </div>
            </div>
        </div>
    `;

    loadBansAndRender(renderBansLists);

    document.getElementById('add-ban-btn').onclick = () => openBanForm();
}

function renderBansLists() {
    const activeBans = bans.filter(b => getRestGames(b) > 0);
    renderBanList(activeBans, 'bans-active-list', true);

    // Vergangene Sperren: restGames <= 0, nach Team
    const oldAek = bans.filter(b => getRestGames(b) <= 0 && b.team === "AEK");
    const oldReal = bans.filter(b => getRestGames(b) <= 0 && b.team === "Real");
    renderBanList(oldAek, 'bans-history-aek', false);
    renderBanList(oldReal, 'bans-history-real', false);
}

function getRestGames(ban) {
    return (ban.totalgames || 1) - (ban.matchesserved || 0);
}

function renderBanList(list, containerId, active) {
    const c = document.getElementById(containerId);
    if (!c) return;
    if (!list.length) {
        c.innerHTML = `<div class="text-gray-400 text-sm">${active ? "Keine aktiven Sperren." : "Keine vergangenen Sperren."}</div>`;
        return;
    }
    c.innerHTML = '';
    list.forEach(ban => {
        const player = playersCache.find(p => p.id === ban.player_id);
        let tClass;
        if (!player) {
            tClass = "bg-gray-700 dark:bg-gray-700 text-gray-400";
        } else if (player.team === "Ehemalige") {
            tClass = "bg-gray-200 dark:bg-gray-700 text-gray-500";
        } else if (player.team === "AEK") {
            tClass = "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-200";
        } else {
            tClass = "bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-200";
        }
        const restGames = getRestGames(ban);
        const div = document.createElement('div');
        div.className = `player-card border dark:border-gray-700 rounded-lg p-3 flex justify-between items-center gap-2 mb-2 ${tClass}`;
        div.innerHTML = `
            <div>
                <div class="font-medium">${player ? player.name : "-"} <span class="text-xs text-gray-400">(${player ? player.team : "-"})</span></div>
                <div class="text-xs text-gray-500">Typ: <b>${ban.type || "-"}</b></div>
                <div class="text-xs text-gray-500">Start: <b>${ban.totalgames}</b> | Aktuell: <b>${restGames < 0 ? 0 : restGames}</b></div>
                ${ban.reason ? `<div class="text-xs text-gray-400">Grund: ${ban.reason}</div>` : ''}
            </div>
            <div class="flex gap-1">
                ${active ? `
                <button class="edit-ban-btn bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg" title="Bearbeiten">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-1.5a2.121 2.121 0 00-3 0l-7.5 7.5a2.121 2.121 0 000 3l3.5 3.5a2.121 2.121 0 003 0l7.5-7.5a2.121 2.121 0 000-3z"/></svg>
                </button>
                <button class="delete-ban-btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg" title="Löschen">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                ` : ''}
            </div>
        `;
        if (active) {
            div.querySelector('.edit-ban-btn').onclick = () => openBanForm(ban);
            div.querySelector('.delete-ban-btn').onclick = () => deleteBan(ban.id);
        }
        c.appendChild(div);
    });
}

async function saveBan(ban) {
    if (ban.id) {
        // Update
        const { error } = await supabase
            .from('bans')
            .update({
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved,
                reason: ban.reason
            })
            .eq('id', ban.id);
        if (error) alert('Fehler beim Speichern: ' + error.message);
    } else {
        // Insert
        const { error } = await supabase
            .from('bans')
            .insert([{
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved || 0,
                reason: ban.reason
            }]);
        if (error) alert('Fehler beim Anlegen: ' + error.message);
    }
}

// --- ASYNCHRONE SPIELERAUSWAHL IM MODAL ---
async function openBanForm(ban = null) {
    const edit = !!ban;
    let team = ban ? ban.team : "AEK";
    // Alle Spieler des gewählten Teams laden
    let spielerArr = await getPlayersByTeam(team);

    function playerOptions(arr, selectedPlayerId = null) {
        return arr.map(p =>
            `<option value="${p.id}"${p.id === selectedPlayerId ? " selected" : ""}>${p.name}</option>`
        ).join('');
    }

    // Typ-Auswahl
    const typeOptions = BAN_TYPES.map(t =>
        `<option value="${t.value}"${ban && ban.type === t.value ? " selected" : ""}>${t.label}</option>`
    ).join('');

    // Gesamtsperrenzahl (dropdown 1-6, außer Gelb-Rote Karte)
    function numberOptions(selectedType, selected, fieldName = "totalgames") {
        if (selectedType === "Gelb-Rote Karte")
            return `<option value="1" selected>1</option>`;
        return ALLOWED_BAN_COUNTS.map(v =>
            `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${v}</option>`
        ).join('');
    }

    const initialType = ban ? ban.type : BAN_TYPES[0].value;
    const initialTotalGames = ban
        ? ban.totalgames
        : BAN_TYPES.find(t => t.value === initialType)?.duration || 1;

    showModal(`
        <form id="ban-form" class="space-y-6 w-full">
            <h3 class="font-bold text-xl mb-6 text-center text-slate-100">${edit ? 'Sperre bearbeiten' : 'Sperre hinzufügen'}</h3>
            <div class="space-y-4">
                <div>
                    <label class="block font-semibold text-slate-200 mb-2">Team:</label>
                    <select name="team" id="ban-team" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent">
                        <option value="AEK"${team === "AEK" ? " selected" : ""}>AEK</option>
                        <option value="Real"${team === "Real" ? " selected" : ""}>Real</option>
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-200 mb-2">Spieler:</label>
                    <select name="player_id" id="ban-player" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent">
                        ${playerOptions(spielerArr, ban ? ban.player_id : null)}
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-200 mb-2">Typ:</label>
                    <select name="type" id="ban-type" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent">
                        ${typeOptions}
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-200 mb-2">Gesamtsperrenzahl:</label>
                    <select name="totalgames" id="ban-totalgames" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent" ${initialType === "Gelb-Rote Karte" ? "disabled" : ""}>
                        ${numberOptions(initialType, initialTotalGames, "totalgames")}
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-200 mb-2">Grund (optional):</label>
                    <input type="text" name="reason" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent" placeholder="Grund" value="${ban && ban.reason ? ban.reason : ''}">
                </div>
            </div>
            <div class="flex gap-3 pt-4">
                <button type="submit" class="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 flex gap-2 items-center justify-center shadow-lg hover:shadow-xl active:scale-95">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" class="bg-slate-600 hover:bg-slate-700 text-slate-100 w-full px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 active:scale-95" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById('ban-team').onchange = async function() {
        const val = this.value;
        const playerSel = document.getElementById('ban-player');
        playerSel.innerHTML = '<option>Lade...</option>';
        const arr = await getPlayersByTeam(val);
        playerSel.innerHTML = playerOptions(arr, null);
    };

    document.getElementById('ban-type').onchange = function() {
        const type = this.value;
        let duration = BAN_TYPES.find(t => t.value === type)?.duration || 1;
        updateTotalGames(type, duration);
    };

    function updateTotalGames(type, val) {
        const totalGamesSel = document.getElementById('ban-totalgames');
        if (type === "Gelb-Rote Karte") {
            totalGamesSel.innerHTML = `<option value="1" selected>1</option>`;
            totalGamesSel.setAttribute("disabled", "disabled");
        } else {
            totalGamesSel.removeAttribute("disabled");
            totalGamesSel.innerHTML = ALLOWED_BAN_COUNTS.map(v =>
                `<option value="${v}"${Number(val) === v ? " selected" : ""}>${v}</option>`
            ).join('');
        }
    }

    document.getElementById('ban-form').onsubmit = async e => {
        e.preventDefault();
        const form = e.target;
        const team = form.team.value;
        const player_id = parseInt(form.player_id.value, 10);
        const type = form.type.value;
        let totalgames = parseInt(form.totalgames.value, 10);
        if (type === "Gelb-Rote Karte") totalgames = 1;
        const reason = form.reason.value.trim();

        if (ban) {
            await saveBan({
                ...ban,
                team,
                player_id,
                type,
                totalgames,
                reason
            });
            showSuccessAndCloseModal("Sperre erfolgreich aktualisiert");
        } else {
            await saveBan({
                team,
                player_id,
                type,
                totalgames,
                matchesserved: 0,
                reason
            });
            showSuccessAndCloseModal("Sperre erfolgreich hinzugefügt");
        }
    };
}

// Hilfsfunktion für andere Module:
export async function decrementBansAfterMatch() {
    const { data: bansData, error } = await supabase.from('bans').select('*');
    if (error) return;
    const updates = [];
    bansData.forEach(ban => {
        if (getRestGames(ban) > 0) {
            updates.push(
                supabase.from('bans').update({ matchesserved: (ban.matchesserved || 0) + 1 }).eq('id', ban.id)
            );
        }
    });
    await Promise.all(updates);
}

// --- RESET-STATE-FUNKTION ---
export function resetBansState() {
    bans = [];
    playersCache = [];
}