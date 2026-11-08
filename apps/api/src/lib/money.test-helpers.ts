// Test-Zugriffspunkt: re-exportiert die zu testenden Funktionen,
// damit Vitest ohne ESM/NodeNext-Import-Konflikte arbeitet.
export { computeTotals } from "./money.js";
export { qrReference as qrRefTestable } from "./qrbill.js";
