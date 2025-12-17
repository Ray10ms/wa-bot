const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

// ================== CONFIG ==================
const PREFIX = ".";
const STORE_NAME = "Emray Store";

const ADMIN_NUMBERS = ["6287867326510", "628997802027"];

const QRIS_PATH = path.join(__dirname, "assets/qris.png");

// Produk (dipisah file)
const PRODUCT_DETAILS = require("./products");

// ================== RESPONSES ==================
const LIST_RESPONSE = `🛍️ *CATALOGUE EMRAY STORE*
━━━━━━━━━━━━━━━━━━━━━━

\`\`\`
1.  Netflix
2.  YouTube Premium
3.  Disney+
4.  Loklok
5.  Vidio
6.  Spotify
7.  ChatGPT
8.  Gemini AI
9.  Canva
10. CapCut
11. Suntik Followers IG
12. Suntik Followers TikTok
13. Likes IG
14. Likes TikTok
15. Views TikTok
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
🔎 *Lihat Detail Produk*
Ketik: \`.<nama produk>\`

📌 Contoh:
\`.capcut\`

✨ Happy shopping di *${STORE_NAME}* `;

const PAY_CAPTION = `📌 *UPDATE LIST PAYMENT* 💳
📸 *WAJIB KIRIM BUKTI TRANSAKSI KE GRUP YA, KAK!*

🇮🇩 *Ketentuan Pembayaran:*
• Pembayaran via *QRIS* (semua transaksi)
• Wajib kirim *bukti transfer + caption pesanan*
• Dilarang *memalsukan bukti transaksi*
• Salah nominal *tidak bisa refund*
• Kelebihan nominal otomatis jadi *deposit* (no refund)

Dengan melakukan pembelian,
berarti kamu *setuju dengan syarat di atas* 

✨ Terima kasih sudah belanja di *${STORE_NAME}*!`;

// ================== HELPERS ==================
const normalize = (jid) => (jid || "").split("@")[0];

const getText = (m) =>
  m.message?.conversation ||
  m.message?.extendedTextMessage?.text ||
  m.message?.imageMessage?.caption ||
  m.message?.videoMessage?.caption ||
  "";

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const md = await sock.groupMetadata(groupJid);
    const p = md.participants.find((x) => x.id === userJid);
    return !!p?.admin;
  } catch {
    return false;
  }
}

async function isAllowedAdmin(sock, m) {
  const senderJid = m.key.participant || m.key.remoteJid;
  const senderNum = normalize(senderJid);

  // whitelist admin
  if (ADMIN_NUMBERS.includes(senderNum)) return true;

  // admin grup juga boleh
  if (m.key.remoteJid.endsWith("@g.us")) {
    return await isGroupAdmin(sock, m.key.remoteJid, senderJid);
  }
  return false;
}

function getReplyContext(m) {
  return m.message?.extendedTextMessage?.contextInfo || null;
}

function getQuotedTextFromContext(ctx) {
  const q = ctx?.quotedMessage;
  if (!q) return null;
  return (
    q.conversation ||
    q.extendedTextMessage?.text ||
    q.imageMessage?.caption ||
    q.videoMessage?.caption ||
    null
  );
}

function genTrxId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `TRX-${r}`;
}

const pad = (n) => String(n).padStart(2, "0");

function formatTanggal(d) {
  const bln = [
    "Januari","Februari","Maret","April","Mei","Juni",
    "Juli","Agustus","September","Oktober","November","Desember"
  ];
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

// ================== BOT ==================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

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
      if (shouldReconnect) startBot();
      else console.log("⚠️ Logged out. Hapus folder 'auth' lalu scan ulang.");
    }

    if (connection === "open") {
      console.log(`✅ Bot ${STORE_NAME} online!`);
    }
  });

  // ===== AUTO WELCOME =====
  sock.ev.on("group-participants.update", async (update) => {
    try {
      if (update.action !== "add") return;

      const groupJid = update.id;
      const userJid = update.participants?.[0];
      if (!userJid) return;

      const welcomeText = `👋 Selamat datang @${normalize(userJid)}!

Terima kasih sudah bergabung di
🛍️ *${STORE_NAME}* ✨

📦 Cek daftar produk dengan *.list*
Jika ingin order, silakan chat admin ya 🙏

Happy shopping & semoga betah 💖`;

      await sock.sendMessage(groupJid, {
        text: welcomeText,
        mentions: [userJid],
      });
    } catch (err) {
      console.error("Welcome error:", err);
    }
  });

  // ===== COMMANDS =====
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages?.[0];
    if (!m?.message || m.key.fromMe) return;

    const text = getText(m).trim();
    if (!text.startsWith(PREFIX)) return;

    const cmd = text.split(/\s+/)[0].toLowerCase();

    // .list (public)
    if (cmd === ".list") {
      return sock.sendMessage(m.key.remoteJid, { text: LIST_RESPONSE }, { quoted: m });
    }

    // detail produk (public)
    if (PRODUCT_DETAILS[cmd]) {
      return sock.sendMessage(
        m.key.remoteJid,
        { text: PRODUCT_DETAILS[cmd] },
        { quoted: m }
      );
    }

    // .pay (admin-only)
    if (cmd === ".pay") {
      const ok = await isAllowedAdmin(sock, m);
      if (!ok) {
        return sock.sendMessage(m.key.remoteJid, { text: "❌ Command khusus admin." }, { quoted: m });
      }

      if (!fs.existsSync(QRIS_PATH)) {
        return sock.sendMessage(
          m.key.remoteJid,
          { text: "⚠️ File QRIS tidak ditemukan. Pastikan ada di: ./assets/qris.png" },
          { quoted: m }
        );
      }

      return sock.sendMessage(
        m.key.remoteJid,
        { image: fs.readFileSync(QRIS_PATH), caption: PAY_CAPTION },
        { quoted: m }
      );
    }

    // .done (admin-only, reply wajib) => mention CUSTOMER yg direply
    if (cmd === ".done") {
      const ok = await isAllowedAdmin(sock, m);
      if (!ok) {
        return sock.sendMessage(m.key.remoteJid, { text: "❌ Command khusus admin." }, { quoted: m });
      }

      const ctx = getReplyContext(m);
      const note = getQuotedTextFromContext(ctx);
      const customerJid = ctx?.participant; // <- pengirim pesan yg direply

      if (!ctx || !note || !customerJid) {
        return sock.sendMessage(
          m.key.remoteJid,
          { text: "⚠️ Cara pakai: reply pesan customer lalu ketik *.done*" },
          { quoted: m }
        );
      }

      const now = new Date();
      const trxId = genTrxId();

      const out = `[ TRANSAKSI SELESAI ]

🆔 ID : ${trxId}
📅 TANGGAL : ${formatTanggal(now)}
⌚ JAM : ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}
✨ STATUS : Berhasil

📝 Catatan : ${note}

@${normalize(customerJid)} Pesanan sudah selesai!
(づ｡◕‿‿◕｡)づ 🎉✨
Terima kasih sudah belanja di ${STORE_NAME} 🛍️`;

      return sock.sendMessage(
        m.key.remoteJid,
        { text: out, mentions: [customerJid] },
        { quoted: m }
      );
    }
  });
}

startBot();
