document.addEventListener("DOMContentLoaded", function () {
    const usersKey = "users";
    const bookingStorageKeys = ["ecodrive_bookings", "ecodrive_orders", "orders"];
    const watchedStorageKeys = new Set(bookingStorageKeys.concat(["latestBooking", usersKey]));
    const configuredApiBase = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    const totalSalesEl = document.getElementById("stat-total-sales");
    const totalBookingsEl = document.getElementById("stat-total-bookings");
    const pendingBookingsEl = document.getElementById("stat-pending-bookings");
    const totalUsersEl = document.getElementById("stat-total-users");
    const totalApprovedEl = document.getElementById("stat-total-approved");
    const totalRejectedEl = document.getElementById("stat-total-rejected");
    const successfulBookingsEl = document.getElementById("stat-successful-bookings");
    const cancelledBookingsEl = document.getElementById("stat-cancelled-bookings");
    const chartBarsEl = document.getElementById("sales-chart-bars");
    const chartLabelsEl = document.getElementById("sales-chart-labels");
    const chartSummaryEl = document.getElementById("sales-chart-summary");
    const dashboardSourceEl = document.getElementById("dashboard-source");

    if (
        !totalSalesEl ||
        !totalBookingsEl ||
        !pendingBookingsEl ||
        !totalUsersEl ||
        !totalApprovedEl ||
        !totalRejectedEl ||
        !successfulBookingsEl ||
        !cancelledBookingsEl ||
        !chartBarsEl ||
        !chartLabelsEl ||
        !chartSummaryEl ||
        !dashboardSourceEl
    ) {
        return;
    }

    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    const AUTO_REFRESH_INTERVAL_MS = 7000;
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let loadInFlight = false;
    let refreshTimerId = null;

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function getApiUrl(path) {
        return configuredApiBase ? `${configuredApiBase}${path}` : path;
    }

    function getApiBaseCandidates() {
        const candidates = [
            configuredApiBase,
            "http://127.0.0.1:5050",
            "http://localhost:5050",
            ""
        ];

        const unique = [];
        const seen = new Set();
        candidates.forEach(function (item) {
            const normalized = String(item || "").trim().replace(/\/+$/, "");
            if (seen.has(normalized)) {
                return;
            }
            seen.add(normalized);
            unique.push(normalized);
        });
        return unique;
    }

    function getApiUrlForBase(base, path) {
        const normalizedBase = String(base || "").trim().replace(/\/+$/, "");
        return normalizedBase ? `${normalizedBase}${path}` : path;
    }

    function toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatPeso(amount) {
        return String.fromCharCode(8369) + toNumber(amount).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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

    function readBookingsFromLocalStorage() {
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

    function dedupeBookings(items) {
        const list = Array.isArray(items) ? items : [];
        const deduped = [];
        const seen = new Set();

        list.forEach(function (record) {
            if (!record || typeof record !== "object") {
                return;
            }
            const dedupeKey = [
                getRecordOrderId(record),
                getRecordCreatedAt(record),
                getRecordEmail(record),
                String(record.model || record.productName || record.itemName || "").trim().toLowerCase()
            ].join("|");
            if (seen.has(dedupeKey)) {
                return;
            }
            seen.add(dedupeKey);
            deduped.push(record);
        });

        return deduped;
    }

    function getMergedStatus(record) {
        const status = String(record && record.status || "").toLowerCase();
        const fulfillment = String(record && record.fulfillmentStatus || "").toLowerCase();
        const reviewDecision = String(record && record.reviewDecision || "").toLowerCase();
        return `${status} ${fulfillment} ${reviewDecision}`.trim();
    }

    function isCancelledBooking(record) {
        return getMergedStatus(record).includes("cancel");
    }

    function isRejectedBooking(record) {
        const merged = getMergedStatus(record);
        return merged.includes("reject") || isCancelledBooking(record);
    }

    function isApprovedBooking(record) {
        const merged = getMergedStatus(record);
        if (isRejectedBooking(record)) {
            return false;
        }
        return (
            merged.includes("approve") ||
            merged.includes("complete") ||
            merged.includes("deliver")
        );
    }

    function isPendingBooking(record) {
        if (isRejectedBooking(record)) {
            return false;
        }
        return !isApprovedBooking(record);
    }

    function buildMonthSkeleton() {
        const months = [];
        const now = new Date();
        for (let offset = 11; offset >= 0; offset -= 1) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            months.push({
                key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
                label: `${MONTH_NAMES[monthDate.getMonth()]} ${String(monthDate.getFullYear()).slice(-2)}`,
                sales: 0,
                bookings: 0,
                approved: 0,
                rejected: 0,
                pending: 0
            });
        }
        return months;
    }

    function parseRecordDate(record) {
        const raw = getRecordCreatedAt(record);
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return parsed;
    }

    function getLocalUsersTotal() {
        const parsed = safeParse(localStorage.getItem(usersKey));
        const users = Array.isArray(parsed) ? parsed : [];
        return users.filter(function (user) {
            const role = String((user && user.role) || "user").trim().toLowerCase();
            return role !== "admin";
        }).length;
    }

    function buildDashboardPayloadFromRecords(bookingsInput, totalUsersInput) {
        const bookings = dedupeBookings(bookingsInput);
        const monthlySeries = buildMonthSkeleton();
        const monthlyMap = new Map();
        monthlySeries.forEach(function (entry) {
            monthlyMap.set(entry.key, entry);
        });

        const stats = {
            totalSales: 0,
            totalBookings: bookings.length,
            pendingBookings: 0,
            approvedBookings: 0,
            rejectedBookings: 0,
            successfulBookings: 0,
            cancelledBookings: 0,
            totalUsers: toNumber(totalUsersInput)
        };

        bookings.forEach(function (record) {
            const rejected = isRejectedBooking(record);
            const approved = isApprovedBooking(record);
            const pending = isPendingBooking(record);
            const cancelled = isCancelledBooking(record);
            const totalAmount = toNumber(record && record.total);

            if (pending) {
                stats.pendingBookings += 1;
            }
            if (approved) {
                stats.approvedBookings += 1;
                stats.successfulBookings += 1;
                stats.totalSales += totalAmount;
            }
            if (rejected) {
                stats.rejectedBookings += 1;
            }
            if (cancelled) {
                stats.cancelledBookings += 1;
            }

            const recordDate = parseRecordDate(record);
            if (!recordDate) {
                return;
            }

            const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}`;
            const monthEntry = monthlyMap.get(monthKey);
            if (!monthEntry) {
                return;
            }

            monthEntry.bookings += 1;
            if (approved) {
                monthEntry.approved += 1;
                monthEntry.sales += totalAmount;
            } else if (rejected) {
                monthEntry.rejected += 1;
            } else if (pending) {
                monthEntry.pending += 1;
            }
        });

        return {
            stats: stats,
            salesOverview: monthlySeries
        };
    }

    function buildLocalDashboardPayload() {
        const localBookings = readBookingsFromLocalStorage();
        return buildDashboardPayloadFromRecords(localBookings, getLocalUsersTotal());
    }

    function renderStats(statsInput) {
        const stats = statsInput && typeof statsInput === "object" ? statsInput : {};
        totalSalesEl.textContent = formatPeso(stats.totalSales);
        totalBookingsEl.textContent = String(toNumber(stats.totalBookings));
        pendingBookingsEl.textContent = String(toNumber(stats.pendingBookings));
        totalUsersEl.textContent = String(toNumber(stats.totalUsers));
        totalApprovedEl.textContent = String(toNumber(stats.approvedBookings));
        totalRejectedEl.textContent = String(toNumber(stats.rejectedBookings));
        successfulBookingsEl.textContent = `Successful bookings: ${toNumber(stats.successfulBookings)}`;
        cancelledBookingsEl.textContent = `Cancelled bookings: ${toNumber(stats.cancelledBookings)}`;
    }

    function renderChart(salesOverviewInput) {
        const salesOverview = Array.isArray(salesOverviewInput) && salesOverviewInput.length
            ? salesOverviewInput
            : buildMonthSkeleton();

        const peakSales = salesOverview.reduce(function (max, item) {
            return Math.max(max, toNumber(item && item.sales));
        }, 0);

        chartBarsEl.innerHTML = "";
        chartLabelsEl.innerHTML = "";

        salesOverview.forEach(function (item) {
            const sales = toNumber(item && item.sales);
            const bookings = toNumber(item && item.bookings);
            const label = String((item && item.label) || "-");
            const heightPercent = peakSales > 0 ? Math.max(7, Math.round((sales / peakSales) * 100)) : 7;

            const bar = document.createElement("span");
            bar.style.height = `${heightPercent}%`;
            bar.title = `${label} | Sales: ${formatPeso(sales)} | Bookings: ${bookings}`;
            chartBarsEl.appendChild(bar);

            const labelNode = document.createElement("span");
            labelNode.textContent = label;
            chartLabelsEl.appendChild(labelNode);
        });

        const latest = salesOverview[salesOverview.length - 1];
        if (!latest) {
            chartSummaryEl.textContent = "No dashboard data available yet.";
            return;
        }

        chartSummaryEl.textContent = `Latest month (${latest.label}): ${formatPeso(latest.sales)} from ${toNumber(latest.bookings)} booking(s).`;
    }

    async function fetchJsonFromBase(base, path) {
        const url = getApiUrlForBase(base, path);

        try {
            const response = await fetch(url, { method: "GET" });
            const payload = await response.json().catch(function () {
                return {};
            });
            return {
                ok: response.ok,
                status: response.status,
                payload: payload,
                url: url
            };
        } catch (_error) {
            return {
                ok: false,
                status: 0,
                payload: {},
                url: url
            };
        }
    }

    async function fetchDashboardFromApi() {
        const bases = getApiBaseCandidates();
        let lastErrorMessage = "Cannot reach API server.";

        for (let i = 0; i < bases.length; i += 1) {
            const base = bases[i];
            const dashboardResult = await fetchJsonFromBase(base, "/api/admin/dashboard");

            if (dashboardResult.ok && dashboardResult.payload && dashboardResult.payload.success === true) {
                return {
                    mode: "ok",
                    payload: dashboardResult.payload,
                    sourceType: "dashboard",
                    sourceUrl: dashboardResult.url
                };
            }

            if (dashboardResult.status !== 404 && dashboardResult.status !== 405) {
                if (dashboardResult.status > 0) {
                    lastErrorMessage = `Dashboard API returned HTTP ${dashboardResult.status}.`;
                }
                continue;
            }

            const bookingsResult = await fetchJsonFromBase(base, "/api/admin/bookings?scope=all");
            const usersResult = await fetchJsonFromBase(base, "/api/admin/users");
            const bookingsOk = bookingsResult.ok && bookingsResult.payload && bookingsResult.payload.success === true;
            const usersOk = usersResult.ok && usersResult.payload && usersResult.payload.success === true;

            if (bookingsOk && usersOk) {
                const bookings = Array.isArray(bookingsResult.payload.bookings) ? bookingsResult.payload.bookings : [];
                const usersTotal = toNumber(
                    usersResult.payload &&
                    usersResult.payload.stats &&
                    usersResult.payload.stats.totalUsers
                );
                const payload = buildDashboardPayloadFromRecords(bookings, usersTotal);

                return {
                    mode: "ok",
                    payload: payload,
                    sourceType: "legacy",
                    sourceUrl: getApiUrlForBase(base, "/api/admin/bookings?scope=all")
                };
            }

            if (!bookingsOk && bookingsResult.status > 0) {
                lastErrorMessage = `Legacy bookings API returned HTTP ${bookingsResult.status}.`;
            } else if (!usersOk && usersResult.status > 0) {
                lastErrorMessage = `Legacy users API returned HTTP ${usersResult.status}.`;
            }
        }

        return { mode: "unavailable", message: lastErrorMessage };
    }

    function getSourceLabel(apiResult) {
        if (!apiResult || apiResult.mode !== "ok") {
            return "";
        }

        if (apiResult.sourceType === "dashboard") {
            return `Source: MySQL backend (live dashboard API) - ${apiResult.sourceUrl}`;
        }
        if (apiResult.sourceType === "legacy") {
            return `Source: MySQL backend (legacy API fallback) - ${apiResult.sourceUrl}`;
        }
        return "Source: MySQL backend (live API).";
    }

    async function loadDashboard(force) {
        if (loadInFlight) {
            return;
        }
        if (document.hidden && !force) {
            return;
        }

        loadInFlight = true;
        try {
            const apiResult = await fetchDashboardFromApi();
            if (apiResult.mode === "ok") {
                renderStats(apiResult.payload.stats || {});
                renderChart(apiResult.payload.salesOverview || []);
                dashboardSourceEl.textContent = getSourceLabel(apiResult);
                return;
            }

            renderStats({
                totalSales: 0,
                totalBookings: 0,
                pendingBookings: 0,
                totalUsers: 0,
                approvedBookings: 0,
                rejectedBookings: 0,
                successfulBookings: 0,
                cancelledBookings: 0
            });
            renderChart([]);
            dashboardSourceEl.textContent = `Source: API unavailable (${apiResult.message || "Cannot connect to backend"})`;
        } finally {
            loadInFlight = false;
        }
    }

    function startAutoRefresh() {
        if (refreshTimerId) {
            return;
        }
        refreshTimerId = window.setInterval(function () {
            void loadDashboard(false);
        }, AUTO_REFRESH_INTERVAL_MS);
    }

    function stopAutoRefresh() {
        if (!refreshTimerId) {
            return;
        }
        window.clearInterval(refreshTimerId);
        refreshTimerId = null;
    }

    window.addEventListener("storage", function (event) {
        if (!event.key || watchedStorageKeys.has(event.key)) {
            void loadDashboard(true);
        }
    });

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            stopAutoRefresh();
            return;
        }
        void loadDashboard(true);
        startAutoRefresh();
    });

    window.addEventListener("beforeunload", stopAutoRefresh);

    void loadDashboard(true);
    startAutoRefresh();
});
