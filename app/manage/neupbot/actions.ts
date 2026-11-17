"use server"

import { logError } from "@/lib/logica-logging"
import { getLiveNeupbotWorkers as getWorkers } from "@/services/neupbot"

export async function getLiveNeupbotWorkers() {
  try {
    return await getWorkers()
  } catch (error) {
    await logError(error, "getLiveNeupbotWorkers")
    return []
  }
}
