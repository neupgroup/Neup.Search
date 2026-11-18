"use server"

import { revalidatePath } from "next/cache"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import { getLiveNeupbotWorkers as getWorkers } from "@/services/neupbot"

export async function getLiveNeupbotWorkers() {
  try {
    return await getWorkers()
  } catch (error) {
    await logError(error, "getLiveNeupbotWorkers")
    return []
  }
}

// Count sites that are eligible for pause but have not reached the paused state.
export async function getPauseAllCrawlsStatus() {
  try {
    const remainingSites = await prisma.domain.count({
      where: { status: { notIn: ["paused", "unlisted", "deleting"] } },
    })
    return { remainingSites }
  } catch (error) {
    await logError(error, "getPauseAllCrawlsStatus")
    return { remainingSites: null }
  }
}

// Pause every listed site so crawler and analysis workers stop claiming its jobs.
export async function pauseAllCrawls() {
  try {
    const result = await prisma.domain.updateMany({
      where: { status: { notIn: ["paused", "unlisted", "deleting"] } },
      data: {
        status: "paused",
        crawlWorkerId: null,
        crawlLeaseUntil: null,
      },
    })
    const remainingSites = await prisma.domain.count({
      where: { status: { notIn: ["paused", "unlisted", "deleting"] } },
    })

    revalidatePath("/manage/neupbot")
    revalidatePath("/manage/sites")
    revalidatePath("/manage/pages")
    return { pausedSites: result.count, remainingSites }
  } catch (error) {
    await logError(error, "pauseAllCrawls")
    throw new Error("Could not pause all crawls.")
  }
}
