import type { Modifier } from '@dnd-kit/core';

/** Listas na vertical (tarefas, projetos): ao arrastar, o item só sobe e desce — não foge para os lados nem fica cortado. */
export const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
