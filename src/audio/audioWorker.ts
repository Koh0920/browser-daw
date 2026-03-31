let timer: number | null = null
const TICK_INTERVAL = 40 // ms

self.onmessage = (e: MessageEvent) => {
  const { command } = e.data

  if (command === "start") {
    if (timer) return
    timer = self.setInterval(() => {
      self.postMessage({ type: "tick" })
    }, TICK_INTERVAL)
  } else if (command === "stop") {
    if (timer) {
      self.clearInterval(timer)
      timer = null
    }
  }
}
