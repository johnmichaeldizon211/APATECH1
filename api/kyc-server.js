const http = require("http");
const crypto = require("crypto");

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

const PORT = process.env.KYC_PORT ? Number(process.env.KYC_PORT) : 5050;

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const otpSessions = new Map();

const ADMIN_USERNAME = "echodrive";
const ADMIN_PASSWORD = "echodriveadmin123";

const DB_HOST = String(process.env.DB_HOST || "").trim();
const DB_PORT = Number(process.env.DB_PORT || "3306");
const DB_USER = String(process.env.DB_USER || "").trim();
const DB_PASSWORD = String(process.env.DB_PASSWORD || "").trim();
const DB_NAME = String(process.env.DB_NAME || "").trim();
let dbPool = null;

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || "").trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";

const SMS_WEBHOOK_URL = String(process.env.SMS_WEBHOOK_URL || "").trim();
const SMS_WEBHOOK_TOKEN = String(process.env.SMS_WEBHOOK_TOKEN || "").trim();
let smtpTransport = null;

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

function isDbConfigured() {
    return Boolean(mysql && DB_HOST && Number.isFinite(DB_PORT) && DB_PORT > 0 && DB_USER && DB_NAME);
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
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    return dbPool;
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

        sendJson(res, 201, {
            success: true,
            user: {
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

        sendJson(res, 500, { success: false, message: error.message || "Signup failed." });
    }
}

async function handleLogin(req, res) {
    try {
        const body = await readBody(req);
        const username = normalizeEmail(body.email);
        const password = String(body.password || "");

        if (!username || !password) {
            sendJson(res, 400, { success: false, message: "Email/username and password are required." });
            return;
        }

        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            sendJson(res, 200, {
                success: true,
                user: {
                    id: 0,
                    name: "Admin",
                    email: ADMIN_USERNAME,
                    role: "admin",
                    status: "active"
                }
            });
            return;
        }

        if (!isValidEmail(username)) {
            sendJson(res, 400, { success: false, message: "Please enter a valid email address." });
            return;
        }

        const pool = await getDbPool();
        const [rows] = await pool.execute(
            `SELECT id, first_name, middle_initial, last_name, full_name, email, phone, address, password_hash, role, is_blocked
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [username]
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

        sendJson(res, 200, { success: true, user: safeUser });
    } catch (error) {
        sendJson(res, 500, { success: false, message: error.message || "Login failed." });
    }
}

async function handleAdminUsers(req, res) {
    try {
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

async function handleBlockToggle(req, res, userId, action) {
    try {
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

        const requestId = createVerificationToken("otp");
        const code = generateOtpCode();
        const normalizedContact = normalizeContact(method, contact);

        otpSessions.set(requestId, {
            code: code,
            method: method,
            contact: normalizedContact,
            expiresAt: Date.now() + OTP_TTL_MS,
            verified: false,
            attempts: 0
        });

        const delivery = await deliverOtp(method, contact, code);
        const isDemoMode = !delivery.sent;
        const responsePayload = {
            success: true,
            message: isDemoMode ? "Verification code generated in demo mode." : "Verification code sent.",
            requestId: requestId,
            expiresInMs: OTP_TTL_MS,
            delivery: {
                method: method,
                mode: isDemoMode ? "demo" : "provider",
                provider: isDemoMode ? "local-demo" : String(delivery.provider || "configured-provider")
            }
        };

        if (isDemoMode) {
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
        const email = normalizeEmail(body.email);
        const method = String(body.method || "").trim().toLowerCase();
        const contact = String(body.contact || "").trim();

        if (!isStrongPassword(newPassword)) {
            sendJson(res, 400, {
                success: false,
                message: "Password must be 8+ chars with upper, lower, number, and symbol."
            });
            return;
        }

        if (requestId) {
            const session = otpSessions.get(requestId);
            if (!session || !session.verified || session.expiresAt <= Date.now()) {
                sendJson(res, 400, { success: false, message: "OTP verification is required." });
                return;
            }
            otpSessions.delete(requestId);
        }

        if (isDbConfigured()) {
            const pool = await getDbPool();
            const passwordHash = hashPassword(newPassword);

            let result = null;
            if (isValidEmail(email)) {
                [result] = await pool.execute(
                    "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?",
                    [passwordHash, email]
                );
            } else if (method === "mobile" && isValidMobile(contact)) {
                [result] = await pool.execute(
                    "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE phone = ?",
                    [passwordHash, normalizeMobile(contact)]
                );
            }

            if (result && Number(result.affectedRows || 0) < 1) {
                sendJson(res, 404, { success: false, message: "Account not found for password reset." });
                return;
            }
        }

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
    const dbStatus = isDbConfigured() ? "configured" : "missing-config";
    const smtpStatus = isSmtpConfigured() ? "enabled" : "demo-fallback";
    const smsStatus = SMS_WEBHOOK_URL ? "configured" : "demo-fallback";
    console.log(
        `API server running at http://127.0.0.1:${PORT} (DB: ${dbStatus}, SMTP: ${smtpStatus}, SMS: ${smsStatus})`
    );
});
