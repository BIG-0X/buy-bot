const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json({ limit: "1mb" }));

// === ENV variables (set these in Railway Variables) ===
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CONTRACT_MINT,
  MIN_BUY_SOL = "0.00428",
  WHALE_TIERS = "2,5,10",
  HELIUS_SECRET = ""
} = process.env;

const MIN_SOL = parseFloat(MIN_BUY_SOL);
const TIERS = WHALE_TIERS.split(",").map(x => parseFloat(x)).sort((a,b)=>a-b);

const sendTelegram = async (text) => {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error("Telegram error:", e?.response?.data || e.message);
  }
};

const classify = (sol) => {
  if (sol >= (TIERS[2] || 10)) return "🟪 T10 WHALE";
  if (sol >= (TIERS[1] || 5))  return "🟥 T5 WHALE";
  if (sol >= (TIERS[0] || 2))  return "🟧 T2 WHALE";
  return "🟩 buy";
};

app.get("/", (req, res) => res.send("Buy-bot alive"));

app.post("/helius", async (req, res) => {
  try {
    if (HELIUS_SECRET) {
      const got = req.headers["x-helius-auth"];
      if (!got || got !== HELIUS_SECRET) {
        return res.status(401).send("bad secret");
      }
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const evt of events) {
      const tokenTransfers = evt?.tokenTransfers || [];
      const nativeTransfers = evt?.nativeTransfers || [];
      const signature = evt?.signature;

      const ourMintMoves = tokenTransfers.filter(t => t.mint === CONTRACT_MINT);
      if (ourMintMoves.length === 0) continue;

      const lamportsSpent = nativeTransfers
        .filter(n => n?.amount > 0 && n?.fromUserAccount)
        .reduce((acc, n) => acc + (n.amount || 0), 0);

      const solSpent = lamportsSpent / 1e9;

      if (solSpent >= MIN_SOL) {
        const size = classify(solSpent);
        const em = "⌨️🖥️💰💲💸";
        const sigLink = signature
          ? `<a href="https://solscan.io/tx/${signature}">tx</a>`
          : "tx";

        const msg =
`${em}
<b>BUY DETECTED</b>
Mint: <code>${CONTRACT_MINT}</code>
Size: <b>${solSpent.toFixed(4)} SOL</b> (${size})
Sig: ${sigLink}`;

        await sendTelegram(msg);
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook handler error:", e?.response?.data || e.message);
    res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Listening on port", PORT));
