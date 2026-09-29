/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Angemeldete Staff-Person (nur in /admin und Admin-Actions gesetzt) */
    staff?: import('./lib/server/auth').Staff | null;
  }
}
