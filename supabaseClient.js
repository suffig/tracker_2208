// Enhanced Supabase configuration with better error handling and performance
const supabaseConfig = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'supabase.auth.token',
    autoRefreshTokenRetryAttempts: 5, // Increased retry attempts
    tokenRefreshMargin: 60 // Refresh 60 seconds before expiry
  },
  global: {
    headers: {
      'X-Client-Info': 'fifa-tracker/1.0.0',
      'X-Client-Version': '2.0.0'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10 // Rate limiting for real-time events
    }
  }
};

// Enhanced fallback client for when CDN is blocked
const createFallbackClient = () => {
  // Enhanced session state for fallback mode with persistence
  let fallbackSession = null;
  let authCallbacks = [];
  let realTimeSubscriptions = new Map();
  let connectionQuality = 'excellent'; // simulate connection quality
  
  // Sample data for demo mode
  const sampleData = {
    players: [
      { id: 1, name: 'Max Müller', team: 'AEK', position: 'ST', value: 120000, goals: 3, created_at: '2024-01-01' },
      { id: 2, name: 'Tom Schmidt', team: 'AEK', position: 'TH', value: 100000, goals: 1, created_at: '2024-01-02' },
      { id: 3, name: 'Leon Wagner', team: 'AEK', position: 'IV', value: 90000, goals: 1, created_at: '2024-01-03' },
      { id: 4, name: 'Tim Fischer', team: 'AEK', position: 'ZM', value: 85000, goals: 1, created_at: '2024-01-04' },
      { id: 5, name: 'Jan Becker', team: 'Real', position: 'ST', value: 110000, goals: 4, created_at: '2024-01-05' },
      { id: 6, name: 'Paul Klein', team: 'Real', position: 'TH', value: 95000, goals: 1, created_at: '2024-01-06' },
      { id: 7, name: 'Lukas Wolf', team: 'Real', position: 'IV', value: 88000, goals: 1, created_at: '2024-01-07' },
      { id: 8, name: 'Ben Richter', team: 'Real', position: 'ZM', value: 92000, goals: 1, created_at: '2024-01-08' },
      { id: 9, name: 'Alex Weber', team: 'Ehemalige', position: 'ST', value: 75000, goals: 2, created_at: '2024-01-09' },
      { id: 10, name: 'Chris Meyer', team: 'Ehemalige', position: 'ZM', value: 70000, goals: 0, created_at: '2024-01-10' }
    ],
    matches: [
      { id: 1, teama: 'AEK', teamb: 'Real', goalsa: 2, goalsb: 1, date: '2024-08-12', created_at: '2024-08-12', manofthematch: 'Max Müller', goalslista: ['Max Müller', 'Tom Schmidt'], goalslistb: ['Jan Becker'] },
      { id: 2, teama: 'AEK', teamb: 'Real', goalsa: 1, goalsb: 3, date: '2024-08-10', created_at: '2024-08-10', manofthematch: 'Jan Becker', goalslista: ['Leon Wagner'], goalslistb: ['Jan Becker', 'Paul Klein', 'Lukas Wolf'] },
      { id: 3, teama: 'AEK', teamb: 'Real', goalsa: 0, goalsb: 2, date: '2024-08-08', created_at: '2024-08-08', manofthematch: 'Ben Richter', goalslista: [], goalslistb: ['Jan Becker', 'Ben Richter'] },
      { id: 4, teama: 'AEK', teamb: 'Real', goalsa: 2, goalsb: 2, date: '2024-08-05', created_at: '2024-08-05', manofthematch: 'Max Müller', goalslista: ['Max Müller', 'Tim Fischer'], goalslistb: ['Jan Becker', 'Paul Klein'] }
    ],
    bans: [
      { id: 1, player_id: 1, matches_remaining: 2, reason: 'Gelb-Rot Karte', created_at: '2024-08-01' },
      { id: 2, player_id: 5, matches_remaining: 1, reason: 'Unsportlichkeit', created_at: '2024-08-05' }
    ],
    transactions: [
      { id: 1, amount: -50000, info: 'Spielerkauf: Max Müller', team: 'AEK', date: '2024-08-10', type: 'Spielerkauf', match_id: null },
      { id: 2, amount: 30000, info: 'Spielerverkauf: Klaus Meyer', team: 'AEK', date: '2024-08-11', type: 'Spielerverkauf', match_id: null },
      { id: 3, amount: -45000, info: 'Spielerkauf: Jan Becker', team: 'Real', date: '2024-08-10', type: 'Spielerkauf', match_id: null },
      { id: 4, amount: 25000, info: 'Sponsoring Einnahme', team: 'Real', date: '2024-08-11', type: 'Sonstiges', match_id: null },
      { id: 5, amount: 5000, info: 'Match-Sieg Preisgeld', team: 'AEK', date: '2024-08-12', type: 'Preisgeld', match_id: 1 },
      { id: 6, amount: 3000, info: 'Match-Niederlage Preisgeld', team: 'Real', date: '2024-08-12', type: 'Preisgeld', match_id: 1 },
      { id: 7, amount: 1500, info: 'SdS Bonus: Max Müller', team: 'AEK', date: '2024-08-12', type: 'SdS Bonus', match_id: 1 },
      { id: 8, amount: 2000, info: 'Liga-Bonus', team: 'AEK', date: '2024-08-13', type: 'Sonstiges', match_id: null },
      { id: 9, amount: -1000, info: 'Kartenstrafe', team: 'Real', date: '2024-08-13', type: 'Strafe', match_id: null },
      { id: 10, amount: 3000, info: 'Match-Niederlage Preisgeld', team: 'AEK', date: '2024-08-10', type: 'Preisgeld', match_id: 2 },
      { id: 11, amount: 5000, info: 'Match-Sieg Preisgeld', team: 'Real', date: '2024-08-10', type: 'Preisgeld', match_id: 2 },
      { id: 12, amount: 1500, info: 'SdS Bonus: Jan Becker', team: 'Real', date: '2024-08-10', type: 'SdS Bonus', match_id: 2 },
      { id: 13, amount: 3000, info: 'Match-Niederlage Preisgeld', team: 'AEK', date: '2024-08-08', type: 'Preisgeld', match_id: 3 },
      { id: 14, amount: 5000, info: 'Match-Sieg Preisgeld', team: 'Real', date: '2024-08-08', type: 'Preisgeld', match_id: 3 },
      { id: 15, amount: 1500, info: 'SdS Bonus: Ben Richter', team: 'Real', date: '2024-08-08', type: 'SdS Bonus', match_id: 3 },
      { id: 16, amount: 4000, info: 'Unentschieden Preisgeld', team: 'AEK', date: '2024-08-05', type: 'Preisgeld', match_id: 4 },
      { id: 17, amount: 4000, info: 'Unentschieden Preisgeld', team: 'Real', date: '2024-08-05', type: 'Preisgeld', match_id: 4 },
      { id: 18, amount: 1500, info: 'SdS Bonus: Max Müller', team: 'AEK', date: '2024-08-05', type: 'SdS Bonus', match_id: 4 }
    ],
    finances: [
      { id: 1, team: 'AEK', budget: 150000, created_at: '2024-01-01' },
      { id: 2, team: 'Real', budget: 175000, created_at: '2024-01-01' }
    ],
    spieler_des_spiels: [
      { id: 1, name: 'Max Müller', team: 'AEK', count: 3, created_at: '2024-08-01' },
      { id: 2, name: 'Jan Becker', team: 'Real', count: 2, created_at: '2024-08-05' },
      { id: 3, name: 'Tom Schmidt', team: 'AEK', count: 2, created_at: '2024-08-08' },
      { id: 4, name: 'Paul Klein', team: 'Real', count: 1, created_at: '2024-08-10' },
      { id: 5, name: 'Leon Wagner', team: 'AEK', count: 1, created_at: '2024-08-12' },
      { id: 6, name: 'Lukas Wolf', team: 'Real', count: 0, created_at: '2024-08-13' },
      { id: 7, name: 'Tim Fischer', team: 'AEK', count: 0, created_at: '2024-08-13' },
      { id: 8, name: 'Ben Richter', team: 'Real', count: 0, created_at: '2024-08-13' }
    ]
  };
  
  // Helper function to filter data based on query parameters
  const filterData = (tableName, query = {}) => {
    let data = [...(sampleData[tableName] || [])];
    
    // Apply filters
    if (query.eq) {
      const [column, value] = query.eq;
      data = data.filter(item => item[column] === value);
    }
    if (query.neq) {
      const [column, value] = query.neq;
      data = data.filter(item => item[column] !== value);
    }
    if (query.gt) {
      const [column, value] = query.gt;
      data = data.filter(item => item[column] > value);
    }
    if (query.gte) {
      const [column, value] = query.gte;
      data = data.filter(item => item[column] >= value);
    }
    if (query.lt) {
      const [column, value] = query.lt;
      data = data.filter(item => item[column] < value);
    }
    if (query.lte) {
      const [column, value] = query.lte;
      data = data.filter(item => item[column] <= value);
    }
    if (query.like) {
      const [column, pattern] = query.like;
      const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
      data = data.filter(item => regex.test(item[column]));
    }
    if (query.in) {
      const [column, values] = query.in;
      data = data.filter(item => values.includes(item[column]));
    }
    
    // Apply ordering
    if (query.order) {
      const [column, direction = 'asc'] = query.order;
      data.sort((a, b) => {
        if (direction === 'desc') {
          return b[column] > a[column] ? 1 : -1;
        }
        return a[column] > b[column] ? 1 : -1;
      });
    }
    
    // Apply range/limit
    if (query.range) {
      const [start, end] = query.range;
      data = data.slice(start, end + 1);
    } else if (query.limit) {
      data = data.slice(0, query.limit);
    }
    
    return data;
  };
  
  const mockClient = {
    auth: {
      getSession: () => {
        // Try to restore session from localStorage first
        if (!fallbackSession) {
          try {
            const stored = localStorage.getItem('supabase.auth.token');
            if (stored) {
              const session = JSON.parse(stored);
              // Check if session is still valid
              if (session.expires_at && session.expires_at > Date.now() / 1000) {
                fallbackSession = session;
                console.log('✅ Restored demo session from localStorage');
              } else {
                localStorage.removeItem('supabase.auth.token');
                console.log('🔄 Demo session expired, removed from localStorage');
              }
            }
          } catch (e) {
            console.warn('Could not restore demo session:', e);
            localStorage.removeItem('supabase.auth.token');
          }
        }
        
        return Promise.resolve({ data: { session: fallbackSession } });
      },
      onAuthStateChange: (callback) => {
        console.warn('Supabase auth not available - using fallback');
        authCallbacks.push(callback);
        // Initial callback
        setTimeout(() => callback(fallbackSession ? 'SIGNED_IN' : 'SIGNED_OUT', fallbackSession), 100);
        return { data: { subscription: { unsubscribe: () => {
          authCallbacks = authCallbacks.filter(cb => cb !== callback);
        } } } };
      },
      signInWithPassword: ({ email, password }) => {
        console.warn('⚠️ Supabase signInWithPassword not available - using enhanced fallback demo auth');
        
        // Simulate network delay based on connection quality
        const delay = connectionQuality === 'excellent' ? 100 : connectionQuality === 'good' ? 300 : 1000;
        
        return new Promise((resolve) => {
          setTimeout(() => {
            // Enhanced validation for demo purposes
            if (!email || !password) {
              resolve({ 
                error: new Error('E-Mail und Passwort sind erforderlich.') 
              });
              return;
            }
            
            if (!email.includes('@')) {
              resolve({ 
                error: new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.') 
              });
              return;
            }
            
            if (password.length < 3) {
              resolve({ 
                error: new Error('Passwort zu kurz (mindestens 3 Zeichen für Demo).') 
              });
              return;
            }
            
            // Create a mock session for demo mode with enhanced data
            fallbackSession = {
              user: {
                id: 'demo-user-' + Date.now(),
                email: email,
                created_at: new Date().toISOString(),
                app_metadata: { provider: 'demo', providers: ['demo'] },
                user_metadata: { demo_mode: true, connection_quality: connectionQuality },
                aud: 'authenticated',
                role: 'authenticated'
              },
              access_token: 'demo-token-' + Date.now(),
              refresh_token: 'demo-refresh-' + Date.now(),
              expires_at: Date.now() / 1000 + 3600, // 1 hour from now
              expires_in: 3600,
              token_type: 'bearer'
            };
            
            // Store session in localStorage for persistence
            try {
              localStorage.setItem('supabase.auth.token', JSON.stringify(fallbackSession));
            } catch (e) {
              console.warn('Could not persist demo session:', e);
            }
            
            // Notify all auth listeners
            authCallbacks.forEach(callback => {
              setTimeout(() => callback('SIGNED_IN', fallbackSession), 50);
            });
            
            resolve({ 
              data: { user: fallbackSession.user, session: fallbackSession }, 
              error: null 
            });
          }, delay);
        });
      },
      signUp: ({ email, password }) => {
        console.warn('Supabase signUp not available - using fallback demo mode');
        
        if (!email || !password) {
          return Promise.resolve({ 
            error: new Error('E-Mail und Passwort sind erforderlich.') 
          });
        }
        
        if (password.length < 6) {
          return Promise.resolve({ 
            error: new Error('Passwort muss mindestens 6 Zeichen haben.') 
          });
        }
        
        return Promise.resolve({ 
          data: { user: null, session: null },
          error: null 
        });
      },
      signOut: () => {
        console.warn('⚠️ Supabase signOut not available - using enhanced fallback');
        
        return new Promise((resolve) => {
          // Clear stored session
          fallbackSession = null;
          
          try {
            localStorage.removeItem('supabase.auth.token');
          } catch (e) {
            console.warn('Could not clear stored session:', e);
          }
          
          // Notify all auth listeners
          authCallbacks.forEach(callback => {
            setTimeout(() => callback('SIGNED_OUT', null), 50);
          });
          
          resolve({ error: null });
        });
      }
    },
    from: (table) => {
      let queryState = {};
      
      const executeQuery = () => {
        const data = filterData(table, queryState);
        queryState = {}; // Reset for next query
        return Promise.resolve({ data, error: null });
      };
      
      const queryBuilder = {
        select: (columns = '*') => {
          // Don't execute immediately, return the builder for chaining
          return queryBuilder;
        },
        eq: (column, value) => {
          queryState.eq = [column, value];
          return queryBuilder;
        },
        neq: (column, value) => {
          queryState.neq = [column, value];
          return queryBuilder;
        },
        gt: (column, value) => {
          queryState.gt = [column, value];
          return queryBuilder;
        },
        gte: (column, value) => {
          queryState.gte = [column, value];
          return queryBuilder;
        },
        lt: (column, value) => {
          queryState.lt = [column, value];
          return queryBuilder;
        },
        lte: (column, value) => {
          queryState.lte = [column, value];
          return queryBuilder;
        },
        like: (column, pattern) => {
          queryState.like = [column, pattern];
          return queryBuilder;
        },
        in: (column, values) => {
          queryState.in = [column, values];
          return queryBuilder;
        },
        order: (column, options = {}) => {
          queryState.order = [column, options.ascending === false ? 'desc' : 'asc'];
          return queryBuilder;
        },
        range: (start, end) => {
          queryState.range = [start, end];
          return queryBuilder;
        },
        limit: (count) => {
          queryState.limit = count;
          return queryBuilder;
        },
        // Additional methods that might be called by SupabaseWrapper
        onConflict: (column) => {
          // Ignore in fallback mode
          return queryBuilder;
        },
        single: () => {
          // Return first result only
          const data = filterData(table, queryState);
          queryState = {};
          const result = data.length > 0 ? data[0] : null;
          return Promise.resolve({ data: result, error: null });
        },
        maybeSingle: () => {
          // Same as single but doesn't error if no results
          const data = filterData(table, queryState);
          queryState = {};
          const result = data.length > 0 ? data[0] : null;
          return Promise.resolve({ data: result, error: null });
        },
        // Make the builder thenable (awaitable)
        then: (resolve, reject) => {
          executeQuery().then(resolve, reject);
        },
        catch: (reject) => {
          executeQuery().catch(reject);
        },
        finally: (callback) => {
          executeQuery().finally(callback);
        },
        insert: (data) => {
          console.warn('Supabase insert not available in demo mode - simulating success');
          // Simulate successful insert
          const newId = Math.max(...(sampleData[table] || []).map(item => item.id || 0)) + 1;
          const newItem = { id: newId, ...data, created_at: new Date().toISOString() };
          if (sampleData[table]) {
            sampleData[table].push(newItem);
          }
          return Promise.resolve({ data: [newItem], error: null });
        },
        update: (data) => {
          console.warn('Supabase update not available in demo mode - simulating success');
          const filteredData = filterData(table, queryState);
          queryState = {};
          // Update the sample data
          filteredData.forEach(item => {
            Object.assign(item, data);
          });
          return Promise.resolve({ data: filteredData, error: null });
        },
        delete: () => {
          console.warn('Supabase delete not available in demo mode - simulating success');
          const filteredData = filterData(table, queryState);
          queryState = {};
          // Remove from sample data
          if (sampleData[table] && filteredData.length > 0) {
            sampleData[table] = sampleData[table].filter(item => 
              !filteredData.some(toDelete => toDelete.id === item.id)
            );
          }
          return Promise.resolve({ data: filteredData, error: null });
        }
      };
      
      return queryBuilder;
    },
    channel: (channelName = 'default') => {
      console.warn('⚠️ Supabase realtime not available - using enhanced fallback simulation');
      
      let subscriptions = [];
      let isSubscribed = false;
      
      const channelObj = {
        on: (event, config, callback) => {
          console.log(`📡 Simulating real-time subscription for ${event} on ${config?.table || 'unknown table'}`);
          
          subscriptions.push({
            event,
            config,
            callback,
            id: Math.random().toString(36).substr(2, 9)
          });
          
          return channelObj;
        },
        
        subscribe: (statusCallback) => {
          console.log('📡 Simulating subscription activation...');
          
          isSubscribed = true;
          realTimeSubscriptions.set(channelName, {
            subscriptions,
            isActive: true,
            created: Date.now()
          });
          
          // Simulate subscription process
          setTimeout(() => {
            if (typeof statusCallback === 'function') {
              statusCallback('SUBSCRIBING');
            }
          }, 50);
          
          setTimeout(() => {
            if (typeof statusCallback === 'function') {
              if (connectionQuality === 'poor') {
                statusCallback('CHANNEL_ERROR');
                console.warn('📡 Simulated connection error due to poor connection quality');
              } else {
                statusCallback('SUBSCRIBED');
                console.log('✅ Real-time subscription simulation active');
              }
            }
          }, connectionQuality === 'excellent' ? 100 : 500);
          
          // Simulate periodic data updates in demo mode
          if (subscriptions.some(s => s.config?.table)) {
            const interval = setInterval(() => {
              if (!isSubscribed) {
                clearInterval(interval);
                return;
              }
              
              // Randomly trigger updates for demo purposes
              if (Math.random() < 0.1) { // 10% chance every 5 seconds
                subscriptions.forEach(sub => {
                  if (sub.config?.table && typeof sub.callback === 'function') {
                    const simulatedPayload = {
                      eventType: ['INSERT', 'UPDATE', 'DELETE'][Math.floor(Math.random() * 3)],
                      new: { id: Math.floor(Math.random() * 1000), updated_at: new Date().toISOString() },
                      old: {},
                      table: sub.config.table,
                      schema: 'public',
                      commit_timestamp: new Date().toISOString()
                    };
                    console.log('📡 Simulated real-time update:', simulatedPayload);
                    sub.callback(simulatedPayload);
                  }
                });
              }
            }, 5000);
          }
          
          return channelObj;
        },
        
        unsubscribe: () => {
          console.log('📡 Unsubscribing from real-time channel simulation');
          isSubscribed = false;
          realTimeSubscriptions.delete(channelName);
          return Promise.resolve({ error: null });
        }
      };
      
      return channelObj;
    },
    
    removeChannel: (channel) => {
      console.log('📡 Removing real-time channel simulation');
      if (channel && typeof channel.unsubscribe === 'function') {
        channel.unsubscribe();
      }
      return Promise.resolve({ error: null });
    }
  };
  return mockClient;
};

// Supabase configuration - replace with your actual values
// You can also set these via environment variables if using a build system
const SUPABASE_URL = (typeof process !== 'undefined' && process?.env?.VITE_SUPABASE_URL) || 
                     (typeof process !== 'undefined' && process?.env?.REACT_APP_SUPABASE_URL) || 
                     'https://buduldeczjwnjvsckqat.supabase.co';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process?.env?.VITE_SUPABASE_ANON_KEY) || 
                          (typeof process !== 'undefined' && process?.env?.REACT_APP_SUPABASE_ANON_KEY) || 
                          'sb_publishable_wcOHaKNEW9rQ3anrRNlEpA_r1_wGda3';

// Alternative: you can also hardcode your values here for static hosting
// const SUPABASE_URL = 'https://yourproject.supabase.co';
// const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Try to create real Supabase client first, fallback if not available
let supabase;
let usingFallback = false;

// Enhanced CDN loading with multiple attempts and fallback sources
async function loadSupabaseCDN() {
    const cdnSources = [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        'https://unpkg.com/@supabase/supabase-js@2',
        'https://esm.sh/@supabase/supabase-js@2'
    ];

    for (const source of cdnSources) {
        try {
            console.log(`🔄 Attempting to load Supabase from: ${source}`);
            
            // Create a script element to load the CDN
            const script = document.createElement('script');
            script.src = source;
            
            // Promise to handle script loading
            const loadPromise = new Promise((resolve, reject) => {
                script.onload = () => {
                    if (window.supabase && window.supabase.createClient) {
                        console.log(`✅ Successfully loaded Supabase from: ${source}`);
                        resolve(true);
                    } else {
                        reject(new Error('Supabase object not found after loading'));
                    }
                };
                script.onerror = () => reject(new Error(`Failed to load script from ${source}`));
                
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error(`Timeout loading from ${source}`)), 10000);
            });

            // Add script to document
            document.head.appendChild(script);
            
            // Wait for loading
            await loadPromise;
            
            // Clean up
            script.remove();
            return true;
            
        } catch (error) {
            console.warn(`❌ Failed to load from ${source}:`, error.message);
            // Clean up failed script
            const scripts = document.querySelectorAll(`script[src="${source}"]`);
            scripts.forEach(s => s.remove());
        }
    }
    
    throw new Error('All CDN sources failed to load');
}

// Initialize Supabase with enhanced error handling
async function initializeSupabase() {
    try {
        // First, check if Supabase is already available (sync loading)
        if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
            console.log('✅ Supabase already available');
        } else {
            // Try to load from CDN asynchronously
            await loadSupabaseCDN();
        }
        
        // Check if we have valid configuration
        if (SUPABASE_URL !== 'https://your-project.supabase.co' && 
            SUPABASE_ANON_KEY !== 'your-anon-key' &&
            SUPABASE_URL.includes('.supabase.co')) {
            
            console.log('🔄 Attempting to connect to Supabase with provided credentials...');
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig);
            
            // Test the connection
            const { data, error } = await supabase.from('players').select('id').limit(1);
            if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
                throw error;
            }
            
            console.log('✅ Supabase client created and tested successfully');
            return;
        } else {
            throw new Error('Supabase configuration not provided - Please set SUPABASE_URL and SUPABASE_ANON_KEY');
        }
    } catch (error) {
        console.warn('⚠️ Supabase realtime not available - using enhanced fallback:', error.message);
        console.log('📝 To connect to your Supabase database:');
        console.log('   1. Replace SUPABASE_URL with your project URL');
        console.log('   2. Replace SUPABASE_ANON_KEY with your anon key');
        console.log('   3. Ensure network connectivity and CDN access');
        console.log('   4. Check browser console for detailed error information');
        usingFallback = true;
        supabase = createFallbackClient();
    }
}

// Initialize immediately for sync usage, but also provide async version
try {
    // Check if Supabase is available via CDN synchronously
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        // Check if we have valid configuration
        if (SUPABASE_URL !== 'https://your-project.supabase.co' && 
            SUPABASE_ANON_KEY !== 'your-anon-key' &&
            SUPABASE_URL.includes('.supabase.co')) {
            console.log('🔄 Attempting to connect to Supabase...');
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig);
            console.log('✅ Supabase client created successfully');
        } else {
            throw new Error('Supabase configuration not provided - Please set SUPABASE_URL and SUPABASE_ANON_KEY');
        }
    } else {
        throw new Error('Supabase library not available (CDN may be blocked)');
    }
} catch (error) {
    console.warn('⚠️ Supabase realtime not available - using fallback:', error.message);
    console.log('📝 To connect to your Supabase database:');
    console.log('   1. Replace SUPABASE_URL with your project URL');
    console.log('   2. Replace SUPABASE_ANON_KEY with your anon key');
    console.log('   3. Ensure the Supabase CDN can load');
    usingFallback = true;
    supabase = createFallbackClient();
}

// Provide async initialization for better error handling
if (typeof window !== 'undefined') {
    window.initializeSupabase = initializeSupabase;
    
    // Auto-retry initialization if initial attempt failed
    if (usingFallback) {
        console.log('🔄 Scheduling automatic retry of Supabase initialization...');
        setTimeout(async () => {
            try {
                console.log('🔄 Retrying Supabase initialization...');
                await initializeSupabase();
                if (!usingFallback) {
                    console.log('✅ Supabase initialization successful on retry');
                    // Notify the app that real database is now available
                    window.dispatchEvent(new CustomEvent('supabase-reconnected', {
                        detail: { timestamp: new Date().toISOString() }
                    }));
                }
            } catch (retryError) {
                console.log('🔄 Retry failed, staying in fallback mode');
            }
        }, 5000); // Retry after 5 seconds
    }
}

export { supabase, usingFallback };

// Enhanced wrapper with better connection handling and metrics
class SupabaseWrapper {
  constructor(client) {
    this.client = client;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds max
    this.connectionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastResponseTime: 0
    };
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentRequests = 5;
    this.activeRequests = 0;
  }

  // Get connection statistics
  getStats() {
    return {
      ...this.connectionStats,
      successRate: this.connectionStats.totalRequests > 0 
        ? (this.connectionStats.successfulRequests / this.connectionStats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length
    };
  }

  // Reset statistics
  resetStats() {
    this.connectionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastResponseTime: 0
    };
  }

  // Enhanced retry operation with better metrics and queue management
  async retryOperation(operation, maxRetries = this.maxRetries, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const requestItem = {
        operation,
        maxRetries,
        priority,
        resolve,
        reject,
        timestamp: Date.now()
      };

      if (priority === 'high') {
        this.requestQueue.unshift(requestItem);
      } else {
        this.requestQueue.push(requestItem);
      }

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.activeRequests >= this.maxConcurrentRequests) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const requestItem = this.requestQueue.shift();
      this.executeRequest(requestItem);
    }

    this.isProcessingQueue = false;
  }

  async executeRequest(requestItem) {
    this.activeRequests++;
    this.connectionStats.totalRequests++;
    
    const startTime = performance.now();
    let lastError = null;

    try {
      for (let attempt = 1; attempt <= requestItem.maxRetries; attempt++) {
        try {
          const result = await requestItem.operation();
          
          if (result.error) throw result.error;
          
          // Success metrics
          const responseTime = performance.now() - startTime;
          this.updateResponseTimeMetrics(responseTime);
          this.connectionStats.successfulRequests++;
          
          requestItem.resolve(result);
          return;
          
        } catch (error) {
          lastError = error;
          console.warn(`Database operation failed (attempt ${attempt}/${requestItem.maxRetries}):`, error);
          
          if (this.isNonRetryableError(error) || attempt === requestItem.maxRetries) {
            break;
          }
          
          // Exponential backoff with jitter
          const baseDelay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
          const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
          const delay = baseDelay + jitter;
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Failed after all retries
      this.connectionStats.failedRequests++;
      requestItem.reject(lastError);
      
    } catch (error) {
      this.connectionStats.failedRequests++;
      requestItem.reject(error);
    } finally {
      this.activeRequests--;
      // Process next items in queue
      setTimeout(() => this.processQueue(), 0);
    }
  }

  updateResponseTimeMetrics(responseTime) {
    this.connectionStats.lastResponseTime = responseTime;
    
    if (this.connectionStats.averageResponseTime === 0) {
      this.connectionStats.averageResponseTime = responseTime;
    } else {
      // Moving average
      this.connectionStats.averageResponseTime = 
        (this.connectionStats.averageResponseTime * 0.8) + (responseTime * 0.2);
    }
  }

  isNonRetryableError(error) {
    if (!error) return false;
    
    const message = error.message ? error.message.toLowerCase() : '';
    const code = error.code;
    
    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return true;
    }
    
    // Specific error codes that shouldn't be retried
    if (code === 'PGRST301' || code === 'PGRST116' || code === '23505' || code === '23503') {
      return true;
    }
    
    // Client errors (4xx) generally shouldn't be retried
    if (error.status && error.status >= 400 && error.status < 500) {
      return true;
    }
    
    return false;
  }

  // Enhanced select with better query building and validation
  async select(table, query = '*', options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).select(query);
      
      // Apply filters
      if (options.eq) {
        Object.entries(options.eq).forEach(([column, value]) => {
          if (value !== undefined && value !== null) {
            queryBuilder = queryBuilder.eq(column, value);
          }
        });
      }
      
      if (options.neq) {
        Object.entries(options.neq).forEach(([column, value]) => {
          queryBuilder = queryBuilder.neq(column, value);
        });
      }
      
      if (options.gt) {
        Object.entries(options.gt).forEach(([column, value]) => {
          queryBuilder = queryBuilder.gt(column, value);
        });
      }
      
      if (options.gte) {
        Object.entries(options.gte).forEach(([column, value]) => {
          queryBuilder = queryBuilder.gte(column, value);
        });
      }
      
      if (options.lt) {
        Object.entries(options.lt).forEach(([column, value]) => {
          queryBuilder = queryBuilder.lt(column, value);
        });
      }
      
      if (options.lte) {
        Object.entries(options.lte).forEach(([column, value]) => {
          queryBuilder = queryBuilder.lte(column, value);
        });
      }
      
      if (options.like) {
        Object.entries(options.like).forEach(([column, pattern]) => {
          queryBuilder = queryBuilder.like(column, pattern);
        });
      }
      
      if (options.in) {
        Object.entries(options.in).forEach(([column, values]) => {
          if (Array.isArray(values) && values.length > 0) {
            queryBuilder = queryBuilder.in(column, values);
          }
        });
      }
      
      // Apply ordering
      if (options.order) {
        if (Array.isArray(options.order)) {
          options.order.forEach(orderBy => {
            queryBuilder = queryBuilder.order(orderBy.column, { 
              ascending: orderBy.ascending ?? true 
            });
          });
        } else {
          queryBuilder = queryBuilder.order(options.order.column, { 
            ascending: options.order.ascending ?? true 
          });
        }
      }
      
      // Apply pagination
      if (options.limit) {
        queryBuilder = queryBuilder.limit(Math.min(options.limit, 1000)); // Max 1000 records
      }
      
      if (options.range) {
        queryBuilder = queryBuilder.range(options.range.from, options.range.to);
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced insert with better validation
  async insert(table, data, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for insert');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).insert(data);
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      if (options.onConflict) {
        queryBuilder = queryBuilder.onConflict(options.onConflict);
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced update with better validation
  async update(table, data, conditions = {}, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for update');
    if (Object.keys(conditions).length === 0) throw new Error('At least one condition is required for update');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).update(data);
      
      // Apply conditions
      Object.entries(conditions).forEach(([column, value]) => {
        if (value !== undefined && value !== null) {
          queryBuilder = queryBuilder.eq(column, value);
        }
      });
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced deleteRow with better validation
  async deleteRow(table, conditions = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (Object.keys(conditions).length === 0) throw new Error('At least one condition is required for delete');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).delete();
      
      // Apply conditions
      Object.entries(conditions).forEach(([column, value]) => {
        if (value !== undefined && value !== null) {
          queryBuilder = queryBuilder.eq(column, value);
        }
      });
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Upsert operation
  async upsert(table, data, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for upsert');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).upsert(data);
      
      if (options.onConflict) {
        queryBuilder = queryBuilder.onConflict(options.onConflict);
      }
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Batch operations for better performance
  async batchSelect(operations) {
    const promises = operations.map(op => 
      this.select(op.table, op.query, op.options, op.priority || 'normal')
    );
    
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
      operation: operations[index]
    }));
  }

  // Connection health check
  async healthCheck() {
    try {
      const result = await this.select('players', 'id', { limit: 1 }, 'high');
      return { healthy: true, responseTime: this.connectionStats.lastResponseTime };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getClient() {
    return this.client;
  }
}


export const supabaseDb = new SupabaseWrapper(supabase);

// Enhanced auth event handler with better error handling and monitoring
const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
  const userInfo = session?.user?.email || 'No user';
  console.log(`Auth state changed: ${event}`, userInfo);
  
  // Update connection stats based on auth events
  if (event === 'SIGNED_IN') {
    console.log('✅ User signed in successfully');
    supabaseDb.resetStats(); // Reset stats on new session
  } else if (event === 'SIGNED_OUT') {
    console.log('👋 User signed out');
    supabaseDb.resetStats(); // Reset stats on sign out
  } else if (event === 'TOKEN_REFRESHED') {
    if (session) {
      console.log('🔄 Auth token refreshed successfully');
    } else {
      console.error('❌ Token refresh failed - user may need to re-authenticate');
      window.dispatchEvent(new CustomEvent('supabase-session-expired', {
        detail: { timestamp: new Date().toISOString() }
      }));
    }
  } else if (event === 'USER_UPDATED') {
    console.log('👤 User profile updated');
  } else if (event === 'PASSWORD_RECOVERY') {
    console.log('🔐 Password recovery initiated');
  }
  
  // Dispatch custom event for app-wide auth state management
  window.dispatchEvent(new CustomEvent('auth-state-change', {
    detail: { event, session, user: session?.user }
  }));
});

// Add connection monitoring for debugging
if (typeof window !== 'undefined') {
  // Global access for debugging
  window.supabase = supabase;
  window.supabaseDb = supabaseDb;
  
  // Add debugging helpers
  window.supabaseDebug = {
    getStats: () => supabaseDb.getStats(),
    resetStats: () => supabaseDb.resetStats(),
    healthCheck: () => supabaseDb.healthCheck(),
    getQueueLength: () => supabaseDb.requestQueue.length,
    getActiveRequests: () => supabaseDb.activeRequests
  };
  
  // Periodic stats logging in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(() => {
      const stats = supabaseDb.getStats();
      if (stats.totalRequests > 0) {
        console.log('📊 Supabase Stats:', stats);
      }
    }, 60000); // Log every minute
  }
}

// Performance monitoring for database operations
class DatabasePerformanceMonitor {
  constructor() {
    this.slowQueryThreshold = 2000; // 2 seconds
    this.slowQueries = [];
    this.maxSlowQueries = 10;
  }

  logSlowQuery(operation, duration, table, query) {
    if (duration > this.slowQueryThreshold) {
      const slowQuery = {
        operation,
        duration: Math.round(duration),
        table,
        query: query || 'N/A',
        timestamp: new Date().toISOString()
      };
      
      this.slowQueries.unshift(slowQuery);
      if (this.slowQueries.length > this.maxSlowQueries) {
        this.slowQueries.pop();
      }
      
      console.warn(`🐌 Slow database query detected:`, slowQuery);
    }
  }

  getSlowQueries() {
    return this.slowQueries;
  }

  clearSlowQueries() {
    this.slowQueries = [];
  }
}

export const dbPerformanceMonitor = new DatabasePerformanceMonitor();

// Add performance monitoring to window for debugging
if (typeof window !== 'undefined') {
  window.dbPerformanceMonitor = dbPerformanceMonitor;
}
