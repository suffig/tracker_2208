# Supabase Verbindung einrichten

Diese Anwendung ist für die Nutzung mit Supabase konfiguriert. Aktuell läuft sie im Demo-Modus mit simulierten Daten.

## Schnellstart

1. **Erstellen Sie ein Supabase-Projekt**
   - Gehen Sie zu [supabase.com](https://supabase.com)
   - Erstellen Sie ein neues Projekt
   - Notieren Sie sich die Projekt-URL und den anon key

2. **Konfigurieren Sie die Verbindung**
   - Öffnen Sie `supabaseClient.js`
   - Ersetzen Sie `'https://your-project.supabase.co'` mit Ihrer Projekt-URL
   - Ersetzen Sie `'your-anon-key'` mit Ihrem anon key

3. **Erstellen Sie die Datenbankstruktur**
   ```sql
   -- Spieler Tabelle
   CREATE TABLE players (
     id SERIAL PRIMARY KEY,
     name VARCHAR(100) NOT NULL,
     team VARCHAR(50) DEFAULT 'AEK',
     position VARCHAR(50),
     status VARCHAR(20) DEFAULT 'active',
     created_at TIMESTAMP DEFAULT NOW()
   );

   -- Spiele Tabelle
   CREATE TABLE matches (
     id SERIAL PRIMARY KEY,
     home_team VARCHAR(100) NOT NULL,
     away_team VARCHAR(100) NOT NULL,
     home_score INTEGER DEFAULT 0,
     away_score INTEGER DEFAULT 0,
     match_date TIMESTAMP DEFAULT NOW(),
     created_at TIMESTAMP DEFAULT NOW()
   );

   -- Sperren Tabelle
   CREATE TABLE bans (
     id SERIAL PRIMARY KEY,
     player_id INTEGER REFERENCES players(id),
     reason TEXT,
     start_date TIMESTAMP DEFAULT NOW(),
     end_date TIMESTAMP,
     active BOOLEAN DEFAULT true
   );

   -- Finanzen Tabelle
   CREATE TABLE finances (
     id SERIAL PRIMARY KEY,
     description TEXT NOT NULL,
     amount DECIMAL(10,2) NOT NULL,
     type VARCHAR(20) DEFAULT 'expense', -- 'income' or 'expense'
     date TIMESTAMP DEFAULT NOW(),
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

4. **Row Level Security (RLS) aktivieren**
   ```sql
   -- RLS aktivieren für alle Tabellen
   ALTER TABLE players ENABLE ROW LEVEL SECURITY;
   ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
   ALTER TABLE bans ENABLE ROW LEVEL SECURITY;
   ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

   -- Basis-Policies erstellen (erlaubt allen authentifizierten Benutzern alles)
   CREATE POLICY "Enable all for authenticated users" ON players FOR ALL USING (auth.role() = 'authenticated');
   CREATE POLICY "Enable all for authenticated users" ON matches FOR ALL USING (auth.role() = 'authenticated');
   CREATE POLICY "Enable all for authenticated users" ON bans FOR ALL USING (auth.role() = 'authenticated');
   CREATE POLICY "Enable all for authenticated users" ON finances FOR ALL USING (auth.role() = 'authenticated');
   ```

## Beispielkonfiguration

In `supabaseClient.js`:
```javascript
const SUPABASE_URL = 'https://ihreprojektid.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

## Troubleshooting

- **"Supabase realtime not available"**: Stellen Sie sicher, dass die Supabase CDN geladen werden kann
- **"Demo-Modus"**: Überprüfen Sie Ihre SUPABASE_URL und SUPABASE_ANON_KEY Konfiguration
- **Keine Daten sichtbar**: Überprüfen Sie die RLS-Policies in Ihrer Supabase-Datenbank

## Features mit echter Supabase-Verbindung

- ✅ Automatische Datensynchronisation
- ✅ Echtzeit-Updates zwischen Geräten
- ✅ Benutzer-Authentifizierung
- ✅ Persistente Datenspeicherung
- ✅ Offline-Funktionalität mit Sync