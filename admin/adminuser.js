document.addEventListener("DOMContentLoaded", () => {
    const usersKey = "users";
    const API_BASE = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    const totalUsersEl = document.getElementById("stat-total-users");
    const activeUsersEl = document.getElementById("stat-active-users");
    const newUsersEl = document.getElementById("stat-new-users");
    const blockedUsersEl = document.getElementById("stat-blocked-users");
    const usersTableBody = document.getElementById("users-table-body");
    const usersEmptyState = document.getElementById("users-empty-state");

    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    loadUsers();

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderStats(stats) {
        totalUsersEl.textContent = String(stats.totalUsers || 0);
        activeUsersEl.textContent = String(stats.activeUsers || 0);
        newUsersEl.textContent = String(stats.newUsersThisMonth || 0);
        blockedUsersEl.textContent = String(stats.blockedUsers || 0);
    }

    function renderUsers(users) {
        usersTableBody.innerHTML = "";

        if (!Array.isArray(users) || users.length === 0) {
            usersEmptyState.style.display = "grid";
            return;
        }

        usersEmptyState.style.display = "none";

        users.forEach((user) => {
            const status = String(user.status || "active").toLowerCase() === "blocked" ? "blocked" : "active";
            const nextAction = status === "blocked" ? "unblock" : "block";

            const row = document.createElement("article");
            row.className = "user-row";
            row.innerHTML = `
                <span class="user-cell">${escapeHtml(user.name || "N/A")}</span>
                <span class="user-cell">${escapeHtml(user.email || "N/A")}</span>
                <span class="user-cell">${escapeHtml(user.role || "user")}</span>
                <span class="user-cell">
                    <span class="status-pill ${status}">${status === "blocked" ? "Blocked" : "Active"}</span>
                </span>
                <span class="user-cell">
                    <button class="action-btn ${nextAction}" type="button">
                        ${nextAction === "block" ? "Block" : "Unblock"}
                    </button>
                </span>
            `;

            const actionBtn = row.querySelector(".action-btn");
            actionBtn.addEventListener("click", async () => {
                actionBtn.disabled = true;
                actionBtn.textContent = nextAction === "block" ? "Blocking..." : "Unblocking...";

                const result = await updateUserStatus(user, nextAction);
                if (result.mode === "ok") {
                    await loadUsers();
                    return;
                }

                if (result.mode === "unavailable") {
                    alert("API unavailable. Please make sure the backend server is running.");
                } else {
                    alert(result.message || "Unable to update user status.");
                }
                actionBtn.disabled = false;
                actionBtn.textContent = nextAction === "block" ? "Block" : "Unblock";
            });

            usersTableBody.appendChild(row);
        });
    }

    async function fetchUsersFromApi() {
        try {
            const response = await fetch(getApiUrl("/api/admin/users"), {
                method: "GET"
            });

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success !== true) {
                return {
                    mode: "error",
                    message: data.message || "Failed to load users from API."
                };
            }

            return {
                mode: "ok",
                data: data
            };
        } catch (_error) {
            return { mode: "unavailable" };
        }
    }

    async function updateUserStatus(user, action) {
        if (!user || !user.id) {
            return { mode: "error", message: "User id is missing." };
        }

        try {
            const response = await fetch(
                getApiUrl(`/api/admin/users/${encodeURIComponent(user.id)}/${action}`),
                { method: "POST" }
            );

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success !== true) {
                return {
                    mode: "error",
                    message: data.message || "Unable to update user status."
                };
            }

            return { mode: "ok" };
        } catch (_error) {
            return { mode: "unavailable" };
        }
    }

    function readUsersFromLocalStorage() {
        try {
            const raw = localStorage.getItem(usersKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function getLocalUsersPayload() {
        const users = readUsersFromLocalStorage()
            .filter((user) => String(user.role || "user").toLowerCase() !== "admin")
            .map((user, index) => ({
                id: Number(user.id || index + 1),
                name: String(user.name || ""),
                email: String(user.email || ""),
                role: String(user.role || "user"),
                status: user.isBlocked ? "blocked" : "active",
                createdAt: user.createdAt || null
            }));

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const stats = users.reduce(
            (acc, user) => {
                acc.totalUsers += 1;
                if (user.status === "blocked") {
                    acc.blockedUsers += 1;
                } else {
                    acc.activeUsers += 1;
                }

                if (user.createdAt) {
                    const created = new Date(user.createdAt);
                    if (!Number.isNaN(created.getTime()) && created >= monthStart) {
                        acc.newUsersThisMonth += 1;
                    }
                }
                return acc;
            },
            {
                totalUsers: 0,
                activeUsers: 0,
                newUsersThisMonth: 0,
                blockedUsers: 0
            }
        );

        return { users, stats };
    }

    function toggleLocalUserBlock(email, blocked) {
        const targetEmail = String(email || "").trim().toLowerCase();
        const users = readUsersFromLocalStorage();
        const next = users.map((user) => {
            if (String(user.email || "").trim().toLowerCase() !== targetEmail) {
                return user;
            }
            return {
                ...user,
                isBlocked: blocked
            };
        });
        localStorage.setItem(usersKey, JSON.stringify(next));
    }

    async function loadUsers() {
        usersTableBody.innerHTML = "";
        usersEmptyState.style.display = "grid";

        const apiResult = await fetchUsersFromApi();
        if (apiResult.mode === "ok") {
            renderStats(apiResult.data.stats || {});
            renderUsers(apiResult.data.users || []);
            return;
        }

        renderStats({
            totalUsers: 0,
            activeUsers: 0,
            newUsersThisMonth: 0,
            blockedUsers: 0
        });
        renderUsers([]);
    }
});
