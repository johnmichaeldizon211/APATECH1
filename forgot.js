document.addEventListener("DOMContentLoaded", () => {
    const usersKey = "users";
    const OTP_LENGTH = 4;
    const OTP_TTL_MS = 5 * 60 * 1000;
    const API_BASE = String(
        localStorage.getItem("ecodrive_api_base") ||
        localStorage.getItem("ecodrive_kyc_api_base") ||
        ""
    ).trim().replace(/\/+$/, "");

    const methodButtons = Array.from(document.querySelectorAll(".method-btn"));
    const contactLabel = document.getElementById("contact-label");
    const contactInput = document.getElementById("contact-input");
    const sendCodeBtn = document.getElementById("send-code-btn");
    const verifyCodeBtn = document.getElementById("verify-code-btn");
    const resendCodeBtn = document.getElementById("resend-code-btn");
    const resetPasswordBtn = document.getElementById("reset-password-btn");
    const newPasswordInput = document.getElementById("new-password");
    const confirmPasswordInput = document.getElementById("confirm-password");
    const maskedContact = document.getElementById("masked-contact");
    const formMessage = document.getElementById("form-message");
    const steps = Array.from(document.querySelectorAll(".step"));
    const otpInputs = Array.from(document.querySelectorAll(".otp-digit"));

    const state = {
        method: "email",
        contact: "",
        matchedUserEmail: "",
        otpCode: "",
        otpRequestId: "",
        otpExpiresAt: 0,
        otpVerified: false
    };

    setMethod("email");
    bindMethodButtons();
    bindOtpInputs();

    sendCodeBtn.addEventListener("click", handleSendCode);
    verifyCodeBtn.addEventListener("click", handleVerifyCode);
    resendCodeBtn.addEventListener("click", handleResendCode);
    resetPasswordBtn.addEventListener("click", handlePasswordReset);

    function bindMethodButtons() {
        methodButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const method = button.dataset.method === "mobile" ? "mobile" : "email";
                setMethod(method);
                clearMessage();
            });
        });
    }

    function bindOtpInputs() {
        otpInputs.forEach((input, index) => {
            input.addEventListener("input", () => {
                input.value = input.value.replace(/\D/g, "").slice(-1);
                if (input.value && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });

            input.addEventListener("keydown", (event) => {
                if (event.key === "Backspace" && !input.value && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });

            input.addEventListener("paste", (event) => {
                event.preventDefault();
                const pasted = (event.clipboardData || window.clipboardData)
                    .getData("text")
                    .replace(/\D/g, "")
                    .slice(0, OTP_LENGTH);

                if (!pasted) {
                    return;
                }

                otpInputs.forEach((field, idx) => {
                    field.value = pasted[idx] || "";
                });

                const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
                otpInputs[focusIndex].focus();
            });
        });
    }

    function setMethod(method) {
        state.method = method;
        state.otpVerified = false;
        state.otpCode = "";
        state.otpRequestId = "";
        state.otpExpiresAt = 0;
        state.matchedUserEmail = "";
        state.contact = "";

        if (method === "mobile") {
            contactLabel.textContent = "Mobile Number";
            contactInput.type = "tel";
            contactInput.placeholder = "Enter your mobile number";
            contactInput.setAttribute("autocomplete", "tel");
        } else {
            contactLabel.textContent = "Email Address";
            contactInput.type = "email";
            contactInput.placeholder = "Enter your email";
            contactInput.setAttribute("autocomplete", "email");
        }

        contactInput.value = "";
        clearOtpInputs();
        goToStep("contact");

        methodButtons.forEach((button) => {
            const isActive = button.dataset.method === method;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    async function handleSendCode() {
        clearMessage();

        const contact = contactInput.value.trim();
        const validationError = validateContact(state.method, contact);
        if (validationError) {
            contactInput.classList.add("input-invalid");
            showMessage(validationError, "error");
            return;
        }

        contactInput.classList.remove("input-invalid");
        const matchedUser = findUserByContact(state.method, contact);
        if (!matchedUser) {
            showMessage("No account found for that email/mobile number.", "error");
            return;
        }

        const defaultLabel = sendCodeBtn.textContent;
        sendCodeBtn.disabled = true;
        sendCodeBtn.textContent = "Sending...";

        try {
            await requestVerificationCode(state.method, contact);
            state.contact = contact;
            state.matchedUserEmail = String(matchedUser.email || "").trim().toLowerCase();
            state.otpVerified = false;

            maskedContact.textContent = maskContact(state.method, contact);
            clearOtpInputs();
            goToStep("otp");
            otpInputs[0].focus();
            showMessage("Code sent. Please check your email/mobile.", "success");
        } catch (error) {
            showMessage(error.message || "Unable to send verification code.", "error");
        } finally {
            sendCodeBtn.disabled = false;
            sendCodeBtn.textContent = defaultLabel;
        }
    }

    async function handleResendCode() {
        clearMessage();
        if (!state.contact) {
            showMessage("Enter email/mobile first before requesting a code.", "error");
            goToStep("contact");
            return;
        }

        const defaultLabel = resendCodeBtn.textContent;
        resendCodeBtn.disabled = true;
        resendCodeBtn.textContent = "Sending...";

        try {
            await requestVerificationCode(state.method, state.contact);
            state.otpVerified = false;
            clearOtpInputs();
            otpInputs[0].focus();
            showMessage("New code sent.", "success");
        } catch (error) {
            showMessage(error.message || "Unable to resend code.", "error");
        } finally {
            resendCodeBtn.disabled = false;
            resendCodeBtn.textContent = defaultLabel;
        }
    }

    async function handleVerifyCode() {
        clearMessage();

        const code = otpInputs.map((input) => input.value).join("");
        if (!/^\d{4}$/.test(code)) {
            showMessage("Enter all 4 digits of the code.", "error");
            return;
        }

        const defaultLabel = verifyCodeBtn.textContent;
        verifyCodeBtn.disabled = true;
        verifyCodeBtn.textContent = "Verifying...";

        try {
            const verified = await verifyCode(code);
            if (!verified) {
                showMessage("Invalid code. Please try again.", "error");
                return;
            }

            state.otpVerified = true;
            showMessage("Code verified. You can now reset your password.", "success");
            goToStep("password");
            newPasswordInput.focus();
        } catch (error) {
            showMessage(error.message || "Verification failed.", "error");
        } finally {
            verifyCodeBtn.disabled = false;
            verifyCodeBtn.textContent = defaultLabel;
        }
    }

    async function handlePasswordReset() {
        clearMessage();

        if (!state.otpVerified) {
            showMessage("Please verify the 4-digit code first.", "error");
            goToStep("otp");
            return;
        }

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        const passwordError = validatePassword(newPassword, confirmPassword);
        if (passwordError) {
            showMessage(passwordError, "error");
            return;
        }

        if (!state.matchedUserEmail) {
            showMessage("Session expired. Request a new code and try again.", "error");
            goToStep("contact");
            return;
        }

        const defaultLabel = resetPasswordBtn.textContent;
        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = "Saving...";

        try {
            const didUpdate = updateLocalPassword(state.matchedUserEmail, newPassword);
            if (!didUpdate) {
                showMessage("Unable to update password. Request a new code.", "error");
                return;
            }

            await notifyServerReset({
                email: state.matchedUserEmail,
                method: state.method,
                contact: state.contact,
                requestId: state.otpRequestId,
                newPassword: newPassword
            });

            showMessage("Password reset successful. Redirecting to login...", "success");
            setTimeout(() => {
                window.location.href = "log in.html";
            }, 900);
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = defaultLabel;
        }
    }

    function goToStep(stepName) {
        steps.forEach((section) => {
            const isTarget = section.dataset.step === stepName;
            section.hidden = !isTarget;
            section.classList.toggle("is-active", isTarget);
        });
    }

    function showMessage(message, type) {
        formMessage.textContent = String(message || "");
        formMessage.classList.remove("error", "success");
        if (type === "error" || type === "success") {
            formMessage.classList.add(type);
        }
    }

    function clearMessage() {
        formMessage.textContent = "";
        formMessage.classList.remove("error", "success");
    }

    function clearOtpInputs() {
        otpInputs.forEach((input) => {
            input.value = "";
        });
    }

    function validateContact(method, value) {
        if (!value) {
            return method === "mobile"
                ? "Mobile number is required."
                : "Email is required.";
        }

        if (method === "mobile") {
            const normalized = value.replace(/[\s-]/g, "");
            const mobileRegex = /^(\+639|09)\d{9}$/;
            if (!mobileRegex.test(normalized)) {
                return "Use 09XXXXXXXXX or +639XXXXXXXXX.";
            }
            return "";
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            return "Please enter a valid email address.";
        }
        return "";
    }

    function validatePassword(newPassword, confirmPassword) {
        if (!newPassword) {
            return "New password is required.";
        }
        if (newPassword.length < 8) {
            return "Password must be at least 8 characters.";
        }
        if (!confirmPassword) {
            return "Please confirm your password.";
        }
        if (newPassword !== confirmPassword) {
            return "Passwords do not match.";
        }
        return "";
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

    function normalizePhone(value) {
        const cleaned = String(value || "").replace(/[^\d+]/g, "");
        if (!cleaned) {
            return "";
        }
        if (/^09\d{9}$/.test(cleaned)) {
            return cleaned;
        }
        if (/^\+639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(3);
        }
        if (/^639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(2);
        }
        return cleaned.replace(/\D/g, "");
    }

    function findUserByContact(method, contact) {
        const users = getUsers();
        if (method === "email") {
            const normalizedEmail = String(contact || "").trim().toLowerCase();
            return users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail) || null;
        }

        const targetPhone = normalizePhone(contact);
        const directMatch = users.find((user) => normalizePhone(user.phone) === targetPhone);
        if (directMatch) {
            return directMatch;
        }

        const profileEmail = findEmailByPhoneFromProfiles(targetPhone);
        if (!profileEmail) {
            return null;
        }

        return users.find((user) => String(user.email || "").trim().toLowerCase() === profileEmail) || null;
    }

    function findEmailByPhoneFromProfiles(targetPhone) {
        if (!targetPhone) {
            return "";
        }

        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith("ecodrive_profile_settings::")) {
                continue;
            }

            try {
                const profile = JSON.parse(localStorage.getItem(key) || "{}");
                const phone = normalizePhone(profile.phone);
                if (phone === targetPhone) {
                    const candidate = String(profile.email || key.split("::")[1] || "").trim().toLowerCase();
                    if (candidate) {
                        return candidate;
                    }
                }
            } catch (_error) {
                continue;
            }
        }

        return "";
    }

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function maskContact(method, contact) {
        if (method === "mobile") {
            const normalized = normalizePhone(contact);
            if (normalized.length >= 11) {
                return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
            }
            return `***${normalized.slice(-2)}`;
        }

        const normalized = String(contact || "").trim().toLowerCase();
        const [namePart, domainPart] = normalized.split("@");
        if (!namePart || !domainPart) {
            return normalized;
        }

        const visible = namePart.slice(0, Math.min(2, namePart.length));
        const hiddenLength = Math.max(1, namePart.length - visible.length);
        return `${visible}${"*".repeat(hiddenLength)}@${domainPart}`;
    }

    async function requestVerificationCode(method, contact) {
        try {
            const response = await fetch(getApiUrl("/api/forgot/send-code"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    method: method,
                    contact: contact
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to send verification code.");
            }

            const expiresInMs = Number(data.expiresInMs);
            state.otpExpiresAt = Date.now() + (Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : OTP_TTL_MS);
            state.otpRequestId = String(data.requestId || "").trim();
            state.otpCode = data.demoCode ? String(data.demoCode) : "";

            if (state.otpCode) {
                alert(`Demo verification code: ${state.otpCode}`);
            }
            return;
        } catch (_error) {
            state.otpCode = String(Math.floor(1000 + Math.random() * 9000));
            state.otpRequestId = "";
            state.otpExpiresAt = Date.now() + OTP_TTL_MS;
            alert(`Demo verification code: ${state.otpCode}`);
        }
    }

    async function verifyCode(code) {
        if (Date.now() > state.otpExpiresAt) {
            throw new Error("Code expired. Please request a new code.");
        }

        if (state.otpRequestId) {
            try {
                const response = await fetch(getApiUrl("/api/forgot/verify-code"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        requestId: state.otpRequestId,
                        code: code
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (response.ok && data.verified === true) {
                    return true;
                }

                if (response.ok) {
                    return false;
                }
            } catch (_error) {
            }
        }

        if (!state.otpCode) {
            throw new Error("Verification service unavailable. Send code again.");
        }
        return state.otpCode === code;
    }

    async function notifyServerReset(payload) {
        try {
            await fetch(getApiUrl("/api/reset-password"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
        } catch (_error) {
        }
    }

    function updateLocalPassword(email, newPassword) {
        try {
            const users = getUsers();
            const index = users.findIndex((user) => String(user.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase());
            if (index < 0) {
                return false;
            }

            users[index] = {
                ...users[index],
                password: newPassword
            };
            localStorage.setItem(usersKey, JSON.stringify(users));
            return true;
        } catch (_error) {
            return false;
        }
    }
});
