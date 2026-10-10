/** Utilitários partilhados pelos scripts de linha de comando (perguntas e ficheiros .env). */
import { existsSync, readFileSync } from 'node:fs';
import readline from 'node:readline';

/** Remove aspas, espaços e carateres invisíveis (erros comuns ao colar). */
export const cleanSecret = (value) => value.replace(/["'“”‘’]/g, '').replace(/[^\x21-\x7E]/g, '');

/** Mostra só o início e o fim de uma chave. */
export const secretHint = (key) => `${key.slice(0, 12)}…${key.slice(-4)} (${key.length} carateres)`;

/** Pergunta normal (o texto aparece no ecrã). */
export function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Pergunta sem mostrar o que se escreve/cola (aparecem asteriscos). */
export function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      let shown = false;
      rl._writeToOutput = (text) => {
        if (!shown) {
          rl.output.write(text);
          shown = true;
        } else if (text.includes('\n') || text.includes('\r')) {
          rl.output.write('\n');
        } else {
          rl.output.write('*');
        }
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Lê um ficheiro .env para um objeto (sem mexer em process.env). */
export function readEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
