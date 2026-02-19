document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("signup-form");
    var firstNameInput = document.getElementById("firstName");
    var middleInitialInput = document.getElementById("middleInitial");
    var lastNameInput = document.getElementById("lastName");
    var emailInput = document.getElementById("email");
    var phoneInput = document.getElementById("phone");
    var addressInput = document.getElementById("address");
    var passwordInput = document.getElementById("password");
    var createBtn = document.getElementById("create-btn");
    var toast = document.getElementById("toast");

    var firstNameErr = document.getElementById("firstName-error");
    var middleInitialErr = document.getElementById("middleInitial-error");
    var lastNameErr = document.getElementById("lastName-error");
    var emailErr = document.getElementById("email-error");
    var phoneErr = document.getElementById("phone-error");
    var addressErr = document.getElementById("address-error");
    var passwordErr = document.getElementById("password-error");

    if (!form || !createBtn) {
        return;
    }

    var touched = {
        firstName: false,
        middleInitial: false,
        lastName: false,
        email: false,
        phone: false,
        address: false,
        password: false
    };
    var submitted = false;

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

    function normalizeMiddleInitial(value) {
        var cleaned = String(value || "").trim().replace(/[^a-zA-Z]/g, "");
        return cleaned ? cleaned.slice(0, 1).toUpperCase() : "";
    }

    function normalizePhone(value) {
        var cleaned = String(value || "").trim().replace(/[\s-]/g, "");
        if (/^\+639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(3);
        }
        if (/^639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(2);
        }
        return cleaned;
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
    }

    function isValidPhone(value) {
        return /^(\+639|09)\d{9}$/.test(String(value || "").trim().replace(/[\s-]/g, ""));
    }

    function isStrongPassword(value) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(String(value || ""));
    }

    function setFieldError(input, errorNode, message, show) {
        if (!input || !errorNode) {
            return;
        }
        errorNode.textContent = show ? String(message || "") : "";
        input.classList.toggle("invalid", Boolean(show && message));
    }

    function showToast(message, type) {
        if (!toast) {
            return;
        }
        toast.textContent = String(message || "");
        toast.className = "toast show " + (type === "error" ? "error" : "success");
        window.setTimeout(function () {
            toast.className = "toast";
        }, 3000);
    }

    function validateForm() {
        var firstName = String(firstNameInput.value || "").trim();
        var middleInitialRaw = String(middleInitialInput.value || "").trim();
        var lastName = String(lastNameInput.value || "").trim();
        var email = String(emailInput.value || "").trim();
        var phone = String(phoneInput.value || "").trim();
        var address = String(addressInput.value || "").trim();
        var password = String(passwordInput.value || "");

        var firstNameMsg = firstName.length < 2 ? "Please enter your first name." : "";
        var middleInitialMsg = (
            middleInitialRaw &&
            !/^[a-zA-Z][.]?$/.test(middleInitialRaw)
        ) ? "Use one letter only for middle initial." : "";
        var lastNameMsg = lastName.length < 2 ? "Please enter your last name." : "";
        var emailMsg = !isValidEmail(email) ? "Please enter a valid email." : "";
        var phoneMsg = !isValidPhone(phone) ? "Use 09XXXXXXXXX or +639XXXXXXXXX." : "";
        var addressMsg = address.length < 5 ? "Please enter a complete address." : "";
        var passwordMsg = !isStrongPassword(password)
            ? "Password must be 8+ chars and include upper, lower, number and symbol."
            : "";

        setFieldError(firstNameInput, firstNameErr, firstNameMsg, touched.firstName || submitted);
        setFieldError(middleInitialInput, middleInitialErr, middleInitialMsg, touched.middleInitial || submitted);
        setFieldError(lastNameInput, lastNameErr, lastNameMsg, touched.lastName || submitted);
        setFieldError(emailInput, emailErr, emailMsg, touched.email || submitted);
        setFieldError(phoneInput, phoneErr, phoneMsg, touched.phone || submitted);
        setFieldError(addressInput, addressErr, addressMsg, touched.address || submitted);
        setFieldError(passwordInput, passwordErr, passwordMsg, touched.password || submitted);

        var valid = !firstNameMsg && !middleInitialMsg && !lastNameMsg && !emailMsg && !phoneMsg && !addressMsg && !passwordMsg;
        createBtn.disabled = !valid;
        return valid;
    }

    [
        { key: "firstName", input: firstNameInput },
        { key: "middleInitial", input: middleInitialInput },
        { key: "lastName", input: lastNameInput },
        { key: "email", input: emailInput },
        { key: "phone", input: phoneInput },
        { key: "address", input: addressInput },
        { key: "password", input: passwordInput }
    ].forEach(function (entry) {
        if (!entry.input) {
            return;
        }
        entry.input.addEventListener("blur", function () {
            touched[entry.key] = true;
            validateForm();
        });
        entry.input.addEventListener("input", function () {
            if (entry.key === "middleInitial") {
                entry.input.value = normalizeMiddleInitial(entry.input.value);
            }
            validateForm();
        });
    });

    document.querySelectorAll(".toggle-password").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var targetId = btn.getAttribute("data-target");
            var target = targetId ? document.getElementById(targetId) : null;
            if (!target) {
                return;
            }
            var reveal = target.type === "password";
            target.type = reveal ? "text" : "password";
            btn.textContent = reveal ? "Hide" : "Show";
        });
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!validateForm()) {
            submitted = true;
            Object.keys(touched).forEach(function (key) {
                touched[key] = true;
            });
            validateForm();
            return;
        }

        createBtn.disabled = true;
        createBtn.textContent = "Creating...";

        var payload = {
            firstName: String(firstNameInput.value || "").trim(),
            middleInitial: normalizeMiddleInitial(middleInitialInput.value),
            lastName: String(lastNameInput.value || "").trim(),
            email: String(emailInput.value || "").trim().toLowerCase(),
            phone: normalizePhone(phoneInput.value),
            address: String(addressInput.value || "").trim(),
            password: String(passwordInput.value || "")
        };

        var response;
        try {
            response = await fetch(getApiUrl("/api/signup"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (_error) {
            showToast("API is unavailable. Please start the backend server.", "error");
            createBtn.disabled = false;
            createBtn.textContent = "Create account";
            return;
        }

        var body = await response.json().catch(function () {
            return {};
        });

        if (!response.ok || body.success !== true) {
            var message = body.message || "Signup failed. Please try again.";
            if (response.status === 409 && message.toLowerCase().includes("mobile")) {
                setFieldError(phoneInput, phoneErr, message, true);
            } else if (response.status === 409) {
                setFieldError(emailInput, emailErr, message, true);
            } else {
                showToast(message, "error");
            }
            createBtn.disabled = false;
            createBtn.textContent = "Create account";
            return;
        }

        if (!window.EcodriveSession || typeof window.EcodriveSession.setSession !== "function") {
            showToast("Session layer failed to load. Try refreshing the page.", "error");
            createBtn.disabled = false;
            createBtn.textContent = "Create account";
            return;
        }

        var didSave = window.EcodriveSession.setSession({
            token: String(body.token || ""),
            user: body.user || {},
            expiresAt: body.expiresAt ? new Date(body.expiresAt).getTime() : 0,
            expiresInMs: Number(body.expiresInMs || 0)
        }, true);

        if (!didSave) {
            showToast("Account created but login session failed. Please log in manually.", "error");
            window.setTimeout(function () {
                window.location.href = "log in.html";
            }, 900);
            return;
        }

        showToast("Account created successfully.", "success");
        window.setTimeout(function () {
            window.location.href = "Userhomefolder/userhome.html";
        }, 850);
    });

    validateForm();
});
