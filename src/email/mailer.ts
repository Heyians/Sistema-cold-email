import nodemailer from "nodemailer";
import { config, requireSmtpConfig } from "../config.js";
import { leadStore } from "../db/store.js";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import type { Lead } from "../types.js";

function buildTransport() {
  const smtp = requireSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return { transporter, smtp };
}

async function sendOne(
  transporter: ReturnType<typeof nodemailer.createTransport>,
  smtp: ReturnType<typeof requireSmtpConfig>,
  lead: Lead
): Promise<void> {
  if (!lead.email) throw new Error("Lead sem email");
  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to: lead.email,
    replyTo: smtp.replyToEmail,
    subject: lead.emailSubject ?? "",
    text: lead.emailBody ?? "",
  });
}

/**
 * Envia os emails compostos e prontos, respeitando o limite por execucao
 * e o intervalo minimo entre envios (protege a conta de email contra
 * bloqueio por volume/spam e da tempo de reagir se algo estiver errado).
 */
export async function sendReadyEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  const { transporter, smtp } = buildTransport();
  const candidates = leadStore.byStatus("email_composed");
  const maxPerRun = config.send.maxPerRun;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const lead of candidates.slice(0, maxPerRun)) {
    if (!lead.email) {
      skipped++;
      continue;
    }
    if (lead.unsubscribed || leadStore.isUnsubscribed(lead.email)) {
      logger.warn(`Pulando ${lead.email} (descadastrado).`);
      leadStore.update(lead.id, { status: "unsubscribed" });
      skipped++;
      continue;
    }

    try {
      await sendOne(transporter, smtp, lead);
      leadStore.update(lead.id, { status: "sent", sentAt: new Date().toISOString() });
      logger.info(`Email enviado para ${lead.email} (${lead.name}).`);
      sent++;
    } catch (err) {
      logger.error(`Falha ao enviar para ${lead.email}:`, (err as Error).message);
      leadStore.update(lead.id, {
        status: "send_failed",
        lastError: (err as Error).message,
        attempts: lead.attempts + 1,
      });
      failed++;
    }

    await leadStore.save();
    await sleep(config.send.minDelayMs);
  }

  if (candidates.length > maxPerRun) {
    logger.info(
      `${candidates.length - maxPerRun} leads ficaram para a proxima execucao (limite de ${maxPerRun}/execucao).`
    );
  }

  return { sent, skipped, failed };
}
