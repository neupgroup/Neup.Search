// Load the crawler supervisor only in the Node.js server runtime.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  await import("./instrumentation.node")
}
