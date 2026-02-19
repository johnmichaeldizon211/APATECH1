document.addEventListener("DOMContentLoaded", function () {
    var OTP_TTL_MS = 5 * 60 * 1000;
    var methodButtons = Array.from(document.querySelectorAll(".method-btn"));
    var contactLabel = document.getElementById("contact-label");
    var contactInput = document.getElementById("contact-input");
    var sendCodeBtn = document.getElementById("send-code-btn");
    var verifyCodeBtn = document.getElementById("verify-code-btn");
    var resendCodeBtn = document.getElementById("resend-code-btn");
    var resetPasswordBtn = document.getElementById("reset-password-btn");
    var newPasswordInput = document.getElementById("new-password");
    var confirmPasswordInput = document.getElementById("confirm-password");
    var maskedContact = document.getElementById("masked-contact");
    var formMessage = document.getElementById("form-message");
    var steps = Array.from(document.querySelectorAll(".step"));
    var otpInputs = Array.from(document.querySelectorAll(".otp-digit"));

    if (!contactInput || !sendCodeBtn || !verifyCodeBtn || !resetPasswordBtn) {
        return;
    }

    var state = {
        method: "email",
        contact: "",
        requestId: "",
        accountEmail: "",
        otpExpiresAt: 0,
        otpVerified: false
    };

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

    function showMessage(message, type) {
        if (!formMessage) {
            return;
        }
        formMessage.textContent = String(message || "");
        formMessage.classList.remove("error", "success");
        if (type === "error" || type === "success") {
            formMessage.classList.add(type);
        }
    }

    function clearMessage() {
        showMessage("", "");
    }

    function goToStep(stepName) {
        steps.forEach(function (step) {
            var active = step.dataset.step === stepName;
            step.hidden = !active;
            step.classList.toggle("is-active", active);
        });
    }

    function clearOtpInputs() {
        otpInputs.forEach(function (input) {
            input.value = "";
        });
    }

    function getOtpCode() {
        return otpInputs.map(function (input) {
            return String(input.value || "");
        }).join("");
    }

    function normalizePhone(value) {
        var cleaned = String(value || "").replace(/[^\d+]/g, "");
        if (/^\+639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(3);
        }
        if (/^639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(2);
        }
        return cleaned;
    }

    function maskContact(method, contact) {
        if (method === "mobile") {
            var mobile = normalizePhone(contact);
            if (mobile.length >= 11) {
                return mobile.slice(0, 4) + "***" + mobile.slice(-2);
            }
            return "***" + mobile.slice(-2);
        }

        var email = String(contact || "").trim().toLowerCase();
        var parts = email.split("@");
        if (parts.length !== 2) {
            return email;
        }
        var left = parts[0];
        var right = parts[1];
        var visible = left.slice(0, Math.min(2, left.length));
        return visible + "*".repeat(Math.max(1, left.length - visible.length)) + "@" + right;
    }

    function validateContact(method, value) {
        var raw = String(value || "").trim();
        if (!raw) {
            return method === "mobile" ? "Mobile number is required." : "Email is required.";
        }
        if (method === "mobile") {
            var normalized = raw.replace(/[\s-]/g, "");
            if (!/^(\+639|09)\d{9}$/.test(normalized)) {
                return "Use 09XXXXXXXXX or +639XXXXXXXXX.";
            }
            return "";
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
            return "Please enter a valid email address.";
        }
        return "";
    }

    function validatePassword(newPassword, confirmPassword) {
        if (!newPassword) {
            return "New password is required.";
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(newPassword)) {
            return "Password must be 8+ chars with upper, lower, number and symbol.";
        }
        if (newPassword !== confirmPassword) {
            return "Passwords do not match.";
        }
        return "";
    }

    function setMethod(method) {
        state.method = method === "mobile" ? "mobile" : "email";
        state.contact = "";
        state.requestId = "";
        state.accountEmail = "";
        state.otpExpiresAt = 0;
        state.otpVerified = false;
        clearOtpInputs();

        if (state.method === "mobile") {
            contactLabel.textContent = "Mobile Number";
            contactInput.type = "tel";
            contactInput.placeholder = "Enter your mobile number";
        } else {
            contactLabel.textContent = "Email Address";
            contactInput.type = "email";
            contactInput.placeholder = "Enter your email";
        }

        methodButtons.forEach(function (button) {
            var active = button.dataset.method === state.method;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        contactInput.value = "";
        goToStep("contact");
    }

    function bindOtpInputs() {
        otpInputs.forEach(function (input, index) {
            input.addEventListener("input", function () {
                input.value = String(input.value || "").replace(/\D/g, "").slice(-1);
                if (input.value && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });

            input.addEventListener("keydown", function (event) {
                if (event.key === "Backspace" && !input.value && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
        });
    }

    methodButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            clearMessage();
            setMethod(button.dataset.method);
        });
    });
    bindOtpInputs();
    setMethod("email");

    sendCodeBtn.addEventListener("click", async function () {
        clearMessage();
        var contact = String(contactInput.value || "").trim();
        var contactError = validateContact(state.method, contact);
        if (contactError) {
            showMessage(contactError, "error");
            return;
        }

        var defaultLabel = sendCodeBtn.textContent;
        sendCodeBtn.disabled = true;
        sendCodeBtn.textContent = "Sending...";

        try {
            var response = await fetch(getApiUrl("/api/forgot/send-code"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    method: state.method,
                    contact: contact
                })
            });

            var payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true) {
                showMessage(payload.message || "Unable to send verification code.", "error");
                return;
            }

            state.contact = contact;
            state.requestId = String(payload.requestId || "");
            state.accountEmail = String(payload.accountEmail || "").trim().toLowerCase();
            state.otpVerified = false;

            var expiresInMs = Number(payload.expiresInMs);
            state.otpExpiresAt = Date.now() + (
                Number.isFinite(expiresInMs) && expiresInMs > 0
                    ? expiresInMs
                    : OTP_TTL_MS
            );

            maskedContact.textContent = maskContact(state.method, contact);
            clearOtpInputs();
            goToStep("otp");
            if (otpInputs[0]) {
                otpInputs[0].focus();
            }
            showMessage("Code sent. Please check your email/mobile.", "success");
        } catch (_error) {
            showMessage("API is unavailable. Please start the backend server.", "error");
        } finally {
            sendCodeBtn.disabled = false;
            sendCodeBtn.textContent = defaultLabel;
        }
    });

    resendCodeBtn.addEventListener("click", function () {
        if (!state.contact) {
            showMessage("Enter email/mobile first.", "error");
            goToStep("contact");
            return;
        }
        sendCodeBtn.click();
    });

    verifyCodeBtn.addEventListener("click", async function () {
        clearMessage();
        var code = getOtpCode();
        if (!/^\d{4}$/.test(code)) {
            showMessage("Enter all 4 digits of the code.", "error");
            return;
        }
        if (!state.requestId) {
            showMessage("Request a new code first.", "error");
            return;
        }
        if (Date.now() > state.otpExpiresAt) {
            showMessage("Code expired. Request a new code.", "error");
            return;
        }

        var defaultLabel = verifyCodeBtn.textContent;
        verifyCodeBtn.disabled = true;
        verifyCodeBtn.textContent = "Verifying...";

        try {
            var response = await fetch(getApiUrl("/api/forgot/verify-code"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    requestId: state.requestId,
                    code: code
                })
            });
            var payload = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || payload.verified !== true) {
                showMessage(payload.message || "Invalid verification code.", "error");
                return;
            }

            state.otpVerified = true;
            goToStep("password");
            newPasswordInput.focus();
            showMessage("Code verified. You can now reset your password.", "success");
        } catch (_error) {
            showMessage("API is unavailable. Please start the backend server.", "error");
        } finally {
            verifyCodeBtn.disabled = false;
            verifyCodeBtn.textContent = defaultLabel;
        }
    });

    resetPasswordBtn.addEventListener("click", async function () {
        clearMessage();
        if (!state.otpVerified) {
            showMessage("Please verify the code first.", "error");
            goToStep("otp");
            return;
        }

        var newPassword = String(newPasswordInput.value || "");
        var confirmPassword = String(confirmPasswordInput.value || "");
        var passwordError = validatePassword(newPassword, confirmPassword);
        if (passwordError) {
            showMessage(passwordError, "error");
            return;
        }

        var defaultLabel = resetPasswordBtn.textContent;
        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = "Saving...";

        try {
            var response = await fetch(getApiUrl("/api/reset-password"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    requestId: state.requestId,
                    email: state.accountEmail,
                    method: state.method,
                    contact: state.contact,
                    newPassword: newPassword
                })
            });

            var payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true) {
                showMessage(payload.message || "Unable to reset password.", "error");
                return;
            }

            showMessage("Password reset successful. Redirecting to login...", "success");
            window.setTimeout(function () {
                window.location.href = "log in.html";
            }, 900);
        } catch (_error) {
            showMessage("API is unavailable. Please start the backend server.", "error");
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = defaultLabel;
        }
    });
});
