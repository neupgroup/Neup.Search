"use server"

import { logError } from "@/lib/logica-logging"
import { getActiveNeupbotCrawls } from "@/services/neupbot"

export async function getLiveNeupbotCrawls() {
  try {
    return await getActiveNeupbotCrawls()
  } catch (error) {
    await logError(error, "getLiveNeupbotCrawls")
    return []
  }
}
