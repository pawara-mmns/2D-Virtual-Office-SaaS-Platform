import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

export async function startProductionApp() {
  const port = await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: "ignore" });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Production server exited. Run pnpm build before testing.");
      try {
        const response = await fetch(base + "/api/health");
        if (response.ok) return { base, stop: () => server.kill() };
      } catch { /* Server is still starting. */ }
      await setTimeout(100);
    }
    throw new Error("Production server did not become ready.");
  } catch (error) {
    server.kill();
    throw error;
  }
}
