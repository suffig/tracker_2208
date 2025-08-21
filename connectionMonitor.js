/**
 * Connection Monitor - Monitors database connectivity, handles reconnection,
 * provides KeepAlive/Heartbeat, and notifies UI of session/connection state.
 */
import { supabase, usingFallback } from './supabaseClient.js';

// Interval for KeepAlive (default: 4 minutes)
const KEEPALIVE_INTERVAL = 4 * 60 * 1000;

class ConnectionMonitor {
    constructor() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.healthCheckInterval = 30000; // Check every 30 seconds
        this.keepAliveTimer = null;
        this.healthCheckTimer = null;
        this.reconnectTimer = null;
        this.listeners = [];
        this.lastSuccessfulConnection = Date.now();
        this.isPaused = false;
        this.connectionType = 'unknown'; // 'real', 'fallback', 'offline', 'unknown'
        this.lastError = null;
        this.connectionMetrics = {
            totalConnections: 0,
            successfulConnections: 0,
            failedConnections: 0,
            averageResponseTime: 0,
            lastResponseTime: 0
        };

        this.detectConnectionType();
        this.startHealthCheck();
        this.setupNetworkListeners();
        this.startKeepAlive();
    }

    // Detect what type of connection we have
    detectConnectionType() {
        if (usingFallback) {
            this.connectionType = 'fallback';
            console.log('🔄 Connection type: Fallback mode (demo data)');
        } else if (!navigator.onLine) {
            this.connectionType = 'offline';
            this.isConnected = false;
            console.log('📴 Connection type: Offline');
        } else {
            this.connectionType = 'real';
            console.log('✅ Connection type: Real database');
        }
    }

    addListener(callback) {
        this.listeners.push(callback);
        // Immediately notify new listeners of current status
        setTimeout(() => {
            callback({
                connected: this.isConnected,
                connectionType: this.connectionType,
                metrics: this.connectionMetrics,
                lastError: this.lastError
            });
        }, 0);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners(status) {
        const enrichedStatus = {
            ...status,
            connectionType: this.connectionType,
            metrics: this.connectionMetrics,
            timestamp: Date.now()
        };

        this.listeners.forEach(listener => {
            try {
                listener(enrichedStatus);
            } catch (error) {
                console.error('Error in connection listener:', error);
            }
        });
    }

    async checkConnection() {
        const startTime = performance.now();
        this.connectionMetrics.totalConnections++;

        try {
            // If using fallback mode, simulate successful connection with health metrics
            if (usingFallback) {
                const responseTime = Math.random() * 100 + 50; // Simulate 50-150ms response
                this.updateMetrics(responseTime, true);
                
                if (!this.isConnected) {
                    console.log('🔄 Demo mode - simulating connection restored');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.lastSuccessfulConnection = Date.now();
                    this.lastError = null;
                    this.notifyListeners({ 
                        connected: true, 
                        reconnected: true,
                        message: 'Demo-Modus aktiv - Simulierte Daten verfügbar'
                    });
                }
                return true;
            }

            // Check network connectivity first
            if (!navigator.onLine) {
                throw new Error('Keine Internetverbindung');
            }

            // Try a simple query to test connection with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id')
                    .limit(1)
                    .abortSignal(controller.signal);

                clearTimeout(timeoutId);

                if (error) throw error;

                const responseTime = performance.now() - startTime;
                this.updateMetrics(responseTime, true);

                if (!this.isConnected) {
                    console.log('✅ Database connection restored');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.lastSuccessfulConnection = Date.now();
                    this.lastError = null;
                    this.connectionType = 'real';
                    this.notifyListeners({ 
                        connected: true, 
                        reconnected: true,
                        message: 'Datenbankverbindung wiederhergestellt'
                    });
                }

                return true;
            } catch (abortError) {
                clearTimeout(timeoutId);
                if (abortError.name === 'AbortError') {
                    throw new Error('Verbindungstest-Timeout (> 10s)');
                }
                throw abortError;
            }

        } catch (error) {
            this.updateMetrics(performance.now() - startTime, false);
            this.lastError = error;
            
            console.warn('❌ Database connection check failed:', error.message);

            if (this.isConnected) {
                console.log('📴 Database connection lost');
                this.isConnected = false;
                this.connectionType = error.message.includes('Internetverbindung') ? 'offline' : 'disconnected';
                this.notifyListeners({ 
                    connected: false, 
                    error,
                    message: this.getErrorMessage(error)
                });
            }

            return false;
        }
    }

    updateMetrics(responseTime, success) {
        this.connectionMetrics.lastResponseTime = responseTime;
        
        if (success) {
            this.connectionMetrics.successfulConnections++;
            // Update average response time (exponential moving average)
            if (this.connectionMetrics.averageResponseTime === 0) {
                this.connectionMetrics.averageResponseTime = responseTime;
            } else {
                this.connectionMetrics.averageResponseTime = 
                    (this.connectionMetrics.averageResponseTime * 0.7) + (responseTime * 0.3);
            }
        } else {
            this.connectionMetrics.failedConnections++;
        }
    }

    getErrorMessage(error) {
        if (!error) return 'Unbekannter Fehler';
        
        const message = error.message.toLowerCase();
        
        if (message.includes('internetverbindung') || message.includes('network')) {
            return 'Keine Internetverbindung';
        } else if (message.includes('timeout')) {
            return 'Verbindungs-Timeout - Server antwortet nicht';
        } else if (message.includes('auth') || message.includes('unauthorized')) {
            return 'Authentifizierungsfehler - Bitte neu anmelden';
        } else if (message.includes('cdn') || message.includes('blocked')) {
            return 'CDN blockiert - Fallback-Modus wird verwendet';
        } else {
            return `Datenbankfehler: ${error.message}`;
        }
    }

    async attemptReconnection() {
        if (this.isPaused) {
            console.log('⏸️ Skipping reconnection attempt - monitor is paused');
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.notifyListeners({
                connected: false,
                maxAttemptsReached: true,
                nextRetry: Date.now() + this.maxReconnectDelay,
                message: 'Maximale Wiederverbindungsversuche erreicht - Warte länger...'
            });

            // Wait longer before trying again, then reset attempts
            this.reconnectTimer = setTimeout(() => {
                if (!this.isPaused) {
                    console.log('🔄 Resetting reconnection attempts after extended wait');
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000; // Reset delay
                    this.attemptReconnection();
                }
            }, this.maxReconnectDelay);

            return;
        }

        this.reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        // For offline scenarios, check network first
        if (!navigator.onLine) {
            console.log('📴 Network is offline, waiting for network recovery...');
            this.notifyListeners({
                connected: false,
                networkOffline: true,
                reconnecting: false,
                message: 'Warte auf Netzwerkverbindung...'
            });
            
            // Don't count offline checks against reconnect attempts
            this.reconnectAttempts--;
            
            this.reconnectTimer = setTimeout(() => {
                if (!this.isPaused) {
                    this.attemptReconnection();
                }
            }, 5000); // Check network every 5 seconds
            return;
        }

        const connected = await this.checkConnection();

        if (!connected && !this.isPaused) {
            // Exponential backoff with jitter
            const baseDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
            this.reconnectDelay = baseDelay + jitter;

            this.notifyListeners({
                connected: false,
                reconnecting: true,
                attempt: this.reconnectAttempts,
                nextRetry: Date.now() + this.reconnectDelay,
                message: `Wiederverbindung... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            });

            this.reconnectTimer = setTimeout(() => {
                if (!this.isPaused) {
                    this.attemptReconnection();
                }
            }, this.reconnectDelay);
        }
    }

    startHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(async () => {
            if (this.isPaused || !this.isConnected) {
                return; // Skip health check if paused or already in reconnection mode
            }

            const connected = await this.checkConnection();
            if (!connected) {
                this.attemptReconnection();
            }
        }, this.healthCheckInterval);
    }

    // --- KeepAlive/Heartbeat ---
    startKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
        }

        this.keepAliveTimer = setInterval(async () => {
            if (!this.isPaused && this.isConnected) {
                try {
                    await supabase.from('players').select('id').limit(1);
                    // Optional: console.log('KeepAlive: Ping sent');
                } catch (e) {
                    console.warn('KeepAlive failed:', e.message);
                }
            }
        }, KEEPALIVE_INTERVAL);
    }

    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    pauseHealthChecks() {
        console.log('Pausing connection health checks');
        this.isPaused = true;
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopKeepAlive();
    }

    resumeHealthChecks() {
        console.log('Resuming connection health checks');
        this.isPaused = false;
        this.startHealthCheck();
        this.startKeepAlive();

        // Check connection immediately when resuming
        if (!this.isConnected) {
            this.checkConnection();
        }
    }

    setupNetworkListeners() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('🌐 Network connection restored');
            this.connectionType = usingFallback ? 'fallback' : 'real';
            if (!this.isConnected) {
                // Reset reconnection attempts when network comes back
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.checkConnection();
            }
        });

        window.addEventListener('offline', () => {
            console.log('📴 Network connection lost');
            this.isConnected = false;
            this.connectionType = 'offline';
            this.lastError = new Error('Keine Internetverbindung');
            this.notifyListeners({ 
                connected: false, 
                networkOffline: true,
                message: 'Netzwerkverbindung verloren'
            });
        });

        // Listen for session expiry (optional enhancement)
        window.addEventListener('supabase-session-expired', () => {
            console.log('🔐 Supabase session expired');
            this.isConnected = false;
            this.connectionType = 'expired';
            this.lastError = new Error('Session abgelaufen');
            this.notifyListeners({ 
                connected: false, 
                sessionExpired: true,
                message: 'Session abgelaufen - Bitte neu anmelden'
            });
        });

        // Listen for page visibility changes to optimize resource usage
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('📱 App hidden - reducing health check frequency');
                this.healthCheckInterval = 60000; // Check every minute when hidden
            } else {
                console.log('📱 App visible - resuming normal health checks');
                this.healthCheckInterval = 30000; // Check every 30 seconds when visible
                this.startHealthCheck(); // Restart with new interval
                
                // Check connection immediately when app becomes visible
                if (!this.isPaused) {
                    this.checkConnection();
                }
            }
        });
    }

    getStatus() {
        return {
            connected: this.isConnected,
            connectionType: this.connectionType,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            lastSuccessfulConnection: this.lastSuccessfulConnection,
            timeSinceLastConnection: Date.now() - this.lastSuccessfulConnection,
            isPaused: this.isPaused,
            lastError: this.lastError,
            metrics: {
                ...this.connectionMetrics,
                successRate: this.connectionMetrics.totalConnections > 0 
                    ? Math.round((this.connectionMetrics.successfulConnections / this.connectionMetrics.totalConnections) * 100)
                    : 0
            },
            networkOnline: navigator.onLine,
            usingFallback: usingFallback
        };
    }

    // Enhanced diagnostic information
    getDiagnostics() {
        const status = this.getStatus();
        const diagnostics = {
            ...status,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            connectionSpeed: this.estimateConnectionSpeed(),
            recommendations: this.getRecommendations()
        };
        
        return diagnostics;
    }

    estimateConnectionSpeed() {
        if (this.connectionMetrics.averageResponseTime === 0) return 'unknown';
        
        const avgTime = this.connectionMetrics.averageResponseTime;
        if (avgTime < 100) return 'fast';
        if (avgTime < 500) return 'medium';
        if (avgTime < 1000) return 'slow';
        return 'very-slow';
    }

    getRecommendations() {
        const recommendations = [];
        
        if (!this.isConnected) {
            if (!navigator.onLine) {
                recommendations.push('Überprüfen Sie Ihre Internetverbindung');
            } else if (this.connectionType === 'fallback') {
                recommendations.push('CDN ist blockiert - Demo-Modus wird verwendet');
                recommendations.push('Konfigurieren Sie Supabase-Credentials für echte Datenbankverbindung');
            } else if (this.connectionType === 'expired') {
                recommendations.push('Melden Sie sich erneut an');
            } else {
                recommendations.push('Server temporär nicht erreichbar - Wiederverbindung läuft...');
            }
        }
        
        if (this.connectionMetrics.averageResponseTime > 2000) {
            recommendations.push('Langsame Verbindung erkannt - Überprüfen Sie Ihre Netzwerkgeschwindigkeit');
        }
        
        if (this.connectionMetrics.failedConnections > 5) {
            recommendations.push('Häufige Verbindungsfehler - Überprüfen Sie Ihre Netzwerkstabilität');
        }
        
        return recommendations;
    }

    destroy() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
        }
        this.listeners = [];
    }
}

// Export singleton instance
export const connectionMonitor = new ConnectionMonitor();

// Utility function to check if we should attempt database operations
export function isDatabaseAvailable() {
    return usingFallback || connectionMonitor.isConnected;
}