# FCE Schichtkalender - Entwicklerdokumentation

Dieses Dokument enthält technische Details zur Einrichtung und zum Betrieb des Schichtsystems für den 1. FC Egenhausen.

## 1. Technischer Stack
- **Frontend:** Next.js (React), Tailwind CSS v4
- **Backend:** Vercel Serverless Functions (Python & TypeScript)
- **Datenbank & Auth:** Supabase (PostgreSQL)

## 2. Datenbank-Setup
Die Datenbank wird manuell über das Supabase Dashboard eingerichtet.

1. Öffnen Sie den **SQL Editor** in Ihrem [Supabase Dashboard](https://supabase.com/dashboard).
2. Führen Sie das vollständige Setup-Skript aus: [supabase/setup.sql](./supabase/setup.sql).
3. Dies erstellt alle Tabellen, RLS-Sicherheitsrichtlinien und Testdaten.

## 3. Lokale Entwicklung
Um das Projekt lokal zu starten, folgen Sie diesen Schritten:

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```
2. **Umgebungsvariablen:**
   Erstellen Sie eine `.env.local` Datei mit Ihren Supabase-Zugangsdaten (zu finden unter *Settings -> API*):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=ihre-projekt-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=ihr-anon-key-publishable
   ```
3. **Server starten:**
   Verwenden Sie die Vercel CLI, um sowohl Frontend als auch API-Routen zu testen:
   ```bash
   npx vercel dev
   ```
4. **Login:**
   Registrieren Sie sich über die App oder nutzen Sie den Test-Account:
   - **User:** `matze29894@gmail.com`
   - **Pass:** `devpassword`
   *(Hinweis: Der Admin-Status muss in der Datenbank mit der `auth_id` verknüpft sein).*

## 4. Authentifizierung & Berechtigungen
Das System nutzt ein zweistufiges Genehmigungsverfahren:
- **Registrierung:** Jeder kann ein Konto erstellen, hat aber initial keinen Zugriff.
- **Freigabe:** Ein Administrator muss neue Konten im Admin-Dashboard freischalten (`is_approved`).
- **Admin-Status:** Nur Benutzer mit `is_admin = true` können das Dashboard sehen und Schichten generieren.

## 5. Algorithmus (Shift Generator)
Die Planungslogik befindet sich in `app/api/generate/route.ts` (TypeScript) und `api/generate.py` (Python-Referenz).
Die Zuweisung erfolgt in 3 Phasen:
1. **Senioren:** Vorrangig für wichtige Schichten.
2. **Wochenenden:** Zuweisung nach Verfügbarkeit.
3. **Wochentage:** Verteilung der restlichen Dienste.
*Fairness-Regel: Mitglieder mit den wenigsten bisherigen Diensten werden bevorzugt.*
