const TelegramBot = require("node-telegram-bot-api");
const { Client } = require("ssh2");
const { exec } = require("child_process");
const fs = require("fs");
const FormData = require('form-data');
const path = require("path");
const axios = require("axios");
const settings = require("./settings");

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 KONFIGURASI TERPUSAT
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CONFIG = {
    owner: settings.adminId,
    botToken: settings.token,
    adminFile: "adminID.json",
    premiumUsersFile: "premiumUsers.json",
    welcomeGoodbyeFile: "welcomeGoodbye.json",
    domain: settings.domain,
    plta: settings.plta,
    pltc: settings.pltc,
    ONLY_FILE: "only.json",
    logFile: "bot.log",
    AI_STATE_FILE: "ai_state.json",
};

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 VARIABEL STATUS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let set = "❌", setV2 = "❌", setV3 = "❌", setV4 = "❌";
let aiEnabled = false;
let adminUsers = [];
let premiumUsers = [];

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧠 MEMORY SYSTEM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Load AI State
try {
    if (fs.existsSync(CONFIG.AI_STATE_FILE)) {
        const aiState = JSON.parse(fs.readFileSync(CONFIG.AI_STATE_FILE));
        aiEnabled = aiState.enabled || false;
    }
} catch (error) {
    console.log("Error loading AI state:", error.message);
}

// Load Chat Memory
function loadChatMemory() {
    try {
        if (fs.existsSync(CONFIG.CHAT_MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG.CHAT_MEMORY_FILE));
        }
    } catch (error) {
        console.log("Error loading chat memory:", error.message);
    }
    return {};
}

// Save Chat Memory
function saveChatMemory(memory) {
    try {
        fs.writeFileSync(CONFIG.CHAT_MEMORY_FILE, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.log("Error saving chat memory:", error.message);
    }
}

// Get User Memory
function getUserMemory(userId) {
    const memory = loadChatMemory();
    if (!memory[userId]) {
        memory[userId] = [];
    }
    return memory[userId];
}

// Save User Memory
function saveUserMemory(userId, userMemory) {
    const memory = loadChatMemory();
    memory[userId] = userMemory.slice(-20);
    saveChatMemory(memory);
}

// Clear User Memory
function clearUserMemory(userId) {
    const memory = loadChatMemory();
    delete memory[userId];
    saveChatMemory(memory);
}

// Add Message to Memory
function addToMemory(userId, role, content) {
    const userMemory = getUserMemory(userId);
    userMemory.push({
        role: role,
        content: content,
        timestamp: new Date().toISOString()
    });
    saveUserMemory(userId, userMemory);
}

function saveAIState() {
    const aiState = { enabled: aiEnabled };
    fs.writeFileSync(CONFIG.AI_STATE_FILE, JSON.stringify(aiState, null, 2));
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👋 WELCOME & GOODBYE SYSTEM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Load Welcome & Goodbye Settings
function loadWelcomeGoodbyeSettings() {
    try {
        if (fs.existsSync(CONFIG.welcomeGoodbyeFile)) {
            return JSON.parse(fs.readFileSync(CONFIG.welcomeGoodbyeFile));
        }
    } catch (error) {
        console.log("Error loading welcome/goodbye settings:", error.message);
    }
    return {};
}

// Save Welcome & Goodbye Settings
function saveWelcomeGoodbyeSettings(settings) {
    try {
        fs.writeFileSync(CONFIG.welcomeGoodbyeFile, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.log("Error saving welcome/goodbye settings:", error.message);
    }
}

// Get Group Settings
function getGroupSettings(chatId) {
    const settings = loadWelcomeGoodbyeSettings();
    if (!settings[chatId]) {
        settings[chatId] = {
            welcome: { enabled: false, text: "Selamat datang {name} di grup! 🎉" },
            goodbye: { enabled: false, text: "Sampai jumpa {name}! 👋" }
        };
    }
    return settings[chatId];
}

// Format welcome/goodbye message
function formatMessage(text, user, chat) {
    return text
        .replace(/{name}/g, user.first_name || 'User')
        .replace(/{username}/g, user.username ? `@${user.username}` : user.first_name || 'User')
        .replace(/{group}/g, chat?.title || 'Grup');
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 FUNGSI UTAMA
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isOwner(userId) {
    return userId.toString() === CONFIG.owner.toString();
}

function isAdmin(userId) {
    try {
        if (!fs.existsSync(CONFIG.adminFile)) return isOwner(userId);
        const adminData = JSON.parse(fs.readFileSync(CONFIG.adminFile));
        return adminData.includes(userId.toString()) || isOwner(userId);
    } catch (error) {
        return isOwner(userId);
    }
}

function isPremium(userId) {
    try {
        if (!fs.existsSync(CONFIG.premiumUsersFile)) return isAdmin(userId);
        const premiumData = JSON.parse(fs.readFileSync(CONFIG.premiumUsersFile));
        return premiumData.includes(userId.toString()) || isAdmin(userId);
    } catch (error) {
        return isAdmin(userId);
    }
}

function isOnlyGroupEnabled() {
    try {
        if (!fs.existsSync(CONFIG.ONLY_FILE)) return false;
        const config = JSON.parse(fs.readFileSync(CONFIG.ONLY_FILE));
        return config.onlyGroup;
    } catch (error) {
        return false;
    }
}

function setOnlyGroup(status) {
    const config = { onlyGroup: status };
    fs.writeFileSync(CONFIG.ONLY_FILE, JSON.stringify(config, null, 2));
}

function shouldIgnoreMessage(msg) {
    if (!isOnlyGroupEnabled()) return false;
    return msg.chat.type === "private";
}

function logToFileAndConsole(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage);
    fs.appendFileSync(CONFIG.logFile, logMessage);
}

function generateRandomPassword() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#%^&*";
    const length = 10;
    let password = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        password += characters[randomIndex];
    }
    return password;
}

function getRuntime(startTime) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${hours} Jam ${minutes} Menit ${seconds} Detik`;
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💰 PREMIUM INFO FUNCTION
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showPremiumInfo(chatId, commandName) {
    const premiumMessage = `<blockquote>┌─⧼ <b>PREMIUM REQUIRED</b> ⧽
├ ❌ Anda bukan user premium!
├ 
├ 💡 Fitur ini hanya untuk user premium
├ 🎯 Upgrade ke premium untuk akses
├ 
├ ┌─⧼ <b>COMMAND</b> ⧽
├ │ • /${commandName}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan membutuhkan pengorbanan</i>
├ Hubungi @botzmarket95 untuk upgrade
╰──────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, premiumMessage, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🕯️ UPGRADE PREMIUM", url: "https://t.me/botzmarket95" }]
            ]
        }
    });
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧠 AI CHATBOT SYSTEM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function openaiChat(text) {
    try {
        const encodedQuery = encodeURIComponent(text);
        const config = {
            timeout: 30000,
            headers: {
                "Accept": "*/*",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
        };

        let response = await axios.get(`https://www.laurine.site/api/ai/deepai?query=${encodedQuery}`, config);
        let result = response.data;
        
        if (result.status && result.data) {
            return {
                choices: [
                    {
                        message: {
                            content: result.data
                        }
                    }
                ]
            };
        } else {
            throw new Error("Invalid response from AI API");
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error("AI API timeout - coba lagi nanti");
        }
        throw new Error(`AI Error: ${error.message}`);
    }
}

async function textToAudioBuffer(text) {
    return new Promise(async (resolve, reject) => {
        try {
            const maxLength = 200;
            const processedText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
            
            const encodedText = encodeURIComponent(processedText);
            const audioUrl = `https://api.siputzx.my.id/api/tools/ttsgoogle?text=${encodedText}`;
            
            const response = await axios({
                method: 'GET',
                url: audioUrl,
                responseType: 'stream',
                timeout: 30000
            });

            const chunks = [];
            response.data.on('data', (chunk) => chunks.push(chunk));
            response.data.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
            response.data.on('error', (err) => {
                reject(new Error(`TTS Stream Error: ${err.message}`));
            });

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                reject(new Error("TTS API timeout - coba lagi nanti"));
            } else {
                reject(new Error(`TTS Error: ${error.message}`));
            }
        }
    });
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🖼️ IMAGE ENHANCER FUNCTION
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function enhanceImage(buffer, { method = 1, size = 'high' } = {}) {
    try {
        const _size = ['low', 'medium', 'high'];
        if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('Image buffer is required');
        if (method < 1 || method > 4) throw new Error('Available methods: 1, 2, 3, 4');
        if (!_size.includes(size)) throw new Error(`Available sizes: ${_size.join(', ')}`);

        const form = new FormData();
        form.append('method', method.toString());
        form.append('is_pro_version', 'false');
        form.append('is_enhancing_more', 'false');
        form.append('max_image_size', size);
        form.append('file', buffer, `enhance_${Date.now()}.jpg`);
        
        const { data } = await axios.post('https://ihancer.com/api/enhance', form, {
            headers: {
                ...form.getHeaders(),
                'accept-encoding': 'gzip',
                host: 'ihancer.com',
                'user-agent': 'Dart/3.5 (dart:io)'
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(data);
    } catch (error) {
        throw new Error(error.message);
    }
}
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 FUNGSI STATUS USER
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getSimpleUserStatus(userId) {
    if (isOwner(userId)) return 'Owner ✅';
    if (isAdmin(userId)) return 'Admin ✅';
    if (isPremium(userId)) return 'Premium User ✅';
    return 'Regular User ⚠️';
}

function saveAIState() {
    const aiState = { enabled: aiEnabled };
    fs.writeFileSync(CONFIG.AI_STATE_FILE, JSON.stringify(aiState, null, 2));
}

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎭 MENU TEMPLATES - DIPERBAIKI
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAIN_MENU = (user, status) => `<blockquote>
╔─═⊱ USER INFO─═⬡
║⎔ 👤 Username: @${user.from.username || 'tidak_ada'}
║⎔ 🏷️ Status: ${status}
║⎔ 🤖 Bot: Novabot
║⎔ 🦠 versi: 1.3
║⎔ 👨‍💻 Developer: @botzmarket
┗━━━━━━━━━━━━━━━━━━⬡

╔─═⊱ BOT INFO─═⬡
║⎔ ⚡ Tipe: Panel Creation Bot
║⎔ 🔒 Akses: Premium Only
║⎔ 💡 Fitur: Pembuatan Panel Hosting
┗━━━━━━━━━━━━━━━━━━⬡

⚠️ <i>Bot khusus untuk pembuatan panel hosting, 
hanya user premium yang dapat mengakses 
fitur lengkap</i>
</blockquote>`;

const CREATE_PANEL_MENU = `<blockquote>┌─⧼ <b>CREATE PANEL</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

╭─⊱ *Panel Berbayar* ⊰─╮
│ /1gb username,id
│ /2gb username,id  
│ /3gb username,id
│ /4gb username,id
│ /5gb username,id
│ /6gb username,id
│ /7gb username,id
│ /8gb username,id
│ /9gb username,id
│ /10gb username,id
╰─────────────────────╯

╭─⊱ *Panel Unlimited* ⊰─╮
│ /unli username,id
╰─────────────────────╯

╭─⊱ *Panel Admin* ⊰─╮
│ /createadmin username,id
╰─────────────────────╯

┌─⧼ <b>CONTOH PENGGUNAAN</b> ⧽
├ /1gb shadow,7550928171
╰──────────────
</blockquote>`;

const OWNER_MENU = `<blockquote>┌─⧼ <b>OWNER MENU</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>MANAJEMEN USER</b> ⧽
├ /addowner id
├ /addprem id
├ /delowner id
├ /delprem id
├ /backup
├ /onlygrup on|off
├ /ongoing
├ /deluser
├ /deladmin
╰──────────────

┌─⧼ <b>MANAJEMEN SERVER</b> ⧽
├ /clearusr
├ /clearsrv
├ /ongoing
╰──────────────
</blockquote>`;

const CONTACT_MENU = `<blockquote>┌─⧼ <b>CONTACT INFO</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
├ ⬡ Developer : rizky cyber
╰───────────────

┌─⧼ <b>HUBUNGI KAMI</b> ⧽
├ 💬 Telegram : @botzmarket95
├ 📷 Tik tok : @rizky.cyber4
╰──────────────

┌─⧼ <b>DUKUNGAN TEKNIS</b> ⧽
├ Hubungi kami untuk bantuan
├ dan pertanyaan teknis
╰──────────────
</blockquote>`;

const AI_MENU = `<blockquote>┌─⧼ <b>AI CHATBOT SETTINGS</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Status : ${aiEnabled ? '🔴AKTIF' : '🟢NONAKTIF'}
├ ⬡ Mode : Auto Response
╰───────────────

┌─⧼ <b>FITUR AI CHATBOT</b> ⧽
├ 🤖 GPT-4 Powered
├ 🎵 Response Voice Note
├ 🔄 Auto Reply ketika aktif
├ 💬 Chat natural
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ Ketik pesan biasa untuk chat
├ Bot akan reply dengan VN
├ Nonaktifkan jika tidak perlu
╰──────────────
</blockquote>`;
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 INISIALISASI BOT
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Load data admin dan premium
try {
    if (fs.existsSync(CONFIG.adminFile)) {
        adminUsers = JSON.parse(fs.readFileSync(CONFIG.adminFile));
    }
} catch (error) {
    console.error("Error reading adminUsers file:", error);
}

try {
    if (fs.existsSync(CONFIG.premiumUsersFile)) {
        premiumUsers = JSON.parse(fs.readFileSync(CONFIG.premiumUsersFile));
    }
} catch (error) {
    console.error("Error reading premiumUsers file:", error);
}

const bot = new TelegramBot(CONFIG.botToken, { polling: true });

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👋 WELCOME & GOODBYE HANDLERS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Handle new chat members (Welcome)
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const groupSettings = getGroupSettings(chatId);
    
    if (groupSettings.welcome.enabled) {
        for (const newMember of msg.new_chat_members) {
            if (!newMember.is_bot) {
                const welcomeMessage = formatMessage(groupSettings.welcome.text, newMember, msg.chat);
                await bot.sendMessage(chatId, welcomeMessage, {
                    parse_mode: "HTML",
                    reply_to_message_id: msg.message_id
                });
            }
        }
    }
});

// Handle left chat member (Goodbye)
bot.on('left_chat_member', async (msg) => {
    const chatId = msg.chat.id;
    const groupSettings = getGroupSettings(chatId);
    
    if (groupSettings.goodbye.enabled && msg.left_chat_member && !msg.left_chat_member.is_bot) {
        const goodbyeMessage = formatMessage(groupSettings.goodbye.text, msg.left_chat_member, msg.chat);
        await bot.sendMessage(chatId, goodbyeMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📁 FILE SEARCH COMMAND - SFILE.MOBI
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/file(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];

    if (!query) {
        const helpMessage = `<blockquote>┌─⧼ <b>FILE SEARCH</b> ⧽
├ 📁 Cari file dari sfile.mobi
├ 
├ 💡 <b>Penggunaan:</b>
├ /file [nama_file]
├ 
├ 🎯 <b>Contoh:</b>
├ /file ddos
├ /file termux
├ /file python
├ /file hacking
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    let processingMsg;

    try {
        // Kirim pesan processing
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>FILE SEARCH</b> ⧽
├ 🔍 Mencari: <b>${query}</b>
├ 📡 Searching sfile.mobi...
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        // Encode query untuk URL
        const encodedQuery = encodeURIComponent(query);
        const apiUrl = `https://api.resellergaming.my.id/search/sfile?q=${encodedQuery}`;

        // Request ke API file search
        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const data = response.data;

        // Cek jika response valid
        if (!data.status || !data.results || data.results.length === 0) {
            throw new Error('Tidak ada file yang ditemukan');
        }

        const results = data.results;

        // Update pesan processing
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>FILE SEARCH</b> ⧽
├ ✅ Ditemukan <b>${results.length}</b> file
├ 🔍 Query: <b>${query}</b>
├ 📊 Menyiapkan hasil...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        // Hapus pesan processing
        await bot.deleteMessage(chatId, processingMsg.message_id);

        // Format hasil pencarian
        let resultMessage = `<blockquote>┌─⧼ <b>FILE SEARCH RESULTS</b> ⧽
├ 🔍 Query: <b>${query}</b>
├ 📊 Total: <b>${results.length}</b> file ditemukan
├ 🌐 Sumber: sfile.mobi
╰──────────────\n\n`;

        // Tambahkan setiap file ke hasil
        results.forEach((file, index) => {
            resultMessage += `<b>${index + 1}. ${file.title}</b>\n`;
            resultMessage += `├ 💾 <b>Size:</b> ${file.size}\n`;
            resultMessage += `├ 🔗 <b>URL:</b> <code>${file.link}</code>\n`;
            resultMessage += `╰────────────────────\n\n`;
        });

        resultMessage += `<blockquote>┌─⧼ <b>INFO</b> ⧽
├ 📝 Klik URL untuk download file
├ ⚠️ Hati-hati dengan file yang didownload
├ 🔒 Gunakan untuk tujuan pembelajaran
╰──────────────</blockquote></blockquote>`;

        // Kirim hasil pencarian
        await bot.sendMessage(chatId, resultMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id,
            disable_web_page_preview: true
        });

    } catch (error) {
        console.log('File Search Error:', error.message);
        
        // Hapus pesan processing jika ada error
        if (processingMsg) {
            try {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            } catch (deleteError) {
                console.log('Gagal menghapus pesan processing:', deleteError.message);
            }
        }
        
        // Tentukan pesan error
        let errorMessage = 'Gagal melakukan pencarian file';
        
        if (error.response) {
            if (error.response.status === 404) {
                errorMessage = 'Tidak ada file yang ditemukan';
            } else if (error.response.status === 429) {
                errorMessage = 'Terlalu banyak request, coba lagi nanti';
            } else {
                errorMessage = `Error ${error.response.status}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Timeout: Pencarian terlalu lama';
        } else if (error.message.includes('tidak ada file')) {
            errorMessage = 'Tidak ada file yang ditemukan, coba kata kunci lain';
        }

        // Kirim pesan error
        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>FILE SEARCH ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ 💡 <b>Tips:</b>
├ • Gunakan kata kunci yang lebih spesifik
├ • Coba kata kunci dalam bahasa Inggris
├ • Tunggu beberapa detik lalu coba lagi
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML", 
                reply_to_message_id: msg.message_id
            }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🖼️ WEBSITE SCREENSHOT SYSTEM - SSWEB
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/ssweb(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];
    const sswebApi = 'https://api.resellergaming.my.id/tools/ssweb';

    if (!url) {
        const helpMessage = `<blockquote>┌─⧼ <b>WEBSITE SCREENSHOT</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>FITUR SSWEB</b> ⧽
├ 🖼️ Screenshot website otomatis
├ ⚡ High quality image
├ 🌐 Support berbagai website
├ ⚡ Powered by ResellerGaming API
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ /ssweb [url_website]
├ 
├ 💡 Contoh:
├ /ssweb https://google.com
├ /ssweb https://github.com
╰──────────────

┌─⧼ <b>PERINGATAN</b> ⧽
├ ⚠️ Hanya website publik
├ 🚫 Tidak support login required
├ 📛 Gunakan dengan bijak
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    let validUrl;
    try {
        validUrl = new URL(url);
        if (!['http:', 'https:'].includes(validUrl.protocol)) {
            throw new Error('Protocol tidak valid');
        }
    } catch (error) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>SSWEB ERROR</b> ⧽
├ ❌ URL tidak valid!
├ 
├ 💡 Pastikan URL lengkap dengan http:// atau https://
├ Contoh: https://example.com
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    let processingMsg;

    try {
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WEBSITE SCREENSHOT</b> ⧽
├ ⏳ Memproses screenshot...
├ 
├ 🌐 URL: ${url}
├ ⏱️ Mohon tunggu...
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `${sswebApi}?url=${encodedUrl}`;

        const response = await axios({
            method: 'GET',
            url: apiUrl,
            timeout: 45000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, */*'
            }
        });

        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = response.data;

        if (!data.status || !data.result) {
            throw new Error('API gagal mengambil screenshot');
        }

        const imageUrl = data.result;

        const imageResponse = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 30000
        });

        if (!imageResponse.data || imageResponse.data.length < 100) {
            throw new Error('Gambar screenshot tidak valid');
        }

        const screenshotBuffer = Buffer.from(imageResponse.data);

        await bot.sendPhoto(chatId, screenshotBuffer, {
            caption: `<blockquote>┌─⧼ <b>WEBSITE SCREENSHOT</b> ⧽
├ ✅ Screenshot berhasil!
├ 
├ 🌐 URL: <code>${url}</code>
├ ⚡ Powered by BotzMarket Panel
╰──────────────</blockquote>`,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });

        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.log('SSWeb Error:', error.message);
        
        if (processingMsg) {
            try {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            } catch (deleteError) {
                console.log('Gagal menghapus pesan processing:', deleteError.message);
            }
        }
        
        let errorMessage = 'Gagal mengambil screenshot';
        
        if (error.response) {
            if (error.response.status === 404) {
                errorMessage = 'Website tidak ditemukan atau tidak dapat diakses';
            } else if (error.response.status === 403) {
                errorMessage = 'Website memblokir akses screenshot';
            } else if (error.response.status === 500) {
                errorMessage = 'Server API sedang gangguan';
            } else {
                errorMessage = `Error ${error.response.status}: ${error.response.statusText}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Website terlalu lama merespon (timeout)';
        } else if (error.message.includes('tidak valid')) {
            errorMessage = 'URL tidak valid atau website tidak dapat diakses';
        } else if (error.message.includes('API gagal')) {
            errorMessage = 'API tidak dapat mengambil screenshot website ini';
        } else {
            errorMessage = error.message;
        }

        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>SSWEB ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ ┌─⧼ <b>SOLUSI</b> ⧽
├ │ • Gunakan website publik
├ │ • Hindari website login required  
├ │ • Coba website lain
├ │ • Tunggu beberapa menit
├ ╰──────────────
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML", 
                reply_to_message_id: msg.message_id
            }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 WELCOME & GOODBYE COMMANDS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Set Welcome Text
bot.onText(/\/setwelcome(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (msg.chat.type === "private") {
        return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di grup!");
    }
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, "❌ Hanya admin yang bisa menggunakan command ini!");
    }
    
    const text = match[1];
    if (!text) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>SET WELCOME</b> ⧽
├ ❌ Format salah!
├ 
├ 💡 Penggunaan:
├ /setwelcome [teks]
├ 
├ 🎯 Variabel yang tersedia:
├ {name} - Nama user
├ {username} - Username user
├ {group} - Nama grup
├ 
├ 💡 Contoh:
├ /setwelcome Selamat datang {name} di {group}! 🎉
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }
    
    const settings = loadWelcomeGoodbyeSettings();
    if (!settings[chatId]) {
        settings[chatId] = {
            welcome: { enabled: false, text: "" },
            goodbye: { enabled: false, text: "" }
        };
    }
    
    settings[chatId].welcome.text = text;
    saveWelcomeGoodbyeSettings(settings);
    
    await bot.sendMessage(chatId,
        `<blockquote>┌─⧼ <b>SET WELCOME</b> ⧽
├ ✅ Teks welcome berhasil disimpan!
├ 
├ 📝 Teks:
├ ${text}
├ 
├ 🔧 Gunakan:
├ /welcome on - Aktifkan welcome
├ /welcome off - Nonaktifkan welcome
╰──────────────</blockquote>`,
        { parse_mode: "HTML", reply_to_message_id: msg.message_id }
    );
});

// Set Goodbye Text
bot.onText(/\/setgoodbye(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (msg.chat.type === "private") {
        return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di grup!");
    }
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, "❌ Hanya admin yang bisa menggunakan command ini!");
    }
    
    const text = match[1];
    if (!text) {
        return bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>SET GOODBYE</b> ⧽
├ ❌ Format salah!
├ 
├ 💡 Penggunaan:
├ /setgoodbye [teks]
├ 
├ 🎯 Variabel yang tersedia:
├ {name} - Nama user
├ {username} - Username user
├ {group} - Nama grup
├ 
├ 💡 Contoh:
├ /setgoodbye Sampai jumpa {name}! 👋
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }
    
    const settings = loadWelcomeGoodbyeSettings();
    if (!settings[chatId]) {
        settings[chatId] = {
            welcome: { enabled: false, text: "" },
            goodbye: { enabled: false, text: "" }
        };
    }
    
    settings[chatId].goodbye.text = text;
    saveWelcomeGoodbyeSettings(settings);
    
    await bot.sendMessage(chatId,
        `<blockquote>┌─⧼ <b>SET GOODBYE</b> ⧽
├ ✅ Teks goodbye berhasil disimpan!
├ 
├ 📝 Teks:
├ ${text}
├ 
├ 🔧 Gunakan:
├ /goodbye on - Aktifkan goodbye
├ /goodbye off - Nonaktifkan goodbye
╰──────────────</blockquote>`,
        { parse_mode: "HTML", reply_to_message_id: msg.message_id }
    );
});

// Welcome On/Off
bot.onText(/\/welcome\s+(on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const action = match[1];
    
    if (msg.chat.type === "private") {
        return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di grup!");
    }
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, "❌ Hanya admin yang bisa menggunakan command ini!");
    }
    
    const settings = loadWelcomeGoodbyeSettings();
    if (!settings[chatId]) {
        settings[chatId] = {
            welcome: { enabled: false, text: "Selamat datang {name} di grup! 🎉" },
            goodbye: { enabled: false, text: "Sampai jumpa {name}! 👋" }
        };
    }
    
    const isEnabled = action === 'on';
    settings[chatId].welcome.enabled = isEnabled;
    saveWelcomeGoodbyeSettings(settings);
    
    await bot.sendMessage(chatId,
        `<blockquote>┌─⧼ <b>WELCOME SYSTEM</b> ⧽
├ ${isEnabled ? '✅' : '❌'} Welcome message ${isEnabled ? 'diaktifkan' : 'dinonaktifkan'}!
├ 
├ 💡 Status: ${isEnabled ? 'AKTIF' : 'NONAKTIF'}
├ 📝 Teks: ${settings[chatId].welcome.text}
╰──────────────</blockquote>`,
        { parse_mode: "HTML", reply_to_message_id: msg.message_id }
    );
});

// Goodbye On/Off
bot.onText(/\/goodbye\s+(on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const action = match[1];
    
    if (msg.chat.type === "private") {
        return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di grup!");
    }
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, "❌ Hanya admin yang bisa menggunakan command ini!");
    }
    
    const settings = loadWelcomeGoodbyeSettings();
    if (!settings[chatId]) {
        settings[chatId] = {
            welcome: { enabled: false, text: "Selamat datang {name} di grup! 🎉" },
            goodbye: { enabled: false, text: "Sampai jumpa {name}! 👋" }
        };
    }
    
    const isEnabled = action === 'on';
    settings[chatId].goodbye.enabled = isEnabled;
    saveWelcomeGoodbyeSettings(settings);
    
    await bot.sendMessage(chatId,
        `<blockquote>┌─⧼ <b>GOODBYE SYSTEM</b> ⧽
├ ${isEnabled ? '✅' : '❌'} Goodbye message ${isEnabled ? 'diaktifkan' : 'dinonaktifkan'}!
├ 
├ 💡 Status: ${isEnabled ? 'AKTIF' : 'NONAKTIF'}
├ 📝 Teks: ${settings[chatId].goodbye.text}
╰──────────────</blockquote>`,
        { parse_mode: "HTML", reply_to_message_id: msg.message_id }
    );
});

// Check Welcome/Goodbye Settings
bot.onText(/\/welcomesettings/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.chat.type === "private") {
        return bot.sendMessage(chatId, "❌ Command ini hanya bisa digunakan di grup!");
    }
    
    const groupSettings = getGroupSettings(chatId);
    
    await bot.sendMessage(chatId,
        `<blockquote>┌─⧼ <b>WELCOME/GOODBYE SETTINGS</b> ⧽
├ 👋 Welcome: ${groupSettings.welcome.enabled ? '✅ AKTIF' : '❌ NONAKTIF'}
├ 📝 Teks: ${groupSettings.welcome.text}
├ 
├ 👋 Goodbye: ${groupSettings.goodbye.enabled ? '✅ AKTIF' : '❌ NONAKTIF'}
├ 📝 Teks: ${groupSettings.goodbye.text}
├ 
├ 🔧 Commands:
├ /setwelcome [teks] - Set teks welcome
├ /setgoodbye [teks] - Set teks goodbye
├ /welcome on/off - Aktifkan/nonaktifkan welcome
├ /goodbye on/off - Aktifkan/nonaktifkan goodbye
╰──────────────</blockquote>`,
        { parse_mode: "HTML", reply_to_message_id: msg.message_id }
    );
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎵 SIMPLE MUSIC PLAYER COMMAND
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/play(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];

    // Jika tidak ada query, tampilkan cara penggunaan
    if (!query) {
        const helpMessage = `<blockquote>┌─⧼ <b>MUSIC PLAYER</b> ⧽
├ 🎵 Download lagu dari YouTube
├ 
├ 💡 <b>Penggunaan:</b>
├ /play [judul_lagu]
├ 
├ 🎯 <b>Contoh:</b>
├ /play melepasmu
├ /play alan walker faded
├ /play coldplay paradise
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    let processingMsg;

    try {
        // Kirim pesan processing
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>MUSIC PLAYER</b> ⧽
├ 🔍 Mencari: <b>${query}</b>
├ ⏳ Mohon tunggu...
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        // Encode query untuk URL
        const encodedQuery = encodeURIComponent(query);
        const apiUrl = `https://api.vreden.my.id/api/v1/download/play/audio?query=${encodedQuery}`;

        // Request ke API music
        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const data = response.data;

        // Cek jika response valid
        if (!data.status || !data.result || !data.result.download) {
            throw new Error('Lagu tidak ditemukan');
        }

        const metadata = data.result.metadata;
        const download = data.result.download;

        // Update pesan processing
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>MUSIC PLAYER</b> ⧽
├ ✅ <b>${metadata.title}</b>
├ 👤 ${metadata.author.name}
├ ⏱️ ${metadata.timestamp}
├ 📥 Mendownload...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        // Download audio file langsung dari URL
        const audioResponse = await axios({
            method: 'GET',
            url: download.url,
            responseType: 'stream',
            timeout: 60000
        });

        // Convert stream ke buffer
        const chunks = [];
        for await (const chunk of audioResponse.data) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        // Hapus pesan processing sebelum kirim audio
        await bot.deleteMessage(chatId, processingMsg.message_id);

        // Kirim audio langsung ke Telegram
        await bot.sendAudio(chatId, audioBuffer, {
            caption: `<blockquote>┌─⧼ <b>MUSIC PLAYER</b> ⧽
├ 🎵 <b>${metadata.title}</b>
├ 
├ 👤 <b>Artist:</b> ${metadata.author.name}
├ ⏱️ <b>Durasi:</b> ${metadata.timestamp}
├ 🎶 <b>Kualitas:</b> ${download.quality}
├ 🔍 <b>Pencarian:</b> ${query}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Nikmati musik dalam kegelapan</i>
╰──────────────</blockquote></blockquote>`,
            parse_mode: "HTML",
            title: metadata.title.substring(0, 64),
            performer: metadata.author.name.substring(0, 64),
            reply_to_message_id: msg.message_id
        });

    } catch (error) {
        console.log('Music Player Error:', error.message);
        
        // Hapus pesan processing jika ada error
        if (processingMsg) {
            try {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            } catch (deleteError) {
                console.log('Gagal menghapus pesan processing:', deleteError.message);
            }
        }
        
        // Tentukan pesan error
        let errorMessage = 'Gagal memproses permintaan musik';
        
        if (error.response) {
            if (error.response.status === 404) {
                errorMessage = 'Lagu tidak ditemukan di YouTube';
            } else if (error.response.status === 429) {
                errorMessage = 'Terlalu banyak request, coba lagi nanti';
            } else {
                errorMessage = `Error ${error.response.status}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Timeout: Proses terlalu lama';
        } else if (error.message.includes('tidak ditemukan')) {
            errorMessage = 'Lagu tidak ditemukan, coba judul lain';
        }

        // Kirim pesan error
        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>MUSIC ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ 💡 <b>Tips:</b>
├ • Gunakan judul yang lebih spesifik
├ • Cek penulisan judul lagu
├ • Tunggu beberapa detik lalu coba lagi
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML", 
                reply_to_message_id: msg.message_id
            }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 MAIN COMMAND HANDLERS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Command /start - DIPERBAIKI
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (shouldIgnoreMessage(msg)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>MODUS GRUP</b> ⧽
├ ❌ Bot hanya bisa digunakan di grup!
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
    
    try {
        const status = getSimpleUserStatus(msg.from.id);
        const menuText = MAIN_MENU(msg, status);
        
        await bot.sendPhoto(chatId, settings.pp, {
            caption: menuText,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🎭 BUAT PANEL", callback_data: "createpanel" },
                        { text: "🤖 AI CHATBOT", callback_data: "ai_menu" }
                    ],
                    [
                        { text: "🆔 CEK ID", callback_data: "cekid" },
                        { text: "🦠 ALLMENU", callback_data: "allmenu" }
                    ],
                    [
                        { text: "💀 MENU OWNER", callback_data: "ownermenu" },
                        { text: "👁️ KONTAK", callback_data: "contact" }
                    ],
                    [
                        { text: "🕯️ DUKUNGAN", url: "https://t.me/botzmarket95" }
                    ]
                ]
            }
        });
    } catch (error) {
        console.log('Media error:', error.message);
        const status = getSimpleUserStatus(msg.from.id);
        const menuText = MAIN_MENU(msg, status);
        
        bot.sendMessage(chatId, menuText, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🎭 BUAT PANEL", callback_data: "createpanel" },
                        { text: "🤖 AI CHATBOT", callback_data: "ai_menu" }
                    ],
                    [
                        { text: "🆔 CEK ID", callback_data: "cekid" },
                        { text: "🦠 ALLMENU", callback_data: "allmenu" }
                    ],
                    [
                        { text: "💀 MENU OWNER", callback_data: "ownermenu" },
                        { text: "👁️ KONTAK", callback_data: "contact" }
                    ],
                    [
                        { text: "🕯️ DUKUNGAN", url: "https://t.me/botzmarket95" }
                    ]
                ]
            }
        });
    }
});

// Command /cekid
bot.onText(/\/cekid/, (msg) => {
    if (shouldIgnoreMessage(msg)) return;
    const chatId = msg.chat.id;
    const sender = msg.from.username;
    const id = msg.from.id;
    const text12 = `<blockquote>┌─⧼ <b>IDENTITAS</b> ⧽
├ Hi @${sender}
├ 🔑 ID Telegram: <code>${id}</code>
├ 👤 Full Name: @${sender}
├ 🎯 Status: ${isOwner(id) ? 'OWNER' : isPremium(id) ? 'PREMIUM' : 'USER'}
╰──────────────</blockquote>`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🕯️ Testimoni", url: "https://t.me/botzmarket95" },
                    { text: "🔮 Produk Lain", url: "https://t.me/botzmarket95" },
                ],
                [{ text: "👁️ OWNER", url: "https://t.me/botzmarket95" }],
            ],
        },
    };
    
    bot.sendAnimation(chatId, settings.pp, {
        caption: text12,
        parse_mode: "HTML",
        reply_markup: keyboard,
    });
});

bot.onText(/\/clearusr(.*)/, async (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const excludedUsers = match[1] ? match[1].trim().split(' ') : [];

    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Fitur khusus admin!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Hanya yang terpilih bisa membersihkan</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        // Kirim pesan processing
        const processingMsg = await bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>PEMBERSIHAN USER</b> ⧽
├ 🔄 Memulai proses pembersihan...
├ ⬡ Mengambil daftar user
├ ⬡ Filter user yang dikecualikan
├ ⬡ Menghapus user terpilih
╰──────────────</blockquote>`,
            { parse_mode: "HTML" }
        );

        let response = await fetch(`${CONFIG.domain}/api/application/users`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`,
            }
        });

        let users = await response.json();
        if (!users || users.errors) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Gagal mengambil daftar user!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        let usersToDelete = users.data.filter(user => !excludedUsers.includes(user.attributes.id.toString()));

        if (usersToDelete.length === 0) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ Tidak ada user untuk dihapus!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Sudah bersih dari jiwa asing</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        // Update pesan dengan progress
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>PEMBERSIHAN USER</b> ⧽
├ 🔄 Menghapus ${usersToDelete.length} user...
├ ⬡ Progress: 0/${usersToDelete.length}
├ ⬡ Estimated: Calculating...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < usersToDelete.length; i++) {
            let user = usersToDelete[i];
            try {
                let deleteResponse = await fetch(`${CONFIG.domain}/api/application/users/${user.attributes.id}`, {
                    method: "DELETE",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${CONFIG.plta}`,
                    }
                });

                if (deleteResponse.ok) {
                    successCount++;
                    console.log(`✅ Sukses menghapus user ${user.attributes.id}`);
                } else {
                    failedCount++;
                    console.log(`❌ Gagal menghapus user ${user.attributes.id}`);
                }

                // Update progress setiap 5 user atau di akhir
                if ((i + 1) % 5 === 0 || i === usersToDelete.length - 1) {
                    const progress = Math.round(((i + 1) / usersToDelete.length) * 100);
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>PEMBERSIHAN USER</b> ⧽
├ 🔄 Menghapus ${usersToDelete.length} user...
├ ⬡ Progress: ${i + 1}/${usersToDelete.length} (${progress}%)
├ ⬡ Berhasil: ${successCount} | Gagal: ${failedCount}
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: "HTML"
                        }
                    );
                }
            } catch (error) {
                failedCount++;
                console.error(`Error menghapus user ${user.attributes.id}:`, error);
            }
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>PEMBERSIHAN SELESAI</b> ⧽
├ ✅ Berhasil menghapus <b>${successCount}</b> user!
├ 
├ ┌─⧼ <b>STATISTIK</b> ⧽
├ │ • 📊 Total diproses: <b>${usersToDelete.length}</b>
├ │ • ✅ Berhasil: <b>${successCount}</b>
├ │ • ❌ Gagal: <b>${failedCount}</b>
├ │ • 🛡️ Dikecualikan: <b>${excludedUsers.length}</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan telah dibersihkan</i>
╰──────────────</blockquote></blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Terjadi kesalahan saat menghapus user.
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});

bot.onText(/\/clearsrv(.*)/, async (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const excludedServers = match[1] ? match[1].trim().split(' ') : [];

    try {
        if (!isAdmin(msg.from.id)) {
            return bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Fitur khusus admin!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Hanya yang terpilih bisa membersihkan</i>
╰──────────────</blockquote></blockquote>`, 
                { parse_mode: "HTML" }
            );
        }

        // Kirim pesan processing
        const processingMsg = await bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>PEMBERSIHAN SERVER</b> ⧽
├ 🔄 Memulai proses pembersihan...
├ ⬡ Mengambil daftar server
├ ⬡ Filter server yang dikecualikan
├ ⬡ Menghapus server terpilih
╰──────────────</blockquote>`,
            { parse_mode: "HTML" }
        );

        let serversData;
        try {
            const response = await fetch(`${CONFIG.domain}/api/application/servers`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${CONFIG.plta}`
                }
            });

            if (!response.ok) {
                await bot.editMessageText(
                    `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Gagal mengambil daftar server!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`,
                    {
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                        parse_mode: "HTML"
                    }
                );
                return;
            }

            serversData = await response.json();
        } catch (error) {
            console.error('Error saat mengambil daftar server:', error);
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Terjadi kesalahan saat mengambil daftar server.
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        if (!serversData || !serversData.data || !Array.isArray(serversData.data)) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ Data server tidak valid atau kosong!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Tidak ada yang perlu dibersihkan</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        let serversToDelete = serversData.data.filter(server => 
            !excludedServers.includes(server.attributes.id.toString())
        );

        if (serversToDelete.length === 0) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ Tidak ada server untuk dihapus!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Sudah bersih dari server asing</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        // Update pesan dengan progress
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>PEMBERSIHAN SERVER</b> ⧽
├ 🔄 Menghapus ${serversToDelete.length} server...
├ ⬡ Progress: 0/${serversToDelete.length}
├ ⬡ Estimated: Calculating...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < serversToDelete.length; i++) {
            let server = serversToDelete[i];
            try {
                const deleteResponse = await fetch(`${CONFIG.domain}/api/application/servers/${server.attributes.id}`, {
                    method: "DELETE",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${CONFIG.plta}`
                    }
                });

                if (deleteResponse.ok) {
                    successCount++;
                    console.log(`✅ Sukses menghapus server ${server.attributes.id}`);
                } else {
                    failedCount++;
                    console.log(`❌ Gagal menghapus server ${server.attributes.id}`);
                }

                // Update progress setiap 3 server atau di akhir
                if ((i + 1) % 3 === 0 || i === serversToDelete.length - 1) {
                    const progress = Math.round(((i + 1) / serversToDelete.length) * 100);
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>PEMBERSIHAN SERVER</b> ⧽
├ 🔄 Menghapus ${serversToDelete.length} server...
├ ⬡ Progress: ${i + 1}/${serversToDelete.length} (${progress}%)
├ ⬡ Berhasil: ${successCount} | Gagal: ${failedCount}
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: "HTML"
                        }
                    );
                }
            } catch (error) {
                failedCount++;
                console.error(`Error saat menghapus server ${server.attributes.id}:`, error);
            }
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>PEMBERSIHAN SELESAI</b> ⧽
├ ✅ Berhasil menghapus <b>${successCount}</b> server!
├ 
├ ┌─⧼ <b>STATISTIK</b> ⧽
├ │ • 📊 Total diproses: <b>${serversToDelete.length}</b>
├ │ • ✅ Berhasil: <b>${successCount}</b>
├ │ • ❌ Gagal: <b>${failedCount}</b>
├ │ • 🛡️ Dikecualikan: <b>${excludedServers.length}</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Dunia server telah dibersihkan</i>
╰──────────────</blockquote></blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

    } catch (error) {
        console.error('Error utama:', error);
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Terjadi kesalahan tak terduga.
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan sangat terganggu</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});
// Enhance Command
bot.onText(/\/enhance/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ENHANCE ERROR</b> ⧽
├ ❌ Silakan reply gambar yang ingin di-enhance!
├ 
├ 💡 Cara penggunaan:
├ 1. Reply sebuah gambar
├ 2. Ketik /enhance
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    const repliedMessage = msg.reply_to_message;
    
    let fileId;
    if (repliedMessage.photo) {
        fileId = repliedMessage.photo[repliedMessage.photo.length - 1].file_id;
    } else if (repliedMessage.document && repliedMessage.document.mime_type.startsWith('image/')) {
        fileId = repliedMessage.document.file_id;
    } else {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ENHANCE ERROR</b> ⧽
├ ❌ Message yang di-reply bukan gambar!
├ 
├ 💡 Hanya support file gambar (JPG, PNG, dll)
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    try {
        const processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>IMAGE ENHANCER</b> ⧽
├ ⏳ Memproses gambar...
├ 
├ 🖼️ Enhancing image quality
├ ⚡ Using AI technology
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        const fileLink = await bot.getFileLink(fileId);
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        const enhancedBuffer = await enhanceImage(imageBuffer, { size: 'high' });

        await bot.sendPhoto(chatId, enhancedBuffer, {
            caption: `<blockquote>┌─⧼ <b>IMAGE ENHANCER</b> ⧽
├ ✅ Gambar berhasil di-enhance!
├ 
├ 🖼️ Enhanced by BotzMarket Panel
├ ⚡ Powered by ihancer.com
╰──────────────</blockquote>`,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });

        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.log('Enhance Error:', error.message);
        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ENHANCE ERROR</b> ⧽
├ ❌ Gagal memproses gambar
├ Error: ${error.message}
├ 
├ 🔧 Silakan coba lagi nanti
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }
});

// Image Quote Creator Command
bot.onText(/\/iqc(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1];

    if (!text) {
        const helpMessage = `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Developer : Risky Dinata
╰───────────────

┌─⧼ <b>FITUR IQC</b> ⧽
├ 🎨 Buat gambar dari teks
├ 💬 Format seperti WhatsApp
├ ⚡ Cepat dan mudah
├ 🎯 Support emoji & simbol
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ /iqc [teks_anda]
├ 
├ 💡 Contoh:
├ /iqc semoga harimu menyenangkan
├ /iqc Hello world! 🌍
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    if (text.length > 500) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>IQC ERROR</b> ⧽
├ ❌ Teks terlalu panjang!
├ 
├ 💡 Maksimal 500 karakter
├ Teks Anda: ${text.length} karakter
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    let processingMsg;

    try {
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ ⏳ Memulai proses pembuatan gambar...
├ 
├ 💭 Teks: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        const encodedText = encodeURIComponent(text);
        const apiUrl = `https://smail.my.id/iqc?text=${encodedText}`;

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ 🔄 Menyiapkan generator gambar...
├ 
├ ⏱️ Tunggu sebentar...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        await new Promise(resolve => setTimeout(resolve, 2000));

        let apiResponse;
        let retryCount = 0;
        const maxRetries = 4;
        let lastError = null;

        while (retryCount < maxRetries) {
            try {
                await bot.editMessageText(
                    `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ 📡 Membuat gambar (${retryCount + 1}/${maxRetries})...
├ 
├ ⏳ Mohon tunggu dengan sabar...
╰──────────────</blockquote>`,
                    {
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                        parse_mode: "HTML"
                    }
                );

                const waitTime = 1500 + (retryCount * 1000);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                apiResponse = await axios.get(apiUrl, {
                    timeout: 30000,
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                        'Accept': 'image/*, */*',
                        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache'
                    },
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });

                if (apiResponse.status === 400) {
                    lastError = new Error(`API Error 400: Bad Request - Teks mungkin tidak valid`);
                    retryCount++;
                    continue;
                }

                if (apiResponse.status === 429) {
                    lastError = new Error(`API Error 429: Too Many Requests - Terlalu banyak request`);
                    await new Promise(resolve => setTimeout(resolve, 4000));
                    retryCount++;
                    continue;
                }

                if (apiResponse.status !== 200) {
                    lastError = new Error(`API Error ${apiResponse.status}: ${apiResponse.statusText}`);
                    retryCount++;
                    continue;
                }

                if (!apiResponse.data || apiResponse.data.length === 0) {
                    lastError = new Error('API mengembalikan gambar kosong');
                    retryCount++;
                    continue;
                }

                break;

            } catch (error) {
                lastError = error;
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw lastError;
                }

                const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ ✅ Gambar berhasil dibuat!
├ 
├ 📤 Mengunggah ke Telegram...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        await new Promise(resolve => setTimeout(resolve, 1000));

        const imageBuffer = Buffer.from(apiResponse.data);

        if (imageBuffer.length < 100) {
            throw new Error('Gambar yang dihasilkan terlalu kecil atau tidak valid');
        }

        await bot.sendPhoto(chatId, imageBuffer, {
            caption: `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ ✅ Gambar berhasil dibuat!
├ 
├ 💬 Teks: "${text}"
├ 🎨 BotzMarket Panel
╰──────────────</blockquote>`,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });

        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.log('IQC API Error:', error.message);
        
        try {
            if (processingMsg) {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            }
        } catch (deleteError) {
            console.log('Gagal menghapus pesan processing:', deleteError.message);
        }
        
        let errorMessage = 'Gagal membuat gambar';
        
        if (error.response) {
            switch (error.response.status) {
                case 400:
                    errorMessage = 'Error 400: Request tidak valid - teks mungkin mengandung karakter tidak didukung';
                    break;
                case 404:
                    errorMessage = 'Error 404: API endpoint tidak ditemukan';
                    break;
                case 429:
                    errorMessage = 'Error 429: Terlalu banyak request - tunggu beberapa menit';
                    break;
                case 500:
                    errorMessage = 'Error 500: Server API sedang gangguan';
                    break;
                case 502:
                    errorMessage = 'Error 502: Bad Gateway - server sedang maintenance';
                    break;
                case 503:
                    errorMessage = 'Error 503: Service Unavailable - coba lagi nanti';
                    break;
                default:
                    errorMessage = `Error ${error.response.status}: ${error.response.statusText}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Timeout: API terlalu lama merespons (30 detik)';
        } else if (error.message.includes('gambar kosong')) {
            errorMessage = 'API mengembalikan gambar kosong - coba dengan teks berbeda';
        } else if (error.message.includes('terlalu kecil')) {
            errorMessage = 'Gambar tidak valid dihasilkan - teks mungkin tidak didukung';
        } else {
            errorMessage = error.message;
        }

        const retryKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: "🔄 COBA LAGI",
                        callback_data: `iqc_retry:${encodeURIComponent(text)}`
                    },
                    {
                        text: "📝 TEKS BARU",
                        callback_data: "iqc_new"
                    }
                ]
            ]
        };

        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>IQC ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ 🔧 Solusi:
├ • Coba dengan teks lebih pendek
├ • Hindari karakter spesial tertentu
├ • Tunggu 1-2 menit lalu coba lagi
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML", 
                reply_to_message_id: msg.message_id,
                reply_markup: retryKeyboard
            }
        );
    }
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📱 TIKTOK DOWNLOADER
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/tt(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];

    if (!url) {
        const helpMessage = `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Developer : Risky Dinata
╰───────────────

┌─⧼ <b>FITUR TIKTOK</b> ⧽
├ 📱 Download video TikTok
├ 🎵 Download audio MP3
├ 🎬 Kualitas SD & HD
├ ⚡ Tanpa watermark
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ /tt [url_tiktok]
├ 
├ 💡 Contoh:
├ /tt https://vt.tiktok.com/ZSy7k6e6U/
├ /tt https://www.tiktok.com/@user/video/123456
╰──────────────

┌─⧼ <b>SUPPORTED URL</b> ⧽
├ ✅ vt.tiktok.com
├ ✅ www.tiktok.com
├ ✅ tiktok.com
├ ✅ vm.tiktok.com
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    const tiktokPattern = /(vt\.tiktok\.com|tiktok\.com|www\.tiktok\.com|vm\.tiktok\.com)/;
    if (!tiktokPattern.test(url)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>TIKTOK ERROR</b> ⧽
├ ❌ URL TikTok tidak valid!
├ 
├ 💡 Pastikan URL dari TikTok
├ Contoh: https://vt.tiktok.com/ZSy7k6e6U/
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    let processingMsg;

    try {
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ ⏳ Memulai proses download...
├ 
├ 🔗 ${url}
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `https://api.nvidiabotz.xyz/download/tiktok?url=${encodedUrl}`;

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ 🔄 Menyiapkan sistem...
├ 
├ ⏱️ Tunggu sebentar...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        await new Promise(resolve => setTimeout(resolve, 2000));

        let apiResponse;
        let retryCount = 0;
        const maxRetries = 5;
        let lastError = null;

        while (retryCount < maxRetries) {
            try {
                await bot.editMessageText(
                    `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ 📡 Request ke API (${retryCount + 1}/${maxRetries})...
├ 
├ ⏳ Mohon tunggu dengan sabar...
╰──────────────</blockquote>`,
                    {
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                        parse_mode: "HTML"
                    }
                );

                const waitTime = 1000 + (retryCount * 1500);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                apiResponse = await axios.get(apiUrl, {
                    timeout: 45000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache'
                    },
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });

                if (apiResponse.status === 400) {
                    lastError = new Error(`API Error 400: Bad Request - Mungkin URL tidak valid`);
                    retryCount++;
                    continue;
                }

                if (apiResponse.status === 429) {
                    lastError = new Error(`API Error 429: Too Many Requests - Terlalu banyak request`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retryCount++;
                    continue;
                }

                if (apiResponse.status !== 200) {
                    lastError = new Error(`API Error ${apiResponse.status}: ${apiResponse.statusText}`);
                    retryCount++;
                    continue;
                }

                break;

            } catch (error) {
                lastError = error;
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw lastError;
                }

                const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ ✅ API Response diterima!
├ 
├ 📊 Memproses data video...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        await new Promise(resolve => setTimeout(resolve, 1500));

        const result = apiResponse.data;

        if (!result || typeof result !== 'object') {
            throw new Error('Format response API tidak valid');
        }

        if (!result.status) {
            throw new Error(result.message || 'API mengembalikan status false');
        }

        if (!result.result) {
            throw new Error('Data video tidak ditemukan dalam response');
        }

        const videoData = result.result;

        if (!videoData.video_sd && !videoData.video_hd && !videoData.mp3) {
            throw new Error('Tidak ada link download yang tersedia');
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ 🎬 Menyiapkan tombol download...
├ 
├ ⏰ Hampir selesai...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        await new Promise(resolve => setTimeout(resolve, 1000));

        const caption = `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ 📱 ${videoData.title ? videoData.title.substring(0, 50) + (videoData.title.length > 50 ? '...' : '') : 'Video TikTok'}
├ 
├ 🎬 Pilih kualitas download:
├ ⚡ BotzMarket Panel
╰──────────────</blockquote>`;

        const buttons = [];

        if (videoData.video_sd && videoData.video_sd.startsWith('http')) {
            buttons.push([
                {
                    text: "🎬 VIDEO SD",
                    url: videoData.video_sd
                }
            ]);
        }

        if (videoData.video_hd && videoData.video_hd.startsWith('http')) {
            if (buttons.length === 0) {
                buttons.push([]);
            }
            buttons[0].push({
                text: "🎬 VIDEO HD", 
                url: videoData.video_hd
            });
        } else if (videoData.video_sd && videoData.video_sd.startsWith('http')) {
            if (buttons.length === 0) {
                buttons.push([]);
            }
            buttons[0].push({
                text: "🎬 VIDEO HD", 
                url: videoData.video_sd
            });
        }

        if (videoData.mp3 && videoData.mp3.startsWith('http')) {
            buttons.push([
                {
                    text: "🎵 DOWNLOAD MP3",
                    url: videoData.mp3
                }
            ]);
        }

        buttons.push([
            {
                text: "🔄 COBA VIDEO LAIN",
                callback_data: "tt_new"
            }
        ]);

        const keyboard = {
            inline_keyboard: buttons
        };

        if (videoData.thumbnail && videoData.thumbnail.startsWith('http')) {
            try {
                await bot.sendPhoto(chatId, videoData.thumbnail, {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                    reply_to_message_id: msg.message_id
                });
            } catch (photoError) {
                await bot.sendMessage(chatId, caption, {
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                    reply_to_message_id: msg.message_id
                });
            }
        } else {
            await bot.sendMessage(chatId, caption, {
                parse_mode: "HTML",
                reply_markup: keyboard,
                reply_to_message_id: msg.message_id
            });
        }

        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.log('TikTok Downloader Error:', error.message);
        
        try {
            if (processingMsg) {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            }
        } catch (deleteError) {
            console.log('Gagal menghapus pesan processing:', deleteError.message);
        }
        
        let errorMessage = 'Gagal mengunduh video TikTok';
        
        if (error.response) {
            switch (error.response.status) {
                case 400:
                    errorMessage = 'Error 400: Request tidak valid - cek URL TikTok';
                    break;
                case 404:
                    errorMessage = 'Error 404: Video tidak ditemukan atau dihapus';
                    break;
                case 429:
                    errorMessage = 'Error 429: Terlalu banyak request - tunggu beberapa menit';
                    break;
                case 500:
                    errorMessage = 'Error 500: Server API sedang gangguan';
                    break;
                case 502:
                    errorMessage = 'Error 502: Bad Gateway - server sedang maintenance';
                    break;
                case 503:
                    errorMessage = 'Error 503: Service Unavailable - coba lagi nanti';
                    break;
                default:
                    errorMessage = `Error ${error.response.status}: ${error.response.statusText}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Timeout: API terlalu lama merespons';
        } else if (error.message.includes('URL tidak valid')) {
            errorMessage = 'URL TikTok tidak valid atau tidak didukung';
        } else if (error.message.includes('Format response')) {
            errorMessage = 'Response API tidak sesuai format';
        } else {
            errorMessage = error.message;
        }

        const retryKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: "🔄 COBA LAGI",
                        callback_data: `tt_retry:${encodeURIComponent(url)}`
                    },
                    {
                        text: "📝 VIDEO BARU",
                        callback_data: "tt_new"
                    }
                ]
            ]
        };

        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>TIKTOK ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ 🔧 Solusi:
├ • Pastikan URL TikTok valid
├ • Coba lagi dalam 1-2 menit
├ • Gunakan URL yang berbeda
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML", 
                reply_to_message_id: msg.message_id,
                reply_markup: retryKeyboard
            }
        );
    }
});
// Handler untuk semua pesan text (AI Auto Response)
bot.on('text', async (msg) => {
    if (msg.text.startsWith('/') || !aiEnabled) return;
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.length < 2) return;

    let processingMsg = null;

    try {
        processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AI CHATBOT</b> ⧽
├ ⏳ Memproses pesan...
├ 💭 "${text.substring(0, 20)}..."
╰──────────────</blockquote>`,
            { parse_mode: "HTML" }
        );

        let aiResponse;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
            try {
                aiResponse = await openaiChat(text);
                break;
            } catch (error) {
                retryCount++;
                if (retryCount > maxRetries) throw error;
                console.log(`AI API retry ${retryCount}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (aiResponse && aiResponse.choices && aiResponse.choices[0]) {
            const replyText = aiResponse.choices[0].message.content;
            
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>AI CHATBOT</b> ⧽
├ ✅ Response AI diterima
├ 🎵 Mengkonversi ke suara...
╰──────────────</blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );

            let audioBuffer;
            retryCount = 0;
            
            while (retryCount <= maxRetries) {
                try {
                    audioBuffer = await textToAudioBuffer(replyText);
                    break;
                } catch (error) {
                    retryCount++;
                    if (retryCount > maxRetries) throw error;
                    console.log(`TTS API retry ${retryCount}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            await bot.sendVoice(chatId, audioBuffer, {
                reply_to_message_id: msg.message_id
            });

            await bot.deleteMessage(chatId, processingMsg.message_id);
            
        } else {
            throw new Error("Tidak ada response dari AI");
        }
        
    } catch (error) {
        console.log('AI Processing Error:', error.message);
        
        if (processingMsg) {
            try {
                await bot.deleteMessage(chatId, processingMsg.message_id);
            } catch (deleteError) {
                console.log('Gagal menghapus pesan processing:', deleteError.message);
            }
        }
        
        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AI CHATBOT</b> ⧽
├ ❌ Gagal memproses pesan
├ ${error.message}
├ 
├ 🔧 Silakan coba lagi nanti
╰──────────────</blockquote>`,
            { 
                parse_mode: "HTML",
                reply_to_message_id: msg.message_id
            }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ DELETE USER COMMAND (2 TAHAP)
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Fitur untuk menghapus user panel berdasarkan nama (2 tahap)
bot.onText(/\/deluser$/, (msg) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    
    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa menghapus user!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini hanya untuk yang terpilih</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    const usageInfo = `<blockquote>┌─⧼ <b>HAPUS USER PANEL</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>CAR PENGGUNAAN</b> ⧽
├ Format: <code>/deluser nama_panel</code>
├ Contoh: <code>/deluser riski</code>
╰───────────────

┌─⧼ <b>PROSES 2 TAHAP</b> ⧽
├ 1. 🗑️ Hapus semua server user
├ 2. 👤 Hapus akun user
╰───────────────

┌─⧼ <b>PERINGATAN</b> ⧽
├ ⚠️ User akan dihapus PERMANEN
├ ⚠️ Semua server user juga terhapus
├ ⚠️ Tidak bisa dikembalikan
╰───────────────

<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Hapus dengan bijak, kekuatan ada di tanganmu</i>
╰───────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, usageInfo, { parse_mode: "HTML" });
});

bot.onText(/\/deluser (.+)/, async (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const username = match[1].trim();

    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa menghapus user!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini hanya untuk yang terpilih</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        // Kirim pesan processing
        const processingMsg = await bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>HAPUS USER</b> ⧽
├ 🔄 Mencari user <b>${username}</b>...
├ ⬡ Scanning database user
├ ⬡ Verifikasi data
╰──────────────</blockquote>`,
            { parse_mode: "HTML" }
        );

        // Cari user berdasarkan username
        const response = await fetch(`${CONFIG.domain}/api/application/users`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`
            }
        });

        if (!response.ok) {
            throw new Error(`Gagal mengambil data user: ${response.status}`);
        }

        const usersData = await response.json();
        const userToDelete = usersData.data.find(user => 
            user.attributes.username.toLowerCase() === username.toLowerCase()
        );

        if (!userToDelete) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>USER TIDAK DITEMUKAN</b> ⧽
├ ❌ User <b>${username}</b> tidak ditemukan!
├ 
├ ┌─⧼ <b>SOLUSI</b> ⧽
├ │ • Periksa penulisan username
├ │ • Gunakan username tanpa @
├ │ • Pastikan user ada di panel
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>User tidak ditemukan di kegelapan</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        // Cek jika user adalah admin
        if (userToDelete.attributes.root_admin) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>USER ADALAH ADMIN</b> ⧽
├ ⚠️ User <b>${username}</b> adalah ADMIN!
├ 
├ ┌─⧼ <b>SOLUSI</b> ⧽
├ │ • Gunakan <code>/deladmin ${username}</code>
├ │ • Untuk menghapus admin panel
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Gunakan command yang tepat untuk admin</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        // Cari server yang dimiliki user ini
        const serversResponse = await fetch(`${CONFIG.domain}/api/application/servers`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`
            }
        });

        let userServers = [];
        if (serversResponse.ok) {
            const serversData = await serversResponse.json();
            userServers = serversData.data.filter(server => 
                server.attributes.user === userToDelete.attributes.id
            );
        }

        // Update pesan - konfirmasi penghapusan
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>KONFIRMASI HAPUS USER</b> ⧽
├ ⚠️ Akan menghapus user:
├ 
├ ┌─⧼ <b>DATA USER</b> ⧽
├ │ • 👤 Username: <b>${userToDelete.attributes.username}</b>
├ │ • 📧 Email: <b>${userToDelete.attributes.email}</b>
├ │ • 🔑 ID: <b>${userToDelete.attributes.id}</b>
├ │ • 🗂️ Total Server: <b>${userServers.length}</b>
├ │ • 📅 Dibuat: <b>${new Date(userToDelete.attributes.created_at).toLocaleDateString()}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>PROSES 2 TAHAP</b> ⧽
├ │ 1. 🗑️ Hapus ${userServers.length} server
├ │ 2. 👤 Hapus akun user
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>PERINGATAN</b> ⧽
├ ❗ Penghapusan bersifat PERMANEN
├ ❗ Semua server user akan terhapus
├ ❗ Tidak dapat dikembalikan
╰──────────────</blockquote></blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ YA, HAPUS", callback_data: `confirm_deluser:${userToDelete.attributes.id}:${userToDelete.attributes.username}` },
                            { text: "❌ BATAL", callback_data: "cancel_delete" }
                        ]
                    ]
                }
            }
        );

    } catch (error) {
        console.error('Error in deluser:', error);
        bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Gagal mencari user!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu saat mencari user</i>
╰──────────────</blockquote></blockquote>`,
            { parse_mode: "HTML" }
        );
    }
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👑 DELETE ADMIN COMMAND (2 TAHAP)
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Fitur untuk menghapus admin panel berdasarkan nama (2 tahap)
bot.onText(/\/deladmin$/, (msg) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    
    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa menghapus admin!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini hanya untuk yang terpilih</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    const usageInfo = `<blockquote>┌─⧼ <b>HAPUS ADMIN PANEL</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>CAR PENGGUNAAN</b> ⧽
├ Format: <code>/deladmin nama_admin</code>
├ Contoh: <code>/deladmin riski</code>
╰───────────────

┌─⧼ <b>PROSES 2 TAHAP</b> ⧽
├ 1. 🗑️ Hapus semua server admin
├ 2. 👑 Hapus akun admin
╰───────────────

┌─⧼ <b>PERINGATAN TINGGI</b> ⧽
├ ⚠️ Admin akan dihapus PERMANEN
├ ⚠️ Semua server admin juga terhapus
├ ⚠️ Hak akses root akan hilang
├ ⚠️ Tidak bisa dikembalikan
╰───────────────

<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Hati-hati dengan kekuatan penghapusan admin</i>
╰───────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, usageInfo, { parse_mode: "HTML" });
});

bot.onText(/\/deladmin (.+)/, async (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const username = match[1].trim();

    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa menghapus admin!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini hanya untuk yang terpilih</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        // Kirim pesan processing
        const processingMsg = await bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>HAPUS ADMIN</b> ⧽
├ 🔄 Mencari admin <b>${username}</b>...
├ ⬡ Scanning database admin
├ ⬡ Verifikasi hak akses root
╰──────────────</blockquote>`,
            { parse_mode: "HTML" }
        );

        // Cari admin berdasarkan username
        const response = await fetch(`${CONFIG.domain}/api/application/users`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`
            }
        });

        if (!response.ok) {
            throw new Error(`Gagal mengambil data user: ${response.status}`);
        }

        const usersData = await response.json();
        const adminToDelete = usersData.data.find(user => 
            user.attributes.username.toLowerCase() === username.toLowerCase() && 
            user.attributes.root_admin
        );

        if (!adminToDelete) {
            await bot.editMessageText(
                `<blockquote>┌─⧼ <b>ADMIN TIDAK DITEMUKAN</b> ⧽
├ ❌ Admin <b>${username}</b> tidak ditemukan!
├ 
├ ┌─⧼ <b>SOLUSI</b> ⧽
├ │ • Periksa penulisan username
├ │ • Pastikan user adalah admin
├ │ • Gunakan <code>/deluser</code> untuk user biasa
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Admin tidak ditemukan di kegelapan</i>
╰──────────────</blockquote></blockquote>`,
                {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: "HTML"
                }
            );
            return;
        }

        // Cari server yang dimiliki admin ini
        const serversResponse = await fetch(`${CONFIG.domain}/api/application/servers`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`
            }
        });

        let adminServers = [];
        if (serversResponse.ok) {
            const serversData = await serversResponse.json();
            adminServers = serversData.data.filter(server => 
                server.attributes.user === adminToDelete.attributes.id
            );
        }

        // Update pesan - konfirmasi penghapusan admin
        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>KONFIRMASI HAPUS ADMIN</b> ⧽
├ ⚠️ Akan menghapus ADMIN:
├ 
├ ┌─⧼ <b>DATA ADMIN</b> ⧽
├ │ • 👑 Username: <b>${adminToDelete.attributes.username}</b>
├ │ • 📧 Email: <b>${adminToDelete.attributes.email}</b>
├ │ • 🔑 ID: <b>${adminToDelete.attributes.id}</b>
├ │ • 🎯 Status: <b>ROOT ADMIN</b>
├ │ • 🗂️ Total Server: <b>${adminServers.length}</b>
├ │ • 📅 Dibuat: <b>${new Date(adminToDelete.attributes.created_at).toLocaleDateString()}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>PROSES 2 TAHAP</b> ⧽
├ │ 1. 🗑️ Hapus ${adminServers.length} server
├ │ 2. 👑 Hapus akun admin
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>PERINGATAN TINGGI</b> ⧽
├ ❗ Penghapusan admin bersifat PERMANEN
├ ❗ Semua hak akses root akan hilang
├ ❗ Semua server admin akan terhapus
├ ❗ Tidak dapat dikembalikan
╰──────────────</blockquote></blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ YA, HAPUS", callback_data: `confirm_deladmin:${adminToDelete.attributes.id}:${adminToDelete.attributes.username}` },
                            { text: "❌ BATAL", callback_data: "cancel_delete" }
                        ]
                    ]
                }
            }
        );

    } catch (error) {
        console.error('Error in deladmin:', error);
        bot.sendMessage(chatId,
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Gagal mencari admin!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu saat mencari admin</i>
╰──────────────</blockquote></blockquote>`,
            { parse_mode: "HTML" }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚡ CALLBACK QUERY HANDLER - COMPLETE
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    bot.answerCallbackQuery(callbackQuery.id);

    try {
        switch(data) {
            case "createpanel":
                await bot.editMessageCaption(CREATE_PANEL_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            case "ai_menu":
                await bot.editMessageCaption(AI_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: aiEnabled ? "🔴 NONAKTIFKAN AI" : "🟢 AKTIFKAN AI", callback_data: aiEnabled ? "ai_off" : "ai_on" }
                            ],
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            case "ai_on":
                if (!isOwner(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya owner yang bisa mengaktifkan AI!",
                        show_alert: true
                    });
                    return;
                }
                aiEnabled = true;
                saveAIState();
                await bot.editMessageCaption(AI_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: aiEnabled ? "🔴 NONAKTIFKAN AI" : "🟢 AKTIFKAN AI", callback_data: aiEnabled ? "ai_off" : "ai_on" }
                            ],
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                await bot.sendMessage(chatId, 
                    `<blockquote>┌─⧼ <b>AI CHATBOT</b> ⧽
├ ✅ AI Chatbot berhasil diaktifkan!
├ 
├ 🤖 Sekarang bot akan merespon otomatis
├ 🎵 Dengan Voice Note (VN)
├ 💬 Ketik pesan biasa untuk chat
╰──────────────</blockquote>`,
                    { parse_mode: "HTML" }
                );
                break;

            case "ai_off":
                if (!isOwner(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya owner yang bisa menonaktifkan AI!",
                        show_alert: true
                    });
                    return;
                }
                aiEnabled = false;
                saveAIState();
                await bot.editMessageCaption(AI_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: aiEnabled ? "🔴 NONAKTIFKAN AI" : "🟢 AKTIFKAN AI", callback_data: aiEnabled ? "ai_off" : "ai_on" }
                            ],
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                await bot.sendMessage(chatId, 
                    `<blockquote>┌─⧼ <b>AI CHATBOT</b> ⧽
├ 🔴 AI Chatbot berhasil dinonaktifkan!
├ 
├ ⚠️ Auto response dimatikan
├ 💬 Gunakan /ai untuk mengaktifkan kembali
╰──────────────</blockquote>`,
                    { parse_mode: "HTML" }
                );
                break;

            case "cekid":
                const status = isOwner(userId) ? 'OWNER' : 
                              isPremium(userId) ? 'PREMIUM' : 'USER';
                
                const idText = `<blockquote>┌─⧼ <b>IDENTITAS</b> ⧽
├ 🔑 ID: <code>${userId}</code>
├ 👤 Username: @${callbackQuery.from.username || 'tidak_ada'}
├ 🎯 Status: ${status}
╰──────────────</blockquote>`;

                await bot.editMessageCaption(idText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            case "ownermenu":
                if (!isOwner(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ AKSES DITOLAK - HANYA UNTUK OWNER",
                        show_alert: true
                    });
                    return;
                }
                await bot.editMessageCaption(OWNER_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            case "contact":
                await bot.editMessageCaption(CONTACT_MENU, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            case "allmenu":
                const enhanceMenu = `<blockquote>┌─⧼ <b>INFORMATION</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95  
├ ⬡ Developer : Risky Dinata
╰───────────────

┌─⧼ <b>STATUS MENU</b> ⧽
├ (✅) — Menu Sudah Aktif
├ (⚠️) — Menu Pending
├ (❌) — Menu Tidak Aktif
╰──────────────

┌─⧼ <b>MENU UTAMA</b> ⧽
├ /cekid — Cek ID Anda
├ /play — melepasmu
├ /file — ddos
├ /enhance — Enhance Gambar
├ /ssweb — screenshot website
├ /waifu — Waifu Images
├ /webzip — Website Scraper
├ /iqc — Image Quote Creator
├ /tt — TikTok Downloader
╰──────────────

┌─⧼ <b>MENU PANEL</b> ⧽
├ /1gb - /10gb — Panel Berbayar
├ /unli — Panel Unlimited
├ /createadmin — Panel Admin
╰──────────────
</blockquote>`;

                await bot.editMessageCaption(enhanceMenu, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔙 KEMBALI", callback_data: "backtomain" }
                            ]
                        ]
                    }
                });
                break;

            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 💾 BACKUP CALLBACKS - INTEGRATED
            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            case "backup_data":
                if (!isOwner(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya owner yang bisa menggunakan fitur backup!",
                        show_alert: true
                    });
                    return;
                }

                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "📊 Membuat backup data sistem...",
                    show_alert: false
                });

                try {
                    const fs = require('fs');
                    const path = require('path');

                    // File-file yang akan di-backup
                    const filesToBackup = [
                        { path: "./storage/adminID.json", name: "adminID.json" },
                        { path: "./storage/premiumUsers.json", name: "premiumUsers.json" },
                        { path: "./storage/welcomeGoodbye.json", name: "welcomeGoodbye.json" },
                        { path: "./storage/bot.log", name: "bot.log" }
                    ];

                    let backupStats = {
                        totalFiles: filesToBackup.length,
                        successFiles: 0,
                        failedFiles: 0,
                        fileDetails: []
                    };

                    // Kirim pesan processing
                    const processingMsg = await bot.sendMessage(chatId,
                        `<blockquote>┌─⧼ <b>BACKUP DATA</b> ⧽
├ 🔄 Memulai backup sistem...
├ ⬡ adminID.json
├ ⬡ premiumUsers.json  
├ ⬡ welcomeGoodbye.json
├ ⬡ bot.log
╰──────────────</blockquote>`,
                        { parse_mode: "HTML" }
                    );

                    // Backup setiap file
                    for (const file of filesToBackup) {
                        try {
                            if (fs.existsSync(file.path)) {
                                const fileContent = fs.readFileSync(file.path, 'utf8');
                                const fileStats = fs.statSync(file.path);
                                
                                backupStats.fileDetails.push({
                                    name: file.name,
                                    size: formatFileSize(fileStats.size),
                                    lines: fileContent.split('\n').length,
                                    status: '✅'
                                });
                                backupStats.successFiles++;
                                
                                // Kirim file individual
                                await bot.sendDocument(chatId, file.path, {
                                    caption: `<blockquote>┌─⧼ <b>BACKUP FILE</b> ⧽
├ 📁 File: <code>${file.name}</code>
├ 💾 Size: <b>${formatFileSize(fileStats.size)}</b>
├ 📊 Lines: <b>${fileContent.split('\n').length}</b>
├ 🕐 Backup: <b>${new Date().toLocaleString()}</b>
╰──────────────</blockquote>`,
                                    parse_mode: "HTML"
                                });
                                
                            } else {
                                backupStats.fileDetails.push({
                                    name: file.name,
                                    size: '0 KB',
                                    lines: 0,
                                    status: '❌'
                                });
                                backupStats.failedFiles++;
                            }
                        } catch (fileError) {
                            backupStats.fileDetails.push({
                                name: file.name,
                                size: 'Error',
                                lines: 0,
                                status: '❌'
                            });
                            backupStats.failedFiles++;
                        }
                    }

                    // Update pesan processing dengan hasil akhir
                    let fileDetailsText = '';
                    backupStats.fileDetails.forEach(file => {
                        fileDetailsText += `├ ${file.status} ${file.name} (${file.size}, ${file.lines} lines)\n`;
                    });

                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>BACKUP DATA SELESAI</b> ⧽
├ ✅ Backup sistem selesai!
├ 
├ ┌─⧼ <b>STATISTIK BACKUP</b> ⧽
├ │ • 📁 Total Files: <b>${backupStats.totalFiles}</b>
├ │ • ✅ Berhasil: <b>${backupStats.successFiles}</b>
├ │ • ❌ Gagal: <b>${backupStats.failedFiles}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>DETAIL FILE</b> ⧽
${fileDetailsText}╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Semua file sistem telah di-backup</i>
╰──────────────</blockquote></blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: "HTML"
                        }
                    );

                } catch (error) {
                    await bot.sendMessage(chatId,
                        `<blockquote>┌─⧼ <b>BACKUP GAGAL</b> ⧽
├ ❌ Gagal membuat backup sistem!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Backup sistem mengalami gangguan</i>
╰──────────────</blockquote></blockquote>`,
                        { parse_mode: "HTML" }
                    );
                }
                break;

            case "backup_script":
                if (!isOwner(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya owner yang bisa menggunakan fitur backup!",
                        show_alert: true
                    });
                    return;
                }

                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "📦 Mempersiapkan backup script...",
                    show_alert: false
                });

                try {
                    const fs = require('fs');

                    // Buat data script backup
                    const scriptData = {
                        timestamp: new Date().toISOString(),
                        bot_info: {
                            name: "BotzMarket Panel",
                            owner: "@botzmarket95",
                            version: "1.0"
                        },
                        system_info: {
                            node_version: process.version,
                            platform: process.platform,
                            config_domain: CONFIG.domain
                        },
                        settings: {
                            eggs: settings.eggs,
                            location: settings.loc,
                            total_commands: panelCommands.length
                        },
                        file_structure: {
                            admin_file: "./storage/adminID.json",
                            premium_file: "./storage/premiumUsers.json",
                            welcome_file: "./storage/welcomeGoodbye.json",
                            log_file: "./storage/bot.log"
                        },
                        generated_by: `@${callbackQuery.from.username || 'owner'}`,
                        note: "Backup informasi sistem dan konfigurasi"
                    };

                    // Buat file JSON sementara
                    const tempFilePath = `./temp_system_backup_${Date.now()}.json`;
                    fs.writeFileSync(tempFilePath, JSON.stringify(scriptData, null, 2));

                    await bot.sendDocument(chatId, tempFilePath, {
                        caption: `<blockquote>┌─⧼ <b>BACKUP SISTEM BERHASIL</b> ⧽
├ ✅ Backup informasi sistem selesai!
├ 
├ ┌─⧼ <b>DETAIL BACKUP</b> ⧽
├ │ • 🤖 Bot: <b>${scriptData.bot_info.name}</b>
├ │ • 👑 Owner: <b>${scriptData.bot_info.owner}</b>
├ │ • 🏷️ Version: <b>${scriptData.bot_info.version}</b>
├ │ • 📁 File: <code>system_backup.json</code>
├ ╰──────────────
├ 
├ ┌─⧼ <b>INFO SISTEM</b> ⧽
├ │ • 🌐 Domain: <b>${scriptData.system_info.config_domain}</b>
├ │ • ⚙️ Node: <b>${scriptData.system_info.node_version}</b>
├ │ • 🖥️ Platform: <b>${scriptData.system_info.platform}</b>
├ │ • 🎯 Commands: <b>${scriptData.settings.total_commands}</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Informasi sistem telah disimpan</i>
╰──────────────</blockquote></blockquote>`,
                        parse_mode: "HTML"
                    });

                    // Hapus file temp
                    fs.unlinkSync(tempFilePath);

                } catch (error) {
                    await bot.sendMessage(chatId,
                        `<blockquote>┌─⧼ <b>BACKUP GAGAL</b> ⧽
├ ❌ Gagal membuat backup sistem!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Backup sistem mengalami gangguan</i>
╰──────────────</blockquote></blockquote>`,
                        { parse_mode: "HTML" }
                    );
                }
                break;

            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🗑️ DELETE USER & ADMIN CALLBACKS - ADDED
            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            case "backtomain":
                const userStatus = getSimpleUserStatus(userId);
                const mainMenu = MAIN_MENU(callbackQuery, userStatus);
                
                await bot.editMessageCaption(mainMenu, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🎭 BUAT PANEL", callback_data: "createpanel" },
                                { text: "🤖 AI CHATBOT", callback_data: "ai_menu" }
                            ],
                            [
                                { text: "🆔 CEK ID", callback_data: "cekid" },
                                { text: "🦠 ALLMENU", callback_data: "allmenu" }
                            ],
                            [
                                { text: "💀 MENU OWNER", callback_data: "ownermenu" },
                                { text: "👁️ KONTAK", callback_data: "contact" }
                            ],
                            [
                                { text: "🕯️ DUKUNGAN", url: "https://t.me/botzmarket95" }
                            ]
                        ]
                    }
                });
                break;
            // Handle IQC retry
            case data.startsWith('iqc_retry:') && data:
                const iqcText = decodeURIComponent(data.split(':')[1]);
                await bot.deleteMessage(chatId, messageId);
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "🔄 Mencoba membuat gambar lagi...",
                    show_alert: false
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
                const iqcMockMsg = {
                    chat: { id: chatId },
                    message_id: messageId,
                    text: `/iqc ${iqcText}`,
                    from: callbackQuery.from
                };
                bot.emit('text', iqcMockMsg);
                break;

            case "iqc_new":
                await bot.deleteMessage(chatId, messageId);
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "📝 Kirim teks baru untuk gambar",
                    show_alert: false
                });
                await bot.sendMessage(chatId, 
                    `<blockquote>┌─⧼ <b>IMAGE QUOTE CREATOR</b> ⧽
├ 🎨 Kirim teks baru untuk dibuat gambar
├ 
├ 💡 Contoh:
├ /iqc semoga harimu menyenangkan
├ /iqc Hello world! 🌍
╰──────────────</blockquote>`,
                    { parse_mode: "HTML" }
                );
                break;

            // Handle TikTok retry
            case data.startsWith('tt_retry:') && data:
                const ttUrl = decodeURIComponent(data.split(':')[1]);
                await bot.deleteMessage(chatId, messageId);
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "🔄 Mencoba lagi...",
                    show_alert: false
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
                const ttMockMsg = {
                    chat: { id: chatId },
                    message_id: messageId,
                    text: `/tt ${ttUrl}`,
                    from: callbackQuery.from
                };
                bot.emit('text', ttMockMsg);
                break;

            case "tt_new":
                await bot.deleteMessage(chatId, messageId);
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "📝 Kirim URL TikTok baru",
                    show_alert: false
                });
                await bot.sendMessage(chatId, 
                    `<blockquote>┌─⧼ <b>TIKTOK DOWNLOADER</b> ⧽
├ 📱 Kirim URL TikTok baru
├ 
├ 💡 Contoh:
├ https://vt.tiktok.com/ZSy7k6e6U/
├ https://www.tiktok.com/@user/video/123456
╰──────────────</blockquote>`,
                    { parse_mode: "HTML" }
                );
                break;

            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🗑️ DELETE CONFIRMATION CALLBACKS - ADDED
            //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // Handle konfirmasi penghapusan user (2 tahap)
            case data.startsWith('confirm_deluser:'):
                if (!isAdmin(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya admin yang bisa menghapus user!",
                        show_alert: true
                    });
                    return;
                }

                const [_, userIdToDelete, username] = data.split(':');
                
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "🗑️ Memulai proses penghapusan user...",
                    show_alert: false
                });

                try {
                    // Update pesan - tahap 1: menghapus server
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>HAPUS USER - TAHAP 1</b> ⧽
├ 🔄 Menghapus server user <b>${username}</b>...
├ ⬡ Mencari server milik user
├ ⬡ Menghapus server satu per satu
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );

                    // Tahap 1: Hapus semua server user
                    let serversDeleted = 0;
                    let serversFailed = 0;

                    // Ambil semua server
                    const serversResponse = await fetch(`${CONFIG.domain}/api/application/servers`, {
                        method: "GET",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${CONFIG.plta}`
                        }
                    });

                    if (serversResponse.ok) {
                        const serversData = await serversResponse.json();
                        const userServers = serversData.data.filter(server => 
                            server.attributes.user === parseInt(userIdToDelete)
                        );

                        for (let server of userServers) {
                            try {
                                const deleteServerResponse = await fetch(`${CONFIG.domain}/api/application/servers/${server.attributes.id}`, {
                                    method: "DELETE",
                                    headers: {
                                        "Accept": "application/json",
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${CONFIG.plta}`
                                    }
                                });

                                if (deleteServerResponse.ok) {
                                    serversDeleted++;
                                    console.log(`✅ Sukses menghapus server ${server.attributes.id} milik user ${username}`);
                                } else {
                                    serversFailed++;
                                    console.log(`❌ Gagal menghapus server ${server.attributes.id}`);
                                }
                            } catch (serverError) {
                                serversFailed++;
                                console.error(`Error menghapus server:`, serverError);
                            }
                        }
                    }

                    // Update pesan - tahap 2: menghapus user
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>HAPUS USER - TAHAP 2</b> ⧽
├ ✅ Server terhapus: <b>${serversDeleted}</b> berhasil, <b>${serversFailed}</b> gagal
├ 🔄 Menghapus akun user <b>${username}</b>...
├ ⬡ Menghapus dari database
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );

                    // Tahap 2: Hapus user
                    const deleteUserResponse = await fetch(`${CONFIG.domain}/api/application/users/${userIdToDelete}`, {
                        method: "DELETE",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${CONFIG.plta}`
                        }
                    });

                    if (deleteUserResponse.ok) {
                        await bot.editMessageText(
                            `<blockquote>┌─⧼ <b>USER BERHASIL DIHAPUS</b> ⧽
├ ✅ User <b>${username}</b> telah dihapus!
├ 
├ ┌─⧼ <b>DETAIL PENGHAPUSAN</b> ⧽
├ │ • 👤 Username: <b>${username}</b>
├ │ • 🔑 ID: <b>${userIdToDelete}</b>
├ │ • 🗑️ Server dihapus: <b>${serversDeleted}</b>
├ │ • ❌ Server gagal: <b>${serversFailed}</b>
├ │ • 🕐 Waktu: <b>${new Date().toLocaleString()}</b>
├ │ • 📊 Status: <b>TERHAPUS PERMANEN</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>User dan server telah lenyap dari kegelapan</i>
╰──────────────</blockquote></blockquote>`,
                            {
                                chat_id: chatId,
                                message_id: messageId,
                                parse_mode: "HTML"
                            }
                        );
                    } else {
                        throw new Error(`Gagal menghapus user: HTTP ${deleteUserResponse.status}`);
                    }
                } catch (error) {
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>GAGAL MENGHAPUS USER</b> ⧽
├ ❌ Gagal menghapus user <b>${username}</b>!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak penghapusan</i>
╰──────────────</blockquote></blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );
                }
                break;

            // Handle konfirmasi penghapusan admin (2 tahap)
            case data.startsWith('confirm_deladmin:'):
                if (!isAdmin(userId)) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: "❌ Hanya admin yang bisa menghapus admin!",
                        show_alert: true
                    });
                    return;
                }

                const [__, adminIdToDelete, adminUsername] = data.split(':');
                
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "🗑️ Memulai proses penghapusan admin...",
                    show_alert: false
                });

                try {
                    // Update pesan - tahap 1: menghapus server admin
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>HAPUS ADMIN - TAHAP 1</b> ⧽
├ 🔄 Menghapus server admin <b>${adminUsername}</b>...
├ ⬡ Mencari server milik admin
├ ⬡ Menghapus server satu per satu
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );

                    // Tahap 1: Hapus semua server admin
                    let serversDeleted = 0;
                    let serversFailed = 0;

                    // Ambil semua server
                    const serversResponse = await fetch(`${CONFIG.domain}/api/application/servers`, {
                        method: "GET",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${CONFIG.plta}`
                        }
                    });

                    if (serversResponse.ok) {
                        const serversData = await serversResponse.json();
                        const adminServers = serversData.data.filter(server => 
                            server.attributes.user === parseInt(adminIdToDelete)
                        );

                        for (let server of adminServers) {
                            try {
                                const deleteServerResponse = await fetch(`${CONFIG.domain}/api/application/servers/${server.attributes.id}`, {
                                    method: "DELETE",
                                    headers: {
                                        "Accept": "application/json",
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${CONFIG.plta}`
                                    }
                                });

                                if (deleteServerResponse.ok) {
                                    serversDeleted++;
                                    console.log(`✅ Sukses menghapus server ${server.attributes.id} milik admin ${adminUsername}`);
                                } else {
                                    serversFailed++;
                                    console.log(`❌ Gagal menghapus server ${server.attributes.id}`);
                                }
                            } catch (serverError) {
                                serversFailed++;
                                console.error(`Error menghapus server:`, serverError);
                            }
                        }
                    }

                    // Update pesan - tahap 2: menghapus admin
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>HAPUS ADMIN - TAHAP 2</b> ⧽
├ ✅ Server terhapus: <b>${serversDeleted}</b> berhasil, <b>${serversFailed}</b> gagal
├ 🔄 Menghapus akun admin <b>${adminUsername}</b>...
├ ⬡ Mencabut hak akses root
├ ⬡ Menghapus dari database
╰──────────────</blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );

                    // Tahap 2: Hapus admin
                    const deleteAdminResponse = await fetch(`${CONFIG.domain}/api/application/users/${adminIdToDelete}`, {
                        method: "DELETE",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${CONFIG.plta}`
                        }
                    });

                    if (deleteAdminResponse.ok) {
                        await bot.editMessageText(
                            `<blockquote>┌─⧼ <b>ADMIN BERHASIL DIHAPUS</b> ⧽
├ ✅ Admin <b>${adminUsername}</b> telah dihapus!
├ 
├ ┌─⧼ <b>DETAIL PENGHAPUSAN</b> ⧽
├ │ • 👑 Username: <b>${adminUsername}</b>
├ │ • 🔑 ID: <b>${adminIdToDelete}</b>
├ │ • 🗑️ Server dihapus: <b>${serversDeleted}</b>
├ │ • ❌ Server gagal: <b>${serversFailed}</b>
├ │ • 🕐 Waktu: <b>${new Date().toLocaleString()}</b>
├ │ • 🎯 Status: <b>ROOT ADMIN TERHAPUS</b>
├ │ • ⚠️ Hak Akses: <b>DIHAPUS SELAMANYA</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan admin telah dicabut dari kegelapan</i>
╰──────────────</blockquote></blockquote>`,
                            {
                                chat_id: chatId,
                                message_id: messageId,
                                parse_mode: "HTML"
                            }
                        );
                    } else {
                        throw new Error(`Gagal menghapus admin: HTTP ${deleteAdminResponse.status}`);
                    }
                } catch (error) {
                    await bot.editMessageText(
                        `<blockquote>┌─⧼ <b>GAGAL MENGHAPUS ADMIN</b> ⧽
├ ❌ Gagal menghapus admin <b>${adminUsername}</b>!
├ 
├ ┌─⧼ <b>ERROR</b> ⧽
├ │ • ${error.message}
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak penghapusan admin</i>
╰──────────────</blockquote></blockquote>`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML"
                        }
                    );
                }
                break;

            // Handle pembatalan penghapusan
            case "cancel_delete":
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: "❌ Penghapusan dibatalkan",
                    show_alert: false
                });

                await bot.editMessageText(
                    `<blockquote>┌─⧼ <b>PENGHAPUSAN DIBATALKAN</b> ⧽
├ ✅ Penghapusan berhasil dibatalkan
├ 
├ ┌─⧼ <b>STATUS</b> ⧽
├ │ • ??️ Data tetap aman
├ │ • ✅ Tidak ada yang terhapus
├ │ • 🔒 Semua akses tetap
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan lega tidak kehilangan jiwa</i>
╰──────────────</blockquote></blockquote>`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML"
                    }
                );
                break;
        }
    } catch (error) {
        console.log('Edit message error:', error.message);
    }
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ HELPER FUNCTION FOR FILE SIZE
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fungsi untuk format ukuran file
 * @param {number} bytes 
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌸 WAIFU COMMANDS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/waifu(?:\s+(sfw|nsfw))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const waifuType = match[1];

    if (!waifuType) {
        const helpMessage = `<blockquote>┌─⧼ <b>WAIFU IMAGES</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>JENIS WAIFU</b> ⧽
├ 🌸 SFW (Safe For Work)
├ 🔥 NSFW (Not Safe For Work)
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ /waifu sfw - Waifu aman
├ /waifu nsfw - Waifu 18+
╰──────────────

┌─⧼ <b>PERINGATAN</b> ⧽
├ ⚠️ NSFW hanya untuk grup khusus
├ 🚫 Tidak untuk di bawah umur
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    if (waifuType !== 'sfw' && waifuType !== 'nsfw') {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WAIFU ERROR</b> ⧽
├ ❌ Jenis waifu tidak valid!
├ 
├ 💡 Gunakan: /waifu sfw atau /waifu nsfw
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    if (waifuType === 'nsfw' && msg.chat.type === 'private') {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WAIFU ERROR</b> ⧽
├ ❌ NSFW tidak diizinkan di private chat!
├ 
├ 💡 Gunakan di grup khusus NSFW
├ ⚠️ Konten 18+ hanya untuk dewasa
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    try {
        const processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WAIFU IMAGES</b> ⧽
├ ⏳ Mencari waifu ${waifuType.toUpperCase()}...
├ 
├ ${waifuType === 'sfw' ? '🌸 Mencari waifu yang imut...' : '🔥 Mencari waifu yang hot...'}
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        let waifuUrl;
        
        if (waifuType === 'nsfw') {
            const response = await axios.get(`https://waifu.pics/api/nsfw/waifu`);
            waifuUrl = response.data.url;
        } else {
            const response = await axios.get(`https://waifu.pics/api/sfw/waifu`);
            waifuUrl = response.data.url;
        }

        await bot.deleteMessage(chatId, processingMsg.message_id);

        await bot.sendPhoto(chatId, waifuUrl, {
            caption: `<blockquote>┌─⧼ <b>WAIFU ${waifuType.toUpperCase()}</b> ⧽
├ ${waifuType === 'sfw' ? '🌸 Waifu imut telah datang!' : '🔥 Waifu hot telah datang!'}
├ 
├ 💫 Powered by waifu.pics
├ ⚡ BotzMarket Panel
╰──────────────</blockquote>`,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });

    } catch (error) {
        console.log('Waifu Error:', error.message);
        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WAIFU ERROR</b> ⧽
├ ❌ Gagal mengambil gambar waifu
├ Error: ${error.message}
├ 
├ 🔧 Silakan coba lagi nanti
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌐 WEBZIP COMMAND
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/webzip(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[1];

    if (!url) {
        const helpMessage = `<blockquote>┌─⧼ <b>WEBZIP SCRAPER</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>FITUR WEBZIP</b> ⧽
├ 🌐 Website File Scraper
├ 📦 Download semua file website
├ ⚡ Convert ke format ZIP
├ 🔗 Support berbagai website
╰──────────────

┌─⧼ <b>PENGGUNAAN</b> ⧽
├ /webzip [url_website]
├ 
├ 💡 Contoh:
├ /webzip https://example.com
├ /webzip https://github.com/user/repo
╰──────────────

┌─⧼ <b>PERINGATAN</b> ⧽
├ ⚠️ Hanya untuk website publik
├ 🚫 Jangan scrape website ilegal
├ 📛 Gunakan dengan bijak
╰──────────────</blockquote>`;

        return bot.sendMessage(chatId, helpMessage, {
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });
    }

    let validUrl;
    try {
        validUrl = new URL(url);
        if (!['http:', 'https:'].includes(validUrl.protocol)) {
            throw new Error('Protocol tidak valid');
        }
    } catch (error) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WEBZIP ERROR</b> ⧽
├ ❌ URL tidak valid!
├ 
├ 💡 Pastikan URL lengkap dengan http:// atau https://
├ Contoh: https://example.com
╰──────────────</blockquote>`, 
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }

    try {
        const processingMsg = await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WEBZIP SCRAPER</b> ⧽
├ ⏳ Memulai proses scraping...
├ 
├ 🌐 URL: ${url}
├ 📦 Menyiapkan file ZIP...
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );

        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `https://api.enzoxavier.biz.id/api/web2zip?url=${encodedUrl}`;

        const response = await axios.get(apiUrl, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const result = response.data;

        if (!result.status) {
            throw new Error('API mengembalikan status false');
        }

        if (!result.downloadUrl) {
            throw new Error('Download URL tidak ditemukan');
        }

        await bot.editMessageText(
            `<blockquote>┌─⧼ <b>WEBZIP SCRAPER</b> ⧽
├ ✅ Berhasil mengambil file!
├ 
├ 🌐 URL: ${result.originalUrl}
├ 📁 Jumlah file: ${result.copiedFilesAmount}
├ ⏳ Mengunduh ZIP...
╰──────────────</blockquote>`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: "HTML"
            }
        );

        const zipResponse = await axios.get(result.downloadUrl, {
            responseType: 'stream',
            timeout: 60000
        });

        const chunks = [];
        for await (const chunk of zipResponse.data) {
            chunks.push(chunk);
        }
        const zipBuffer = Buffer.concat(chunks);

        await bot.deleteMessage(chatId, processingMsg.message_id);

        await bot.sendDocument(chatId, zipBuffer, {
            caption: `<blockquote>┌─⧼ <b>WEBZIP SCRAPER</b> ⧽
├ ✅ Website berhasil di-scrape!
├ 
├ 🌐 URL: ${result.originalUrl}
├ 📁 Total file: ${result.copiedFilesAmount}
├ 📦 Format: ZIP Archive
├ ⚡ Powered by BotzMarket Panel
╰──────────────</blockquote>`,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id
        });

    } catch (error) {
        console.log('Webzip Error:', error.message);
        let errorMessage = 'Gagal memproses website';
        if (error.code === 'ECONNABORTED') {
            errorMessage = 'Timeout: Website terlalu lama merespon';
        } else if (error.response && error.response.status === 404) {
            errorMessage = 'Website tidak ditemukan atau tidak dapat diakses';
        } else if (error.response && error.response.status >= 500) {
            errorMessage = 'Server API sedang bermasalah';
        } else {
            errorMessage = error.message;
        }

        await bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>WEBZIP ERROR</b> ⧽
├ ❌ ${errorMessage}
├ 
├ 🔧 Silakan coba dengan website lain
├ 💡 Pastikan website dapat diakses publik
╰──────────────</blockquote>`,
            { parse_mode: "HTML", reply_to_message_id: msg.message_id }
        );
    }
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 OWNER COMMANDS
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/^\/onlygrup (on|off)/, (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    const chatId = msg.chat.id;
    if (!isOwner(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner yang bisa menggunakan perintah ini
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    const mode = match[1] === "on";
    setOnlyGroup(mode);

    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>SYSTEM UPDATED</b> ⧽
├ ✅ OnlyGroup Mode: ${mode ? 'AKTIF' : 'NONAKTIF'}
╰──────────────</blockquote>`, 
        { parse_mode: "HTML" }
    );
});

bot.onText(/\/addprem (.+)/, (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUser = match[1];

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner sistem
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        let premiumData = [];
        if (fs.existsSync(CONFIG.premiumUsersFile)) {
            premiumData = JSON.parse(fs.readFileSync(CONFIG.premiumUsersFile));
        }
        
        if (!premiumData.includes(targetUser)) {
            premiumData.push(targetUser);
            fs.writeFileSync(CONFIG.premiumUsersFile, JSON.stringify(premiumData));
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>USER DIPERBARUI</b> ⧽
├ ✅ ${targetUser} sekarang memiliki akses PREMIUM
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        } else {
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ User sudah memiliki akses premium
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        }
    } catch (error) {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});

bot.onText(/\/delprem (.+)/, (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUser = match[1];

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner sistem
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        let premiumData = [];
        if (fs.existsSync(CONFIG.premiumUsersFile)) {
            premiumData = JSON.parse(fs.readFileSync(CONFIG.premiumUsersFile));
        }
        
        const index = premiumData.indexOf(targetUser);
        if (index !== -1) {
            premiumData.splice(index, 1);
            fs.writeFileSync(CONFIG.premiumUsersFile, JSON.stringify(premiumData));
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>USER DIHAPUS</b> ⧽
├ 🗑️ ${targetUser} dihapus dari akses PREMIUM
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        } else {
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ User tidak ditemukan dalam daftar premium
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        }
    } catch (error) {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});

bot.onText(/\/addowner (.+)/, (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUser = match[1];

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner sistem
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        let adminData = [];
        if (fs.existsSync(CONFIG.adminFile)) {
            adminData = JSON.parse(fs.readFileSync(CONFIG.adminFile));
        }
        
        if (!adminData.includes(targetUser)) {
            adminData.push(targetUser);
            fs.writeFileSync(CONFIG.adminFile, JSON.stringify(adminData));
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>OWNER BARU</b> ⧽
├ 👑 ${targetUser} sekarang menjadi OWNER
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        } else {
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ User sudah menjadi owner
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        }
    } catch (error) {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});

bot.onText(/\/delowner (.+)/, (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const targetUser = match[1];

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner sistem
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        let adminData = [];
        if (fs.existsSync(CONFIG.adminFile)) {
            adminData = JSON.parse(fs.readFileSync(CONFIG.adminFile));
        }
        
        const index = adminData.indexOf(targetUser);
        if (index !== -1) {
            adminData.splice(index, 1);
            fs.writeFileSync(CONFIG.adminFile, JSON.stringify(adminData));
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>OWNER DIHAPUS</b> ⧽
├ 🗑️ ${targetUser} dihapus dari OWNER
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        } else {
            bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ User tidak ditemukan dalam daftar owner
╰──────────────</blockquote>`, 
                { parse_mode: "HTML" }
            );
        }
    } catch (error) {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});
bot.onText(/\/ongoing/, (msg) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>STATUS SISTEM</b> ⧽
├ ✅ Tidak ada command yang sedang berjalan
├ 🤖 AI Status: ${aiEnabled ? 'AKTIF' : 'NONAKTIF'}
╰──────────────</blockquote>`, 
        { parse_mode: "HTML" }
    );
});

//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💾 BACKUP SYSTEM
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function backupUserData(chatId) {
    try {
        const backupData = {
            timestamp: new Date().toISOString(),
            adminUsers: adminUsers,
            premiumUsers: premiumUsers,
            onlyGroup: isOnlyGroupEnabled(),
            systemInfo: {
                botVersion: "BotzMarket Panel 1.0",
                totalAdmins: adminUsers.length,
                totalPremium: premiumUsers.length,
                backupDate: new Date().toLocaleString('id-ID')
            }};

        const backupFileName = `backup_data_${Date.now()}.json`;
        fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
        
        await bot.sendDocument(chatId, backupFileName, {
            caption: `<blockquote>┌─⧼ <b>BACKUP DATA</b> ⧽
├ ✅ Backup data user berhasil dibuat!
├ 📅 Tanggal: ${new Date().toLocaleString()}
├ 👥 Total Admin: ${adminUsers.length}
├ ⭐ Total Premium: ${premiumUsers.length}
├ 🔒 OnlyGroup: ${isOnlyGroupEnabled() ? 'AKTIF' : 'NONAKTIF'}
╰──────────────</blockquote>`,
            parse_mode: "HTML"
        });

        fs.unlinkSync(backupFileName);
        
    } catch (error) {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR BACKUP</b> ⧽
├ ❌ Gagal membuat backup data
├ ${error.message}
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
}

bot.onText(/\/backup$/, (msg) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya owner yang bisa menggunakan fitur backup!
╰──────────────</blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    const backupMenu = `<blockquote>┌─⧼ <b>BACKUP SYSTEM</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>RESTORE OPTIONS</b> ⧽
├ Kirim file backup.json
├ untuk restore data
╰──────────────

┌─⧼ <b>INFO BACKUP</b> ⧽
├ Data user: admin & premium
├ Script: semua file system
├ Secure: encrypted & compressed
╰──────────────</blockquote>`;

    bot.sendMessage(chatId, backupMenu, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "💾 BACKUP DATA", callback_data: "backup_data" },
                    { text: "📦 BACKUP SCRIPT", callback_data: "backup_script" }
                ]
            ]
        }
    });
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 PANEL CREATION SYSTEM - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fungsi untuk membuat panel
async function createPanel(msg, match, memory, disk, cpu, packageName) {
  if (shouldIgnoreMessage(msg)) return;
  
  const chatId = msg.chat.id;
  
  // Jika tidak ada parameter, tampilkan cara penggunaan
  if (!match[1]) {
    const isUserPremium = isPremium(msg.from.id);
    const usageInfo = `<blockquote>┌─⧼ <b>PANEL ${packageName.toUpperCase()}</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>CARA PENGGUNAAN</b> ⧽
├ Format: <code>/${packageName} username,idtelegram</code>
├ Contoh: <code>/${packageName} username,123456789</code>
╰───────────────

┌─⧼ <b>STATUS SYSTEM</b> ⧽
${isUserPremium ? 
`├ ✅ Status: <b>AKTIF</b>
├ 💾 Memory: <b>${memory}MB</b>
├ 💿 Disk: <b>${disk}MB</b>
├ ⚡ CPU: <b>${cpu}%</b>
╰───────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Siap membuat panel</i>
╰───────────────</blockquote>` : 
`├ ❌ Status: <b>BUTUH PREMIUM</b>
╰───────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan membutuhkan pengorbanan</i>
├ Hubungi @botzmarket95 untuk upgrade
╰───────────────</blockquote>`}</blockquote>`;

    bot.sendMessage(chatId, usageInfo, {
        parse_mode: "HTML",
        reply_markup: !isUserPremium ? {
            inline_keyboard: [
                [{ text: "🕯️ UPGRADE PREMIUM", url: "https://t.me/botzmarket95" }]
            ]
        } : undefined
    });
    return;
  }

  const text = match[1];
  
  const isPremiumUser = isPremium(msg.from.id);
  if (!isPremiumUser) {
    showPremiumInfo(chatId, packageName);
    return;
  }

  const t = text.split(",");
  if (t.length < 2) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>FORMAT SALAH</b> ⧽
├ ❌ Gunakan: <code>/${packageName} username,id</code>
├ Contoh: <code>/${packageName} shadow,7550928171</code>
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Format yang salah mengganggu kegelapan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
    return;
  }

  const username = t[0];
  const u = t[1];
  const name = username + packageName;
  const egg = settings.eggs;
  const loc = settings.loc;
  const memo = memory.toString();
  const cpuLimit = cpu.toString();
  const diskLimit = disk.toString();
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';
  const email = `${username}@nation.id`;
  const akunlo = settings.pp;
  const password = generateRandomPassword();
  let user;
  let server;

  try {
    const response = await fetch(`${CONFIG.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.plta}`,
      },
      body: JSON.stringify({
        email: email,
        username: username,
        first_name: username,
        last_name: username,
        language: "en",
        password: password,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.errors) {
      if (data.errors[0].meta.rule === "unique" && data.errors[0].meta.source_field === "email") {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Email sudah digunakan
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Identitas ini sudah ada di kegelapan</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
      } else {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${JSON.stringify(data.errors[0])}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
      }
      return;
    }
    user = data.attributes;
    
    const response2 = await fetch(`${CONFIG.domain}/api/application/servers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.plta}`,
      },
      body: JSON.stringify({
        name: name,
        description: "",
        user: user.id,
        egg: parseInt(egg),
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: spc,
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start",
        },
        limits: {
          memory: parseInt(memo),
          swap: 0,
          disk: parseInt(diskLimit),
          io: 500,
          cpu: parseInt(cpuLimit),
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1,
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: [],
        },
      }),
    });
    
    if (!response2.ok) {
      throw new Error(`HTTP Error: ${response2.status}`);
    }
    
    const data2 = await response2.json();
    server = data2.attributes;
  } catch (error) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>GAGAL MEMBUAT</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak pembuatan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
    return;
  }

  if (user && server) {
    const successText = `<blockquote>┌─⧼ <b>PANEL TERCIPTA</b> ⧽
├ ✅ Panel <b>${packageName.toUpperCase()}</b> Berhasil Dibuat!
├ 
├ ┌─⧼ <b>DETAIL PANEL</b> ⧽
├ │ • 👤 Nama: <b>${username}</b>
├ │ • 📧 Email: <b>${email}</b>
├ │ • 💾 Memory: <b>${memory}MB</b>
├ │ • 💿 Disk: <b>${disk}MB</b>
├ │ • ⚡ CPU: <b>${cpu}%</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Panel telah bangkit dari kegelapan</i>
╰──────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, successText, { parse_mode: "HTML" });

    if (akunlo) {
      const panelData = `<blockquote>┌─⧼ <b>DATA PANEL</b> ⧽
├ 🔐 Informasi Login Panel:
├ 
├ ┌─⧼ <b>AKSES PANEL</b> ⧽
├ │ • 🌐 Login: <b>${CONFIG.domain}</b>
├ │ • 👤 Username: <b>${user.username}</b>
├ │ • 🔑 Password: <b>${password}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>ATURAN PENGGUNAAN</b> ⧽
├ │ • Dilarang DDoS Server
├ │ • Wajib sensor domain
├ │ • Admin hanya kirim 1x
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Jaga data ini dengan baik</i>
╰──────────────</blockquote></blockquote>`;

      bot.sendAnimation(u, akunlo, { caption: panelData, parse_mode: "HTML" });
      bot.sendMessage(chatId, 
          `<blockquote>┌─⧼ <b>DATA TERKIRIM</b> ⧽
├ ✅ Data panel sudah dikirim ke user
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Rahasia telah disampaikan</i>
╰──────────────</blockquote></blockquote>`, 
          { parse_mode: "HTML" }
      );
    }
  } else {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>GAGAL MEMBUAT</b> ⧽
├ ❌ Panel gagal dibuat
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak pembentukan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
  }
}
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 PANEL COMMANDS - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const panelCommands = [
  { pattern: /\/1gb$/, memory: 1024, disk: 1024, cpu: 30, name: "1gb" },
  { pattern: /\/1gb (.+)/, memory: 1024, disk: 1024, cpu: 30, name: "1gb" },
  { pattern: /\/2gb$/, memory: 2048, disk: 2048, cpu: 60, name: "2gb" },
  { pattern: /\/2gb (.+)/, memory: 2048, disk: 2048, cpu: 60, name: "2gb" },
  { pattern: /\/3gb$/, memory: 3072, disk: 3072, cpu: 90, name: "3gb" },
  { pattern: /\/3gb (.+)/, memory: 3072, disk: 3072, cpu: 90, name: "3gb" },
  { pattern: /\/4gb$/, memory: 4048, disk: 4048, cpu: 110, name: "4gb" },
  { pattern: /\/4gb (.+)/, memory: 4048, disk: 4048, cpu: 110, name: "4gb" },
  { pattern: /\/5gb$/, memory: 5048, disk: 5048, cpu: 140, name: "5gb" },
  { pattern: /\/5gb (.+)/, memory: 5048, disk: 5048, cpu: 140, name: "5gb" },
  { pattern: /\/6gb$/, memory: 6048, disk: 6048, cpu: 170, name: "6gb" },
  { pattern: /\/6gb (.+)/, memory: 6048, disk: 6048, cpu: 170, name: "6gb" },
  { pattern: /\/7gb$/, memory: 7048, disk: 7048, cpu: 200, name: "7gb" },
  { pattern: /\/7gb (.+)/, memory: 7048, disk: 7048, cpu: 200, name: "7gb" },
  { pattern: /\/8gb$/, memory: 8048, disk: 8048, cpu: 230, name: "8gb" },
  { pattern: /\/8gb (.+)/, memory: 8048, disk: 8048, cpu: 230, name: "8gb" },
  { pattern: /\/9gb$/, memory: 9048, disk: 9048, cpu: 260, name: "9gb" },
  { pattern: /\/9gb (.+)/, memory: 9048, disk: 9048, cpu: 260, name: "9gb" },
  { pattern: /\/10gb$/, memory: 10000, disk: 10000, cpu: 290, name: "10gb" },
  { pattern: /\/10gb (.+)/, memory: 10000, disk: 10000, cpu: 290, name: "10gb" },
  { pattern: /\/11gb$/, memory: 11000, disk: 10000, cpu: 290, name: "11gb" },
  { pattern: /\/11gb (.+)/, memory: 11000, disk: 10000, cpu: 290, name: "11gb" }
];

panelCommands.forEach(({ pattern, memory, disk, cpu, name }) => {
  bot.onText(pattern, async (msg, match) => {
    await createPanel(msg, match, memory, disk, cpu, name);
  });
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌙 UNLIMITED PANEL - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/unli$/, (msg) => {
  if (shouldIgnoreMessage(msg)) return;
  
  const chatId = msg.chat.id;
  const isUserPremium = isPremium(msg.from.id);

  const unliPanel = `<blockquote>┌─⧼ <b>PANEL UNLIMITED</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>CARA PENGGUNAAN</b> ⧽
├ Format: <code>/unli username,idtelegram</code>
├ Contoh: <code>/unli username,123456789</code>
╰───────────────

┌─⧼ <b>STATUS SYSTEM</b> ⧽
${isUserPremium ? 
`├ ✅ Status: <b>AKTIF</b>
├ 💾 Memory: <b>UNLIMITED</b>
├ 💿 Disk: <b>UNLIMITED</b>
├ ⚡ CPU: <b>UNLIMITED</b>
╰───────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Siap membuat panel unlimited</i>
╰───────────────</blockquote>` : 
`├ ❌ Status: <b>BUTUH PREMIUM</b>
╰───────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan tak terbatas butuh pengorbanan</i>
├ Hubungi @botzmarket95 untuk upgrade
╰───────────────</blockquote>`}</blockquote>`;

  bot.sendMessage(chatId, unliPanel, {
    parse_mode: "HTML",
    reply_markup: !isUserPremium ? {
      inline_keyboard: [
        [{ text: "🕯️ UPGRADE PREMIUM", url: "https://t.me/botzmarket95" }]
      ]
    } : undefined
  });
});
bot.onText(/\/unli (.+)/, async (msg, match) => {
  if (shouldIgnoreMessage(msg)) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = match[1];

  // Cek apakah user adalah owner atau premium
  const isOwnerUser = isOwner(userId);
  const isPremiumUser = isPremium(userId);

  // Jika bukan owner dan bukan premium, tampilkan pesan premium
  if (!isOwnerUser && !isPremiumUser) {
    showPremiumInfo(chatId, "unli");
    return;
  }

  const t = text.split(",");
  if (t.length < 2) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>FORMAT SALAH</b> ⧽
├ ❌ Gunakan: <code>/unli username,id</code>
├ Contoh: <code>/unli username,7550928171</code>
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Format yang salah mengganggu kegelapan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
    return;
  }

  const username = t[0];
  const u = t[1];
  const name = username + "unli";
  const egg = settings.eggs;
  const loc = settings.loc;
  const memo = "0";
  const cpuLimit = "0";
  const diskLimit = "0";
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';
  const email = `${username}@unli.nation.id`;
  const akunlo = settings.pp;
  const password = generateRandomPassword();
  let user;
  let server;

  try {
    const response = await fetch(`${CONFIG.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.plta}`,
      },
      body: JSON.stringify({
        email: email,
        username: username,
        first_name: username,
        last_name: username,
        language: "en",
        password: password,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.errors) {
      if (data.errors[0].meta.rule === "unique" && data.errors[0].meta.source_field === "email") {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Email sudah digunakan
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Identitas ini sudah ada di kegelapan</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
      } else {
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${JSON.stringify(data.errors[0])}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
      }
      return;
    }
    user = data.attributes;
    
    const response2 = await fetch(`${CONFIG.domain}/api/application/servers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.plta}`,
      },
      body: JSON.stringify({
        name: name,
        description: "",
        user: user.id,
        egg: parseInt(egg),
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: spc,
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start",
        },
        limits: {
          memory: parseInt(memo),
          swap: 0,
          disk: parseInt(diskLimit),
          io: 500,
          cpu: parseInt(cpuLimit),
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1,
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: [],
        },
      }),
    });
    
    if (!response2.ok) {
      throw new Error(`HTTP Error: ${response2.status}`);
    }
    
    const data2 = await response2.json();
    server = data2.attributes;
  } catch (error) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>GAGAL MEMBUAT</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak pembuatan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
    return;
  }

  if (user && server) {
    const successText = `<blockquote>┌─⧼ <b>PANEL TERCIPTA</b> ⧽
├ ✅ Panel Unlimited Berhasil Dibuat!
├ 
├ ┌─⧼ <b>DETAIL PANEL</b> ⧽
├ │ • 👤 Nama: <b>${username}</b>
├ │ • 📧 Email: <b>${email}</b>
├ │ • 💾 Memory: <b>UNLIMITED</b>
├ │ • 💿 Disk: <b>UNLIMITED</b>
├ │ • ⚡ CPU: <b>UNLIMITED</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan tak terbatas telah bangkit</i>
╰──────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, successText, { parse_mode: "HTML" });

    if (akunlo) {
      const panelData = `<blockquote>┌─⧼ <b>DATA PANEL</b> ⧽
├ 🔐 Informasi Login Panel:
├ 
├ ┌─⧼ <b>AKSES PANEL</b> ⧽
├ │ • 🌐 Login: <b>${CONFIG.domain}</b>
├ │ • 👤 Username: <b>${user.username}</b>
├ │ • 🔑 Password: <b>${password}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>ATURAN PENGGUNAAN</b> ⧽
├ │ • Dilarang DDoS Server
├ │ • Wajib sensor domain
├ │ • Admin hanya kirim 1x
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan besar datang dengan tanggung jawab</i>
╰──────────────</blockquote></blockquote>`;

      bot.sendAnimation(u, akunlo, { caption: panelData, parse_mode: "HTML" });
      bot.sendMessage(chatId, 
          `<blockquote>┌─⧼ <b>DATA TERKIRIM</b> ⧽
├ ✅ Data panel sudah dikirim ke user
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Rahasia telah disampaikan</i>
╰──────────────</blockquote></blockquote>`, 
          { parse_mode: "HTML" }
      );
    }
  } else {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>GAGAL MEMBUAT</b> ⧽
├ ❌ Panel gagal dibuat
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak pembentukan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
  }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👑 ADMIN PANEL COMMANDS - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/createadmin$/, (msg) => {
  if (shouldIgnoreMessage(msg)) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    return bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa membuat panel admin
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini terlalu besar untukmu</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
  }

  const usageInfo = `<blockquote>┌─⧼ <b>ADMIN PANEL</b> ⧽
├ ⬡ Bot : BotzMarket Panel
├ ⬡ Owner : @botzmarket95
╰───────────────

┌─⧼ <b>CARA MEMBUAT ADMIN PANEL</b> ⧽
├ Format: <code>/createadmin username,idtelegram</code>
├ Contoh: <code>/createadmin username,123456789</code>
╰───────────────

<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan admin harus diberikan dengan bijak</i>
├ 👑 Hanya untuk yang terpilih
╰───────────────</blockquote></blockquote>`;

  bot.sendMessage(chatId, usageInfo, { parse_mode: "HTML" });
});

bot.onText(/\/createadmin (.+)/, async (msg, match) => {
  if (shouldIgnoreMessage(msg)) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    return bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Hanya admin yang bisa membuat panel admin
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan ini terlalu besar untukmu</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
  }

  const commandParams = match[1].split(",");
  if (commandParams.length < 2) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>FORMAT SALAH</b> ⧽
├ ❌ Gunakan: <code>/createadmin username,id</code>
├ Contoh: <code>/createadmin username,7550928171</code>
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Format yang salah mengganggu kegelapan</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
    return;
  }

  const panelName = commandParams[0].trim();
  const telegramId = commandParams[1].trim();
  const password = generateRandomPassword();

  try {
    const response = await fetch(`${CONFIG.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.plta}`,
      },
      body: JSON.stringify({
        email: `${panelName}@nation.id`,
        username: panelName,
        first_name: panelName,
        last_name: "Admin",
        language: "en",
        root_admin: true,
        password: password,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.errors) {
      bot.sendMessage(chatId, 
          `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${JSON.stringify(data.errors[0])}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`, 
          { parse_mode: "HTML" }
      );
      return;
    }
    
    const user = data.attributes;
    const userInfo = `<blockquote>┌─⧼ <b>ADMIN TERCIPTA</b> ⧽
├ ✅ Admin Panel Berhasil Dibuat!
├ 
├ ┌─⧼ <b>DETAIL ADMIN</b> ⧽
├ │ • 🔑 ID: <b>${user.id}</b>
├ │ • 👤 Username: <b>${user.username}</b>
├ │ • 📧 Email: <b>${user.email}</b>
├ │ • 👑 Status: <b>ROOT ADMIN</b>
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kekuatan admin telah diberikan</i>
╰──────────────</blockquote></blockquote>`;

    bot.sendMessage(chatId, userInfo, { parse_mode: "HTML" });
    
    const adminData = `<blockquote>┌─⧼ <b>DATA ADMIN</b> ⧽
├ 🔐 Informasi Login Admin Panel:
├ 
├ ┌─⧼ <b>AKSES ADMIN</b> ⧽
├ │ • 🌐 Login: <b>${CONFIG.domain}</b>
├ │ • 👤 Username: <b>${user.username}</b>
├ │ • 🔑 Password: <b>${password}</b>
├ ╰──────────────
├ 
├ ┌─⧼ <b>ATURAN PENGGUNAAN</b> ⧽
├ │ • Jangan nyolong script orang
├ │ • Jangan intip panel orang
├ │ • Jangan DDoS server
├ │ • Wajib sensor domain
├ │ • Jangan bagi panel gratis
├ ╰──────────────
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Dengan kekuatan besar datang tanggung jawab besar</i>
╰──────────────</blockquote></blockquote>`;

    bot.sendMessage(telegramId, adminData, { parse_mode: "HTML" });
    
  } catch (error) {
    bot.sendMessage(chatId, 
        `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Error: ${error.message}
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu</i>
╰──────────────</blockquote></blockquote>`, 
        { parse_mode: "HTML" }
    );
  }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ CLEANUP COMMANDS - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/clearusr(.*)/, async (msg, match) => {
    if (shouldIgnoreMessage(msg)) return;
    
    const chatId = msg.chat.id;
    const excludedUsers = match[1] ? match[1].trim().split(' ') : [];

    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>AKSES DITOLAK</b> ⧽
├ ❌ Fitur khusus admin!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Hanya yang terpilih bisa membersihkan</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }

    try {
        let response = await fetch(`${CONFIG.domain}/api/application/users`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.plta}`,
            }
        });

        let users = await response.json();
        if (!users || users.errors) {
            return bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Gagal mengambil daftar user!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan menolak</i>
╰──────────────</blockquote></blockquote>`, 
                { parse_mode: "HTML" }
            );
        }

        let usersToDelete = users.data.filter(user => !excludedUsers.includes(user.attributes.id.toString()));

        if (usersToDelete.length === 0) {
            return bot.sendMessage(chatId, 
                `<blockquote>┌─⧼ <b>INFO SYSTEM</b> ⧽
├ ℹ️ Tidak ada user untuk dihapus!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Sudah bersih dari jiwa asing</i>
╰──────────────</blockquote></blockquote>`, 
                { parse_mode: "HTML" }
            );
        }

        for (let user of usersToDelete) {
            let deleteResponse = await fetch(`${CONFIG.domain}/api/application/users/${user.attributes.id}`, {
                method: "DELETE",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${CONFIG.plta}`,
                }
            });

            if (deleteResponse.ok) {
                console.log(`✅ Sukses menghapus user ${user.attributes.id}`);
            }
        }

        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>BERSIHAN SELEMAT</b> ⧽
├ ✅ Berhasil menghapus <b>${usersToDelete.length}</b> user!
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan telah dibersihkan</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 
            `<blockquote>┌─⧼ <b>ERROR SYSTEM</b> ⧽
├ ❌ Terjadi kesalahan saat menghapus user.
╰──────────────
<blockquote>┌─⧼ <b>INFO</b> ⧽
├ <i>Kegelapan terganggu</i>
╰──────────────</blockquote></blockquote>`, 
            { parse_mode: "HTML" }
        );
    }
});
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 START BOT - BOTZMARKET
//━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function displayBotStatus() {
    const now = new Date();
    const formattedDate = now.toLocaleString();
    const runtime = getRuntime();
    
    const asciiArt = [
        "⠄⣾⣿⡇⢸⣿⣿⣿⠄⠈⣿⣿⣿⣿⠈⣿⡇⢹⣿⣿⣿⡇⡇⢸⣿⣿⡇⣿⣿⣿",
        "⢠⣿⣿⡇⢸⣿⣿⣿⡇⠄⢹⣿⣿⣿⡀⣿⣧⢸⣿⣿⣿⠁⡇⢸⣿⣿⠁⣿⣿⣿",
        "⢸⣿⣿⡇⠸⣿⣿⣿⣿⡄⠈⢿⣿⣿⡇⢸⣿⡀⣿⣿⡿⠸⡇⣸⣿⣿⠄⣿⣿⣿",
        "⢸⣿⡿⠷⠄⠿⠿⠿⠟⠓⠰⠘⠿⣿⣿⡈⣿⡇⢹⡟⠰⠦⠁⠈⠉⠋⠄⠻⢿⣿",
        "⢨⡑⠶⡏⠛⠐⠋⠓⠲⠶⣭⣤⣴⣦⣭⣥⣮⣾⣬⣴⡮⠝⠒⠂⠂⠘⠉⠿⠖⣬",
        "⠈⠉⠄⡀⠄⣀⣀⣀⣀⠈⢛⣿⣿⣿⣿⣿⣿⣿⣿⣟⠁⣀⣤⣤⣠⡀⠄⡀⠈⠁",
        "⠄⠠⣾⡀⣾⣿⣧⣼⣿⡿⢠⣿⣿⣿⣿⣿⣿⣿⣿⣧⣼⣿⣧⣼⣿⣿⢀⣿⡇⠄",
        "⡀⠄⠻⣷⡘⢿⣿⣿⡿⢣⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣜⢿⣿⣿⡿⢃⣾⠟⢁⠈",
        "⢃⢻⣶⣬⣿⣶⣬⣥⣶⣿⣿⣿⣿⣿⣿⢿⣿⣿⣿⣿⣿⣷⣶⣶⣾⣿⣷⣾⣾⢣"
    ];

    const colors = [201, 213, 225, 219, 213, 207, 201, 195, 189];
    
    console.clear();
    
    // Header
    console.log(`\x1b[1m\x1b[35m🎯 BOTZMARKET PANEL SYSTEM\x1b[0m \x1b[1m[\x1b[34m${formattedDate}\x1b[0m\x1b[1m]\x1b[0m`);
    console.log(`\x1b[1m\x1b[36m   🦠 𝗕𝗢𝗧𝗭𝗠𝗔𝗥𝗞𝗘𝗧 𝟮𝟬𝟮𝟱-𝟮𝟬𝟮𝟲 🦠\x1b[0m`);
    console.log('   \x1b[1m' + '═'.repeat(50) + '\x1b[0m');
    console.log('');
    
    // ASCII Art + Info Layout
    const infoLines = [
        `🤖 \x1b[1mBOT STATUS:  \x1b[31m[\x1b[0m \x1b[1m${aiEnabled ? 'AKTIF' : 'NONAKTIF'}\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `👑 \x1b[1mOWNER:       \x1b[31m[\x1b[0m \x1b[1m@botzmarket95\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `👤 \x1b[1mDEVELOPER:   \x1b[31m[\x1b[0m \x1b[1mRisky Dinata\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `⏱️  \x1b[1mRUNTIME:    \x1b[31m[\x1b[0m \x1b[1m${runtime}\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `🌐 \x1b[1mDOMAIN:      \x1b[31m[\x1b[0m \x1b[1m${CONFIG.domain}\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `👋 \x1b[1mWELCOME:     \x1b[31m[\x1b[0m \x1b[1mREADY\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `🚪 \x1b[1mGOODBYE:     \x1b[31m[\x1b[0m \x1b[1mREADY\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `🎵 \x1b[1mTTS SYSTEM:  \x1b[31m[\x1b[0m \x1b[1mREADY\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`,
        `📊 \x1b[1mCOMMANDS:    \x1b[31m[\x1b[0m \x1b[1m${panelCommands.length}\x1b[0m \x1b[1m\x1b[31m]\x1b[0m`
    ];
    
    // Display ASCII art and info side by side
    for (let i = 0; i < asciiArt.length; i++) {
        const asciiLine = asciiArt[i];
        const infoLine = infoLines[i] || '';
        const colorCode = colors[i];
        
        // Format: ASCII Art (colored) + spacing + Info
        console.log(`\x1b[38;5;${colorCode}m${asciiLine}\x1b[0m   ${infoLine}`);
    }
    
    // Footer
    console.log('');
    console.log('   \x1b[1m' + '─'.repeat(50) + '\x1b[0m');
    console.log(`🟢 \x1b[1m\x1b[32mSTATUS: OPERATIONAL\x1b[0m | \x1b[1m\x1b[33mPANEL SYSTEM\x1b[0m | \x1b[1m\x1b[35mREADY\x1b[0m`);
}

// Panggil fungsi untuk menampilkan status
displayBotStatus();

// Error handling
bot.on('polling_error', (error) => {
    console.log(`❌ \x1b[1mPOLLING ERROR: \x1b[31m${error.message}\x1b[0m`);
});

bot.on('error', (error) => {
    console.log(`❌ \x1b[1mBOT ERROR: \x1b[31m${error.message}\x1b[0m`);
});
