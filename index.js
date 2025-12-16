const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
// Test Webhooks
const COMMAND = ".list";
const RESPONSE = `*[RESELLER PRICE]*

━━━━━━━━━━━━━━
*NETFLIX*
*Sharing 1P1U*
• 1 Day : 5.000
• 3 Days : 9.000
• 7 Days : 12.000
• 1 Month : 28.500

*Sharing 1P2U*
• 1 Day : 6.000
• 3 Days : 9.000
• 7 Days : 14.000
• 1 Month : 19.000

*Semi Private*
• 1 Month : 35.000

*Private*
• 7 Days : 35.000
• 1 Month : 125.000

━━━━━━━━━━━━━━
*VIU*
*Private*
• 1 Month : 10.000
• 3 Month : 30.000
• 1 Year : 55.000
• 200 Year : 150.000

━━━━━━━━━━━━━━
*DISNEY+*
• 1 Hari : 3.500
• 3 Hari : 7.000
• 5 Hari : 11.000
• 7 Hari : 12.500
• 1 Bulan : 25.000

━━━━━━━━━━━━━━
*SPOTIFY*
*Individual Plan*
• 1 Month : 18.000
• 2 Month : 30.000
• 3 Month : 35.000

*Family Plan*
• 1 Month : 19.000
• 2 Month : 30.000

━━━━━━━━━━━━━━
*CAPCUT*
*Sharing*
• 1 Day : 2.000
• 7 Days : 5.500
• 1 Month : 10.000

*Private*
• 7 Days : 9.000
• 14 Days : 10.000
• 21 Days : 11.500
• 28 Days : 16.000
• 1 Month : 19.000

━━━━━━━━━━━━━━
*CANVA*
*Member*
• 1 Day : 700
• 7 Days : 2.500
• 1 Month : 10.000
• 6 Month : 25.000
• 1 Year : 30.000`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
  });

  // Simpan session/login
  sock.ev.on("creds.update", saveCreds);

  // Tampilkan QR di terminal
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan QR ini di WhatsApp (Linked devices):");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("❌ Koneksi terputus.", statusCode ? `Status: ${statusCode}` : "");
      if (shouldReconnect) {
        console.log("🔄 Reconnect...");
        startBot();
      } else {
        console.log("⚠️ Kamu logout. Hapus folder 'auth' lalu jalankan lagi untuk scan QR ulang.");
      }
    }

    if (connection === "open") {
      console.log("✅ Bot online & siap dipakai!");
      console.log(`➡️ Coba ketik ${COMMAND} di chat/grup.`);
    }
  });

  // Handler pesan masuk
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;
    if (msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const incoming = text.trim().toLowerCase();

    // cocokkan command
    if (incoming === COMMAND.toLowerCase()) {
      await sock.sendMessage(
        msg.key.remoteJid,
        { text: RESPONSE },
        { quoted: msg }
      );
    }
  });
}

startBot();
