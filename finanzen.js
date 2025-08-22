import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabase } from './supabaseClient.js';
import { matches } from './matches.js';

let finances = {
    aekAthen: { balance: 0, debt: 0 },
    realMadrid: { balance: 0, debt: 0 }
};
let transactions = [];

// Lädt alle Finanzen und Transaktionen und ruft das Rendern auf
async function loadFinancesAndTransactions(renderFn = renderFinanzenTabInner) {
    const { data: finData, error: finError } = await supabase.from('finances').select('*');
    if (finError) {
        alert("Fehler beim Laden der Finanzen: " + finError.message);
    }
    if (finData && finData.length) {
        finances = {
            aekAthen: finData.find(f => f.team === "AEK") || { balance: 0, debt: 0 },
            realMadrid: finData.find(f => f.team === "Real") || { balance: 0, debt: 0 }
        };
    } else {
        finances = {
            aekAthen: { balance: 0, debt: 0 },
            realMadrid: { balance: 0, debt: 0 }
        };
    }

    const { data: transData, error: transError } = await supabase.from('transactions').select('*').order('id', { ascending: false });
    if (transError) {
        alert("Fehler beim Laden der Transaktionen: " + transError.message);
    }
    transactions = transData || [];
    console.log('Loaded transactions:', transactions.length, transactions);
    renderFn("app");
}

// Transaktion in die DB schreiben und Finanzen aktualisieren
async function saveTransaction(trans) {
    trans.amount = parseInt(trans.amount, 10) || 0;
    const { error: insertError } = await supabase.from('transactions').insert([{
        date: trans.date,
        type: trans.type,
        team: trans.team,
        amount: trans.amount,
        info: trans.info || null,
        match_id: trans.match_id || null
    }]);
    if (insertError) {
        alert("Fehler beim Speichern der Transaktion: " + insertError.message);
        return;
    }
    const teamKey = trans.team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    if (trans.type === "Echtgeld-Ausgleich") {
        updateObj.debt = (finances[teamKey].debt || 0) + trans.amount;
    } else {
        let newBalance = (finances[teamKey].balance || 0) + trans.amount;
        if (newBalance < 0) newBalance = 0;
        updateObj.balance = newBalance;
    }
    const { error: updateError } = await supabase.from('finances').update(updateObj).eq('team', trans.team);
    if (updateError) {
        alert("Fehler beim Aktualisieren der Finanzen: " + updateError.message);
    }
}

export async function renderFinanzenTab(containerId = "app") {
	console.log("renderFinanzenTab aufgerufen!", { containerId });
    await loadFinancesAndTransactions(renderFinanzenTabInner);
}

function renderFinanzenTabInner(containerId = "app") {
    const app = document.getElementById(containerId);
    app.innerHTML = `
        <div class="mb-4">
            <h2 class="text-lg font-semibold text-slate-100">Finanzen</h2>
        </div>
        <div class="flex flex-col sm:flex-row sm:space-x-8 space-y-2 sm:space-y-0 mb-6">
            <div class="bg-blue-700 text-blue-100 rounded-lg p-4 flex-1 min-w-0 border border-blue-600 shadow-lg">
                <b>AEK</b><br>
                Kontostand: <span class="font-bold text-blue-200">${(finances.aekAthen.balance || 0).toLocaleString('de-DE')} €</span><br>
                Echtgeldschulden: <span class="font-bold text-blue-200">${(finances.aekAthen.debt || 0).toLocaleString('de-DE')} €</span>
            </div>
            <div class="bg-red-700 text-red-100 rounded-lg p-4 flex-1 min-w-0 border border-red-600 shadow-lg">
                <b>Real</b><br>
                Kontostand: <span class="font-bold text-red-200">${(finances.realMadrid.balance || 0).toLocaleString('de-DE')} €</span><br>
                Echtgeldschulden: <span class="font-bold text-red-200">${(finances.realMadrid.debt || 0).toLocaleString('de-DE')} €</span>
            </div>
        </div>
        <div class="mb-4 flex flex-col sm:flex-row sm:justify-between items-stretch gap-2">
            <h3 class="text-md font-semibold text-slate-100">Transaktionen</h3>
            <button id="add-trans-btn" class="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto px-4 py-3 rounded-lg text-base flex items-center justify-center gap-2 font-semibold transition shadow">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Transaktion hinzufügen</span>
            </button>
        </div>
        <div class="overflow-x-auto w-full" style="max-width:100vw;">
          <div id="transactions-list" class="space-y-2"></div>
        </div>
    `;

    document.getElementById("add-trans-btn").onclick = openTransForm;
    renderTransactions();
}

let transactionGroups = [];
let selectedDateIdx = 0;

function groupTransactionsByDate(transactions) {
    const groups = {};
    for (const t of transactions) {
        // Handle both old (created_at) and new (date) field names
        const dateField = t.date || t.created_at;
        if (!dateField) continue;
        if (!groups[dateField]) groups[dateField] = [];
        // Normalize transaction structure for consistent rendering
        const normalizedTransaction = {
            ...t,
            date: dateField,
            info: t.info || t.description || 'Keine Beschreibung',
            type: t.type || 'Sonstiges'
        };
        groups[dateField].push(normalizedTransaction);
    }
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
        date,
        items: groups[date]
    }));
}

function renderTransactions() {
    const container = document.getElementById('transactions-list');
    console.log('renderTransactions called with:', transactions.length, 'transactions');
    if (!transactions.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Keine Transaktionen vorhanden.</div>`;
        return;
    }

    transactionGroups = groupTransactionsByDate(transactions);
    console.log('Transaction groups created:', transactionGroups.length, transactionGroups);
    if (selectedDateIdx >= transactionGroups.length) selectedDateIdx = 0;
    if (selectedDateIdx < 0) selectedDateIdx = 0;

    // Check if we have any valid transaction groups (transactions with dates)
    if (transactionGroups.length === 0) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Keine gültigen Transaktionen mit Datum vorhanden.</div>`;
        return;
    }

    const { date, items } = transactionGroups[selectedDateIdx];

    // Matches sortieren wie Übersicht (neueste oben)
    let matchOrder = [];
    if (typeof matches !== "undefined" && Array.isArray(matches)) {
        matchOrder = matches.slice().sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    }

    function getAppMatchNumber(matchId) {
        const idx = matchOrder.findIndex(m => m.id == matchId);
        return idx >= 0 ? matchOrder.length - idx : null;
    }

    // Gruppiere Transaktionen nach match_id
    const matchGroups = [];
    const nonMatchTransactions = [];
    for (const match of matchOrder) {
        const matchTx = items.filter(t => t.match_id == match.id);
        if (matchTx.length) {
            matchGroups.push({ match, txs: matchTx });
        }
    }
    const matchIds = new Set(matchOrder.map(m => m.id));
    items.forEach(t => {
        if (!t.match_id || !matchIds.has(t.match_id)) {
            nonMatchTransactions.push(t);
        }
    });

    let html = "";

    function getCellBgClass(team) {
        if (team === "AEK") return "bg-blue-700 text-blue-100 border-l-4 border-blue-400 shadow-sm";
        if (team === "Real") return "bg-red-700 text-red-100 border-l-4 border-red-400 shadow-sm";
        return "bg-slate-600 text-slate-100 shadow-sm";
    }

    // Enhanced function to get team indicator styling
    function getTeamIndicatorClass(team) {
        if (team === "AEK") return "w-3 h-3 bg-blue-400 rounded-full inline-block mr-2";
        if (team === "Real") return "w-3 h-3 bg-red-400 rounded-full inline-block mr-2";
        return "w-3 h-3 bg-slate-400 rounded-full inline-block mr-2";
    }

    // Generate unique colors for each match based on match number
    function getMatchColorScheme(matchNumber) {
        // Define a set of appealing color schemes for matches using available colors
        const colorSchemes = [
            {
                // Blue theme  
                container: "border-blue-400 bg-blue-50 dark:bg-blue-700",
                header: "text-blue-800 dark:text-blue-100",
                accent: "blue-500"
            },
            {
                // Green theme
                container: "border-green-600 bg-gray-100 dark:bg-green-600", 
                header: "text-green-800 dark:text-green-300",
                accent: "green-600"
            },
            {
                // Red theme
                container: "border-red-500 bg-red-50 dark:bg-red-500",
                header: "text-red-800 dark:text-red-100", 
                accent: "red-500"
            },
            {
                // Sky theme
                container: "border-sky-500 bg-blue-100 dark:bg-sky-500",
                header: "text-blue-700 dark:text-blue-100",
                accent: "sky-500"
            },
            {
                // Rose theme using red colors
                container: "border-rose-600 bg-red-100 dark:bg-rose-600",
                header: "text-red-700 dark:text-red-100",
                accent: "red-500"
            },
            {
                // Yellow theme (original)
                container: "border-yellow-400 bg-yellow-100 dark:bg-yellow-900",
                header: "text-yellow-800 dark:text-yellow-300",
                accent: "yellow-400"
            }
        ];
        
        // Cycle through color schemes based on match number
        const schemeIndex = (matchNumber - 1) % colorSchemes.length;
        return colorSchemes[schemeIndex];
    }

    // Match-Transaktionen
    matchGroups.forEach(({ match, txs }) => {
        const appNr = getAppMatchNumber(match.id);
        const matchInfo = match ? ` - AEK ${match.goalsa || 0}:${match.goalsb || 0} Real (${new Date(match.date).toLocaleDateString('de-DE')})` : '';
        const colorScheme = getMatchColorScheme(appNr || 1);
        
        html += `
        <div class="border-2 ${colorScheme.container} rounded-lg mb-4 p-3 shadow-lg">
            <div class="font-bold ${colorScheme.header} pl-2 mb-3 text-lg flex items-center justify-between">
                <div class="flex items-center">
                    <div class="w-4 h-4 bg-${colorScheme.accent} rounded-full mr-3 flex-shrink-0"></div>
                    <div>
                        <div class="text-xl font-extrabold">Match #${appNr}</div>
                        <div class="text-sm font-normal opacity-90">${matchInfo}</div>
                    </div>
                </div>
                <div class="text-sm bg-${colorScheme.accent} text-white px-3 py-1 rounded-full font-semibold">
                    ${txs.length} Transaktion${txs.length !== 1 ? 'en' : ''}
                </div>
            </div>
            <div class="overflow-x-auto">
                <!-- Desktop Table View -->
                <table class="hidden md:table w-full text-sm dark:bg-gray-800 dark:text-gray-100 bg-gray-800 rounded-lg overflow-hidden shadow">
                    <thead class="bg-gray-700 dark:bg-gray-700">
                        <tr>
                            <th class="p-3 text-left font-semibold">Datum</th>
                            <th class="p-3 text-left font-semibold">Typ</th>
                            <th class="p-3 text-left font-semibold">Team</th>
                            <th class="p-3 text-left font-semibold">Info</th>
                            <th class="p-3 text-left font-semibold">Betrag (€)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        txs.forEach(t => {
            html += `
                <tr class="border-b border-gray-600 hover:bg-gray-700 transition-colors">
                    <td class="p-3 ${getCellBgClass(t.team)} rounded-l">${new Date(t.date).toLocaleDateString('de-DE')}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-3 ${getCellBgClass(t.team)} font-semibold flex items-center">
                        <span class="${getTeamIndicatorClass(t.team)}"></span>
                        ${t.team}
                    </td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.info || '-'}</td>
                    <td class="p-3 font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'} rounded-r">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}€
                    </td>
                </tr>
            `;
        });
        html += `
                    </tbody>
                </table>
                
                <!-- Mobile Card View with enhanced team colors -->
                <div class="md:hidden space-y-3">
        `;
        txs.forEach(t => {
            const teamColorClass = t.team === 'AEK' ? 'border-blue-500 bg-blue-900' : 
                                   t.team === 'Real' ? 'border-red-500 bg-red-900' : 
                                   'border-gray-400 bg-gray-700';
            const teamTextClass = t.team === 'AEK' ? 'text-blue-300' : 
                                   t.team === 'Real' ? 'text-red-300' : 
                                   'text-gray-300';
            html += `
                <div class="rounded-lg p-4 shadow border-l-4 ${teamColorClass}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-sm text-gray-400">${new Date(t.date).toLocaleDateString('de-DE')}</div>
                        <div class="text-lg font-bold ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'}">
                            ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}€
                        </div>
                    </div>
                    <div class="text-base font-semibold text-gray-100 mb-1">${t.type}</div>
                    <div class="text-sm mb-1 flex items-center">
                        <span class="${getTeamIndicatorClass(t.team)}"></span>
                        <span class="font-semibold ${teamTextClass}">${t.team}</span>
                    </div>
                    ${t.info ? `<div class="text-sm text-gray-300">${t.info}</div>` : ''}
                </div>
            `;
        });
        html += `
                </div>
            </div>
        </div>
        `;
    });

    // Normale Transaktionen (ohne Match)
    if (nonMatchTransactions.length) {
        html += `
        <div class="border-2 border-slate-500 bg-slate-600 rounded-lg mb-4 p-3 shadow-lg">
            <div class="font-bold text-slate-100 pl-2 mb-3 text-lg flex items-center justify-between">
                <div class="flex items-center">
                    <div class="w-4 h-4 bg-slate-400 rounded-full mr-3 flex-shrink-0"></div>
                    <div>
                        <div class="text-xl font-extrabold">Sonstige Transaktionen</div>
                        <div class="text-sm font-normal opacity-90">Nicht match-bezogene Buchungen</div>
                    </div>
                </div>
                <div class="text-sm bg-slate-400 text-slate-900 px-3 py-1 rounded-full font-semibold">
                    ${nonMatchTransactions.length} Buchung${nonMatchTransactions.length !== 1 ? 'en' : ''}
                </div>
            </div>
            <div class="overflow-x-auto">
                <!-- Desktop Table View -->
                <table class="hidden md:table w-full text-sm bg-slate-700 text-slate-100 rounded-lg overflow-hidden shadow">
                    <thead class="bg-slate-600">
                        <tr>
                            <th class="p-3 text-left font-semibold text-slate-200">Datum</th>
                            <th class="p-3 text-left font-semibold text-slate-200">Typ</th>
                            <th class="p-3 text-left font-semibold text-slate-200">Team</th>
                            <th class="p-3 text-left font-semibold text-slate-200">Info</th>
                            <th class="p-3 text-left font-semibold text-slate-200">Betrag (€)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        nonMatchTransactions.forEach(t => {
            html += `
                <tr class="border-b border-slate-600 hover:bg-slate-600 transition-colors">
                    <td class="p-3 ${getCellBgClass(t.team)}">${new Date(t.date).toLocaleDateString('de-DE')}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-3 ${getCellBgClass(t.team)} font-semibold">${t.team}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.info || '-'}</td>
                    <td class="p-3 font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-400 dark:text-green-400' : 'text-red-400 dark:text-red-400'}">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}
                    </td>
                </tr>
            `;
        });
        html += `
                    </tbody>
                </table>
                
                <!-- Mobile Card View -->
                <div class="md:hidden space-y-3">
        `;
        nonMatchTransactions.forEach(t => {
            html += `
                <div class="bg-slate-600 rounded-lg p-4 shadow border-l-4 ${t.team === 'AEK' ? 'border-blue-400' : t.team === 'Real' ? 'border-red-400' : 'border-slate-400'}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-sm text-slate-300">${new Date(t.date).toLocaleDateString('de-DE')}</div>
                        <div class="text-lg font-bold ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'}">
                            ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}€
                        </div>
                    </div>
                    <div class="text-base font-semibold text-slate-100 mb-1">${t.type}</div>
                    <div class="text-sm text-slate-200 mb-1">Team: <span class="font-semibold ${t.team === 'AEK' ? 'text-blue-300' : t.team === 'Real' ? 'text-red-300' : 'text-slate-300'}">${t.team}</span></div>
                    ${t.info ? `<div class="text-sm text-slate-200">${t.info}</div>` : ''}
                </div>
            `;
        });
        html += `
                </div>
            </div>
        </div>`;
    }

    // Navigation Buttons
    html += `<div class="flex gap-3 mt-6 justify-center">`;
    if (selectedDateIdx < transactionGroups.length - 1) {
        html += `<button id="older-trans-btn" class="bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors">
            <i class="fas fa-chevron-left mr-2"></i>Ältere Transaktionen
        </button>`;
    }
    if (selectedDateIdx > 0) {
        html += `<button id="newer-trans-btn" class="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors">
            Neuere Transaktionen<i class="fas fa-chevron-right ml-2"></i>
        </button>`;
    }
    html += `</div>`;

    container.innerHTML = html;

    if (selectedDateIdx < transactionGroups.length - 1) {
        document.getElementById('older-trans-btn').onclick = () => {
            selectedDateIdx++;
            renderTransactions();
        };
    }
    if (selectedDateIdx > 0) {
        document.getElementById('newer-trans-btn').onclick = () => {
            selectedDateIdx--;
            renderTransactions();
        };
    }
}

function openTransForm() {
    showModal(`
        <form id="trans-form" class="space-y-6 w-full">
            <div class="space-y-4">
                <select name="team" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent" required>
                    <option value="">Team wählen</option>
                    <option value="AEK">AEK</option>
                    <option value="Real">Real</option>
                </select>
                <select name="type" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base focus:ring-2 focus:ring-sky-500 focus:border-transparent" required>
                    <option value="Sonstiges">Sonstiges</option>
                    <option value="Spielerkauf">Spielerkauf</option>
                    <option value="Spielerverkauf">Spielerverkauf</option>
                    <option value="Echtgeld-Ausgleich">Echtgeld-Ausgleich</option>
                </select>
                <input type="number" step="any" name="amount" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent" required placeholder="Betrag (negativ für Abzug)">
                <input type="text" name="info" class="border border-slate-600 bg-slate-700 text-slate-100 rounded-lg p-3 w-full text-base placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent" placeholder="Zusatzinfo (Spielername, Kommentar)">
            </div>
            <div class="flex gap-3 pt-4">
                <button type="submit" class="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 flex gap-2 items-center justify-center shadow-lg hover:shadow-xl active:scale-95">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  Speichern
                </button>
                <button type="button" class="bg-slate-600 hover:bg-slate-700 text-slate-100 w-full px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 active:scale-95" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById("trans-form").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const team = f.team.value;
        const type = f.type.value;
        const amount = parseInt(f.amount.value, 10) || 0;
        const now = new Date().toISOString().slice(0,10);
        const info = f.info.value?.trim() || "";

        await saveTransaction({
            date: now,
            type, team, amount, info
        });

        const transactionText = amount >= 0 ? "Einnahme" : "Ausgabe";
        showSuccessAndCloseModal(`${transactionText} erfolgreich hinzugefügt`);
    };
}

export function resetFinanzenState() {
    finances = {
        aekAthen: { balance: 0, debt: 0 },
        realMadrid: { balance: 0, debt: 0 }
    };
    transactions = [];
}