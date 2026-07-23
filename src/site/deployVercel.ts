import { requireVercelToken, config } from "../config.js";

interface VercelDeploymentResponse {
  url?: string;
  error?: { message: string };
}

/**
 * Publica um HTML estatico de uma pagina so na Vercel usando a API de
 * deployments (sem precisar do Vercel CLI). O arquivo e' enviado inline
 * (sem build step, pois e' HTML puro), o que deixa o preview no ar em
 * segundos.
 */
export async function deployStaticSite(projectSlug: string, html: string): Promise<string> {
  const token = requireVercelToken();
  const query = config.vercel.teamId ? `?teamId=${encodeURIComponent(config.vercel.teamId)}` : "";

  const res = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectSlug,
      target: "production",
      files: [{ file: "index.html", data: html, encoding: "utf-8" }],
      projectSettings: { framework: null },
    }),
  });

  const data = (await res.json()) as VercelDeploymentResponse;
  if (!res.ok || !data.url) {
    throw new Error(
      `Falha ao publicar na Vercel: ${data.error?.message ?? res.statusText}`
    );
  }

  return `https://${data.url}`;
}
