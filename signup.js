document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const firstNameInput = document.getElementById("firstName");
  const middleInitialInput = document.getElementById("middleInitial");
  const lastNameInput = document.getElementById("lastName");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const addressInput = document.getElementById("address");
  const passwordInput = document.getElementById("password");
  const createBtn = document.getElementById("create-btn");
  const toast = document.getElementById("toast");

  const firstNameErr = document.getElementById("firstName-error");
  const middleInitialErr = document.getElementById("middleInitial-error");
  const lastNameErr = document.getElementById("lastName-error");
  const emailErr = document.getElementById("email-error");
  const phoneErr = document.getElementById("phone-error");
  const addressErr = document.getElementById("address-error");
  const passwordErr = document.getElementById("password-error");

  const passwordStrength = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  const currentUserKey = "ecodrive_current_user_email";
  const usersKey = "users";
  const API_BASE = String(
    localStorage.getItem("ecodrive_api_base") ||
    localStorage.getItem("ecodrive_kyc_api_base") ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  function getApiUrl(path) {
    return API_BASE ? `${API_BASE}${path}` : path;
  }

  function isValidPhone(phone) {
    return /^(\+639|09)\d{9}$/.test(String(phone || "").trim().replace(/[\s-]/g, ""));
  }

  function normalizeMiddleInitial(value) {
    const cleaned = String(value || "").trim().replace(/[^a-zA-Z]/g, "");
    if (!cleaned) {
      return "";
    }
    return cleaned.slice(0, 1).toUpperCase();
  }

  function buildFullName(firstName, middleInitial, lastName) {
    const middlePart = middleInitial ? `${middleInitial}.` : "";
    return [firstName, middlePart, lastName].filter(Boolean).join(" ");
  }

  let toastTimer = null;
  function showToast(message, type = "success") {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show ${type === "success" ? "success" : "error"}`;
    toastTimer = setTimeout(() => {
      toast.className = "toast";
    }, 3000);
  }

  const touched = {
    firstName: false,
    middleInitial: false,
    lastName: false,
    email: false,
    phone: false,
    address: false,
    password: false
  };
  let formSubmitted = false;

  function setError(input, errElem, message, show = true) {
    errElem.textContent = show ? message || "" : "";
    input.classList.toggle("invalid", show && Boolean(message));
  }

  function validate() {
    let valid = true;

    const firstName = firstNameInput.value.trim();
    const middleInitial = normalizeMiddleInitial(middleInitialInput.value);
    const lastName = lastNameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const address = addressInput.value.trim();
    const password = passwordInput.value;

    const firstNameMsg = firstName.length < 2 ? "Please enter your first name." : "";
    const middleInitialMsg =
      middleInitialInput.value.trim() && !/^[a-zA-Z][.]?$/.test(middleInitialInput.value.trim())
        ? "Use 1 letter only for middle initial."
        : "";
    const lastNameMsg = lastName.length < 2 ? "Please enter your last name." : "";
    const emailMsg = !isValidEmail(email) ? "Please enter a valid email." : "";
    const phoneMsg = !isValidPhone(phone) ? "Use 09XXXXXXXXX or +639XXXXXXXXX." : "";
    const addressMsg = address.length < 5 ? "Please enter a complete address." : "";
    const passwordMsg = !passwordStrength.test(password)
      ? "Password must be 8+ chars and include upper, lower, number & symbol."
      : "";

    if (firstNameMsg) valid = false;
    if (middleInitialMsg) valid = false;
    if (lastNameMsg) valid = false;
    if (emailMsg) valid = false;
    if (phoneMsg) valid = false;
    if (addressMsg) valid = false;
    if (passwordMsg) valid = false;

    setError(firstNameInput, firstNameErr, firstNameMsg, touched.firstName || formSubmitted);
    setError(middleInitialInput, middleInitialErr, middleInitialMsg, touched.middleInitial || formSubmitted);
    setError(lastNameInput, lastNameErr, lastNameMsg, touched.lastName || formSubmitted);
    setError(emailInput, emailErr, emailMsg, touched.email || formSubmitted);
    setError(phoneInput, phoneErr, phoneMsg, touched.phone || formSubmitted);
    setError(addressInput, addressErr, addressMsg, touched.address || formSubmitted);
    setError(passwordInput, passwordErr, passwordMsg, touched.password || formSubmitted);

    createBtn.disabled = !valid;
    return valid;
  }

  function getStoredUsers() {
    try {
      const raw = localStorage.getItem(usersKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function getProfileStorageKey(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    return email ? `ecodrive_profile_settings::${email}` : "ecodrive_profile_settings";
  }

  function persistProfileFromSignup(payload) {
    const key = getProfileStorageKey(payload.email);
    let existing = {};
    try {
      existing = JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_error) {
      existing = {};
    }

    const profile = {
      fullName: payload.name,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      avatar: typeof existing.avatar === "string" ? existing.avatar : "",
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(profile));
    localStorage.removeItem("ecodrive_profile_settings");
  }

  function upsertUserLocally(payload) {
    const users = getStoredUsers();
    const index = users.findIndex((u) => String(u.email || "").toLowerCase() === payload.email);

    if (index >= 0) {
      users[index] = {
        ...users[index],
        firstName: payload.firstName,
        middleInitial: payload.middleInitial,
        lastName: payload.lastName,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        password: payload.password,
        role: payload.role || "user",
        isBlocked: Boolean(payload.isBlocked),
        createdAt: payload.createdAt || (index >= 0 ? users[index].createdAt : new Date().toISOString())
      };
    } else {
      users.push(payload);
    }

    localStorage.setItem(usersKey, JSON.stringify(users));
    persistProfileFromSignup(payload);
    localStorage.setItem(currentUserKey, payload.email);
  }

  function isPhoneTaken(phoneValue, users) {
    const normalized = normalizePhone(phoneValue);
    return users.some((u) => normalizePhone(u.phone) === normalized);
  }

  function saveAccountLocally(payload) {
    const users = getStoredUsers();
    if (users.some((u) => String(u.email || "").toLowerCase() === payload.email)) {
      setError(emailInput, emailErr, "An account with this email already exists.");
      emailInput.focus();
      return false;
    }

    if (isPhoneTaken(payload.phone, users)) {
      setError(phoneInput, phoneErr, "This mobile number is already in use.");
      phoneInput.focus();
      return false;
    }

    users.push(payload);
    localStorage.setItem(usersKey, JSON.stringify(users));
    persistProfileFromSignup(payload);
    localStorage.setItem(currentUserKey, payload.email);
    showToast("Account created successfully (local).", "success");
    setTimeout(() => (window.location.href = "Userhomefolder/userhome.html"), 850);
    return true;
  }

  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isHidden = target.type === "password";
      target.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "Hide" : "Show";
    });
  });

  const trackedInputs = [
    { key: "firstName", input: firstNameInput },
    { key: "middleInitial", input: middleInitialInput },
    { key: "lastName", input: lastNameInput },
    { key: "email", input: emailInput },
    { key: "phone", input: phoneInput },
    { key: "address", input: addressInput },
    { key: "password", input: passwordInput }
  ];

  trackedInputs.forEach(({ key, input }) => {
    input.addEventListener("blur", () => {
      touched[key] = true;
      validate();
    });
    input.addEventListener("input", () => {
      if (key === "middleInitial") {
        const normalized = normalizeMiddleInitial(input.value);
        input.value = normalized;
      }
      validate();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) {
      formSubmitted = true;
      Object.keys(touched).forEach((key) => {
        touched[key] = true;
      });
      validate();
      return;
    }

    const firstName = firstNameInput.value.trim();
    const middleInitial = normalizeMiddleInitial(middleInitialInput.value);
    const lastName = lastNameInput.value.trim();

    const payload = {
      firstName: firstName,
      middleInitial: middleInitial,
      lastName: lastName,
      name: buildFullName(firstName, middleInitial, lastName),
      email: emailInput.value.trim().toLowerCase(),
      phone: normalizePhone(phoneInput.value),
      address: addressInput.value.trim(),
      password: passwordInput.value,
      role: "user",
      isBlocked: false,
      createdAt: new Date().toISOString()
    };

    const existingUsers = getStoredUsers();
    if (existingUsers.some((u) => String(u.email || "").toLowerCase() === payload.email)) {
      setError(emailInput, emailErr, "An account with this email already exists.");
      emailInput.focus();
      return;
    }

    if (isPhoneTaken(payload.phone, existingUsers)) {
      setError(phoneInput, phoneErr, "This mobile number is already in use.");
      phoneInput.focus();
      return;
    }

    createBtn.textContent = "Creating...";
    createBtn.disabled = true;

    try {
      const resp = await fetch(getApiUrl("/api/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await resp.json().catch(() => ({}));

      if (resp.ok || resp.status === 201) {
        const serverUser = body && body.user ? body.user : {};
        const localPayload = {
          ...payload,
          firstName: serverUser.firstName || payload.firstName,
          middleInitial: serverUser.middleInitial || payload.middleInitial,
          lastName: serverUser.lastName || payload.lastName,
          name: serverUser.name || payload.name,
          email: String(serverUser.email || payload.email).toLowerCase(),
          phone: serverUser.phone || payload.phone,
          address: serverUser.address || payload.address,
          role: serverUser.role || "user",
          isBlocked: String(serverUser.status || "active").toLowerCase() === "blocked",
          createdAt: payload.createdAt
        };
        upsertUserLocally(localPayload);
        showToast("Account created successfully", "success");
        setTimeout(() => (window.location.href = "Userhomefolder/userhome.html"), 850);
        return;
      }

      if (resp.status === 409) {
        const message = body.message || "An account with this email already exists.";
        if (message.toLowerCase().includes("mobile")) {
          setError(phoneInput, phoneErr, message);
          phoneInput.focus();
        } else {
          setError(emailInput, emailErr, message);
          emailInput.focus();
        }
        createBtn.disabled = false;
        createBtn.textContent = "Create account";
        return;
      }

      if (resp.status === 404 || resp.status === 405) {
        const didSave = saveAccountLocally(payload);
        if (!didSave) {
          showToast("Signup endpoint not found.", "error");
        }
        createBtn.disabled = false;
        createBtn.textContent = "Create account";
        return;
      }

      showToast(body.message || "Signup failed. Please try again.", "error");
      createBtn.disabled = false;
      createBtn.textContent = "Create account";
      return;
    } catch (_err) {
      const didSave = saveAccountLocally(payload);
      if (!didSave) {
        showToast("Network error. Try again later.", "error");
        createBtn.disabled = false;
        createBtn.textContent = "Create account";
      }
    }
  });

  validate();
});
