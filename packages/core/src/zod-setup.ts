/**
 * Mensagens genéricas de validação em português (as específicas estão em cada campo).
 * É o único ficheiro do pacote com um efeito global: o package.json marca-o em
 * "sideEffects", para o resto poder ser cortado pelo bundler (cada página só leva
 * o que usa).
 *
 * Importa só a língua portuguesa: `z.locales.pt()` puxava as 63 línguas do zod
 * para o browser (~170 KB de JavaScript em todas as páginas).
 */
import { z } from 'zod';
import pt from 'zod/v4/locales/pt.js';

z.config(pt());
