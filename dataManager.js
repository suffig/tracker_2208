/**
 * Centralized Data Manager
 * Handles all database operations with caching, batching, and enhanced error handling
 */
import { supabase, supabaseDb } from './supabaseClient.js';
import { isDatabaseAvailable } from './connectionMonitor.js';

class DataManager {
    constructor() {
        this.cache = new Map();
        this.pendingRequests = new Map();
        this.cacheExpiry = new Map();
        this.defaultCacheTTL = 30000; // 30 seconds
        this.batchQueue = [];
        this.batchTimer = null;
        this.batchDelay = 100; // 100ms debounce
        this.validationRules = this.initValidationRules();
    }

    initValidationRules() {
        return {
            players: {
                name: { required: true, type: 'string', minLength: 1, maxLength: 50 },
                team: { required: true, type: 'string', enum: ['AEK', 'Real', 'Ehemalige'] },
                position: { required: true, type: 'string', enum: ['TH','LV','RV','IV','ZDM','ZM','ZOM','LM','RM','LF','RF','ST'] },
                value: { required: true, type: 'number', min: 0, max: 999999999 }
            },
            matches: {
                team1: { required: true, type: 'string' },
                team2: { required: true, type: 'string' },
                score1: { required: true, type: 'number', min: 0, max: 50 },
                score2: { required: true, type: 'number', min: 0, max: 50 },
                date: { required: true, type: 'string' }
            },
            bans: {
                player_id: { required: true, type: 'number' },
                matches_remaining: { required: true, type: 'number', min: 0, max: 20 },
                reason: { required: false, type: 'string', maxLength: 200 }
            },
            transactions: {
                amount: { required: true, type: 'number' },
                description: { required: true, type: 'string', minLength: 1, maxLength: 200 },
                team: { required: true, type: 'string', enum: ['AEK', 'Real'] }
            }
        };
    }

    validateData(tableName, data) {
        const rules = this.validationRules[tableName];
        if (!rules) return { valid: true };

        const errors = [];
        
        for (const [field, rule] of Object.entries(rules)) {
            const value = data[field];
            
            // Required field check
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} ist erforderlich`);
                continue;
            }
            
            // Skip further validation if field is not required and empty
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }
            
            // Type validation
            if (rule.type === 'string' && typeof value !== 'string') {
                errors.push(`${field} muss ein Text sein`);
            } else if (rule.type === 'number' && (typeof value !== 'number' || isNaN(value))) {
                errors.push(`${field} muss eine Zahl sein`);
            }
            
            // String length validation
            if (rule.type === 'string' && typeof value === 'string') {
                if (rule.minLength && value.length < rule.minLength) {
                    errors.push(`${field} muss mindestens ${rule.minLength} Zeichen haben`);
                }
                if (rule.maxLength && value.length > rule.maxLength) {
                    errors.push(`${field} darf maximal ${rule.maxLength} Zeichen haben`);
                }
            }
            
            // Number range validation
            if (rule.type === 'number' && typeof value === 'number') {
                if (rule.min !== undefined && value < rule.min) {
                    errors.push(`${field} muss mindestens ${rule.min} sein`);
                }
                if (rule.max !== undefined && value > rule.max) {
                    errors.push(`${field} darf maximal ${rule.max} sein`);
                }
            }
            
            // Enum validation
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${field} muss einer der folgenden Werte sein: ${rule.enum.join(', ')}`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    sanitizeData(data) {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                // Basic XSS prevention
                sanitized[key] = value.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    getCacheKey(table, options = {}) {
        return `${table}:${JSON.stringify(options)}`;
    }

    isCacheValid(key) {
        const expiry = this.cacheExpiry.get(key);
        return expiry && Date.now() < expiry;
    }

    setCache(key, data, ttl = this.defaultCacheTTL) {
        this.cache.set(key, data);
        this.cacheExpiry.set(key, Date.now() + ttl);
    }

    getCache(key) {
        if (this.isCacheValid(key)) {
            return this.cache.get(key);
        }
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
        return null;
    }

    invalidateCache(pattern = null) {
        if (pattern) {
            for (const key of this.cache.keys()) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                    this.cacheExpiry.delete(key);
                }
            }
        } else {
            this.cache.clear();
            this.cacheExpiry.clear();
        }
    }

    async executeWithRetry(operation, maxRetries = 3) {
        if (!isDatabaseAvailable()) {
            throw new Error('Keine Datenbankverbindung verfügbar. Bitte später versuchen.');
        }

        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                if (result && result.error) {
                    throw result.error;
                }
                return result;
            } catch (error) {
                lastError = error;
                console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
                
                if (attempt === maxRetries || this.isNonRetryableError(error)) {
                    break;
                }
                
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    isNonRetryableError(error) {
        if (!error) return false;
        const message = error.message || '';
        return message.includes('auth') || 
               message.includes('permission') || 
               message.includes('constraint') ||
               error.code === 'PGRST301' || 
               error.code === 'PGRST116';
    }

    async batchedSelect(requests) {
        const results = await Promise.allSettled(
            requests.map(req => this.select(req.table, req.query, req.options))
        );
        
        return results.map((result, index) => ({
            key: requests[index].key,
            success: result.status === 'fulfilled',
            data: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }

    async select(table, query = '*', options = {}) {
        const cacheKey = this.getCacheKey(table, { query, options });
        
        // Check cache first
        const cached = this.getCache(cacheKey);
        if (cached !== null) {
            return { data: cached, fromCache: true };
        }

        // Check for pending request to avoid duplicates
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const request = this.executeWithRetry(async () => {
            let queryBuilder = supabase.from(table).select(query);
            
            if (options.eq) {
                Object.entries(options.eq).forEach(([column, value]) => {
                    queryBuilder = queryBuilder.eq(column, value);
                });
            }
            
            if (options.order) {
                queryBuilder = queryBuilder.order(options.order.column, { 
                    ascending: options.order.ascending ?? true 
                });
            }
            
            if (options.limit) {
                queryBuilder = queryBuilder.limit(options.limit);
            }

            if (options.range) {
                queryBuilder = queryBuilder.range(options.range.from, options.range.to);
            }
            
            return await queryBuilder;
        }).then(result => {
            this.pendingRequests.delete(cacheKey);
            if (result && result.data) {
                this.setCache(cacheKey, result.data);
            }
            return result;
        }).catch(error => {
            this.pendingRequests.delete(cacheKey);
            throw error;
        });

        this.pendingRequests.set(cacheKey, request);
        return request;
    }

    async insert(table, data) {
        const sanitized = this.sanitizeData(data);
        const validation = this.validateData(table, sanitized);
        
        if (!validation.valid) {
            throw new Error(`Validierungsfehler: ${validation.errors.join(', ')}`);
        }

        const result = await this.executeWithRetry(async () => {
            return await supabase.from(table).insert([sanitized]).select();
        });

        // Invalidate relevant cache
        this.invalidateCache(table);
        
        return result;
    }

    async update(table, data, id) {
        const sanitized = this.sanitizeData(data);
        const validation = this.validateData(table, sanitized);
        
        if (!validation.valid) {
            throw new Error(`Validierungsfehler: ${validation.errors.join(', ')}`);
        }

        const result = await this.executeWithRetry(async () => {
            return await supabase.from(table).update(sanitized).eq('id', id).select();
        });

        // Invalidate relevant cache
        this.invalidateCache(table);
        
        return result;
    }

    async delete(table, id) {
        if (!id) {
            throw new Error('ID ist erforderlich zum Löschen');
        }

        const result = await this.executeWithRetry(async () => {
            return await supabase.from(table).delete().eq('id', id);
        });

        // Invalidate relevant cache
        this.invalidateCache(table);
        
        return result;
    }

    async upsert(table, data) {
        const sanitized = this.sanitizeData(data);
        const validation = this.validateData(table, sanitized);
        
        if (!validation.valid) {
            throw new Error(`Validierungsfehler: ${validation.errors.join(', ')}`);
        }

        const result = await this.executeWithRetry(async () => {
            return await supabase.from(table).upsert(sanitized).select();
        });

        // Invalidate relevant cache
        this.invalidateCache(table);
        
        return result;
    }

    // Convenience methods for common operations
    async getPlayersByTeam(team) {
        return this.select('players', '*', { eq: { team } });
    }

    async getAllMatches() {
        return this.select('matches', '*', { order: { column: 'id', ascending: false } });
    }

    async getBans() {
        return this.select('bans', '*');
    }

    async getFinances() {
        return this.select('finances', '*');
    }

    async getTransactions() {
        return this.select('transactions', '*', { order: { column: 'id', ascending: false } });
    }

    async getSpielerDesSpiels() {
        return this.select('spieler_des_spiels', '*');
    }

    // Batch operations for better performance
    async loadAllAppData() {
        const requests = [
            { key: 'matches', table: 'matches', query: '*', options: { order: { column: 'id', ascending: false } } },
            { key: 'players', table: 'players', query: '*', options: {} },
            { key: 'bans', table: 'bans', query: '*', options: {} },
            { key: 'finances', table: 'finances', query: '*', options: {} },
            { key: 'transactions', table: 'transactions', query: '*', options: { order: { column: 'id', ascending: false } } },
            { key: 'spieler_des_spiels', table: 'spieler_des_spiels', query: '*', options: {} }
        ];

        const results = await this.batchedSelect(requests);
        
        const data = {};
        for (const result of results) {
            if (result.success) {
                data[result.key] = result.data.data || [];
            } else {
                console.error(`Failed to load ${result.key}:`, result.error);
                data[result.key] = [];
            }
        }

        return data;
    }

    // Health check method
    async healthCheck() {
        try {
            await this.select('players', 'id', { limit: 1 });
            return true;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
}

// Create singleton instance
export const dataManager = new DataManager();

// Export for backward compatibility and direct access
export default dataManager;