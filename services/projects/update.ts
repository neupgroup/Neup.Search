import * as cheerio from "cheerio"
import { assist } from "@neup/logica/assist"
import { prisma } from "@/lib/prisma"
import { neupbotUserAgent } from "@/services/neupbot"
import { getDomainName } from "@/services/projects/domain"
import { readDetails } from "@/services/projects/view"
import type { DomainDetails } from "@/services/neupbot"

// Update selected project metadata while retaining existing details.
export async function updateDomainDetails(domainId: string, details: DomainDetails) {
  const existing = await prisma.domain.findUnique({ where: { id: domainId }, select: { details: true } })
  await prisma.domain.update({ where: { id: domainId }, data: { details: { ...readDetails(existing?.details), ...details } } })
}

// Fetch site metadata and use Logica Assist to produce concise project details.
export async function summarizeDomain(siteId: string, siteUrl: string, authAccountToken?: string) {
  await updateDomainDetails(siteId, { currentActivity: "Summarizing domain..." })
  const response = await fetch(siteUrl, { headers: { "User-Agent": neupbotUserAgent }, cache: "no-store" })
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
  if (!response.ok || (contentType !== "text/html" && contentType !== "application/xhtml+xml")) throw new Error("Could not fetch an HTML page to summarize.")
  const $ = cheerio.load(await response.text())
  const title = $("title").text().trim()
  const description = $("meta[name='description']").attr("content")?.trim() || ""
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000)
  const logoPath = $("link[rel~='icon']").first().attr("href") || $("meta[property='og:image']").attr("content")
  const logoUrl = logoPath ? new URL(logoPath, response.url || siteUrl).toString() : ""
  const prompt = `Return JSON only: {"name":"site name","summary":"50 words max","logoUrl":"absolute URL or empty"}. Use these page details; do not guess a logo.\nURL: ${siteUrl}\nTitle: ${title}\nDescription: ${description}\nText: ${bodyText}\nLogo: ${logoUrl}`
  const pageAssist = assist({ authAccountToken })
  const chatResponse = await pageAssist.chats.create({ title: "Site summary" })
  if (!chatResponse.ok || !chatResponse.body.id) throw new Error(chatResponse.body.error || "Could not start a Logica Assist chat.")
  const messageResponse = await pageAssist.chats.messages(chatResponse.body.id).send(prompt)
  if (!messageResponse.ok || !messageResponse.body.result?.trim()) throw new Error(messageResponse.body.error || "Logica Assist returned an empty site summary.")
  const responseText = messageResponse.body.result.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")
  const parsedSummary = JSON.parse(responseText) as { name?: string; summary?: string; logoUrl?: string }
  const summary = parsedSummary.summary?.trim().split(/\s+/).slice(0, 50).join(" ") || description
  const existing = await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } })
  await prisma.domain.update({ where: { id: siteId }, data: { name: parsedSummary.name?.trim() || title || getDomainName(siteUrl), details: { ...readDetails(existing?.details), summary: summary || undefined, logoUrl: parsedSummary.logoUrl?.trim() || logoUrl || undefined, currentActivity: "" } } })
}

// Mark a project summary operation as failed.
export async function markDomainSummaryFailed(siteId: string) {
  await prisma.domain.update({ where: { id: siteId }, data: { status: "Error", details: { currentActivity: "Failed to summarize domain." } } })
}
