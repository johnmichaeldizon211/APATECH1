document.addEventListener("DOMContentLoaded", function () {
    const usersKey = "users";
    const bookingStorageKeys = ["ecodrive_bookings", "ecodrive_orders", "orders"];
    const watchedStorageKeys = new Set(bookingStorageKeys.concat(["latestBooking", usersKey]));
    const adminSelectedBookingKey = "ecodrive_admin_selected_booking";
    const API_BASE = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    const rowsContainer = document.getElementById("requestRows");
    const emptyState = document.getElementById("bookingEmptyState");

    if (!rowsContainer || !emptyState) {
        return;
    }

    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    const AUTO_REFRESH_INTERVAL_MS = 7000;
    let renderedItems = [];
    let loadRowsInFlight = false;
    let autoRefreshTimerId = null;

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function encodeToken(value) {
        return encodeURIComponent(String(value || ""));
    }

    function decodeToken(value) {
        try {
            return decodeURIComponent(String(value || ""));
        } catch (_error) {
            return String(value || "");
        }
    }

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function buildNameFromUser(user) {
        if (!user || typeof user !== "object") {
            return "";
        }

        if (user.name) {
            return String(user.name).trim();
        }

        const first = String(user.firstName || "").trim();
        const middle = String(user.middleInitial || "").trim();
        const last = String(user.lastName || "").trim();
        const middleWithDot = middle ? middle.replace(/\.+$/, "") + "." : "";
        return [first, middleWithDot, last].filter(Boolean).join(" ").trim();
    }

    function getUsersByEmailMap() {
        const parsed = safeParse(localStorage.getItem(usersKey));
        const users = Array.isArray(parsed) ? parsed : [];
        const map = {};

        users.forEach(function (user) {
            if (!user || typeof user !== "object") {
                return;
            }
            const email = String(user.email || "").trim().toLowerCase();
            if (!email) {
                return;
            }
            const name = buildNameFromUser(user);
            if (name) {
                map[email] = name;
            }
        });

        return map;
    }

    function getRecordEmail(record) {
        return String((record && (record.email || record.userEmail)) || "")
            .trim()
            .toLowerCase();
    }

    function readBookings() {
        const merged = [];
        bookingStorageKeys.forEach(function (key) {
            const parsed = safeParse(localStorage.getItem(key));
            if (Array.isArray(parsed)) {
                merged.push.apply(merged, parsed);
            }
        });

        const latest = safeParse(localStorage.getItem("latestBooking"));
        if (latest && typeof latest === "object") {
            merged.push(latest);
        }

        return merged;
    }

    function getMergedStatus(record) {
        const statusText = String(record && record.status || "");
        const fulfillmentText = String(record && record.fulfillmentStatus || "");
        return (statusText + " " + fulfillmentText).toLowerCase();
    }

    function isPendingBooking(record) {
        const merged = getMergedStatus(record);
        if (!merged.trim()) {
            return true;
        }

        if (merged.includes("cancel")) return false;
        if (merged.includes("reject")) return false;
        if (merged.includes("approved")) return false;
        if (merged.includes("complete")) return false;
        if (merged.includes("deliver")) return false;
        return true;
    }

    function getBookingName(record, usersByEmailMap) {
        const localName = String(
            (record && (record.fullName || record.name)) ||
            ""
        ).trim();
        if (localName) {
            return localName;
        }

        const email = getRecordEmail(record);
        if (email && usersByEmailMap[email]) {
            return usersByEmailMap[email];
        }

        return email || "Unknown Customer";
    }

    function getPlanLabel(record) {
        const payment = String(record && record.payment || "").toLowerCase();
        const service = String(record && record.service || "").toLowerCase();
        if (payment.includes("installment") || service.includes("installment")) {
            return "Installment";
        }
        return "Full Payment";
    }

    function getStatusLabel(record) {
        const status = String(record && record.status || "").trim();
        const fulfillment = String(record && record.fulfillmentStatus || "").trim();
        if (status && fulfillment && status.toLowerCase() !== fulfillment.toLowerCase()) {
            return status + " / " + fulfillment;
        }
        return status || fulfillment || "Pending review";
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "N/A";
        }
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function normalizeBookings(raw, usersByEmailMap) {
        const normalized = raw
            .map(function (record, index) {
                if (!record || typeof record !== "object") {
                    return null;
                }

                if (!isPendingBooking(record)) {
                    return null;
                }

                const createdAt = String(record.createdAt || record.updatedAt || "").trim() || new Date().toISOString();
                const orderId = String(record.orderId || record.id || "").trim() || ("BOOKING-" + index);

                return {
                    orderId: orderId,
                    createdAt: createdAt,
                    name: getBookingName(record, usersByEmailMap),
                    model: String(record.model || record.productName || record.itemName || "Ecodrive E-Bike"),
                    plan: getPlanLabel(record),
                    status: getStatusLabel(record),
                    email: getRecordEmail(record),
                    service: String(record.service || ""),
                    payment: String(record.payment || ""),
                    total: Number(record.total || 0),
                    shippingAddress: String(record.shippingAddress || "")
                };
            })
            .filter(Boolean)
            .sort(function (a, b) {
                return String(b.createdAt).localeCompare(String(a.createdAt));
            });

        const deduped = [];
        const seen = new Set();

        normalized.forEach(function (record) {
            const dedupeKey = [
                String(record.orderId || "").trim(),
                String(record.createdAt || "").trim(),
                String(record.email || "").trim().toLowerCase(),
                String(record.model || "").trim().toLowerCase()
            ].join("|");

            if (seen.has(dedupeKey)) {
                return;
            }

            seen.add(dedupeKey);
            deduped.push(record);
        });

        return deduped;
    }

    function renderRows(sourceRows) {
        const usersByEmailMap = getUsersByEmailMap();
        const baseRows = Array.isArray(sourceRows) ? sourceRows : readBookings();
        renderedItems = normalizeBookings(baseRows, usersByEmailMap);
        rowsContainer.innerHTML = "";

        if (!renderedItems.length) {
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;

        const fragment = document.createDocumentFragment();
        renderedItems.forEach(function (item) {
            const row = document.createElement("article");
            row.className = "request-row";
            row.innerHTML = ""
                + "<span>" + escapeHtml(item.name) + "</span>"
                + "<span>" + escapeHtml(item.model) + "</span>"
                + "<span>" + escapeHtml(item.plan) + "</span>"
                + "<span class=\"status\">" + escapeHtml(item.status) + "</span>"
                + "<span class=\"action-group\">"
                + "<button type=\"button\" class=\"action-btn approve\" data-action=\"approve\" data-order-id=\"" + encodeToken(item.orderId) + "\" data-created-at=\"" + encodeToken(item.createdAt) + "\">Approve</button>"
                + "<button type=\"button\" class=\"action-btn reject\" data-action=\"reject\" data-order-id=\"" + encodeToken(item.orderId) + "\" data-created-at=\"" + encodeToken(item.createdAt) + "\">Reject</button>"
                + "<button type=\"button\" class=\"action-btn view\" data-action=\"view\" data-order-id=\"" + encodeToken(item.orderId) + "\" data-created-at=\"" + encodeToken(item.createdAt) + "\">View</button>"
                + "</span>";
            fragment.appendChild(row);
        });

        rowsContainer.appendChild(fragment);
    }

    function getRecordOrderId(record) {
        return String((record && (record.orderId || record.id)) || "").trim();
    }

    function getRecordCreatedAt(record) {
        return String((record && (record.createdAt || record.updatedAt)) || "").trim();
    }

    function matchesBookingRecord(record, orderId, createdAt) {
        if (!record || typeof record !== "object") {
            return false;
        }

        const sameOrderId = getRecordOrderId(record) === String(orderId || "").trim();
        if (!sameOrderId) {
            return false;
        }

        const targetCreatedAt = String(createdAt || "").trim();
        if (!targetCreatedAt) {
            return true;
        }

        const recordCreatedAt = getRecordCreatedAt(record);
        if (!recordCreatedAt) {
            return true;
        }
        return recordCreatedAt === targetCreatedAt;
    }

    function applyDecisionToRecord(record, action) {
        const next = Object.assign({}, record);
        if (action === "approve") {
            next.status = "Approved";
            if (!String(next.fulfillmentStatus || "").trim()) {
                next.fulfillmentStatus = "In Process";
            }
            next.reviewDecision = "approved";
        } else {
            next.status = "Rejected";
            next.fulfillmentStatus = "Rejected";
            next.reviewDecision = "rejected";
        }
        next.reviewedAt = new Date().toISOString();
        return next;
    }

    function updateBookingDecision(orderId, createdAt, action) {
        let changed = false;

        bookingStorageKeys.forEach(function (storageKey) {
            const parsed = safeParse(localStorage.getItem(storageKey));
            if (!Array.isArray(parsed)) {
                return;
            }

            let storageChanged = false;
            const next = parsed.map(function (record) {
                if (!matchesBookingRecord(record, orderId, createdAt)) {
                    return record;
                }
                storageChanged = true;
                changed = true;
                return applyDecisionToRecord(record, action);
            });

            if (storageChanged) {
                localStorage.setItem(storageKey, JSON.stringify(next));
            }
        });

        const latest = safeParse(localStorage.getItem("latestBooking"));
        if (matchesBookingRecord(latest, orderId, createdAt)) {
            localStorage.setItem("latestBooking", JSON.stringify(applyDecisionToRecord(latest, action)));
            changed = true;
        }

        return changed;
    }

    async function fetchPendingBookingsFromApi() {
        try {
            const response = await fetch(getApiUrl("/api/admin/bookings?scope=pending"), {
                method: "GET"
            });

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable", bookings: [] };
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true) {
                return { mode: "error", bookings: [] };
            }

            return {
                mode: "ok",
                bookings: Array.isArray(payload.bookings) ? payload.bookings : []
            };
        } catch (_error) {
            return { mode: "unavailable", bookings: [] };
        }
    }

    async function updateBookingDecisionViaApi(orderId, action) {
        try {
            const response = await fetch(
                getApiUrl(`/api/admin/bookings/${encodeURIComponent(orderId)}/${action}`),
                { method: "POST" }
            );

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true) {
                return {
                    mode: "error",
                    message: payload.message || "Unable to update booking status."
                };
            }
            return { mode: "ok" };
        } catch (_error) {
            return { mode: "unavailable" };
        }
    }

    async function loadRows(force) {
        if (loadRowsInFlight) {
            return;
        }
        if (document.hidden && !force) {
            return;
        }

        loadRowsInFlight = true;
        try {
            const apiResult = await fetchPendingBookingsFromApi();
            if (apiResult.mode === "ok") {
                renderRows(apiResult.bookings);
                return;
            }
            renderRows([]);
        } finally {
            loadRowsInFlight = false;
        }
    }

    function startAutoRefresh() {
        if (autoRefreshTimerId) {
            return;
        }
        autoRefreshTimerId = window.setInterval(function () {
            void loadRows(false);
        }, AUTO_REFRESH_INTERVAL_MS);
    }

    function stopAutoRefresh() {
        if (!autoRefreshTimerId) {
            return;
        }
        window.clearInterval(autoRefreshTimerId);
        autoRefreshTimerId = null;
    }

    function openDetailsPage(orderId, createdAt) {
        const selected = renderedItems.find(function (item) {
            return item.orderId === orderId && item.createdAt === createdAt;
        });
        if (selected) {
            localStorage.setItem(adminSelectedBookingKey, JSON.stringify(selected));
        }

        const query = new URLSearchParams();
        query.set("orderId", orderId);
        if (createdAt) {
            query.set("createdAt", createdAt);
        }
        window.location.href = "adminorder-view.html?" + query.toString();
    }

    rowsContainer.addEventListener("click", async function (event) {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) {
            return;
        }

        const action = String(actionButton.getAttribute("data-action") || "").trim().toLowerCase();
        const orderId = decodeToken(actionButton.getAttribute("data-order-id"));
        const createdAt = decodeToken(actionButton.getAttribute("data-created-at"));
        if (!orderId) {
            return;
        }

        if (action === "view") {
            openDetailsPage(orderId, createdAt);
            return;
        }

        if (action !== "approve" && action !== "reject") {
            return;
        }

        const confirmMessage = action === "approve"
            ? "Approve this booking request?"
            : "Reject this booking request?";
        if (!window.confirm(confirmMessage)) {
            return;
        }

        const apiResult = await updateBookingDecisionViaApi(orderId, action);
        if (apiResult.mode === "ok") {
            await loadRows(true);
            return;
        }

        if (apiResult.mode === "error") {
            alert(apiResult.message || "Unable to update booking status.");
            return;
        }
        alert("API unavailable. Unable to update booking status.");
    });

    window.addEventListener("storage", function (event) {
        if (!event.key || watchedStorageKeys.has(event.key)) {
            void loadRows(true);
        }
    });

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            stopAutoRefresh();
            return;
        }
        void loadRows(true);
        startAutoRefresh();
    });

    window.addEventListener("beforeunload", stopAutoRefresh);

    void loadRows(true);
    startAutoRefresh();
});
