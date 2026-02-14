document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const remember = document.getElementById("remember");
    const loginError = document.getElementById("loginError");

    const adminEmail = "echodrive";
    const adminPassword = "echodriveadmin123";
    const usersKey = "users";
    const currentUserKey = "ecodrive_current_user_email";
    const API_BASE = String(
        localStorage.getItem("ecodrive_api_base") ||
        localStorage.getItem("ecodrive_kyc_api_base") ||
        ""
    )
        .trim()
        .replace(/\/+$/, "");

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function getUsers() {
        try {
            const raw = localStorage.getItem(usersKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function setUsers(users) {
        localStorage.setItem(usersKey, JSON.stringify(Array.isArray(users) ? users : []));
    }

    function setCurrentUser(emailValue, shouldRemember) {
        if (shouldRemember) {
            localStorage.setItem(currentUserKey, emailValue);
            sessionStorage.removeItem(currentUserKey);
            return;
        }
        sessionStorage.setItem(currentUserKey, emailValue);
        localStorage.removeItem(currentUserKey);
    }

    function setError(message) {
        if (loginError) {
            loginError.textContent = message;
            return;
        }
        alert(message);
    }

    function clearError() {
        if (loginError) {
            loginError.textContent = "";
        }
    }

    function normalizePhone(phone) {
        const cleaned = String(phone || "").trim().replace(/[\s-]/g, "");
        if (/^\+639\d{9}$/.test(cleaned)) {
            return `0${cleaned.slice(3)}`;
        }
        if (/^639\d{9}$/.test(cleaned)) {
            return `0${cleaned.slice(2)}`;
        }
        return cleaned;
    }

    function upsertUserFromApi(userData) {
        if (!userData || !userData.email) {
            return;
        }

        const users = getUsers();
        const targetEmail = String(userData.email || "").trim().toLowerCase();
        const index = users.findIndex(
            (user) => String(user.email || "").trim().toLowerCase() === targetEmail
        );

        const merged = {
            ...(index >= 0 ? users[index] : {}),
            firstName: userData.firstName || (index >= 0 ? users[index].firstName : ""),
            middleInitial: userData.middleInitial || (index >= 0 ? users[index].middleInitial : ""),
            lastName: userData.lastName || (index >= 0 ? users[index].lastName : ""),
            name: userData.name || (index >= 0 ? users[index].name : ""),
            email: targetEmail,
            phone: userData.phone ? normalizePhone(userData.phone) : (index >= 0 ? users[index].phone : ""),
            address: userData.address || (index >= 0 ? users[index].address : ""),
            role: userData.role || (index >= 0 ? users[index].role : "user"),
            isBlocked: String(userData.status || "").toLowerCase() === "blocked"
        };

        if (index >= 0) {
            users[index] = merged;
        } else {
            users.push(merged);
        }

        setUsers(users);
    }

    async function tryApiLogin(emailValue, passwordValue) {
        try {
            const response = await fetch(getApiUrl("/api/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: emailValue,
                    password: passwordValue
                })
            });

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                return {
                    mode: "rejected",
                    message: data.message || "Login failed."
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

    const rememberedEmail = localStorage.getItem(currentUserKey);
    if (rememberedEmail && email) {
        email.value = rememberedEmail;
        if (remember) {
            remember.checked = true;
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearError();

        const emailValue = email.value.trim().toLowerCase();
        const passwordValue = password.value.trim();
        const shouldRemember = remember ? remember.checked : false;

        if (!emailValue || !passwordValue) {
            setError("Please enter both email and password.");
            return;
        }

        if (emailValue === adminEmail && passwordValue === adminPassword) {
            setCurrentUser(adminEmail, shouldRemember);
            window.location.href = "admin/admin.html";
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
            setError("Please enter a valid email address.");
            return;
        }

        const apiLogin = await tryApiLogin(emailValue, passwordValue);
        if (apiLogin.mode === "ok") {
            const user = apiLogin.data && apiLogin.data.user ? apiLogin.data.user : {};
            upsertUserFromApi(user);
            setCurrentUser(String(user.email || emailValue).toLowerCase(), shouldRemember);
            window.location.href = "Userhomefolder/userhome.html";
            return;
        }

        if (apiLogin.mode === "rejected") {
            setError(apiLogin.message || "Invalid email or password.");
            return;
        }

        const users = getUsers();
        const matchedByEmail = users.find(
            (user) => String(user.email || "").toLowerCase() === emailValue
        );

        if (!matchedByEmail) {
            setError("Invalid email or password.");
            return;
        }

        if (
            matchedByEmail.isBlocked === true ||
            String(matchedByEmail.status || "").toLowerCase() === "blocked"
        ) {
            setError("Your account is blocked. Please contact admin.");
            return;
        }

        if (String(matchedByEmail.password || "") !== passwordValue) {
            setError("Invalid email or password.");
            return;
        }

        setCurrentUser(emailValue, shouldRemember);
        window.location.href = "Userhomefolder/userhome.html";
    });
});
