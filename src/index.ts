import { WebSocketServer, WebSocket } from "ws";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import * as dotenv from "dotenv"; dotenv.config();

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) throw new Error("DEEPGRAM_API_KEY missing");

function newDeepgramConn() {
  const dg = createClient(process.env.DEEPGRAM_API_KEY).listen.live({
    model: "general",        // ← Deepgram elegirá polaris o base según tu plan
    encoding: "linear16",
    sample_rate: 16000,
    language: "es",       // o "es-419" si es latam
    interim_results: true,
    smart_format: true,
    endpointing: 400
  });

  dg.on(LiveTranscriptionEvents.Transcript, m => {
    const text = m.channel?.alternatives?.[0]?.transcript;
    if (text) {
      console.log(m.is_final ? "📄" : "⋯", text);
    }
  });

  dg.on(LiveTranscriptionEvents.Open,   () => console.log("🟢 DG socket OPEN"));
  dg.on(LiveTranscriptionEvents.Close,  () => console.log("⚪ DG socket CLOSED"));
  dg.on(LiveTranscriptionEvents.Error,  e  => console.error("🔴 DG ERROR:", e));

  dg.on(LiveTranscriptionEvents.Transcript, m => {
    if (m.is_final) console.log(m.channel.alternatives[0].transcript);
  });

  // auto-close antes del hard-timeout GCP
  setTimeout(() => dg.finish(), 55 * 60 * 1000);
  return dg;
}

/* ─────────────────────  WebSocket server ─────────────────── */
const wss = new WebSocketServer({ port: 8080 });
console.log("🌐 WS bridge listening on ws://0.0.0.0:8080");

wss.on("connection", (client, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`📶 Client CONNECTED from ${ip}`);

  const dg = newDeepgramConn();
  let ready = false;
  const backlog: Buffer[] = [];

  dg.on(LiveTranscriptionEvents.Open, () => {
    ready = true;
    console.log("↗️  DG ready → flushing", backlog.length, "buffered chunks");
    backlog.forEach(buf => dg.send(buf));
    backlog.length = 0;
  });

  client.on("message", chunk => {
    if (ready && dg.getReadyState() === WebSocket.OPEN) {
      dg.send(chunk as Buffer);
    } else {
      backlog.push(chunk as Buffer);
    }
  });

  /* Keep-alive pings cada 8 s para no perder la conexión móvil */
  const pingId = setInterval(() => client.ping(), 8_000);

  client.on("pong", () => console.log(`🏓  Pong from ${ip}`));

  client.on("close", (code, reason) => {
    console.log(`❎ Client ${ip} CLOSED (${code}) ${reason.toString()}`);
    clearInterval(pingId);
    dg.finish();
  });

  client.on("error", err => {
    console.error(`🚨 WS error with ${ip}:`, err);
    client.terminate();
    clearInterval(pingId);
    dg.finish();
  });
});
