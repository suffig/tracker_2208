import { dataManager } from './dataManager.js';
import { ErrorHandler } from './utils.js';

export const POSITIONEN = ["TH","LV","RV","IV","ZDM","ZM","ZOM","LM","RM","LF","RF","ST"];

// Enhanced data loading with centralized data manager
async function safeDataOperation(operation, fallbackValue = []) {
    try {
        const result = await operation();
        return result.data || fallbackValue;
    } catch (error) {
        ErrorHandler.handleDatabaseError(error, 'Data loading');
        return fallbackValue;
    }
}

// Lade alle Spieler eines Teams aus Supabase
export async function getPlayersByTeam(team) {
    return safeDataOperation(
        () => dataManager.getPlayersByTeam(team),
        []
    );
}

// Lade alle Ehemaligen (team === "Ehemalige")
export async function getEhemalige() {
    return safeDataOperation(
        () => dataManager.getPlayersByTeam("Ehemalige"),
        []
    );
}

// Lade alle bans
export async function getBans() {
    return safeDataOperation(
        () => dataManager.getBans(),
        []
    );
}

// Lade alle Matches
export async function getMatches() {
    return safeDataOperation(
        () => dataManager.getAllMatches(),
        []
    );
}

// Lade alle Transaktionen
export async function getTransactions() {
    return safeDataOperation(
        () => dataManager.getTransactions(),
        []
    );
}

// Lade Finanzen (liefert beide Teams als Array)
export async function getFinances() {
    return safeDataOperation(
        () => dataManager.getFinances(),
        []
    );
}

// Lade SpielerDesSpiels-Statistik
export async function getSpielerDesSpiels() {
    return safeDataOperation(
        () => dataManager.getSpielerDesSpiels(),
        []
    );
}

// Enhanced save operations with validation and centralized error handling
export async function savePlayer(player) {
    return ErrorHandler.withErrorHandling(async () => {
        if (player.id) {
            const result = await dataManager.update('players', {
                name: player.name,
                team: player.team,
                position: player.position,
                value: player.value
            }, player.id);
            return result;
        } else {
            const result = await dataManager.insert('players', {
                name: player.name,
                team: player.team,
                position: player.position,
                value: player.value
            });
            return result;
        }
    }, 'Spieler speichern');
}

export async function deletePlayer(id) {
    return ErrorHandler.withErrorHandling(async () => {
        return await dataManager.delete('players', id);
    }, 'Spieler löschen');
}

// Batch data loading for better performance
export async function loadAllAppData() {
    return ErrorHandler.withErrorHandling(async () => {
        return await dataManager.loadAllAppData();
    }, 'App-Daten laden');
}