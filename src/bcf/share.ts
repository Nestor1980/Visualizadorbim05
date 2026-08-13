import type * as OBC from "@thatopen/components";

const DISCORD_WEBHOOK_STORAGE_KEY = "bim-discord-webhook-url";

export function getDiscordWebhookUrl(): string {
  return localStorage.getItem(DISCORD_WEBHOOK_STORAGE_KEY) ?? "";
}

export function setDiscordWebhookUrl(url: string): void {
  if (url) localStorage.setItem(DISCORD_WEBHOOK_STORAGE_KEY, url);
  else localStorage.removeItem(DISCORD_WEBHOOK_STORAGE_KEY);
}

function formatTopicSummary(topic: OBC.Topic): string {
  return [
    `Topic BCF: ${topic.title}`,
    `Estado: ${topic.status}`,
    topic.priority && `Prioridad: ${topic.priority}`,
    topic.assignedTo && `Asignado a: ${topic.assignedTo}`,
    topic.description && `Descripción: ${topic.description}`,
    `GUID: ${topic.guid}`,
  ].filter(Boolean).join("\n");
}

/** Abre el cliente de correo del usuario con un resumen del topic en el cuerpo. */
export function shareTopicByEmail(topic: OBC.Topic): void {
  const subject = `BCF Topic: ${topic.title}`;
  const body = `${formatTopicSummary(topic)}\n\nAdjuntá el archivo .bcfzip descargado a este correo.`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Publica un resumen del topic en el canal de Discord configurado en Ajustes
 * vía un Incoming Webhook. Lanza un error legible si no hay webhook configurado
 * o si Discord rechaza el request.
 */
export async function shareTopicToDiscord(topic: OBC.Topic): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    throw new Error("No hay un Webhook de Discord configurado. Configuralo en Ajustes > Compartir.");
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: formatTopicSummary(topic) }),
  });
  if (!response.ok) {
    throw new Error(`Discord respondió con estado ${response.status}.`);
  }
}
