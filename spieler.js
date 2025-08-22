import { supabase } from './supabaseClient.js';

export async function renderSpielerTab(containerId = "app") {
	console.log("renderSpielerTab aufgerufen!", { containerId });
    const app = document.getElementById(containerId);
    app.innerHTML = `
    <div class="mb-4">
        <h2 class="text-lg font-semibold mb-3">Spieler-Übersicht</h2>
        <div class="flex flex-col sm:flex-row gap-3 sm:gap-3">
            <button id="show-tore" class="flex-1 transition-all duration-150 bg-gradient-to-r from-blue-400 to-blue-600 text-white font-bold rounded-xl px-4 py-3 sm:py-2 shadow-lg hover:from-fuchsia-500 hover:to-blue-400 hover:scale-105 focus:ring-2 focus:ring-blue-300 focus:outline-none min-h-[48px] text-sm sm:text-base">
                <i class="fas fa-futbol mr-2"></i> Torschützen
            </button>
            <button id="show-sds" class="flex-1 transition-all duration-150 bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900 font-bold rounded-xl px-4 py-3 sm:py-2 shadow-lg hover:from-fuchsia-500 hover:to-yellow-400 hover:scale-105 focus:ring-2 focus:ring-yellow-300 focus:outline-none min-h-[48px] text-sm sm:text-base">
                <i class="fas fa-star mr-2"></i> Spieler des Spiels
            </button>
        </div>
    </div>
    <div id="spieler-content"></div>
    `;

    document.getElementById('show-tore').onclick = () => renderTorschuetzen();
    document.getElementById('show-sds').onclick = () => renderSdS();

    // Initialanzeige
    renderTorschuetzen();

    // Enhanced helper function for team indicators
    function getTeamIndicator(team) {
        if (team === "Ehemalige") return '<span class="w-3 h-3 bg-slate-400 rounded-full inline-block mr-2"></span>';
        if (team === "AEK") return '<span class="w-3 h-3 bg-blue-400 rounded-full inline-block mr-2"></span>';
        return '<span class="w-3 h-3 bg-red-400 rounded-full inline-block mr-2"></span>';
    }

    // Hilfsfunktion für Card-Klasse nach Team
    function getCardClass(team) {
        if (team === "Ehemalige") return "text-slate-300";
        if (team === "AEK") return "text-blue-200";
        return "text-red-200";
    }

    // Hilfsfunktion für bessere Kontraste in Top 3 Cards
    function getCardClassForTop3(team, position) {
        if (team === "Ehemalige") return "text-slate-100 font-bold";
        if (team === "AEK") return "text-blue-100 font-bold"; 
        // Für Real Madrid: bei Gold/Bronze dunkler rot, bei Silber helleres rot für besseren Kontrast
        if (position === 1) return "text-red-100 font-bold"; // Silber background
        return "text-red-100 font-bold"; // Gold/Bronze background
    }

    function getBadge(idx) {
        if (idx === 0) return `<span class="inline-block text-2xl align-middle mr-1">🥇</span>`;
        if (idx === 1) return `<span class="inline-block text-2xl align-middle mr-1">🥈</span>`;
        if (idx === 2) return `<span class="inline-block text-2xl align-middle mr-1">🥉</span>`;
        return "";
    }

    // Hilfsfunktion für Team-spezifische Card-Hintergründe mit Medal-Overlay
    function getTeamCardBackground(team, position) {
        let teamBase = "";
        let medalOverlay = "";
        
        // Team-spezifische Basis-Farben
        if (team === "Ehemalige") {
            teamBase = "from-slate-600 to-slate-700";
        } else if (team === "AEK") {
            teamBase = "from-blue-600 to-blue-700";
        } else { // Real Madrid
            teamBase = "from-red-600 to-red-700";
        }
        
        // Medal-spezifische Border und Shadow-Effekte
        let borderClass = "";
        if (position === 0) { // Gold
            borderClass = "border-yellow-400";
            medalOverlay = "shadow-yellow-400/30 ring-2 ring-yellow-400/60";
        } else if (position === 1) { // Silver
            borderClass = "border-gray-300";
            medalOverlay = "shadow-gray-300/30 ring-2 ring-gray-300/60";
        } else { // Bronze
            borderClass = "border-orange-400";
            medalOverlay = "shadow-orange-400/30 ring-2 ring-orange-400/60";
        }
        
        return `bg-gradient-to-br ${teamBase} ${medalOverlay} ${borderClass}`;
    }

    async function renderTorschuetzen() {
        // Spieler laden
        const { data: players, error: errP } = await supabase.from('players').select('*');
        if (errP) {
            document.getElementById('spieler-content').innerHTML =
                `<div class="text-red-700 dark:text-red-300 p-4">Fehler beim Laden der Daten: ${errP?.message || ''}</div>`;
            return;
        }

        let scorerArr = (players || [])
            .filter(p => p.goals && p.goals > 0)
            .map(p => ({
                team: p.team,
                name: p.name,
                goals: p.goals || 0
            }));
        scorerArr.sort((a, b) => b.goals - a.goals);

        // Top 3 mit Abzeichen
        const top3 = scorerArr.slice(0, 3);
        const rest = scorerArr.slice(3);

		// Card-Ansicht Top 3 - alle in einer Reihe, responsive mit Team-Farben
		let top3Html = '';
		if (top3.length) {
			top3Html = `
			<div class="mb-4">
				<div class="text-md font-semibold mb-2 text-gray-200">🏆 Top 3 Torschützen</div>
				<div class="flex flex-row gap-3 w-full overflow-x-auto pb-2">
					${top3.map((s, idx) => `
						<div class="flex-1 min-w-0 w-full p-4 rounded-2xl shadow-lg flex flex-col items-center border-4 border-opacity-90 ${getTeamCardBackground(s.team, idx)}">
							<div class="text-2xl font-extrabold mb-1">${getBadge(idx)}</div>
							<div class="font-bold mb-0.5 text-base truncate w-full text-center ${getCardClassForTop3(s.team, idx)}">${s.name}</div>
							<div class="text-xs text-base mb-1 ${getCardClassForTop3(s.team, idx)} flex items-center justify-center">
								${getTeamIndicator(s.team)}${s.team}
							</div>
							<div class="text-2xl text-base font-bold ${getCardClassForTop3(s.team, idx)}">${s.goals} ⚽</div>
						</div>
					`).join('')}
				</div>
			</div>
			`;
		}

        // Restliche als Tabelle mit verbessertem Team-Styling
        let tableHtml = '';
        if (rest.length) {
            tableHtml = `
            <div class="overflow-x-auto">
            <table class="w-full text-sm bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                <thead class="bg-gray-700">
                    <tr>
                        <th class="p-3 text-left font-semibold text-gray-200">#</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Spieler</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Team</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Tore</th>
                    </tr>
                </thead>
                <tbody>
                    ${rest.map((s, idx) => {
                        let tClass = "";
                        let borderClass = "";
                        if (s.team === "Ehemalige") {
                            tClass = "bg-slate-600 text-slate-200 shadow-sm";
                            borderClass = "border-l-4 border-slate-400";
                        }
                        else if (s.team === "AEK") {
                            tClass = "bg-blue-700 text-blue-100 shadow-sm";
                            borderClass = "border-l-4 border-blue-400";
                        }
                        else {
                            tClass = "bg-red-700 text-red-100 shadow-sm";
                            borderClass = "border-l-4 border-red-400";
                        }
                        return `
                            <tr class="${borderClass} hover:scale-[1.01] transition-transform">
                                <td class="p-3 text-center font-bold ${tClass}">${idx + 4}</td>
                                <td class="p-3 font-semibold ${tClass}">${s.name}</td>
                                <td class="p-3 ${tClass} font-medium flex items-center">
                                    ${getTeamIndicator(s.team)}${s.team}
                                </td>
                                <td class="p-3 font-bold ${tClass} text-center">${s.goals}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
            `;
        } else if (!top3.length) {
            tableHtml = `<div class="text-gray-400 p-2">Noch keine Tore</div>`;
        }

        document.getElementById('spieler-content').innerHTML = top3Html + tableHtml;
    }

    async function renderSdS() {
        const { data: sdsArr, error } = await supabase.from('spieler_des_spiels').select('*');
        if (error) {
            document.getElementById('spieler-content').innerHTML =
                `<div class="text-red-700 dark:text-red-300 p-4">Fehler beim Laden der Spieler des Spiels: ${error.message}</div>`;
            return;
        }
        // Hole alle Spieler für aktuelle Teams
        const { data: players } = await supabase.from('players').select('name, team');
        let arr = [...sdsArr].sort((a, b) => b.count - a.count);

        // Team immer aktuell aus players, fallback auf SdS-Tabelle
        arr = arr.map(s => {
            const found = players?.find(p => p.name === s.name);
            return {
                ...s,
                team: found ? found.team : s.team
            };
        });

        // Top 3 Cards mit Abzeichen - alle in einer Reihe, responsive
        const top3 = arr.slice(0, 3);
        const rest = arr.slice(3);

        let top3Html = '';
        if (top3.length) {
            top3Html = `
            <div class="mb-4">
                <div class="text-md font-semibold mb-2 text-gray-200">⭐ Top 3 Spieler des Spiels</div>
                <div class="flex flex-row gap-3 w-full overflow-x-auto pb-2">
                    ${top3.map((s, idx) => `
					<div class="flex-1 min-w-0 w-full p-4 rounded-2xl shadow-lg flex flex-col items-center border-4 border-opacity-90 ${getTeamCardBackground(s.team, idx)}">
                            <div class="text-2xl font-extrabold mb-1">${getBadge(idx)}</div>
                            <div class="font-bold mb-0.5 text-base truncate w-full text-center ${getCardClassForTop3(s.team, idx)}">${s.name}</div>
                            <div class="text-xs text-base mb-1 ${getCardClassForTop3(s.team, idx)} flex items-center justify-center">
                                ${getTeamIndicator(s.team)}${s.team}
                            </div>
                            <div class="text-2xl text-base font-bold ${getCardClassForTop3(s.team, idx)}">${s.count} ⭐</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }

        // Restliche als Tabelle mit verbessertem Team-Styling
        let tableHtml = '';
        if (rest.length) {
            tableHtml = `
            <div class="overflow-x-auto">
            <table class="w-full text-sm bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                <thead class="bg-gray-700">
                    <tr>
                        <th class="p-3 text-left font-semibold text-gray-200">#</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Spieler</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Team</th>
                        <th class="p-3 text-left font-semibold text-gray-200">Anzahl SdS</th>
                    </tr>
                </thead>
                <tbody>
                    ${rest.map((s, idx) => {
                        let tClass = "";
                        let borderClass = "";
                        if (s.team === "Ehemalige") {
                            tClass = "bg-slate-600 text-slate-200 shadow-sm";
                            borderClass = "border-l-4 border-slate-400";
                        }
                        else if (s.team === "AEK") {
                            tClass = "bg-blue-700 text-blue-100 shadow-sm";
                            borderClass = "border-l-4 border-blue-400";
                        }
                        else {
                            tClass = "bg-red-700 text-red-100 shadow-sm";
                            borderClass = "border-l-4 border-red-400";
                        }
                        return `
                            <tr class="${borderClass} hover:scale-[1.01] transition-transform">
                                <td class="p-3 text-center font-bold ${tClass}">${idx + 4}</td>
                                <td class="p-3 font-semibold ${tClass}">${s.name}</td>
                                <td class="p-3 ${tClass} font-medium flex items-center">
                                    ${getTeamIndicator(s.team)}${s.team}
                                </td>
                                <td class="p-3 font-bold ${tClass} text-center">${s.count}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
            `;
        } else if (!top3.length) {
            tableHtml = `<div class="text-gray-400 p-2">Noch kein Spieler des Spiels vergeben</div>`;
        }

        document.getElementById('spieler-content').innerHTML = top3Html + tableHtml;
    }
}
export function resetSpielerState() {}