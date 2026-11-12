import { mkdirSync, writeFileSync } from 'node:fs';

/** Guarda a hora de início da corrida: no fim, a limpeza só apaga o que foi criado depois disto. */
export default function globalSetup() {
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/inicio-corrida.txt', new Date().toISOString());
}
