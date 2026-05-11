import makeWASocket, { useMultiFileAuthState, DisconnectReason, isJidBroadcast, } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import supabase from '../config/supabase.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Folder tempat session WhatsApp disimpan secara lokal */
const AUTH_FOLDER = './wa_auth';
/**
 * Tenant ID yang terkait dengan nomor WhatsApp bisnis ini.
 * Wajib diset di .env agar order bisa dikaitkan ke tenant yang benar.
 */
const WA_TENANT_ID = process.env.WA_TENANT_ID ?? '';
/**
 * Kamus Permanen: key yang cocok akan masuk ke profile_metadata pelanggan.
 * Key lainnya secara otomatis masuk ke custom_data order (order_custom_data).
 */
const PROFILE_DICT = ['email', 'plat nomor', 'nama'];
// ---------------------------------------------------------------------------
// Internal state — satu instance per proses
// ---------------------------------------------------------------------------
let sock = null;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Ekstrak nomor pengirim dari jid Baileys.
 * Format jid: "6281234567890@s.whatsapp.net"
 */
function parsePhoneNumber(jid) {
    return jid.split('@')[0];
}
/**
 * Apakah JID ini merupakan pesan dari status/broadcast yang harus diabaikan?
 */
function shouldIgnore(jid, fromMe) {
    if (fromMe)
        return true; // Pesan dari nomor sendiri
    if (isJidBroadcast(jid))
        return true; // Broadcast list
    if (jid === 'status@broadcast')
        return true;
    return false;
}
/**
 * Memecah teks pesan menjadi pasangan key-value lalu
 * men-routing-nya ke profile_metadata atau order_custom_data.
 *
 * Format yang dikenali (per baris):
 *   nama: Budi Santoso
 *   pesanan: Nasi Goreng x2
 */
function blindParser(text) {
    const result = { profile_metadata: {}, order_custom_data: {} };
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const separatorIdx = line.indexOf(':');
        if (separatorIdx === -1)
            continue; // Bukan format key: value — lewati
        const rawKey = line.slice(0, separatorIdx).trim().toLowerCase();
        const value = line.slice(separatorIdx + 1).trim();
        if (!rawKey || !value)
            continue;
        if (PROFILE_DICT.includes(rawKey)) {
            result.profile_metadata[rawKey] = value;
        }
        else {
            result.order_custom_data[rawKey] = value;
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Bisnis: Process WA Order
// ---------------------------------------------------------------------------
/**
 * Orkestrasi penuh dari satu pesan WhatsApp:
 * 1. Parse blind → profile_metadata & order_custom_data
 * 2. Cek idempotency (whatsapp_message_id sudah ada?)
 * 3. Upsert customer berdasarkan nomor WA
 * 4. Insert draft order
 */
async function processWhatsAppOrder(msgId, phoneNumber, text) {
    if (!WA_TENANT_ID) {
        console.error('[WhatsApp] WA_TENANT_ID tidak diset di .env! Order diabaikan.');
        return;
    }
    // ── 1. Blind Parsing ──
    const { profile_metadata, order_custom_data } = blindParser(text);
    console.log(`   📊 profile_metadata  :`, profile_metadata);
    console.log(`   📦 order_custom_data :`, order_custom_data);
    // ── 2. Idempotency Check ──
    const { data: existingOrder, error: idempotencyError } = await supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', WA_TENANT_ID)
        .eq('whatsapp_message_id', msgId)
        .maybeSingle();
    if (idempotencyError) {
        console.error('[WhatsApp] Idempotency check gagal:', idempotencyError.message);
        return;
    }
    if (existingOrder) {
        console.warn(`   ⚠️  Duplikat! Order dengan message_id ${msgId} sudah ada (id: ${existingOrder.id}). Diabaikan.`);
        return;
    }
    // ── 3. Upsert Customer ──
    const { data: customer, error: customerError } = await supabase
        .from('customers')
        .upsert({
        tenant_id: WA_TENANT_ID,
        phone_number: phoneNumber,
        // Jika ada nama di profile_metadata, gunakan — fallback ke nomor WA
        name: profile_metadata['nama'] ?? phoneNumber,
        profile_metadata,
    }, {
        onConflict: 'tenant_id,phone_number', // UNIQUE constraint di schema
        ignoreDuplicates: false, // Tetap lakukan UPDATE
    })
        .select('id')
        .single();
    if (customerError || !customer) {
        console.error('[WhatsApp] Gagal upsert customer:', customerError?.message);
        return;
    }
    console.log(`   ✅ Customer upserted, id: ${customer.id}`);
    // ── 4. Insert Draft Order ──
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
        tenant_id: WA_TENANT_ID,
        customer_id: customer.id,
        source: 'whatsapp',
        status: 'draft',
        payment_status: 'unpaid',
        subtotal_amount: 0,
        discount_amount: 0,
        total_amount: 0,
        whatsapp_message_id: msgId,
        custom_data: order_custom_data,
    })
        .select('id')
        .single();
    if (orderError || !order) {
        console.error('[WhatsApp] Gagal insert order:', orderError?.message);
        return;
    }
    console.log(`   ✅ Draft order dibuat, id: ${order.id}`);
}
// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleIncomingMessages(messages) {
    for (const msg of messages) {
        const jid = msg.key.remoteJid ?? '';
        const fromMe = msg.key.fromMe ?? false;
        const msgId = msg.key.id ?? 'unknown';
        // Guard: abaikan pesan yang tidak relevan
        if (shouldIgnore(jid, fromMe))
            continue;
        // Hanya proses pesan teks biasa
        const textContent = msg.message?.conversation ?? // Teks langsung
            msg.message?.extendedTextMessage?.text; // Teks dengan preview link
        if (!textContent)
            continue; // Bukan teks biasa — lewati
        const sender = parsePhoneNumber(jid);
        console.log('────────────────────────────────────────');
        console.log(`📩 [WhatsApp] Pesan Masuk`);
        console.log(`   ID Pesan  : ${msgId}`);
        console.log(`   Pengirim  : +${sender}`);
        console.log(`   Isi Teks  : ${textContent}`);
        console.log('────────────────────────────────────────');
        // Proses sebagai order WhatsApp (fire-and-forget, error sudah di-log di dalam)
        processWhatsAppOrder(msgId, sender, textContent).catch((err) => console.error('[WhatsApp] processWhatsAppOrder error:', err));
    }
}
// ---------------------------------------------------------------------------
// Core: initializeWhatsApp
// ---------------------------------------------------------------------------
/**
 * Inisialisasi koneksi WhatsApp menggunakan Baileys.
 *
 * - Menampilkan QR code di terminal untuk di-scan admin.
 * - Menyimpan session di folder `./wa_auth` agar tidak perlu scan ulang.
 * - Menangkap pesan teks masuk dan men-log-nya ke console.
 * - Otomatis reconnect saat koneksi terputus (kecuali logout eksplisit).
 *
 * @returns Promise yang resolve setelah socket berhasil dibuat.
 */
export async function initializeWhatsApp() {
    // Muat atau buat state autentikasi dari folder lokal
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Kita handle QR sendiri agar lebih eksplisit
    });
    // ── Event: Simpan credentials setiap kali berubah ──
    sock.ev.on('creds.update', saveCreds);
    // ── Event: Status koneksi ──
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        // Tampilkan QR di terminal jika belum login
        if (qr) {
            console.log('\n🔲 Scan QR Code di bawah ini menggunakan WhatsApp Anda:\n');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.log(shouldReconnect
                ? `⚠️  [WhatsApp] Koneksi terputus (kode: ${reason}). Mencoba sambung ulang...`
                : '🔴 [WhatsApp] Logout terdeteksi. Hapus folder ./wa_auth dan restart untuk login ulang.');
            if (shouldReconnect) {
                // Reconnect: panggil ulang fungsi ini secara rekursif
                initializeWhatsApp().catch(console.error);
            }
        }
        if (connection === 'open') {
            console.log('🟢 [WhatsApp] Terhubung! Siap menerima pesan.');
        }
    });
    // ── Event: Pesan masuk ──
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        // Hanya proses pesan baru (notify), bukan pesan histori yang di-load
        if (type !== 'notify')
            return;
        // handleIncomingMessages adalah async — error sudah dihandle di dalam
        handleIncomingMessages(messages).catch((err) => console.error('[WhatsApp] handleIncomingMessages error:', err));
    });
    return sock;
}
/**
 * Mengembalikan instance socket WhatsApp yang sedang aktif.
 * Berguna untuk mengirim pesan dari controller lain.
 *
 * @throws Error jika `initializeWhatsApp()` belum pernah dipanggil.
 */
export function getWhatsAppSocket() {
    if (!sock) {
        throw new Error('[WhatsApp] Socket belum diinisialisasi. Panggil initializeWhatsApp() terlebih dahulu.');
    }
    return sock;
}
