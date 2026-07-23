import { leadStore } from "../db/store.js";
import { logger } from "../utils/logger.js";

/**
 * Marca um email como descadastrado. Chame isso manualmente sempre que
 * alguem responder "REMOVER" (ou pedir para nao receber mais contato).
 * Sem processamento automatico de respostas nesta versao — e' um passo
 * manual de compliance.
 */
export async function unsubscribeEmail(email: string): Promise<number> {
  await leadStore.load();
  const count = leadStore.markUnsubscribed(email);
  await leadStore.save();
  logger.info(`${count} lead(s) marcados como descadastrados para ${email}.`);
  return count;
}
