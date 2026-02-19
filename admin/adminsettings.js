document.addEventListener("DOMContentLoaded", function () {
    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    const apiBase = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    const loginIdForm = document.getElementById("loginIdForm");
    const loginIdInput = document.getElementById("loginIdInput");
    const currentPasswordForLoginId = document.getElementById("currentPasswordForLoginId");
    const saveLoginIdBtn = document.getElementById("saveLoginIdBtn");
    const loginIdStatus = document.getElementById("loginIdStatus");

    const passwordForm = document.getElementById("passwordForm");
    const currentPasswordInput = document.getElementById("currentPasswordInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const savePasswordBtn = document.getElementById("savePasswordBtn");
    const passwordStatus = document.getElementById("passwordStatus");

    if (
        !loginIdForm ||
        !loginIdInput ||
        !currentPasswordForLoginId ||
        !saveLoginIdBtn ||
        !loginIdStatus ||
        !passwordForm ||
        !currentPasswordInput ||
        !newPasswordInput ||
        !confirmPasswordInput ||
        !savePasswordBtn ||
        !passwordStatus
    ) {
        return;
    }

    function getApiUrl(path) {
        return apiBase ? `${apiBase}${path}` : path;
    }

    function normalizeLoginId(value) {
        return String(value || "").trim().toLowerCase();
    }

    function isValidLoginId(value) {
        const normalized = normalizeLoginId(value);
        if (normalized.length < 3 || normalized.length > 190) {
            return false;
        }
        return /^[a-z0-9._@+\-]+$/.test(normalized);
    }

    function isStrongPassword(value) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(String(value || ""));
    }

    function setStatus(element, message, isError) {
        element.textContent = String(message || "");
        element.classList.toggle("error", Boolean(isError));
    }

    function syncStoredAdminLoginId(nextLoginId) {
        const normalized = normalizeLoginId(nextLoginId);
        if (!normalized) {
            return;
        }

        [localStorage, sessionStorage].forEach(function (storage) {
            const rawUser = storage.getItem("ecodrive_auth_user");
            if (rawUser) {
                try {
                    const parsed = JSON.parse(rawUser);
                    if (parsed && typeof parsed === "object") {
                        parsed.email = normalized;
                        storage.setItem("ecodrive_auth_user", JSON.stringify(parsed));
                    }
                } catch (_error) {
                    // Ignore malformed local data.
                }
            }

            const rawCurrentUser = storage.getItem("ecodrive_current_user_email");
            if (rawCurrentUser !== null) {
                storage.setItem("ecodrive_current_user_email", normalized);
            }
        });
    }

    async function loadAdminSettings() {
        setStatus(loginIdStatus, "Loading current settings...", false);
        try {
            const response = await fetch(getApiUrl("/api/admin/settings"), { method: "GET" });
            const data = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || data.success !== true || !data.settings) {
                setStatus(loginIdStatus, data.message || "Unable to load admin settings.", true);
                return;
            }

            loginIdInput.value = normalizeLoginId(data.settings.loginId || "");
            setStatus(loginIdStatus, "", false);
        } catch (_error) {
            setStatus(loginIdStatus, "Cannot connect to backend API.", true);
        }
    }

    loginIdForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        setStatus(loginIdStatus, "", false);

        const nextLoginId = normalizeLoginId(loginIdInput.value);
        const currentPassword = String(currentPasswordForLoginId.value || "");

        if (!isValidLoginId(nextLoginId)) {
            setStatus(loginIdStatus, "Username/email format is invalid.", true);
            return;
        }
        if (!currentPassword) {
            setStatus(loginIdStatus, "Current password is required.", true);
            return;
        }

        saveLoginIdBtn.disabled = true;
        saveLoginIdBtn.textContent = "Saving...";

        try {
            const response = await fetch(getApiUrl("/api/admin/settings/login-id"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    newLoginId: nextLoginId,
                    currentPassword: currentPassword
                })
            });
            const data = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || data.success !== true) {
                setStatus(loginIdStatus, data.message || "Unable to update login identifier.", true);
                return;
            }

            if (data.settings && data.settings.loginId) {
                loginIdInput.value = normalizeLoginId(data.settings.loginId);
                syncStoredAdminLoginId(data.settings.loginId);
            }
            currentPasswordForLoginId.value = "";
            setStatus(loginIdStatus, data.message || "Login identifier updated.", false);
        } catch (_error) {
            setStatus(loginIdStatus, "Cannot connect to backend API.", true);
        } finally {
            saveLoginIdBtn.disabled = false;
            saveLoginIdBtn.textContent = "Save Login Identifier";
        }
    });

    passwordForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        setStatus(passwordStatus, "", false);

        const currentPassword = String(currentPasswordInput.value || "");
        const newPassword = String(newPasswordInput.value || "");
        const confirmPassword = String(confirmPasswordInput.value || "");

        if (!currentPassword) {
            setStatus(passwordStatus, "Current password is required.", true);
            return;
        }
        if (!isStrongPassword(newPassword)) {
            setStatus(passwordStatus, "Use 8+ chars with upper, lower, number, and symbol.", true);
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatus(passwordStatus, "New password and confirmation do not match.", true);
            return;
        }

        savePasswordBtn.disabled = true;
        savePasswordBtn.textContent = "Updating...";

        try {
            const response = await fetch(getApiUrl("/api/admin/settings/password"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });
            const data = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || data.success !== true) {
                setStatus(passwordStatus, data.message || "Unable to update password.", true);
                return;
            }

            passwordForm.reset();
            setStatus(passwordStatus, data.message || "Password updated.", false);
        } catch (_error) {
            setStatus(passwordStatus, "Cannot connect to backend API.", true);
        } finally {
            savePasswordBtn.disabled = false;
            savePasswordBtn.textContent = "Update Password";
        }
    });

    void loadAdminSettings();
});
