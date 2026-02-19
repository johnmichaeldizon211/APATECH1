document.addEventListener("DOMContentLoaded", function () {
    const bookingStorageKeys = ["ecodrive_bookings", "ecodrive_orders", "orders"];
    const selectedBookingKey = "ecodrive_admin_selected_booking";
    const API_BASE = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    const detailsEmpty = document.getElementById("detailsEmpty");
    const detailsContent = document.getElementById("detailsContent");
    const approveBtn = document.getElementById("approveBtn");
    const rejectBtn = document.getElementById("rejectBtn");

    const detailOrderId = document.getElementById("detailOrderId");
    const detailCreatedAt = document.getElementById("detailCreatedAt");
    const detailName = document.getElementById("detailName");
    const detailEmail = document.getElementById("detailEmail");
    const detailModel = document.getElementById("detailModel");
    const detailService = document.getElementById("detailService");
    const detailPlan = document.getElementById("detailPlan");
    const detailPayment = document.getElementById("detailPayment");
    const detailStatus = document.getElementById("detailStatus");
    const detailTotal = document.getElementById("detailTotal");
    const detailAddress = document.getElementById("detailAddress");

    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function getRecordOrderId(record) {
        return String((record && (record.orderId || record.id)) || "").trim();
    }

    function getRecordCreatedAt(record) {
        return String((record && (record.createdAt || record.updatedAt)) || "").trim();
    }

    function getRecordEmail(record) {
        return String((record && (record.email || record.userEmail)) || "").trim().toLowerCase();
    }

    function buildNameFromRecord(record) {
        const direct = String((record && (record.fullName || record.name)) || "").trim();
        if (direct) {
            return direct;
        }
        return getRecordEmail(record) || "Unknown Customer";
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

    function formatPeso(amount) {
        return String.fromCharCode(8369) + Number(amount || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function matchesBookingRecord(record, orderId, createdAt) {
        if (!record || typeof record !== "object") {
            return false;
        }

        if (getRecordOrderId(record) !== String(orderId || "").trim()) {
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

    function readAllBookings() {
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

    function findBooking(orderId, createdAt) {
        const all = readAllBookings();
        const match = all.find(function (record) {
            return matchesBookingRecord(record, orderId, createdAt);
        });
        if (match) {
            return match;
        }

        const fallback = safeParse(localStorage.getItem(selectedBookingKey));
        if (matchesBookingRecord(fallback, orderId, createdAt)) {
            return fallback;
        }
        return null;
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
                changed = true;
                storageChanged = true;
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

    async function fetchBookingFromApi(orderId) {
        try {
            const response = await fetch(
                getApiUrl(`/api/admin/bookings/${encodeURIComponent(orderId)}`),
                { method: "GET" }
            );

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable", booking: null };
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true || !payload.booking) {
                return { mode: "error", booking: null };
            }

            return { mode: "ok", booking: payload.booking };
        } catch (_error) {
            return { mode: "unavailable", booking: null };
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

    function setEmptyState(show) {
        detailsEmpty.hidden = !show;
        detailsContent.hidden = show;
        approveBtn.disabled = show;
        rejectBtn.disabled = show;
    }

    function renderBookingDetails(booking) {
        detailOrderId.textContent = getRecordOrderId(booking) || "-";
        detailCreatedAt.textContent = formatDateTime(getRecordCreatedAt(booking));
        detailName.textContent = buildNameFromRecord(booking);
        detailEmail.textContent = getRecordEmail(booking) || "-";
        detailModel.textContent = String(booking.model || booking.productName || booking.itemName || "Ecodrive E-Bike");
        detailService.textContent = String(booking.service || "-");
        detailPlan.textContent = getPlanLabel(booking);
        detailPayment.textContent = String(booking.payment || "-");
        detailStatus.textContent = getStatusLabel(booking);
        detailTotal.textContent = formatPeso(booking.total || 0);
        detailAddress.textContent = String(booking.shippingAddress || "N/A");
    }

    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        const orderId = String(params.get("orderId") || "").trim();
        const createdAt = String(params.get("createdAt") || "").trim();
        if (!orderId) {
            setEmptyState(true);
            return;
        }

        let booking = null;
        const apiResult = await fetchBookingFromApi(orderId);
        if (apiResult.mode === "ok") {
            booking = apiResult.booking;
        }

        if (!booking) {
            setEmptyState(true);
            return;
        }

        localStorage.setItem(selectedBookingKey, JSON.stringify(booking));
        setEmptyState(false);
        renderBookingDetails(booking);

        approveBtn.addEventListener("click", async function () {
            if (!window.confirm("Approve this booking request?")) {
                return;
            }

            const result = await updateBookingDecisionViaApi(orderId, "approve");
            if (result.mode === "ok") {
                window.location.href = "adminorder.html";
                return;
            }
            if (result.mode === "error") {
                alert(result.message || "Unable to update booking status.");
                return;
            }
            alert("API unavailable. Unable to update booking status.");
        });

        rejectBtn.addEventListener("click", async function () {
            if (!window.confirm("Reject this booking request?")) {
                return;
            }

            const result = await updateBookingDecisionViaApi(orderId, "reject");
            if (result.mode === "ok") {
                window.location.href = "adminorder.html";
                return;
            }
            if (result.mode === "error") {
                alert(result.message || "Unable to update booking status.");
                return;
            }
            alert("API unavailable. Unable to update booking status.");
        });
    }

    void initialize();
});
