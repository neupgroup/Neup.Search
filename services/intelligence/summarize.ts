import { createNiaResponse } from "@neup/logica/intelligence/responses"

// Summarize a page's content in plain language, limited to fifty words.
export async function summarizePage(pageContent: string): Promise<string> {
  const response = await createNiaResponse({
    model: "auto",
    input: [
      { type: "text", role: "system", text: "Summarize this webpage in 50 words max. State purpose and key points. Plain language; no preamble." },
      { type: "text", role: "user", text: pageContent.slice(0, 12_000) },
    ],
  })
  const summary = response.data.output.map((item) => item.value.trim()).filter(Boolean).join(" ")
  if (!summary) throw new Error("Logica Assist returned an empty summary.")
  return summary.split(/\s+/).slice(0, 50).join(" ")
}
