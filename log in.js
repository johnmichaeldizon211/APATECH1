document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("loginForm");
    var emailInput = document.getElementById("email");
    var passwordInput = document.getElementById("password");
    var rememberInput = document.getElementById("remember");
    var loginError = document.getElementById("loginError");

    if (!form || !emailInput || !passwordInput) {
        return;
    }

    if (window.EcodriveSession && typeof window.EcodriveSession.getCurrentUser === "function") {
        var existingUser = window.EcodriveSession.getCurrentUser();
        if (existingUser && window.EcodriveSession.getToken && window.EcodriveSession.getToken()) {
            var existingRole = String(existingUser.role || "").trim().toLowerCase();
            window.location.href = existingRole === "admin" ? "admin/admin.html" : "Userhomefolder/userhome.html";
            return;
        }
    }

    function getApiUrl(path) {
        if (window.EcodriveSession && typeof window.EcodriveSession.getApiUrl === "function") {
            return window.EcodriveSession.getApiUrl(path);
        }
        var base = String(
            localStorage.getItem("ecodrive_api_base") ||
            localStorage.getItem("ecodrive_kyc_api_base") ||
            "http://127.0.0.1:5050"
        )
            .trim()
            .replace(/\/+$/, "");
        return base + path;
    }

    function setError(message) {
        if (loginError) {
            loginError.textContent = String(message || "");
            return;
        }
        alert(String(message || "Login failed."));
    }

    function clearError() {
        if (loginError) {
            loginError.textContent = "";
        }
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearError();

        var emailValue = String(emailInput.value || "").trim().toLowerCase();
        var passwordValue = String(passwordInput.value || "").trim();
        var remember = rememberInput ? Boolean(rememberInput.checked) : false;

        if (!emailValue || !passwordValue) {
            setError("Please enter both email/username and password.");
            return;
        }

        var response;
        try {
            response = await fetch(getApiUrl("/api/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: emailValue,
                    password: passwordValue
                })
            });
        } catch (_error) {
            setError("API is unavailable. Please start the backend server.");
            return;
        }

        var payload = await response.json().catch(function () {
            return {};
        });
        if (!response.ok || payload.success !== true) {
            setError(payload.message || "Invalid email/username or password.");
            return;
        }

        var user = payload.user && typeof payload.user === "object" ? payload.user : {};
        var token = String(payload.token || "").trim();
        var expiresAt = payload.expiresAt ? new Date(payload.expiresAt).getTime() : 0;

        if (!window.EcodriveSession || typeof window.EcodriveSession.setSession !== "function") {
            setError("Session layer failed to load. Refresh and try again.");
            return;
        }

        var didSave = window.EcodriveSession.setSession({
            token: token,
            user: user,
            expiresAt: expiresAt,
            expiresInMs: Number(payload.expiresInMs || 0)
        }, remember);

        if (!didSave) {
            setError("Unable to create login session. Please try again.");
            return;
        }

        var role = String(user.role || "").trim().toLowerCase();
        if (role === "admin") {
            window.location.href = "admin/admin.html";
            return;
        }
        window.location.href = "Userhomefolder/userhome.html";
    });
});
