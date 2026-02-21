const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function loadDotEnvFile() {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) {
        return;
    }

    const raw = fs.readFileSync(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
        const cleaned = String(line || "").trim();
        if (!cleaned || cleaned.startsWith("#")) {
            return;
        }

        const separatorIndex = cleaned.indexOf("=");
        if (separatorIndex < 1) {
            return;
        }

        const key = cleaned.slice(0, separatorIndex).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
            return;
        }

        let value = cleaned.slice(separatorIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    });
}

loadDotEnvFile();

let nodemailer = null;
try {
    nodemailer = require("nodemailer");
} catch (_error) {
    nodemailer = null;
}

let mysql = null;
try {
    mysql = require("mysql2/promise");
} catch (_error) {
    mysql = null;
}

const RAW_PORT = Number(process.env.PORT || process.env.KYC_PORT || "");
const PORT = (Number.isFinite(RAW_PORT) && RAW_PORT > 0) ? RAW_PORT : 5050;
const PUBLIC_API_BASE = String(process.env.PUBLIC_API_BASE || "").trim().replace(/\/+$/, "");

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const otpSessions = new Map();
const RAW_SESSION_TTL_MS = Number(process.env.AUTH_SESSION_TTL_MS || "");
const SESSION_TTL_MS = (
    Number.isFinite(RAW_SESSION_TTL_MS) && RAW_SESSION_TTL_MS >= 5 * 60 * 1000
)
    ? RAW_SESSION_TTL_MS
    : 24 * 60 * 60 * 1000;
const authSessions = new Map();
const ALLOW_DEMO_OTP = String(process.env.ALLOW_DEMO_OTP || "").trim().toLowerCase() === "true";

const DEFAULT_ADMIN_LOGIN_ID = String(process.env.ADMIN_LOGIN_ID || "echodrive").trim();
const DEFAULT_ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "echodriveadmin123");
const ADMIN_CREDENTIALS_PATH = path.join(__dirname, "admin-credentials.json");
let adminCredentialsCache = null;

const MYSQL_URL = String(process.env.MYSQL_URL || process.env.DATABASE_URL || "").trim();
let DB_HOST = String(process.env.DB_HOST || "127.0.0.1").trim();
let DB_PORT = Number(process.env.DB_PORT || "3306");
let DB_USER = String(process.env.DB_USER || "root").trim();
let DB_PASSWORD = String(process.env.DB_PASSWORD || "").trim();
let DB_NAME = String(process.env.DB_NAME || "ecodrive_db").trim();
const DB_SSL_MODE = String(process.env.DB_SSL || "").trim().toLowerCase();
const DB_SSL_REJECT_UNAUTHORIZED = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true")
    .trim()
    .toLowerCase() !== "false";
let dbPool = null;

if (MYSQL_URL) {
    try {
        const parsedDbUrl = new URL(MYSQL_URL);
        if (parsedDbUrl.hostname) {
            DB_HOST = parsedDbUrl.hostname;
        }
        if (parsedDbUrl.port) {
            const parsedPort = Number(parsedDbUrl.port);
            if (Number.isFinite(parsedPort) && parsedPort > 0) {
                DB_PORT = parsedPort;
            }
        }
        if (parsedDbUrl.username) {
            DB_USER = decodeURIComponent(parsedDbUrl.username);
        }
        if (parsedDbUrl.password) {
            DB_PASSWORD = decodeURIComponent(parsedDbUrl.password);
        }
        const dbNameFromPath = String(parsedDbUrl.pathname || "").replace(/^\/+/, "").trim();
        if (dbNameFromPath) {
            DB_NAME = dbNameFromPath;
        }
    } catch (error) {
        console.warn("[db-config] Invalid MYSQL_URL/DATABASE_URL:", error && error.message ? error.message : error);
    }
}

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";

const SMS_WEBHOOK_URL = String(process.env.SMS_WEBHOOK_URL || "").trim();
const SMS_WEBHOOK_TOKEN = String(process.env.SMS_WEBHOOK_TOKEN || "").trim();
let smtpTransport = null;

const DEFAULT_PRODUCT_CATALOG = [
    { model: "BLITZ 2000", price: 68000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 1.png", detailUrl: "/Userhomefolder/Ebikes/ebike1.0.html" },
    { model: "BLITZ 1200", price: 45000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 2.png", detailUrl: "/Userhomefolder/Ebikes/ebike2.0.html" },
    { model: "FUN 1500 FI", price: 74000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 3.png", detailUrl: "/Userhomefolder/Ebikes/ebike3.0.html" },
    { model: "CANDY 800", price: 58000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 4.png", detailUrl: "/Userhomefolder/Ebikes/ebike4.0.html" },
    { model: "BLITZ 200R", price: 74000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 5.png", detailUrl: "/Userhomefolder/Ebikes/ebike5.0.html" },
    { model: "TRAVELLER 1500", price: 79000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 6.png", detailUrl: "/Userhomefolder/Ebikes/ebike6.0.html" },
    { model: "ECONO 500 MP", price: 51500, category: "2-Wheel", imageUrl: "/Userhomefolder/image 7.png", detailUrl: "/Userhomefolder/Ebikes/ebike7.0.html" },
    { model: "ECONO 350 MINI-II", price: 58000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 8.png", detailUrl: "/Userhomefolder/Ebikes/ebike8.0.html" },
    { model: "ECARGO 100", price: 72500, category: "3-Wheel", imageUrl: "/Userhomefolder/image 9.png", detailUrl: "/Userhomefolder/Ebikes/ebike9.0.html" },
    { model: "ECONO 650 MP", price: 65000, category: "3-Wheel", imageUrl: "/Userhomefolder/image 10.png", detailUrl: "/Userhomefolder/Ebikes/ebike10.0.html" },
    { model: "ECAB 100V V2", price: 51500, category: "3-Wheel", imageUrl: "/Userhomefolder/image 11.png", detailUrl: "/Userhomefolder/Ebikes/ebike11.0.html" },
    { model: "ECONO 800 MP II", price: 67000, category: "3-Wheel", imageUrl: "/Userhomefolder/image 12.png", detailUrl: "/Userhomefolder/Ebikes/ebike12.0.html" },
    { model: "E-CARGO 800", price: 205000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 13.png", detailUrl: "/Userhomefolder/Ebikes/ebike13.0.html" },
    { model: "E-CAB MAX 1500", price: 130000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 14.png", detailUrl: "/Userhomefolder/Ebikes/ebike14.0.html" },
    { model: "E-CAB 1000", price: 75000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 15.png", detailUrl: "/Userhomefolder/Ebikes/ebike15.0.html" },
    { model: "ECONO 800 MP", price: 100000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 16.png", detailUrl: "/Userhomefolder/Ebikes/ebike16.0.html" }
];
const MAX_PRODUCT_IMAGE_DATA_URL_LENGTH = 3 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 8 * 1024 * 1024) {
                reject(new Error("Payload too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            try {
                const parsed = raw ? JSON.parse(raw) : {};
                resolve(parsed);
            } catch (_error) {
                reject(new Error("Invalid JSON payload"));
            }
        });
        req.on("error", reject);
    });
}

function isDataImage(value) {
    return typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);
}

function createVerificationToken(source) {
    const random = crypto.randomBytes(10).toString("hex");
    return `${source}_${Date.now()}_${random}`;
}

function estimateDistance(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    if (!left || !right) {
        return 1;
    }

    const min = Math.min(left.length, right.length);
    let same = 0;
    for (let i = 0; i < min; i += 97) {
        if (left.charCodeAt(i) === right.charCodeAt(i)) {
            same += 1;
        }
    }

    const similarity = same / Math.max(1, Math.floor(min / 97));
    return Number((0.85 - similarity * 0.55).toFixed(3));
}

function htmlEscape(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeMobile(value) {
    const raw = String(value || "").trim().replace(/[^\d+]/g, "");
    if (/^09\d{9}$/.test(raw)) {
        return raw;
    }
    if (/^\+639\d{9}$/.test(raw)) {
        return `0${raw.slice(3)}`;
    }
    if (/^639\d{9}$/.test(raw)) {
        return `0${raw.slice(2)}`;
    }
    return raw.replace(/\D/g, "");
}

function isValidMobile(value) {
    const normalized = String(value || "").trim().replace(/[\s-]/g, "");
    return /^(\+639|09)\d{9}$/.test(normalized);
}

function normalizeMiddleInitial(value) {
    const cleaned = String(value || "").trim().replace(/[^a-zA-Z]/g, "");
    if (!cleaned) {
        return "";
    }
    return cleaned.slice(0, 1).toUpperCase();
}

function normalizeNamePart(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function buildFullName(firstName, middleInitial, lastName) {
    const middlePart = middleInitial ? `${middleInitial}.` : "";
    return [firstName, middlePart, lastName].filter(Boolean).join(" ");
}

function isStrongPassword(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(String(password || ""));
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
    return `scrypt:${salt}:${derived}`;
}

function verifyPassword(plainPassword, storedHash) {
    const plain = String(plainPassword || "");
    const stored = String(storedHash || "");

    if (!stored) {
        return false;
    }

    if (!stored.startsWith("scrypt:")) {
        return plain === stored;
    }

    const parts = stored.split(":");
    if (parts.length !== 3) {
        return false;
    }

    const salt = parts[1];
    const hashHex = parts[2];

    try {
        const left = Buffer.from(hashHex, "hex");
        const right = Buffer.from(crypto.scryptSync(plain, salt, 64).toString("hex"), "hex");
        return left.length === right.length && crypto.timingSafeEqual(left, right);
    } catch (_error) {
        return false;
    }
}

function normalizeAdminLoginId(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidAdminLoginId(value) {
    const normalized = normalizeAdminLoginId(value);
    if (normalized.length < 3 || normalized.length > 190) {
        return false;
    }
    return /^[a-z0-9._@+\-]+$/.test(normalized);
}

function sanitizeAdminCredentials(rawInput) {
    const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
    const loginId = normalizeAdminLoginId(raw.loginId || raw.username || raw.email);
    const passwordHash = String(raw.passwordHash || "").trim();
    if (!isValidAdminLoginId(loginId) || !passwordHash) {
        return null;
    }
    return {
        loginId: loginId,
        passwordHash: passwordHash,
        updatedAt: String(raw.updatedAt || new Date().toISOString())
    };
}

function createDefaultAdminCredentials() {
    return {
        loginId: isValidAdminLoginId(DEFAULT_ADMIN_LOGIN_ID)
            ? normalizeAdminLoginId(DEFAULT_ADMIN_LOGIN_ID)
            : "echodrive",
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        updatedAt: new Date().toISOString()
    };
}

function getEnvAdminCredentials() {
    const loginIdRaw = String(process.env.ADMIN_LOGIN_ID || "").trim();
    const passwordRaw = String(process.env.ADMIN_PASSWORD || "");
    if (!loginIdRaw || !passwordRaw) {
        return null;
    }

    const loginId = normalizeAdminLoginId(loginIdRaw);
    if (!isValidAdminLoginId(loginId)) {
        return null;
    }

    return {
        loginId: loginId,
        passwordHash: hashPassword(passwordRaw),
        updatedAt: new Date().toISOString()
    };
}

function readAdminCredentialsFromDisk() {
    if (!fs.existsSync(ADMIN_CREDENTIALS_PATH)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(ADMIN_CREDENTIALS_PATH, "utf8");
        const parsed = raw ? JSON.parse(raw) : {};
        return sanitizeAdminCredentials(parsed);
    } catch (_error) {
        return null;
    }
}

function writeAdminCredentialsToDisk(credentialsInput) {
    const credentials = sanitizeAdminCredentials(credentialsInput);
    if (!credentials) {
        throw new Error("Invalid admin credentials payload.");
    }

    fs.writeFileSync(
        ADMIN_CREDENTIALS_PATH,
        JSON.stringify(credentials, null, 2) + "\n",
        "utf8"
    );
}

function getAdminCredentials() {
    if (adminCredentialsCache) {
        return adminCredentialsCache;
    }

    const fromEnv = getEnvAdminCredentials();
    if (fromEnv) {
        adminCredentialsCache = fromEnv;
        return adminCredentialsCache;
    }

    const fromDisk = readAdminCredentialsFromDisk();
    if (fromDisk) {
        adminCredentialsCache = fromDisk;
        return adminCredentialsCache;
    }

    const fallback = createDefaultAdminCredentials();
    adminCredentialsCache = fallback;
    try {
        writeAdminCredentialsToDisk(fallback);
    } catch (error) {
        console.warn("[admin-auth] Unable to persist default admin credentials:", error.message || error);
    }
    return adminCredentialsCache;
}

function saveAdminCredentials(updatesInput) {
    const current = getAdminCredentials();
    const updates = updatesInput && typeof updatesInput === "object" ? updatesInput : {};
    const candidate = {
        loginId: Object.prototype.hasOwnProperty.call(updates, "loginId")
            ? normalizeAdminLoginId(updates.loginId)
            : current.loginId,
        passwordHash: Object.prototype.hasOwnProperty.call(updates, "passwordHash")
            ? String(updates.passwordHash || "").trim()
            : current.passwordHash,
        updatedAt: new Date().toISOString()
    };

    const sanitized = sanitizeAdminCredentials(candidate);
    if (!sanitized) {
        throw new Error("Invalid admin credentials.");
    }

    writeAdminCredentialsToDisk(sanitized);
    adminCredentialsCache = sanitized;
    return adminCredentialsCache;
}

function normalizeContact(method, value) {
    if (method === "email") {
        return normalizeEmail(value);
    }
    if (method === "mobile") {
        return normalizeMobile(value);
    }
    return "";
}

function generateOtpCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function clearExpiredOtpSessions() {
    const now = Date.now();
    for (const [requestId, session] of otpSessions.entries()) {
        if (!session || session.expiresAt <= now) {
            otpSessions.delete(requestId);
        }
    }
}

function clearExpiredAuthSessions() {
    const now = Date.now();
    for (const [token, session] of authSessions.entries()) {
        if (!session || session.expiresAt <= now) {
            authSessions.delete(token);
        }
    }
}

function normalizeUserRole(value) {
    return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "user";
}

function createAuthSession(userInput) {
    const user = userInput && typeof userInput === "object" ? userInput : {};
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");

    const session = {
        token: token,
        userId: Number(user.id || 0),
        role: normalizeUserRole(user.role),
        email: normalizeEmail(user.email),
        name: String(user.name || "").trim(),
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS
    };

    authSessions.set(token, session);
    clearExpiredAuthSessions();
    return session;
}

function getAuthTokenFromRequest(req) {
    const raw = String((req && req.headers && req.headers.authorization) || "").trim();
    if (!raw) {
        return "";
    }
    const match = raw.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return "";
    }
    return String(match[1] || "").trim();
}

function getAuthSessionFromRequest(req) {
    clearExpiredAuthSessions();
    const token = getAuthTokenFromRequest(req);
    if (!token) {
        return null;
    }
    const session = authSessions.get(token);
    if (!session) {
        return null;
    }
    if (session.expiresAt <= Date.now()) {
        authSessions.delete(token);
        return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    authSessions.set(token, session);
    return session;
}

function requireAuthSession(req, res, options) {
    const opts = options && typeof options === "object" ? options : {};
    const session = getAuthSessionFromRequest(req);
    if (!session) {
        sendJson(res, 401, {
            success: false,
            message: "Authentication required. Please sign in again."
        });
        return null;
    }

    if (opts.role && normalizeUserRole(opts.role) !== session.role) {
        sendJson(res, 403, {
            success: false,
            message: "You do not have permission to access this resource."
        });
        return null;
    }

    return session;
}

function getAuthResponse(session) {
    if (!session) {
        return {
            token: "",
            expiresInMs: SESSION_TTL_MS,
            expiresAt: null
        };
    }

    return {
        token: String(session.token || ""),
        expiresInMs: SESSION_TTL_MS,
        expiresAt: new Date(session.expiresAt).toISOString()
    };
}

function canAccessEmail(session, targetEmail) {
    if (!session) {
        return false;
    }

    if (session.role === "admin") {
        return true;
    }

    return normalizeEmail(targetEmail) === normalizeEmail(session.email);
}

function isDbConfigured() {
    return Boolean(mysql && DB_HOST && Number.isFinite(DB_PORT) && DB_PORT > 0 && DB_USER && DB_NAME);
}

async function hasColumn(pool, tableName, columnName) {
    const [rows] = await pool.execute(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );
    return Array.isArray(rows) && rows.length > 0;
}

function getDbSslConfig() {
    if (!DB_SSL_MODE || DB_SSL_MODE === "false" || DB_SSL_MODE === "0" || DB_SSL_MODE === "off") {
        return undefined;
    }
    return {
        rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED
    };
}

async function getDbPool() {
    if (!mysql) {
        throw new Error("Missing mysql2 package. Run: npm install mysql2");
    }
    if (!isDbConfigured()) {
        throw new Error("MySQL is not configured. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.");
    }
    if (dbPool) {
        return dbPool;
    }

    dbPool = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        ssl: getDbSslConfig(),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    return dbPool;
}

async function ensureDbSchema() {
    if (!isDbConfigured()) {
        return;
    }

    try {
        const pool = await getDbPool();
        await pool.execute(
            `CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                first_name VARCHAR(80) NOT NULL,
                middle_initial VARCHAR(3) NULL,
                last_name VARCHAR(80) NOT NULL,
                full_name VARCHAR(200) NOT NULL,
                email VARCHAR(190) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                address VARCHAR(255) NOT NULL,
                avatar_data_url MEDIUMTEXT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
                is_blocked TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_login_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_users_email (email),
                UNIQUE KEY uq_users_phone (phone),
                KEY idx_users_role_blocked (role, is_blocked),
                KEY idx_users_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );

        try {
            const usersHasAvatar = await hasColumn(pool, "users", "avatar_data_url");
            if (!usersHasAvatar) {
                await pool.execute(
                    "ALTER TABLE users ADD COLUMN avatar_data_url MEDIUMTEXT NULL AFTER address"
                );
            }
        } catch (alterError) {
            console.warn("[db-schema] Unable to add users.avatar_data_url automatically:", alterError.message || alterError);
        }

        await pool.execute(
            `CREATE TABLE IF NOT EXISTS bookings (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                order_id VARCHAR(64) NOT NULL,
                user_id BIGINT UNSIGNED NULL,
                full_name VARCHAR(200) NOT NULL,
                email VARCHAR(190) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                model VARCHAR(180) NOT NULL,
                bike_image VARCHAR(255) NULL,
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                payment_method VARCHAR(80) NOT NULL,
                service_type VARCHAR(40) NOT NULL,
                status VARCHAR(80) NOT NULL DEFAULT 'Pending review',
                fulfillment_status VARCHAR(80) NOT NULL DEFAULT 'In Process',
                shipping_address VARCHAR(255) NULL,
                shipping_lat DECIMAL(10,6) NULL,
                shipping_lng DECIMAL(10,6) NULL,
                shipping_map_embed_url TEXT NULL,
                user_email VARCHAR(190) NULL,
                installment_payload LONGTEXT NULL,
                review_decision ENUM('approved', 'rejected', 'none') NOT NULL DEFAULT 'none',
                reviewed_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_bookings_order_id (order_id),
                KEY idx_bookings_email (email),
                KEY idx_bookings_user_email (user_email),
                KEY idx_bookings_review_decision (review_decision),
                KEY idx_bookings_created_at (created_at),
                CONSTRAINT fk_bookings_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );

        await pool.execute(
            `CREATE TABLE IF NOT EXISTS products (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                model VARCHAR(180) NOT NULL,
                price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                category ENUM('2-Wheel', '3-Wheel', '4-Wheel', 'Other') NOT NULL DEFAULT 'Other',
                product_info VARCHAR(255) NULL,
                image_url MEDIUMTEXT NULL,
                detail_url VARCHAR(255) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_products_model_category (model, category),
                KEY idx_products_active_category (is_active, category),
                KEY idx_products_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );

        try {
            const productsHasInfo = await hasColumn(pool, "products", "product_info");
            if (!productsHasInfo) {
                await pool.execute(
                    "ALTER TABLE products ADD COLUMN product_info VARCHAR(255) NULL AFTER category"
                );
            }
        } catch (alterError) {
            console.warn("[db-schema] Unable to add products.product_info automatically:", alterError.message || alterError);
        }

        try {
            await pool.execute(
                "ALTER TABLE products MODIFY COLUMN image_url MEDIUMTEXT NULL"
            );
        } catch (alterError) {
            console.warn("[db-schema] Unable to widen products.image_url automatically:", alterError.message || alterError);
        }

        if (Array.isArray(DEFAULT_PRODUCT_CATALOG) && DEFAULT_PRODUCT_CATALOG.length > 0) {
            const placeholders = [];
            const values = [];
            DEFAULT_PRODUCT_CATALOG.forEach((item) => {
                placeholders.push("(?, ?, ?, ?, ?, ?, 1)");
                values.push(
                    String(item.model || "").slice(0, 180),
                    Number(item.price || 0),
                    String(item.category || "Other"),
                    item.info ? normalizeText(item.info).slice(0, 255) : null,
                    item.imageUrl ? String(item.imageUrl).slice(0, 255) : null,
                    item.detailUrl ? String(item.detailUrl).slice(0, 255) : null
                );
            });

            await pool.execute(
                `INSERT IGNORE INTO products (
                    model,
                    price,
                    category,
                    product_info,
                    image_url,
                    detail_url,
                    is_active
                ) VALUES ${placeholders.join(", ")}`,
                values
            );
        }
    } catch (error) {
        console.warn("[db-schema] Unable to auto-prepare schema:", error.message || error);
    }
}

function isSmtpConfigured() {
    return Boolean(
        nodemailer &&
        SMTP_HOST &&
        Number.isFinite(SMTP_PORT) &&
        SMTP_PORT > 0 &&
        SMTP_USER &&
        SMTP_PASS &&
        SMTP_FROM
    );
}

function getSmtpTransport() {
    if (!isSmtpConfigured()) {
        return null;
    }
    if (smtpTransport) {
        return smtpTransport;
    }

    smtpTransport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });
    return smtpTransport;
}

async function sendOtpEmail(email, code) {
    const transport = getSmtpTransport();
    if (!transport) {
        return { sent: false, reason: "SMTP is not configured." };
    }

    try {
        await transport.sendMail({
            from: SMTP_FROM,
            to: email,
            subject: "Ecodrive password reset code",
            text: `Your Ecodrive verification code is ${code}. It expires in 5 minutes.`,
            html: `<p>Your Ecodrive verification code is <strong>${htmlEscape(code)}</strong>.</p><p>This code expires in 5 minutes.</p>`
        });
        return { sent: true, provider: "smtp" };
    } catch (error) {
        return { sent: false, reason: error.message || "SMTP send failed." };
    }
}

async function sendOtpSms(mobile, code) {
    if (!SMS_WEBHOOK_URL) {
        return { sent: false, reason: "SMS_WEBHOOK_URL is not configured." };
    }
    if (typeof fetch !== "function") {
        return { sent: false, reason: "Global fetch is unavailable in this Node version." };
    }

    const headers = { "Content-Type": "application/json" };
    if (SMS_WEBHOOK_TOKEN) {
        headers.Authorization = `Bearer ${SMS_WEBHOOK_TOKEN}`;
    }

    try {
        const response = await fetch(SMS_WEBHOOK_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                to: mobile,
                code: code,
                message: `Your Ecodrive verification code is ${code}. It expires in 5 minutes.`
            })
        });

        if (!response.ok) {
            return { sent: false, reason: `SMS webhook returned ${response.status}.` };
        }
        return { sent: true, provider: "sms-webhook" };
    } catch (error) {
        return { sent: false, reason: error.message || "SMS delivery failed." };
    }
}

async function deliverOtp(method, contact, code) {
    if (method === "email") {
        return sendOtpEmail(contact, code);
    }
    if (method === "mobile") {
        return sendOtpSms(contact, code);
    }
    return { sent: false, reason: "Unsupported delivery method." };
}

function getDuplicateField(errorMessage) {
    const msg = String(errorMessage || "").toLowerCase();
    if (msg.includes("email")) {
        return "email";
    }
    if (msg.includes("phone")) {
        return "phone";
    }
    return "";
}

function normalizeText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeOrderId(value, allowFallback) {
    const cleaned = normalizeText(value).replace(/[^\w\-]/g, "");
    if (cleaned) {
        return cleaned.slice(0, 64);
    }
    if (allowFallback !== false) {
        return `EC-${Date.now()}`;
    }
    return "";
}

function normalizeServiceType(value) {
    const raw = normalizeText(value).toLowerCase();
    if (raw === "pick up" || raw === "pickup") {
        return "Pick Up";
    }
    if (raw === "installment") {
        return "Installment";
    }
    return "Delivery";
}

function normalizeOrderStatus(value, serviceType) {
    const status = normalizeText(value);
    if (status) {
        return status.slice(0, 80);
    }
    if (serviceType === "Installment") {
        return "Application Review";
    }
    return "Pending review";
}

function normalizeFulfillmentStatus(value, serviceType) {
    const status = normalizeText(value);
    if (status) {
        return status.slice(0, 80);
    }
    if (serviceType === "Pick Up") {
        return "Ready to Pick up";
    }
    if (serviceType === "Installment") {
        return "Under Review";
    }
    return "In Process";
}

function parseAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return 0;
    }
    return Number(amount.toFixed(2));
}

function normalizeProductModel(value) {
    return normalizeText(value).slice(0, 180);
}

function normalizeProductCategory(value) {
    const raw = normalizeText(value).toLowerCase();
    if (!raw) {
        return "Other";
    }
    if (raw.includes("2")) {
        return "2-Wheel";
    }
    if (raw.includes("3")) {
        return "3-Wheel";
    }
    if (raw.includes("4")) {
        return "4-Wheel";
    }
    return "Other";
}

function normalizeProductPrice(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            return null;
        }
        return Number(value.toFixed(2));
    }

    const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }
    return Number(numeric.toFixed(2));
}

function normalizeProductUrl(value) {
    const cleaned = String(value || "").trim();
    if (!cleaned) {
        return "";
    }
    return cleaned.slice(0, 255);
}

function normalizeProductImage(value) {
    const cleaned = String(value || "").trim();
    if (!cleaned) {
        return "";
    }
    if (isDataImage(cleaned)) {
        return cleaned;
    }
    return cleaned.slice(0, 255);
}

function normalizeProductInfo(value) {
    return normalizeText(value).slice(0, 255);
}

function normalizeOptionalBoolean(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return Boolean(fallback);
    }
    if (typeof value === "boolean") {
        return value;
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }
    return Boolean(fallback);
}

function normalizeOptionalNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return null;
    }
    return Number(num.toFixed(6));
}

function getReviewDecisionFromStatus(status, fulfillmentStatus) {
    const merged = `${String(status || "")} ${String(fulfillmentStatus || "")}`.toLowerCase();
    if (merged.includes("reject")) {
        return "rejected";
    }
    if (merged.includes("approve")) {
        return "approved";
    }
    return "none";
}

function mapProductRow(row) {
    return {
        id: Number(row.id || 0),
        model: String(row.model || "Ecodrive E-Bike"),
        price: Number(row.price || 0),
        category: String(row.category || "Other"),
        info: String(row.product_info || ""),
        imageUrl: String(row.image_url || ""),
        detailUrl: String(row.detail_url || ""),
        isActive: Number(row.is_active || 0) > 0,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

function mapBookingRow(row) {
    let installment = null;
    if (row && row.installment_payload) {
        try {
            installment = JSON.parse(row.installment_payload);
        } catch (_error) {
            installment = null;
        }
    }

    return {
        id: Number(row.id || 0),
        orderId: String(row.order_id || ""),
        fullName: String(row.full_name || ""),
        email: String(row.email || ""),
        phone: String(row.phone || ""),
        model: String(row.model || "Ecodrive E-Bike"),
        bikeImage: String(row.bike_image || ""),
        subtotal: Number(row.subtotal || 0),
        shippingFee: Number(row.shipping_fee || 0),
        total: Number(row.total || 0),
        payment: String(row.payment_method || ""),
        service: String(row.service_type || ""),
        status: String(row.status || ""),
        fulfillmentStatus: String(row.fulfillment_status || ""),
        shippingAddress: String(row.shipping_address || ""),
        shippingCoordinates: (
            row.shipping_lat !== null &&
            row.shipping_lat !== undefined &&
            row.shipping_lng !== null &&
            row.shipping_lng !== undefined
        )
            ? {
                lat: Number(row.shipping_lat),
                lng: Number(row.shipping_lng)
            }
            : null,
        shippingMapEmbedUrl: String(row.shipping_map_embed_url || ""),
        userEmail: String(row.user_email || ""),
        reviewedAt: row.reviewed_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        installment: installment
    };
}

async function handleSignup(req, res) {
    try {
        const body = await readBody(req);

        const firstName = normalizeNamePart(body.firstName);
        const middleInitial = normalizeMiddleInitial(body.middleInitial);
        const lastName = normalizeNamePart(body.lastName);
        const fullName = buildFullName(firstName, middleInitial, lastName);
        const email = normalizeEmail(body.email);
        const phone = normalizeMobile(body.phone);
        const address = normalizeNamePart(body.address);
        const password = String(body.password || "");

        if (firstName.length < 2) {
            sendJson(res, 400, { success: false, message: "First name is required." });
            return;
        }
        if (lastName.length < 2) {
            sendJson(res, 400, { success: false, message: "Last name is required." });
            return;
        }
        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "Please enter a valid email address." });
            return;
        }
        if (!isValidMobile(phone)) {
            sendJson(res, 400, { success: false, message: "Use 09XXXXXXXXX or +639XXXXXXXXX." });
            return;
        }
        if (address.length < 5) {
            sendJson(res, 400, { success: false, message: "Please enter a complete address." });
            return;
        }
        if (!isStrongPassword(password)) {
            sendJson(res, 400, {
                success: false,
                message: "Password must be 8+ chars with upper, lower, number, and symbol."
            });
            return;
        }

        const pool = await getDbPool();
        const passwordHash = hashPassword(password);

        const sql = `
            INSERT INTO users (
                first_name,
                middle_initial,
                last_name,
                full_name,
                email,
                phone,
                address,
                password_hash,
                role,
                is_blocked
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', 0)
        `;

        const values = [
            firstName,
            middleInitial || null,
            lastName,
            fullName,
            email,
            phone,
            address,
            passwordHash
        ];

        const [result] = await pool.execute(sql, values);

        const safeUser = {
            id: Number(result.insertId || 0),
            firstName: firstName,
            middleInitial: middleInitial,
            lastName: lastName,
            name: fullName,
            email: email,
            phone: phone,
            address: address,
            role: "user",
            status: "active"
        };

        const authSession = createAuthSession(safeUser);
        sendJson(res, 201, {
            success: true,
            user: safeUser,
            ...getAuthResponse(authSession)
        });
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
            const duplicateField = getDuplicateField(error.message);
            const message = duplicateField === "phone"
                ? "This mobile number is already in use."
                : "An account with this email already exists.";
            sendJson(res, 409, { success: false, message: message });
            return;
        }

        sendJson(res, 500, { success: false, message: error.message || "Signup failed." });
    }
}

async function handleLogin(req, res) {
    try {
        const body = await readBody(req);
        const loginId = normalizeAdminLoginId(body.email || body.username);
        const password = String(body.password || "");

        if (!loginId || !password) {
            sendJson(res, 400, { success: false, message: "Email/username and password are required." });
            return;
        }

        const adminCredentials = getAdminCredentials();
        if (
            loginId === adminCredentials.loginId &&
            verifyPassword(password, adminCredentials.passwordHash)
        ) {
            const adminUser = {
                id: 0,
                name: "Admin",
                email: adminCredentials.loginId,
                role: "admin",
                status: "active"
            };
            const authSession = createAuthSession(adminUser);
            sendJson(res, 200, {
                success: true,
                user: adminUser,
                ...getAuthResponse(authSession)
            });
            return;
        }

        if (!isValidEmail(loginId)) {
            sendJson(res, 400, { success: false, message: "Please enter a valid email address or the admin username." });
            return;
        }

        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT id, first_name, middle_initial, last_name, full_name, email, phone, address, password_hash, role, is_blocked
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [loginId]
        );

        const user = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!user) {
            sendJson(res, 401, { success: false, message: "Invalid email or password." });
            return;
        }

        if (Number(user.is_blocked) === 1) {
            sendJson(res, 403, {
                success: false,
                message: "Your account is blocked. Please contact admin."
            });
            return;
        }

        const validPassword = verifyPassword(password, user.password_hash);
        if (!validPassword) {
            sendJson(res, 401, { success: false, message: "Invalid email or password." });
            return;
        }

        await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

        const safeUser = {
            id: Number(user.id || 0),
            firstName: String(user.first_name || ""),
            middleInitial: String(user.middle_initial || ""),
            lastName: String(user.last_name || ""),
            name: String(user.full_name || ""),
            email: String(user.email || ""),
            phone: String(user.phone || ""),
            address: String(user.address || ""),
            role: String(user.role || "user"),
            status: Number(user.is_blocked) === 1 ? "blocked" : "active"
        };

        const authSession = createAuthSession(safeUser);
        sendJson(res, 200, {
            success: true,
            user: safeUser,
            ...getAuthResponse(authSession)
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Login failed." });
    }
}

async function handleAuthMe(req, res) {
    const session = requireAuthSession(req, res);
    if (!session) {
        return;
    }

    sendJson(res, 200, {
        success: true,
        user: {
            id: Number(session.userId || 0),
            name: String(session.name || ""),
            email: String(session.email || ""),
            role: normalizeUserRole(session.role),
            status: "active"
        },
        ...getAuthResponse(session)
    });
}

async function handleLogout(req, res) {
    const token = getAuthTokenFromRequest(req);
    if (token) {
        authSessions.delete(token);
    }
    sendJson(res, 200, { success: true, message: "Logged out." });
}

async function handleAdminUsers(req, res) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const pool = await getDbPool();
        const [userRows] = await pool.execute(
            `SELECT id, full_name, email, role, is_blocked, created_at
             FROM users
             WHERE role = 'user'
             ORDER BY created_at DESC`
        );

        const [statRows] = await pool.execute(
            `SELECT
                COUNT(*) AS totalUsers,
                SUM(CASE WHEN is_blocked = 0 THEN 1 ELSE 0 END) AS activeUsers,
                SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) AS blockedUsers,
                SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END) AS newUsersThisMonth
             FROM users
             WHERE role = 'user'`
        );

        const stats = statRows && statRows[0] ? statRows[0] : {};
        const payload = {
            success: true,
            stats: {
                totalUsers: Number(stats.totalUsers || 0),
                activeUsers: Number(stats.activeUsers || 0),
                newUsersThisMonth: Number(stats.newUsersThisMonth || 0),
                blockedUsers: Number(stats.blockedUsers || 0)
            },
            users: (userRows || []).map((row) => ({
                id: Number(row.id || 0),
                name: String(row.full_name || ""),
                email: String(row.email || ""),
                role: String(row.role || "user"),
                status: Number(row.is_blocked) === 1 ? "blocked" : "active",
                createdAt: row.created_at || null
            }))
        };

        sendJson(res, 200, payload);
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load users." });
    }
}

async function handleAdminDashboard(_req, res) {
    try {
        const authSession = requireAuthSession(_req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const pool = await getDbPool();

        const [bookingStatsRows] = await pool.execute(
            `SELECT
                COUNT(*) AS totalBookings,
                COALESCE(SUM(total), 0) AS grossSales,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'approved'
                            OR LOWER(status) LIKE '%approve%'
                            OR LOWER(status) LIKE '%complete%'
                            OR LOWER(status) LIKE '%deliver%'
                        )
                        AND LOWER(status) NOT LIKE '%cancel%'
                        AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                        THEN total
                        ELSE 0
                    END
                ), 0) AS totalSales,
                COALESCE(SUM(
                    CASE
                        WHEN review_decision = 'none'
                            AND LOWER(status) NOT LIKE '%cancel%'
                            AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                            AND LOWER(status) NOT LIKE '%reject%'
                            AND LOWER(status) NOT LIKE '%approve%'
                            AND LOWER(status) NOT LIKE '%complete%'
                            AND LOWER(status) NOT LIKE '%deliver%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS pendingBookings,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'approved'
                            OR LOWER(status) LIKE '%approve%'
                            OR LOWER(status) LIKE '%complete%'
                            OR LOWER(status) LIKE '%deliver%'
                        )
                        AND LOWER(status) NOT LIKE '%cancel%'
                        AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS approvedBookings,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'rejected'
                            OR LOWER(status) LIKE '%reject%'
                            OR LOWER(status) LIKE '%cancel%'
                            OR LOWER(fulfillment_status) LIKE '%cancel%'
                        )
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS rejectedBookings,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(status) LIKE '%cancel%'
                            OR LOWER(fulfillment_status) LIKE '%cancel%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS cancelledBookings,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'approved'
                            OR LOWER(status) LIKE '%approve%'
                            OR LOWER(status) LIKE '%complete%'
                            OR LOWER(status) LIKE '%deliver%'
                        )
                        AND LOWER(status) NOT LIKE '%cancel%'
                        AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS successfulBookings
             FROM bookings`
        );

        const [userStatsRows] = await pool.execute(
            `SELECT COUNT(*) AS totalUsers
             FROM users
             WHERE role = 'user'`
        );

        const [monthlyRows] = await pool.execute(
            `SELECT
                DATE_FORMAT(created_at, '%Y-%m-01') AS month_key,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'approved'
                            OR LOWER(status) LIKE '%approve%'
                            OR LOWER(status) LIKE '%complete%'
                            OR LOWER(status) LIKE '%deliver%'
                        )
                        AND LOWER(status) NOT LIKE '%cancel%'
                        AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                        THEN total
                        ELSE 0
                    END
                ), 0) AS sales,
                COUNT(*) AS bookings,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'approved'
                            OR LOWER(status) LIKE '%approve%'
                            OR LOWER(status) LIKE '%complete%'
                            OR LOWER(status) LIKE '%deliver%'
                        )
                        AND LOWER(status) NOT LIKE '%cancel%'
                        AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS approved,
                COALESCE(SUM(
                    CASE
                        WHEN (
                            review_decision = 'rejected'
                            OR LOWER(status) LIKE '%reject%'
                            OR LOWER(status) LIKE '%cancel%'
                            OR LOWER(fulfillment_status) LIKE '%cancel%'
                        )
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS rejected,
                COALESCE(SUM(
                    CASE
                        WHEN review_decision = 'none'
                            AND LOWER(status) NOT LIKE '%cancel%'
                            AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                            AND LOWER(status) NOT LIKE '%reject%'
                            AND LOWER(status) NOT LIKE '%approve%'
                            AND LOWER(status) NOT LIKE '%complete%'
                            AND LOWER(status) NOT LIKE '%deliver%'
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS pending
             FROM bookings
             WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01')
             GROUP BY month_key
             ORDER BY month_key ASC`
        );

        const bookingStats = bookingStatsRows && bookingStatsRows[0] ? bookingStatsRows[0] : {};
        const userStats = userStatsRows && userStatsRows[0] ? userStatsRows[0] : {};
        const monthlyMap = new Map();
        (monthlyRows || []).forEach((row) => {
            const key = String(row.month_key || "").trim();
            if (!key) {
                return;
            }
            monthlyMap.set(key, row);
        });

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const now = new Date();
        const salesOverview = [];
        for (let offset = 11; offset >= 0; offset -= 1) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`;
            const row = monthlyMap.get(monthKey) || {};

            salesOverview.push({
                key: monthKey.slice(0, 7),
                label: `${monthNames[monthDate.getMonth()]} ${String(monthDate.getFullYear()).slice(-2)}`,
                sales: Number(row.sales || 0),
                bookings: Number(row.bookings || 0),
                approved: Number(row.approved || 0),
                rejected: Number(row.rejected || 0),
                pending: Number(row.pending || 0)
            });
        }

        sendJson(res, 200, {
            success: true,
            asOf: new Date().toISOString(),
            stats: {
                totalSales: Number(bookingStats.totalSales || 0),
                grossSales: Number(bookingStats.grossSales || 0),
                totalBookings: Number(bookingStats.totalBookings || 0),
                pendingBookings: Number(bookingStats.pendingBookings || 0),
                approvedBookings: Number(bookingStats.approvedBookings || 0),
                rejectedBookings: Number(bookingStats.rejectedBookings || 0),
                successfulBookings: Number(bookingStats.successfulBookings || 0),
                cancelledBookings: Number(bookingStats.cancelledBookings || 0),
                totalUsers: Number(userStats.totalUsers || 0)
            },
            salesOverview: salesOverview
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load dashboard stats." });
    }
}

async function handleBlockToggle(req, res, userId, action) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const pool = await getDbPool();
        const blockedValue = action === "block" ? 1 : 0;

        const [result] = await pool.execute(
            `UPDATE users
             SET is_blocked = ?, updated_at = NOW()
             WHERE id = ? AND role = 'user'`,
            [blockedValue, Number(userId)]
        );

        if (!result || Number(result.affectedRows || 0) < 1) {
            sendJson(res, 404, { success: false, message: "User not found." });
            return;
        }

        sendJson(res, 200, {
            success: true,
            message: blockedValue === 1 ? "User blocked successfully." : "User unblocked successfully."
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to update user status." });
    }
}

async function handleAdminSettingsGet(req, res) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const adminCredentials = getAdminCredentials();
        sendJson(res, 200, {
            success: true,
            settings: {
                loginId: adminCredentials.loginId,
                updatedAt: adminCredentials.updatedAt
            }
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load admin settings." });
    }
}

async function handleAdminSettingsUpdateLoginId(req, res) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const body = await readBody(req);
        const currentPassword = String(body.currentPassword || "");
        const nextLoginId = normalizeAdminLoginId(
            body.newLoginId || body.loginId || body.username || body.email
        );

        if (!currentPassword) {
            sendJson(res, 400, { success: false, message: "Current password is required." });
            return;
        }
        if (!isValidAdminLoginId(nextLoginId)) {
            sendJson(res, 400, {
                success: false,
                message: "Username/email must be 3-190 chars using letters, numbers, dot, underscore, plus, hyphen, or @."
            });
            return;
        }

        const adminCredentials = getAdminCredentials();
        if (!verifyPassword(currentPassword, adminCredentials.passwordHash)) {
            sendJson(res, 401, { success: false, message: "Current password is incorrect." });
            return;
        }

        const updatedCredentials = saveAdminCredentials({ loginId: nextLoginId });
        authSession.email = updatedCredentials.loginId;
        authSessions.set(authSession.token, authSession);

        const isChanged = updatedCredentials.loginId !== adminCredentials.loginId;
        sendJson(res, 200, {
            success: true,
            message: isChanged ? "Admin login updated successfully." : "Admin login is already up to date.",
            settings: {
                loginId: updatedCredentials.loginId,
                updatedAt: updatedCredentials.updatedAt
            }
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to update admin login." });
    }
}

async function handleAdminSettingsUpdatePassword(req, res) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const body = await readBody(req);
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");

        if (!currentPassword) {
            sendJson(res, 400, { success: false, message: "Current password is required." });
            return;
        }
        if (!isStrongPassword(newPassword)) {
            sendJson(res, 400, {
                success: false,
                message: "Password must be 8+ chars with upper, lower, number, and symbol."
            });
            return;
        }

        const adminCredentials = getAdminCredentials();
        if (!verifyPassword(currentPassword, adminCredentials.passwordHash)) {
            sendJson(res, 401, { success: false, message: "Current password is incorrect." });
            return;
        }
        if (verifyPassword(newPassword, adminCredentials.passwordHash)) {
            sendJson(res, 400, { success: false, message: "New password must be different from current password." });
            return;
        }

        saveAdminCredentials({
            passwordHash: hashPassword(newPassword)
        });

        sendJson(res, 200, { success: true, message: "Admin password updated successfully." });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to update admin password." });
    }
}

async function handleProfileSettingsGet(_req, res, parsedUrl) {
    try {
        const authSession = requireAuthSession(_req, res);
        if (!authSession) {
            return;
        }

        const sessionEmail = normalizeEmail(authSession.email);
        const requestedEmail = normalizeEmail(parsedUrl.searchParams.get("email"));
        const email = isValidEmail(requestedEmail) ? requestedEmail : sessionEmail;
        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "A valid email query parameter is required." });
            return;
        }
        if (!canAccessEmail(authSession, email)) {
            sendJson(res, 403, { success: false, message: "You can only access your own profile." });
            return;
        }

        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT full_name, email, phone, address, avatar_data_url
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (!Array.isArray(rows) || rows.length < 1) {
            sendJson(res, 404, { success: false, message: "Profile not found." });
            return;
        }

        const profile = rows[0];
        sendJson(res, 200, {
            success: true,
            profile: {
                fullName: String(profile.full_name || ""),
                email: String(profile.email || ""),
                phone: String(profile.phone || ""),
                address: String(profile.address || ""),
                avatar: String(profile.avatar_data_url || "")
            }
        });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load profile." });
    }
}

async function handleProfileSettingsSave(req, res) {
    try {
        const authSession = requireAuthSession(req, res);
        if (!authSession) {
            return;
        }

        const body = await readBody(req);

        const fullName = normalizeText(body.fullName);
        const email = normalizeEmail(body.email);
        const phone = normalizeMobile(body.phone);
        const address = normalizeText(body.address);
        const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";
        const currentEmail = normalizeEmail(body.currentEmail);
        const lookupEmail = isValidEmail(currentEmail) ? currentEmail : email;
        const sessionEmail = normalizeEmail(authSession.email);

        if (fullName.length < 2) {
            sendJson(res, 400, { success: false, message: "Full name is required." });
            return;
        }
        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "Please enter a valid email address." });
            return;
        }
        if (!isValidMobile(phone)) {
            sendJson(res, 400, { success: false, message: "Use 09XXXXXXXXX or +639XXXXXXXXX." });
            return;
        }
        if (address.length < 5) {
            sendJson(res, 400, { success: false, message: "Please enter a complete address." });
            return;
        }
        if (!isValidEmail(lookupEmail)) {
            sendJson(res, 400, { success: false, message: "Missing current account email." });
            return;
        }
        if (authSession.role !== "admin" && lookupEmail !== sessionEmail) {
            sendJson(res, 403, { success: false, message: "You can only edit your own profile." });
            return;
        }

        const pool = await getDbPool();
        const [result] = await pool.execute(
            `UPDATE users
             SET full_name = ?,
                 email = ?,
                 phone = ?,
                 address = ?,
                 avatar_data_url = ?,
                 updated_at = NOW()
             WHERE email = ?
             LIMIT 1`,
            [fullName, email, phone, address, avatar || null, lookupEmail]
        );

        if (!result || Number(result.affectedRows || 0) < 1) {
            sendJson(res, 404, { success: false, message: "Account not found." });
            return;
        }

        const [rows] = await pool.execute(
            `SELECT full_name, email, phone, address, avatar_data_url
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );
        const profile = Array.isArray(rows) && rows.length ? rows[0] : null;

        if (authSession.role !== "admin") {
            authSession.email = email;
            authSessions.set(authSession.token, authSession);
        }

        sendJson(res, 200, {
            success: true,
            profile: {
                fullName: String((profile && profile.full_name) || fullName),
                email: String((profile && profile.email) || email),
                phone: String((profile && profile.phone) || phone),
                address: String((profile && profile.address) || address),
                avatar: String((profile && profile.avatar_data_url) || avatar || "")
            }
        });
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
            const duplicateField = getDuplicateField(error.message);
            const message = duplicateField === "phone"
                ? "This mobile number is already in use."
                : "An account with this email already exists.";
            sendJson(res, 409, { success: false, message: message });
            return;
        }
        sendJson(res, 500, { success: false, message: error.message || "Unable to save profile." });
    }
}

async function handleProfilePasswordChange(req, res) {
    try {
        const authSession = requireAuthSession(req, res);
        if (!authSession) {
            return;
        }

        const body = await readBody(req);
        const requestedEmail = normalizeEmail(body.email);
        const sessionEmail = normalizeEmail(authSession.email);
        const email = isValidEmail(requestedEmail) ? requestedEmail : sessionEmail;
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");

        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "Please enter a valid email address." });
            return;
        }
        if (authSession.role !== "admin" && email !== sessionEmail) {
            sendJson(res, 403, { success: false, message: "You can only change your own password." });
            return;
        }
        if (!currentPassword) {
            sendJson(res, 400, { success: false, message: "Current password is required." });
            return;
        }
        if (!isStrongPassword(newPassword)) {
            sendJson(res, 400, {
                success: false,
                message: "Password must be 8+ chars with upper, lower, number, and symbol."
            });
            return;
        }

        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT id, password_hash
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        const user = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!user) {
            sendJson(res, 404, { success: false, message: "Account not found." });
            return;
        }

        if (!verifyPassword(currentPassword, user.password_hash)) {
            sendJson(res, 401, { success: false, message: "Current password is incorrect." });
            return;
        }

        const passwordHash = hashPassword(newPassword);
        await pool.execute(
            "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
            [passwordHash, user.id]
        );

        sendJson(res, 200, { success: true, message: "Password updated successfully." });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to update password." });
    }
}

async function handleCreateBooking(req, res) {
    try {
        const authSession = requireAuthSession(req, res);
        if (!authSession) {
            return;
        }

        const body = await readBody(req);

        const orderId = normalizeOrderId(body.orderId);
        let email = normalizeEmail(body.email || body.userEmail);
        let userEmail = normalizeEmail(body.userEmail || body.email);
        const fullName = normalizeText(body.fullName || body.name);
        const phone = normalizeMobile(body.phone);
        const model = normalizeText(body.model || body.productName || body.itemName || "Ecodrive E-Bike");
        const bikeImage = normalizeText(body.bikeImage || body.image || body.img);
        const serviceType = normalizeServiceType(body.service);
        const paymentMethod = normalizeText(body.payment || "CASH ON DELIVERY").slice(0, 80);
        const status = normalizeOrderStatus(body.status, serviceType);
        const fulfillmentStatus = normalizeFulfillmentStatus(body.fulfillmentStatus, serviceType);
        const shippingAddress = normalizeText(body.shippingAddress).slice(0, 255);
        const shippingMapEmbedUrl = String(body.shippingMapEmbedUrl || "").trim().slice(0, 3000);
        const shippingCoordinates = body.shippingCoordinates && typeof body.shippingCoordinates === "object"
            ? body.shippingCoordinates
            : null;
        const shippingLat = normalizeOptionalNumber(shippingCoordinates && shippingCoordinates.lat);
        const shippingLng = normalizeOptionalNumber(shippingCoordinates && shippingCoordinates.lng);
        const subtotal = parseAmount(body.subtotal);
        const shippingFee = parseAmount(body.shippingFee);
        const total = parseAmount(body.total || (subtotal + shippingFee));
        const reviewDecision = getReviewDecisionFromStatus(status, fulfillmentStatus);
        const reviewedAt = reviewDecision === "none" ? null : new Date();
        const sessionEmail = normalizeEmail(authSession.email);

        if (authSession.role !== "admin") {
            if ((isValidEmail(email) && email !== sessionEmail) || (isValidEmail(userEmail) && userEmail !== sessionEmail)) {
                sendJson(res, 403, { success: false, message: "You can only create bookings for your own account." });
                return;
            }
            email = sessionEmail;
            userEmail = sessionEmail;
        }

        let installmentPayload = null;
        if (body.installment && typeof body.installment === "object") {
            installmentPayload = JSON.stringify(body.installment);
        }

        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "A valid email is required for booking." });
            return;
        }
        if (!fullName || fullName.length < 2) {
            sendJson(res, 400, { success: false, message: "Customer full name is required." });
            return;
        }
        if (!isValidMobile(phone)) {
            sendJson(res, 400, { success: false, message: "Use 09XXXXXXXXX or +639XXXXXXXXX." });
            return;
        }

        const pool = await getDbPool();

        let userId = null;
        const [userRows] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email]
        );
        if (Array.isArray(userRows) && userRows.length > 0) {
            userId = Number(userRows[0].id || 0) || null;
        }

        await pool.execute(
            `INSERT INTO bookings (
                order_id,
                user_id,
                full_name,
                email,
                phone,
                model,
                bike_image,
                subtotal,
                shipping_fee,
                total,
                payment_method,
                service_type,
                status,
                fulfillment_status,
                shipping_address,
                shipping_lat,
                shipping_lng,
                shipping_map_embed_url,
                user_email,
                installment_payload,
                review_decision,
                reviewed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                full_name = VALUES(full_name),
                email = VALUES(email),
                phone = VALUES(phone),
                model = VALUES(model),
                bike_image = VALUES(bike_image),
                subtotal = VALUES(subtotal),
                shipping_fee = VALUES(shipping_fee),
                total = VALUES(total),
                payment_method = VALUES(payment_method),
                service_type = VALUES(service_type),
                status = VALUES(status),
                fulfillment_status = VALUES(fulfillment_status),
                shipping_address = VALUES(shipping_address),
                shipping_lat = VALUES(shipping_lat),
                shipping_lng = VALUES(shipping_lng),
                shipping_map_embed_url = VALUES(shipping_map_embed_url),
                user_email = VALUES(user_email),
                installment_payload = VALUES(installment_payload),
                review_decision = VALUES(review_decision),
                reviewed_at = VALUES(reviewed_at),
                updated_at = NOW()`,
            [
                orderId,
                userId,
                fullName,
                email,
                phone,
                model,
                bikeImage || null,
                subtotal,
                shippingFee,
                total,
                paymentMethod,
                serviceType,
                status,
                fulfillmentStatus,
                shippingAddress || null,
                shippingLat,
                shippingLng,
                shippingMapEmbedUrl || null,
                userEmail || null,
                installmentPayload,
                reviewDecision,
                reviewedAt
            ]
        );

        const [rows] = await pool.execute(
            `SELECT *
             FROM bookings
             WHERE order_id = ?
             LIMIT 1`,
            [orderId]
        );
        const booking = Array.isArray(rows) && rows.length ? mapBookingRow(rows[0]) : null;

        sendJson(res, 201, { success: true, booking: booking });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to save booking." });
    }
}

async function handleListBookings(_req, res, parsedUrl) {
    try {
        const authSession = requireAuthSession(_req, res);
        if (!authSession) {
            return;
        }

        const sessionEmail = normalizeEmail(authSession.email);
        const requestedEmail = normalizeEmail(parsedUrl.searchParams.get("email"));
        const email = isValidEmail(requestedEmail) ? requestedEmail : sessionEmail;
        if (!isValidEmail(email)) {
            sendJson(res, 400, { success: false, message: "A valid email query parameter is required." });
            return;
        }
        if (!canAccessEmail(authSession, email)) {
            sendJson(res, 403, { success: false, message: "You can only access your own bookings." });
            return;
        }

        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT *
             FROM bookings
             WHERE email = ? OR user_email = ?
             ORDER BY created_at DESC`,
            [email, email]
        );

        const bookings = Array.isArray(rows) ? rows.map(mapBookingRow) : [];
        sendJson(res, 200, { success: true, bookings: bookings });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load bookings." });
    }
}

async function handleCancelBooking(req, res, orderId) {
    try {
        const authSession = requireAuthSession(req, res);
        if (!authSession) {
            return;
        }

        const body = await readBody(req);
        let email = normalizeEmail(body.email || body.userEmail);
        const sessionEmail = normalizeEmail(authSession.email);
        if (authSession.role !== "admin") {
            email = sessionEmail;
        }
        const normalizedOrderId = normalizeOrderId(orderId, false);
        if (!normalizedOrderId) {
            sendJson(res, 400, { success: false, message: "Invalid booking order id." });
            return;
        }
        const pool = await getDbPool();

        let result = null;
        if (isValidEmail(email)) {
            [result] = await pool.execute(
                `UPDATE bookings
                 SET status = 'Cancelled',
                     fulfillment_status = 'Cancelled',
                     review_decision = 'rejected',
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE order_id = ?
                   AND (email = ? OR user_email = ?)`,
                [normalizedOrderId, email, email]
            );
        } else {
            if (authSession.role !== "admin") {
                sendJson(res, 400, { success: false, message: "A valid account email is required." });
                return;
            }
            [result] = await pool.execute(
                `UPDATE bookings
                 SET status = 'Cancelled',
                     fulfillment_status = 'Cancelled',
                     review_decision = 'rejected',
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE order_id = ?`,
                [normalizedOrderId]
            );
        }

        if (!result || Number(result.affectedRows || 0) < 1) {
            sendJson(res, 404, { success: false, message: "Booking not found." });
            return;
        }

        sendJson(res, 200, { success: true, message: "Booking cancelled successfully." });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to cancel booking." });
    }
}

async function handleAdminBookings(_req, res, parsedUrl) {
    try {
        const authSession = requireAuthSession(_req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const scope = normalizeText(parsedUrl.searchParams.get("scope")).toLowerCase();
        const pool = await getDbPool();

        const query = scope === "all"
            ? `SELECT * FROM bookings ORDER BY created_at DESC`
            : `SELECT *
               FROM bookings
               WHERE review_decision = 'none'
                 AND LOWER(status) NOT LIKE '%cancel%'
                 AND LOWER(fulfillment_status) NOT LIKE '%cancel%'
                 AND LOWER(status) NOT LIKE '%reject%'
               ORDER BY created_at DESC`;

        const [rows] = await pool.execute(query);
        const bookings = Array.isArray(rows) ? rows.map(mapBookingRow) : [];
        sendJson(res, 200, { success: true, bookings: bookings });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load booking requests." });
    }
}

async function handleAdminBookingDetails(_req, res, orderId) {
    try {
        const authSession = requireAuthSession(_req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const normalizedOrderId = normalizeOrderId(orderId, false);
        if (!normalizedOrderId) {
            sendJson(res, 400, { success: false, message: "Invalid booking order id." });
            return;
        }
        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT *
             FROM bookings
             WHERE order_id = ?
             LIMIT 1`,
            [normalizedOrderId]
        );
        if (!Array.isArray(rows) || rows.length < 1) {
            sendJson(res, 404, { success: false, message: "Booking not found." });
            return;
        }

        sendJson(res, 200, { success: true, booking: mapBookingRow(rows[0]) });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load booking details." });
    }
}

async function handleAdminBookingDecision(_req, res, orderId, action) {
    try {
        const authSession = requireAuthSession(_req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const normalizedOrderId = normalizeOrderId(orderId, false);
        if (!normalizedOrderId) {
            sendJson(res, 400, { success: false, message: "Invalid booking order id." });
            return;
        }
        const normalizedAction = String(action || "").toLowerCase() === "approve" ? "approve" : "reject";
        const pool = await getDbPool();

        if (normalizedAction === "approve") {
            await pool.execute(
                `UPDATE bookings
                 SET status = 'Approved',
                     fulfillment_status = CASE
                        WHEN fulfillment_status IS NULL OR fulfillment_status = '' OR LOWER(fulfillment_status) IN ('pending review', 'under review')
                            THEN 'In Process'
                        ELSE fulfillment_status
                     END,
                     review_decision = 'approved',
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE order_id = ?`,
                [normalizedOrderId]
            );
        } else {
            await pool.execute(
                `UPDATE bookings
                 SET status = 'Rejected',
                     fulfillment_status = 'Rejected',
                     review_decision = 'rejected',
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE order_id = ?`,
                [normalizedOrderId]
            );
        }

        const [rows] = await pool.execute(
            `SELECT *
             FROM bookings
             WHERE order_id = ?
             LIMIT 1`,
            [normalizedOrderId]
        );
        if (!Array.isArray(rows) || rows.length < 1) {
            sendJson(res, 404, { success: false, message: "Booking not found." });
            return;
        }

        sendJson(res, 200, { success: true, booking: mapBookingRow(rows[0]) });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to update booking status." });
    }
}

function getProductCategoryFilter(parsedUrl) {
    const raw = String(parsedUrl.searchParams.get("category") || "").trim();
    if (!raw) {
        return "";
    }
    const normalized = normalizeProductCategory(raw);
    if (normalized === "Other" && raw.toLowerCase() !== "other") {
        return "";
    }
    return normalized;
}

async function fetchProductById(pool, productId) {
    const [rows] = await pool.execute(
        `SELECT *
         FROM products
         WHERE id = ?
         LIMIT 1`,
        [productId]
    );
    if (!Array.isArray(rows) || rows.length < 1) {
        return null;
    }
    return mapProductRow(rows[0]);
}

async function handleListProducts(_req, res, parsedUrl) {
    try {
        const pool = await getDbPool();
        const categoryFilter = getProductCategoryFilter(parsedUrl);

        let query = `
            SELECT *
            FROM products
            WHERE is_active = 1
        `;
        const params = [];
        if (categoryFilter) {
            query += " AND category = ?";
            params.push(categoryFilter);
        }
        query += " ORDER BY FIELD(category, '2-Wheel', '3-Wheel', '4-Wheel', 'Other'), model ASC";

        const [rows] = await pool.execute(query, params);
        const products = Array.isArray(rows) ? rows.map(mapProductRow) : [];
        sendJson(res, 200, { success: true, products: products });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load products." });
    }
}

async function handleAdminProducts(_req, res, parsedUrl) {
    try {
        const authSession = requireAuthSession(_req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const pool = await getDbPool();
        const includeInactive = String(parsedUrl.searchParams.get("includeInactive") || "").trim().toLowerCase() === "true";
        const categoryFilter = getProductCategoryFilter(parsedUrl);

        let query = "SELECT * FROM products";
        const whereClauses = [];
        const params = [];

        if (!includeInactive) {
            whereClauses.push("is_active = 1");
        }
        if (categoryFilter) {
            whereClauses.push("category = ?");
            params.push(categoryFilter);
        }
        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(" AND ")}`;
        }
        query += " ORDER BY FIELD(category, '2-Wheel', '3-Wheel', '4-Wheel', 'Other'), model ASC";

        const [rows] = await pool.execute(query, params);
        const products = Array.isArray(rows) ? rows.map(mapProductRow) : [];
        sendJson(res, 200, { success: true, products: products });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to load admin products." });
    }
}

async function handleAdminCreateProduct(req, res) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const body = await readBody(req);
        const model = normalizeProductModel(body.model);
        const price = normalizeProductPrice(body.price);
        const category = normalizeProductCategory(body.category);
        const productInfo = normalizeProductInfo(body.info || body.productInfo || body.description);
        const imageUrl = normalizeProductImage(body.imageUrl || body.image || body.image_url);
        const detailUrl = normalizeProductUrl(body.detailUrl || body.detailsUrl || body.detail_url);
        const isActive = normalizeOptionalBoolean(body.isActive, true) ? 1 : 0;

        if (model.length < 2) {
            sendJson(res, 400, { success: false, message: "Model name is required." });
            return;
        }
        if (price === null) {
            sendJson(res, 400, { success: false, message: "A valid product price is required." });
            return;
        }
        if (isDataImage(imageUrl) && imageUrl.length > MAX_PRODUCT_IMAGE_DATA_URL_LENGTH) {
            sendJson(res, 400, { success: false, message: "Image file is too large. Max size is 2MB." });
            return;
        }

        const pool = await getDbPool();
        const [result] = await pool.execute(
            `INSERT INTO products (
                model,
                price,
                category,
                product_info,
                image_url,
                detail_url,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                model,
                price,
                category,
                productInfo || null,
                imageUrl || null,
                detailUrl || null,
                isActive
            ]
        );

        const product = await fetchProductById(pool, Number(result.insertId || 0));
        sendJson(res, 201, { success: true, product: product });
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
            sendJson(res, 409, { success: false, message: "This model already exists for the selected category." });
            return;
        }
        sendJson(res, 500, { success: false, message: error.message || "Unable to create product." });
    }
}

async function handleAdminUpdateProduct(req, res, productId) {
    try {
        const authSession = requireAuthSession(req, res, { role: "admin" });
        if (!authSession) {
            return;
        }

        const id = Number(productId);
        if (!Number.isFinite(id) || id < 1) {
            sendJson(res, 400, { success: false, message: "Invalid product id." });
            return;
        }

        const body = await readBody(req);
        const updates = [];
        const params = [];

        if (Object.prototype.hasOwnProperty.call(body, "model")) {
            const model = normalizeProductModel(body.model);
            if (model.length < 2) {
                sendJson(res, 400, { success: false, message: "Model name is required." });
                return;
            }
            updates.push("model = ?");
            params.push(model);
        }

        if (Object.prototype.hasOwnProperty.call(body, "price")) {
            const price = normalizeProductPrice(body.price);
            if (price === null) {
                sendJson(res, 400, { success: false, message: "A valid product price is required." });
                return;
            }
            updates.push("price = ?");
            params.push(price);
        }

        if (Object.prototype.hasOwnProperty.call(body, "category")) {
            updates.push("category = ?");
            params.push(normalizeProductCategory(body.category));
        }

        const hasInfoField = ["info", "productInfo", "description"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
        if (hasInfoField) {
            const productInfo = normalizeProductInfo(body.info || body.productInfo || body.description);
            updates.push("product_info = ?");
            params.push(productInfo || null);
        }

        const hasImageField = ["imageUrl", "image", "image_url"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
        if (hasImageField) {
            const imageUrl = normalizeProductImage(body.imageUrl || body.image || body.image_url);
            if (isDataImage(imageUrl) && imageUrl.length > MAX_PRODUCT_IMAGE_DATA_URL_LENGTH) {
                sendJson(res, 400, { success: false, message: "Image file is too large. Max size is 2MB." });
                return;
            }
            updates.push("image_url = ?");
            params.push(imageUrl || null);
        }

        const hasDetailField = ["detailUrl", "detailsUrl", "detail_url"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
        if (hasDetailField) {
            const detailUrl = normalizeProductUrl(body.detailUrl || body.detailsUrl || body.detail_url);
            updates.push("detail_url = ?");
            params.push(detailUrl || null);
        }

        if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
            updates.push("is_active = ?");
            params.push(normalizeOptionalBoolean(body.isActive, true) ? 1 : 0);
        }

        if (!updates.length) {
            sendJson(res, 400, { success: false, message: "No product fields provided for update." });
            return;
        }

        const pool = await getDbPool();
        params.push(id);
        const [result] = await pool.execute(
            `UPDATE products
             SET ${updates.join(", ")},
                 updated_at = NOW()
             WHERE id = ?`,
            params
        );

        let product = null;
        if (!result || Number(result.affectedRows || 0) < 1) {
            product = await fetchProductById(pool, id);
            if (!product) {
                sendJson(res, 404, { success: false, message: "Product not found." });
                return;
            }
            sendJson(res, 200, { success: true, product: product });
            return;
        }

        product = await fetchProductById(pool, id);
        sendJson(res, 200, { success: true, product: product });
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
            sendJson(res, 409, { success: false, message: "This model already exists for the selected category." });
            return;
        }
        sendJson(res, 500, { success: false, message: error.message || "Unable to update product." });
    }
}

async function handleForgotSendCode(req, res) {
    try {
        clearExpiredOtpSessions();
        const body = await readBody(req);

        const method = String(body.method || "").trim().toLowerCase();
        const contact = String(body.contact || "").trim();

        if (method !== "email" && method !== "mobile") {
            sendJson(res, 400, { success: false, message: "Method must be email or mobile." });
            return;
        }
        if (method === "email" && !isValidEmail(contact)) {
            sendJson(res, 400, { success: false, message: "Invalid email address." });
            return;
        }
        if (method === "mobile" && !isValidMobile(contact)) {
            sendJson(res, 400, { success: false, message: "Invalid mobile number." });
            return;
        }

        if (!isDbConfigured()) {
            sendJson(res, 503, {
                success: false,
                message: "Password reset is unavailable. Database is not configured."
            });
            return;
        }

        const pool = await getDbPool();
        let account = null;

        if (method === "email") {
            const normalizedEmail = normalizeEmail(contact);
            const [rows] = await pool.execute(
                `SELECT id, email, phone, is_blocked
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [normalizedEmail]
            );
            account = Array.isArray(rows) && rows.length ? rows[0] : null;
        } else {
            const normalizedPhone = normalizeMobile(contact);
            const [rows] = await pool.execute(
                `SELECT id, email, phone, is_blocked
                 FROM users
                 WHERE phone = ?
                 LIMIT 1`,
                [normalizedPhone]
            );
            account = Array.isArray(rows) && rows.length ? rows[0] : null;
        }

        if (!account) {
            sendJson(res, 404, { success: false, message: "No account found for this contact." });
            return;
        }

        if (Number(account.is_blocked || 0) === 1) {
            sendJson(res, 403, { success: false, message: "This account is blocked." });
            return;
        }

        const accountEmail = normalizeEmail(account.email);

        const requestId = createVerificationToken("otp");
        const code = generateOtpCode();
        const normalizedContact = normalizeContact(method, contact);

        otpSessions.set(requestId, {
            code: code,
            method: method,
            contact: normalizedContact,
            accountEmail: accountEmail,
            expiresAt: Date.now() + OTP_TTL_MS,
            verified: false,
            attempts: 0
        });

        const delivery = await deliverOtp(method, contact, code);
        const isDemoMode = !delivery.sent;
        if (isDemoMode && !ALLOW_DEMO_OTP) {
            otpSessions.delete(requestId);
            sendJson(res, 503, {
                success: false,
                message: "OTP delivery is unavailable. Configure SMTP or SMS provider first."
            });
            return;
        }

        const responsePayload = {
            success: true,
            message: isDemoMode ? "Verification code generated in demo mode." : "Verification code sent.",
            requestId: requestId,
            accountEmail: accountEmail,
            expiresInMs: OTP_TTL_MS,
            delivery: {
                method: method,
                mode: isDemoMode ? "demo" : "provider",
                provider: isDemoMode ? "local-demo" : String(delivery.provider || "configured-provider")
            }
        };

        if (isDemoMode && ALLOW_DEMO_OTP) {
            responsePayload.demoCode = code;
            responsePayload.deliveryReason = String(delivery.reason || "No provider configured.");
        }

        const codeLog = isDemoMode ? ` code=${code}` : "";
        console.log(`[forgot-otp] ${method}:${normalizedContact} requestId=${requestId} mode=${responsePayload.delivery.mode}${codeLog}`);
        sendJson(res, 200, responsePayload);
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Unable to send code." });
    }
}

async function handleForgotVerifyCode(req, res) {
    try {
        clearExpiredOtpSessions();
        const body = await readBody(req);

        const requestId = String(body.requestId || "").trim();
        const code = String(body.code || "").trim();

        if (!requestId || !/^\d{4}$/.test(code)) {
            sendJson(res, 400, {
                success: false,
                verified: false,
                message: "requestId and 4-digit code are required."
            });
            return;
        }

        const session = otpSessions.get(requestId);
        if (!session) {
            sendJson(res, 200, { success: true, verified: false, message: "Code expired or not found." });
            return;
        }

        if (session.expiresAt <= Date.now()) {
            otpSessions.delete(requestId);
            sendJson(res, 200, { success: true, verified: false, message: "Code expired. Request a new code." });
            return;
        }

        session.attempts += 1;
        if (session.code !== code) {
            if (session.attempts >= MAX_OTP_ATTEMPTS) {
                otpSessions.delete(requestId);
                sendJson(res, 200, {
                    success: true,
                    verified: false,
                    message: "Too many failed attempts. Request a new code."
                });
                return;
            }
            otpSessions.set(requestId, session);
            sendJson(res, 200, { success: true, verified: false, message: "Invalid verification code." });
            return;
        }

        session.verified = true;
        otpSessions.set(requestId, session);
        sendJson(res, 200, { success: true, verified: true, message: "Code verified." });
    } catch (error) {
        sendJson(res, 500, { success: false, verified: false, message: error.message || "Verification failed." });
    }
}

async function handleResetPassword(req, res) {
    try {
        clearExpiredOtpSessions();
        const body = await readBody(req);

        const newPassword = String(body.newPassword || "");
        const requestId = String(body.requestId || "").trim();
        const method = String(body.method || "").trim().toLowerCase();
        const contact = String(body.contact || "").trim();

        if (!isStrongPassword(newPassword)) {
            sendJson(res, 400, {
                success: false,
                message: "Password must be 8+ chars with upper, lower, number, and symbol."
            });
            return;
        }

        if (!requestId) {
            sendJson(res, 400, { success: false, message: "OTP verification is required." });
            return;
        }

        const otpSession = otpSessions.get(requestId);
        if (!otpSession || !otpSession.verified || otpSession.expiresAt <= Date.now()) {
            otpSessions.delete(requestId);
            sendJson(res, 400, { success: false, message: "OTP verification is required." });
            return;
        }

        if (method && method !== otpSession.method) {
            sendJson(res, 400, { success: false, message: "Invalid reset method." });
            return;
        }

        if (contact) {
            const normalizedContact = normalizeContact(otpSession.method, contact);
            if (!normalizedContact || normalizedContact !== otpSession.contact) {
                sendJson(res, 400, { success: false, message: "Reset contact does not match verified contact." });
                return;
            }
        }

        const accountEmail = normalizeEmail(otpSession.accountEmail || body.email);
        if (!isValidEmail(accountEmail)) {
            sendJson(res, 400, { success: false, message: "Unable to resolve account for password reset." });
            return;
        }

        if (!isDbConfigured()) {
            sendJson(res, 503, {
                success: false,
                message: "Password reset is unavailable. Database is not configured."
            });
            return;
        }

        const pool = await getDbPool();
        const passwordHash = hashPassword(newPassword);
        const [result] = await pool.execute(
            "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?",
            [passwordHash, accountEmail]
        );

        if (!result || Number(result.affectedRows || 0) < 1) {
            sendJson(res, 404, { success: false, message: "Account not found for password reset." });
            return;
        }

        otpSessions.delete(requestId);
        sendJson(res, 200, { success: true, message: "Password reset request accepted." });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Reset failed." });
    }
}

async function handleKycVerifyId(req, res) {
    try {
        const body = await readBody(req);
        const idType = String(body.idType || "").trim();
        const idImage = body.idImage;

        if (!idType) {
            sendJson(res, 400, { verified: false, reason: "Missing idType." });
            return;
        }
        if (!isDataImage(idImage)) {
            sendJson(res, 400, { verified: false, reason: "Invalid ID image payload." });
            return;
        }
        if (idImage.length < 9000) {
            sendJson(res, 200, { verified: false, reason: "ID image is too small or unclear." });
            return;
        }

        const verificationToken = createVerificationToken("id");
        sendJson(res, 200, {
            verified: true,
            reason: "ID passed server-side validation.",
            verificationToken: verificationToken
        });
    } catch (error) {
        sendJson(res, 500, { verified: false, reason: error.message || "ID verification failed." });
    }
}

async function handleKycVerifyFace(req, res) {
    try {
        const body = await readBody(req);
        const idImage = body.idImage;
        const selfieImage = body.selfieImage;
        const token = String(body.verificationToken || "").trim();

        if (!isDataImage(idImage) || !isDataImage(selfieImage)) {
            sendJson(res, 400, { verified: false, reason: "Invalid image payload." });
            return;
        }
        if (!token) {
            sendJson(res, 400, { verified: false, reason: "Missing verification token from ID step." });
            return;
        }

        const distance = estimateDistance(idImage, selfieImage);
        const verified = distance <= 0.52;
        sendJson(res, 200, {
            verified: verified,
            reason: verified ? "Face matched with ID on server." : "Face mismatch detected by server.",
            distance: distance
        });
    } catch (error) {
        sendJson(res, 500, { verified: false, reason: error.message || "Face verification failed." });
    }
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;

    if (req.method === "OPTIONS") {
        sendJson(res, 200, { ok: true });
        return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, {
            ok: true,
            service: "ecodrive-api",
            dbConfigured: isDbConfigured(),
            smtpConfigured: isSmtpConfigured(),
            smsConfigured: Boolean(SMS_WEBHOOK_URL)
        });
        return;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
        await handleAuthMe(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/logout") {
        await handleLogout(req, res);
        return;
    }

    if (req.method === "GET" && pathname === "/api/profile/settings") {
        await handleProfileSettingsGet(req, res, parsedUrl);
        return;
    }

    if (req.method === "POST" && pathname === "/api/profile/settings") {
        await handleProfileSettingsSave(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/profile/password") {
        await handleProfilePasswordChange(req, res);
        return;
    }

    if (req.method === "GET" && pathname === "/api/bookings") {
        await handleListBookings(req, res, parsedUrl);
        return;
    }

    if (req.method === "POST" && pathname === "/api/bookings") {
        await handleCreateBooking(req, res);
        return;
    }

    if (req.method === "GET" && pathname === "/api/products") {
        await handleListProducts(req, res, parsedUrl);
        return;
    }

    const bookingCancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
    if (req.method === "POST" && bookingCancelMatch) {
        await handleCancelBooking(req, res, decodeURIComponent(bookingCancelMatch[1]));
        return;
    }

    if (req.method === "GET" && pathname === "/api/admin/bookings") {
        await handleAdminBookings(req, res, parsedUrl);
        return;
    }

    if (req.method === "GET" && pathname === "/api/admin/dashboard") {
        await handleAdminDashboard(req, res);
        return;
    }

    if (req.method === "GET" && pathname === "/api/admin/settings") {
        await handleAdminSettingsGet(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/admin/settings/login-id") {
        await handleAdminSettingsUpdateLoginId(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/admin/settings/password") {
        await handleAdminSettingsUpdatePassword(req, res);
        return;
    }

    if (req.method === "GET" && pathname === "/api/admin/products") {
        await handleAdminProducts(req, res, parsedUrl);
        return;
    }

    if (req.method === "POST" && pathname === "/api/admin/products") {
        await handleAdminCreateProduct(req, res);
        return;
    }

    const adminProductUpdateMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if (req.method === "POST" && adminProductUpdateMatch) {
        await handleAdminUpdateProduct(req, res, adminProductUpdateMatch[1]);
        return;
    }

    const adminBookingDetailMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (req.method === "GET" && adminBookingDetailMatch) {
        await handleAdminBookingDetails(req, res, decodeURIComponent(adminBookingDetailMatch[1]));
        return;
    }

    const adminBookingDecisionMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/(approve|reject)$/);
    if (req.method === "POST" && adminBookingDecisionMatch) {
        await handleAdminBookingDecision(
            req,
            res,
            decodeURIComponent(adminBookingDecisionMatch[1]),
            adminBookingDecisionMatch[2]
        );
        return;
    }

    if (req.method === "GET" && pathname === "/api/admin/users") {
        await handleAdminUsers(req, res);
        return;
    }

    const blockMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/(block|unblock)$/);
    if (req.method === "POST" && blockMatch) {
        await handleBlockToggle(req, res, blockMatch[1], blockMatch[2]);
        return;
    }

    if (req.method === "POST" && pathname === "/api/signup") {
        await handleSignup(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/login") {
        await handleLogin(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/forgot/send-code") {
        await handleForgotSendCode(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/forgot/verify-code") {
        await handleForgotVerifyCode(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/reset-password") {
        await handleResetPassword(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/kyc/verify-id") {
        await handleKycVerifyId(req, res);
        return;
    }

    if (req.method === "POST" && pathname === "/api/kyc/verify-face") {
        await handleKycVerifyFace(req, res);
        return;
    }

    sendJson(res, 404, { success: false, message: "Endpoint not found." });
});

server.listen(PORT, () => {
    void ensureDbSchema();
    const dbStatus = isDbConfigured() ? "configured" : "missing-config";
    const smtpStatus = isSmtpConfigured() ? "enabled" : "demo-fallback";
    const smsStatus = SMS_WEBHOOK_URL ? "configured" : "demo-fallback";
    const otpMode = ALLOW_DEMO_OTP ? "demo-allowed" : "provider-required";
    const apiUrl = PUBLIC_API_BASE || `http://127.0.0.1:${PORT}`;
    console.log(
        `API server running at ${apiUrl} (DB: ${dbStatus}, SMTP: ${smtpStatus}, SMS: ${smsStatus}, OTP: ${otpMode}, SessionTTLms: ${SESSION_TTL_MS})`
    );
});
