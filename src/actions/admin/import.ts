/**
 * Admin-Actions: Telemetrie-/CSV-Import (Plan Phase 2): Import-Token, Import-Stapel prüfen, verwerfen, übernehmen.
 *
 * Jede Action prüft die Rolle mit staffFrom(...), schreibt über getServiceStore(),
 * protokolliert mit audit(...) und fordert bei öffentlich sichtbaren Änderungen einen Rebuild an.
 */
export const importActions = {};
