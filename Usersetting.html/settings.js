document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("settingsForm");
  const statusMsg = document.getElementById("statusMsg");
  const saveBtn = form.querySelector(".save-btn");
  const securityForm = document.getElementById("securityForm");
  const securityStatusMsg = document.getElementById("securityStatusMsg");
  const avatarImage = document.getElementById("avatarImage");
  const avatarInput = document.getElementById("avatarInput");
  const avatarMsg = document.getElementById("avatarMsg");
  const removeAvatarBtn = document.getElementById("removeAvatarBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const menuButtons = document.querySelectorAll(".menu-buttons button");
  const sections = document.querySelectorAll(".settings-section");
  const orderList = document.getElementById("orderList");
  const orderStatusMsg = document.getElementById("orderStatusMsg");
  const topProfileBtn = document.querySelector(".top-nav .profile-menu .profile-btn");
  const topDropdown = document.querySelector(".top-nav .profile-menu .dropdown");
  const topLogoutLink = document.getElementById("topLogoutLink");
  const chatToggle = document.getElementById("chatbot-toggle");
  const chatPanel = document.getElementById("chat-panel");
  const chatClose = document.getElementById("chat-close");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatBody = document.getElementById("chat-body");

  const fields = {
    fullName: document.getElementById("fullName"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    address: document.getElementById("address")
  };

  const errors = {
    fullName: document.getElementById("fullNameError"),
    email: document.getElementById("emailError"),
    phone: document.getElementById("phoneError"),
    address: document.getElementById("addressError")
  };

  const securityFields = {
    currentPassword: document.getElementById("currentPassword"),
    newSecurityPassword: document.getElementById("newSecurityPassword"),
    confirmSecurityPassword: document.getElementById("confirmSecurityPassword")
  };

  const securityErrors = {
    currentPassword: document.getElementById("currentPasswordError"),
    newSecurityPassword: document.getElementById("newSecurityPasswordError"),
    confirmSecurityPassword: document.getElementById("confirmSecurityPasswordError")
  };

  const legacyStorageKey = "ecodrive_profile_settings";
  const securityStorageKey = "ecodrive_security_settings";
  const usersKey = "users";
  const currentUserKey = "ecodrive_current_user_email";
  const orderStorageKeys = ["ecodrive_orders", "orders", "ecodrive_bookings"];
  const defaultAvatarSrc = avatarImage.getAttribute("src");
  let activeProfileKey = getProfileStorageKey(getCurrentUserEmail());
  let activateSectionById = null;

  if (!ensureAuthenticatedUser()) {
    return;
  }

  loadSavedData();
  renderOrderStatus();
  bindSectionSwitching();
  bindTopProfileMenu();
  bindChatbot();
  bindAvatarUpload();
  bindAvatarRemove();
  bindLogout();
  bindProfileLiveValidation();
  bindSecurityLiveValidation();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFeedback();

    const data = {
      fullName: fields.fullName.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim().replace(/[\s-]/g, ""),
      address: fields.address.value.trim()
    };

    const isValid = validate(data);
    if (!isValid) {
      setStatus("Please fix the highlighted fields.", true);
      return;
    }

    const payload = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      address: data.address,
      updatedAt: new Date().toISOString()
    };

    saveProfile(payload);
  });

  securityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearSecurityFeedback();

    const currentPassword = securityFields.currentPassword.value;
    const newPassword = securityFields.newSecurityPassword.value;
    const confirmPassword = securityFields.confirmSecurityPassword.value;

    const validSecurity = validateSecurity({
      currentPassword,
      newSecurityPassword: newPassword,
      confirmSecurityPassword: confirmPassword
    });
    if (!validSecurity) {
      setSecurityStatus("Please fix the highlighted fields.", true);
      return;
    }

    const passwordUpdated = updateCurrentUserPassword(currentPassword, newPassword);
    if (!passwordUpdated) {
      setSecurityStatus("Current password is incorrect or user is not found.", true);
      return;
    }

    localStorage.setItem(
      securityStorageKey,
      JSON.stringify({
        updatedAt: new Date().toISOString()
      })
    );

    securityForm.reset();
    setSecurityStatus("Password updated locally.", false);
  });

  function bindSectionSwitching() {
    activateSectionById = (targetId) => {
      if (!targetId) {
        return;
      }

      menuButtons.forEach((button) => {
        const isActive = button.dataset.target === targetId;
        button.classList.toggle("active", isActive);
      });

      sections.forEach((section) => {
        const isTarget = section.id === targetId;
        section.classList.toggle("hidden", !isTarget);
        section.setAttribute("aria-hidden", String(!isTarget));
      });
    };

    sections.forEach((section) => {
      section.setAttribute("aria-hidden", String(section.classList.contains("hidden")));
    });

    const initialTarget = window.location.hash ? window.location.hash.slice(1) : "";
    if (initialTarget && document.getElementById(initialTarget)) {
      activateSectionById(initialTarget);
    }

    window.addEventListener("hashchange", () => {
      const hashTarget = window.location.hash ? window.location.hash.slice(1) : "";
      if (hashTarget && document.getElementById(hashTarget) && activateSectionById) {
        activateSectionById(hashTarget);
      }
    });

    menuButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.target;
        if (!targetId) {
          return;
        }

        if (activateSectionById) {
          activateSectionById(targetId);
        }

        window.location.hash = targetId;
      });
    });
  }

  function bindTopProfileMenu() {
    if (!topProfileBtn || !topDropdown) {
      return;
    }

    topProfileBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      topDropdown.classList.toggle("show");
    });

    topDropdown.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetLink = event.target.closest("[data-target-section]");
      if (!targetLink) {
        return;
      }

      event.preventDefault();
      const targetId = targetLink.getAttribute("data-target-section");
      if (targetId && activateSectionById) {
        activateSectionById(targetId);
        window.location.hash = targetId;
      }

      topDropdown.classList.remove("show");
    });

    document.addEventListener("click", () => {
      topDropdown.classList.remove("show");
    });
  }

  function bindChatbot() {
    if (!chatToggle || !chatPanel || !chatClose || !chatForm || !chatInput || !chatBody) {
      return;
    }

    const STORAGE_KEY = "ecodrive_chat_messages_v1";
    let messages = [];

    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      messages = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      messages = [];
    }

    function saveMessages() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }

    function renderMessage(msg) {
      const el = document.createElement("div");
      el.className = "chat-message " + (msg.from === "user" ? "user" : "bot");
      if (msg.typing) {
        el.classList.add("typing");
      }
      el.textContent = msg.text;
      if (msg.typing) {
        el.setAttribute("data-typing", "1");
      }
      chatBody.appendChild(el);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    function renderAll() {
      chatBody.innerHTML = "";
      messages.forEach(renderMessage);
    }

    function appendMessage(msg) {
      messages.push(msg);
      saveMessages();
      renderMessage(msg);
    }

    function removeTyping() {
      const typing = chatBody.querySelector("[data-typing='1']");
      if (typing) {
        typing.remove();
      }
    }

    function botReply(text) {
      const inputText = String(text || "").toLowerCase();
      let reply = "Thanks! We'll get back to you shortly.";

      if (inputText.includes("hi") || inputText.includes("hello")) {
        reply = "Hi there! How can I help you today?";
      } else if (inputText.includes("price") || inputText.includes("cost")) {
        reply = "Our prices vary by model. Which model are you interested in?";
      } else if (inputText.includes("delivery")) {
        reply = "We offer pickup and delivery options. Which do you prefer?";
      } else if (inputText.includes("book") || inputText.includes("booking")) {
        reply = "You can continue your booking from the Bookings page in the top menu.";
      } else if (inputText.includes("contact")) {
        reply = "You can view our contact details in the Contact page.";
      }

      renderMessage({ from: "bot", text: "Typing...", typing: true });

      setTimeout(() => {
        removeTyping();
        appendMessage({ from: "bot", text: reply, time: Date.now() });
      }, 700 + Math.random() * 500);
    }

    function openPanel() {
      chatPanel.classList.add("open");
      chatPanel.setAttribute("aria-hidden", "false");
      renderAll();
      chatInput.focus();
    }

    function closePanel() {
      chatPanel.classList.remove("open");
      chatPanel.setAttribute("aria-hidden", "true");
    }

    chatToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (chatPanel.classList.contains("open")) {
        closePanel();
      } else {
        openPanel();
      }
    });

    chatClose.addEventListener("click", (event) => {
      event.stopPropagation();
      closePanel();
    });

    chatPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = chatInput.value.trim();
      if (!text) {
        return;
      }

      appendMessage({ from: "user", text: text, time: Date.now() });
      chatInput.value = "";
      botReply(text);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePanel();
      }
    });

    if (messages.length === 0) {
      messages = [{
        from: "bot",
        text: "Hello! I'm Ecodrive Bot. Ask me about products, booking, or delivery.",
        time: Date.now()
      }];
      saveMessages();
    }
  }

  function renderOrderStatus() {
    if (!orderList) {
      return;
    }

    const currentEmail = getCurrentUserEmail();
    const rawOrders = readOrders();
    const normalizedOrders = normalizeOrders(rawOrders, currentEmail);

    orderList.innerHTML = "";

    if (!normalizedOrders.length) {
      orderStatusMsg.textContent = "No orders yet. Your next booking will appear here.";
      orderStatusMsg.classList.remove("error");
      return;
    }

    orderStatusMsg.textContent = "";
    normalizedOrders.forEach((order) => {
      const card = document.createElement("article");
      card.className = "order-item";
      card.innerHTML = `
        <h3>${escapeHtml(order.orderId)}</h3>
        <p>Model: ${escapeHtml(order.model)}</p>
        <p class="order-meta">Status: ${escapeHtml(order.status)}</p>
      `;
      orderList.appendChild(card);
    });
  }

  function bindProfileLiveValidation() {
    Object.keys(fields).forEach((key) => {
      fields[key].addEventListener("input", () => {
        fields[key].classList.remove("input-invalid");
        errors[key].textContent = "";
      });
    });
  }

  function bindSecurityLiveValidation() {
    Object.keys(securityFields).forEach((key) => {
      securityFields[key].addEventListener("input", () => {
        securityFields[key].classList.remove("input-invalid");
        securityErrors[key].textContent = "";
      });
    });
  }

  async function saveProfile(payload) {
    setSubmitting(true);

    try {
      const response = await fetch("/api/profile/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Profile API request failed.");
      }

      const data = await response.json();
      if (!data || data.success !== true) {
        throw new Error("Profile API returned unsuccessful response.");
      }

      persistLocal(payload);
      setStatus("Profile settings saved.", false);
    } catch (error) {
      console.warn("Profile save API unavailable. Falling back to local storage.", error);
      persistLocal(payload);
      setStatus("Saved locally (backend unavailable).", false);
    } finally {
      setSubmitting(false);
    }
  }

  function validate(data) {
    let valid = true;

    if (data.fullName.length < 2) {
      showError("fullName", "Enter at least 2 characters.");
      valid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      showError("email", "Enter a valid email address.");
      valid = false;
    }

    const phoneRegex = /^(\+639|09)\d{9}$/;
    if (!phoneRegex.test(data.phone)) {
      showError("phone", "Use 09XXXXXXXXX or +639XXXXXXXXX.");
      valid = false;
    }

    if (data.address.length < 5) {
      showError("address", "Enter a complete address.");
      valid = false;
    }


    return valid;
  }

  function showError(fieldName, message) {
    fields[fieldName].classList.add("input-invalid");
    errors[fieldName].textContent = message;
  }

  function showSecurityError(fieldName, message) {
    securityFields[fieldName].classList.add("input-invalid");
    securityErrors[fieldName].textContent = message;
  }

  function clearFeedback() {
    Object.keys(fields).forEach((key) => {
      fields[key].classList.remove("input-invalid");
      errors[key].textContent = "";
    });

    statusMsg.textContent = "";
    statusMsg.classList.remove("error");
  }

  function setStatus(message, isError) {
    statusMsg.textContent = message;
    statusMsg.classList.toggle("error", isError);
  }

  function setSecurityStatus(message, isError) {
    securityStatusMsg.textContent = message;
    securityStatusMsg.classList.toggle("error", isError);
  }

  function clearSecurityStatus() {
    securityStatusMsg.textContent = "";
    securityStatusMsg.classList.remove("error");
  }

  function clearSecurityFeedback() {
    Object.keys(securityFields).forEach((key) => {
      securityFields[key].classList.remove("input-invalid");
      securityErrors[key].textContent = "";
    });
    clearSecurityStatus();
  }

  function validateSecurity(data) {
    let valid = true;

    if (!data.currentPassword) {
      showSecurityError("currentPassword", "Current password is required.");
      valid = false;
    }

    const hasUpper = /[A-Z]/.test(data.newSecurityPassword);
    const hasLower = /[a-z]/.test(data.newSecurityPassword);
    const hasNumber = /\d/.test(data.newSecurityPassword);

    if (!data.newSecurityPassword) {
      showSecurityError("newSecurityPassword", "New password is required.");
      valid = false;
    } else if (data.newSecurityPassword.length < 8 || !hasUpper || !hasLower || !hasNumber) {
      showSecurityError("newSecurityPassword", "Use 8+ chars with upper, lower, and number.");
      valid = false;
    }

    if (!data.confirmSecurityPassword) {
      showSecurityError("confirmSecurityPassword", "Please confirm your new password.");
      valid = false;
    } else if (data.newSecurityPassword !== data.confirmSecurityPassword) {
      showSecurityError("confirmSecurityPassword", "New password and confirmation do not match.");
      valid = false;
    }

    return valid;
  }

  function setSubmitting(isSubmitting) {
    saveBtn.disabled = isSubmitting;
    saveBtn.textContent = isSubmitting ? "Saving..." : "Save Changes";
  }

  function persistLocal(payload) {
    const existing = readProfileData();
    const profileOnly = {
      fullName: payload.fullName,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone,
      address: payload.address,
      avatar: existing.avatar || "",
      updatedAt: payload.updatedAt
    };

    const previousEmail = getCurrentUserEmail();
    const nextEmail = profileOnly.email;
    if (nextEmail) {
      setCurrentUserEmail(nextEmail);
      activeProfileKey = getProfileStorageKey(nextEmail);
      if (previousEmail && previousEmail !== nextEmail) {
        localStorage.removeItem(getProfileStorageKey(previousEmail));
      }
    }

    localStorage.setItem(activeProfileKey, JSON.stringify(profileOnly));
    localStorage.removeItem(legacyStorageKey);
    syncCurrentUserProfile(profileOnly);
  }

  function loadSavedData() {
    const currentEmail = getCurrentUserEmail();
    activeProfileKey = getProfileStorageKey(currentEmail);

    const saved = readProfileData();
    if (saved.fullName) {
      fields.fullName.value = saved.fullName;
    }
    if (saved.email) {
      fields.email.value = saved.email;
    }
    if (saved.phone) {
      fields.phone.value = saved.phone;
    }
    if (saved.address) {
      fields.address.value = saved.address;
    }
    if (saved.avatar) {
      avatarImage.src = saved.avatar;
    }

    const currentUser = getCurrentUser();
    if (currentUser) {
      if (!fields.fullName.value) {
        fields.fullName.value = currentUser.name || "";
      }
      if (!fields.email.value) {
        fields.email.value = currentUser.email || "";
      }
      if (!fields.phone.value) {
        fields.phone.value = currentUser.phone || "";
      }
      if (!fields.address.value) {
        fields.address.value = currentUser.address || "";
      }
      if (!saved.avatar && currentUser.avatar) {
        avatarImage.src = currentUser.avatar;
      }
    }
  }

  function bindAvatarUpload() {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) {
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setAvatarMsg("Use JPG, PNG, or WEBP only.", true);
        avatarInput.value = "";
        return;
      }

      const maxBytes = 2 * 1024 * 1024;
      if (file.size > maxBytes) {
        setAvatarMsg("Image too large. Max size is 2MB.", true);
        avatarInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        avatarImage.src = dataUrl;
        saveAvatar(dataUrl);
        setAvatarMsg("Profile picture updated.", false);
      };
      reader.onerror = () => {
        setAvatarMsg("Could not read image file.", true);
      };
      reader.readAsDataURL(file);
    });
  }

  function bindAvatarRemove() {
    removeAvatarBtn.addEventListener("click", () => {
      avatarImage.src = defaultAvatarSrc;
      avatarInput.value = "";
      clearSavedAvatar();
      setAvatarMsg("Profile picture removed.", false);
    });
  }

  function bindLogout() {
    const runLogout = (event) => {
      if (event) {
        event.preventDefault();
      }
      localStorage.removeItem(currentUserKey);
      sessionStorage.removeItem(currentUserKey);
      window.location.href = "../log in.html";
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", runLogout);
    }

    if (topLogoutLink) {
      topLogoutLink.addEventListener("click", runLogout);
    }
  }

  function saveAvatar(dataUrl) {
    const existing = readProfileData();
    const nextData = {
      ...existing,
      email: existing.email || getCurrentUserEmail(),
      avatar: dataUrl,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(activeProfileKey, JSON.stringify(nextData));
    syncCurrentUserProfile({ avatar: dataUrl, email: nextData.email });
    localStorage.removeItem(legacyStorageKey);
  }

  function clearSavedAvatar() {
    const existing = readProfileData();
    const nextData = {
      ...existing,
      email: existing.email || getCurrentUserEmail(),
      avatar: "",
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(activeProfileKey, JSON.stringify(nextData));
    syncCurrentUserProfile({ avatar: "", email: nextData.email });
    localStorage.removeItem(legacyStorageKey);
  }

  function setAvatarMsg(message, isError) {
    avatarMsg.textContent = message;
    avatarMsg.classList.toggle("error", isError);
  }

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return {};
    }
  }

  function readOrders() {
    const mergedOrders = [];

    for (const key of orderStorageKeys) {
      const parsed = safeParse(localStorage.getItem(key));
      if (Array.isArray(parsed) && parsed.length > 0) {
        mergedOrders.push(...parsed);
      }
    }

    return mergedOrders;
  }

  function normalizeOrders(rawOrders, currentEmail) {
    const lowerEmail = String(currentEmail || "").trim().toLowerCase();
    const fromStorage = rawOrders
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const itemEmail = String(item.email || item.userEmail || "").trim().toLowerCase();
        if (lowerEmail && itemEmail !== lowerEmail) {
          return null;
        }

        return {
          orderId: String(item.orderId || item.id || `#EC-${1000 + index}`),
          model: String(item.model || item.productName || item.itemName || "Ecodrive Ebike"),
          status: String(item.status || "Payment confirmed"),
          createdAt: item.createdAt || item.updatedAt || ""
        };
      })
      .filter(Boolean);

    if (fromStorage.length > 0) {
      fromStorage.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      const deduped = [];
      const seen = new Set();
      fromStorage.forEach((item) => {
        const key = `${item.orderId}|${item.model}|${item.createdAt}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      });

      return deduped.slice(0, 10);
    }

    return [];
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getUsers() {
    try {
      const raw = localStorage.getItem(usersKey);
      const users = raw ? JSON.parse(raw) : [];
      return Array.isArray(users) ? users : [];
    } catch (_error) {
      return [];
    }
  }

  function getCurrentUserEmail() {
    const localValue = (localStorage.getItem(currentUserKey) || "").trim().toLowerCase();
    if (localValue) {
      return localValue;
    }
    return (sessionStorage.getItem(currentUserKey) || "").trim().toLowerCase();
  }

  function ensureAuthenticatedUser() {
    const email = getCurrentUserEmail();
    if (email) {
      return true;
    }
    window.location.href = "../log in.html";
    return false;
  }

  function setCurrentUserEmail(emailValue) {
    const nextEmail = String(emailValue || "").trim().toLowerCase();
    if (!nextEmail) {
      return;
    }

    if (localStorage.getItem(currentUserKey)) {
      localStorage.setItem(currentUserKey, nextEmail);
      sessionStorage.removeItem(currentUserKey);
      return;
    }

    if (sessionStorage.getItem(currentUserKey)) {
      sessionStorage.setItem(currentUserKey, nextEmail);
      localStorage.removeItem(currentUserKey);
      return;
    }

    localStorage.setItem(currentUserKey, nextEmail);
  }

  function getProfileStorageKey(emailValue) {
    const email = String(emailValue || "").trim().toLowerCase();
    return email ? `ecodrive_profile_settings::${email}` : legacyStorageKey;
  }

  function readProfileData() {
    const rawActive = localStorage.getItem(activeProfileKey);
    if (rawActive) {
      return safeParse(rawActive);
    }

    const rawLegacy = localStorage.getItem(legacyStorageKey);
    if (rawLegacy) {
      return safeParse(rawLegacy);
    }

    return {};
  }

  function getCurrentUser() {
    const email = getCurrentUserEmail();
    if (!email) {
      return null;
    }
    const users = getUsers();
    return users.find((user) => String(user.email || "").toLowerCase() === email) || null;
  }

  function updateCurrentUserPassword(currentPassword, newPassword) {
    const email = getCurrentUserEmail();
    if (!email) {
      return false;
    }

    const users = getUsers();
    const index = users.findIndex((user) => String(user.email || "").toLowerCase() === email);
    if (index < 0) {
      return false;
    }

    if (String(users[index].password || "") !== currentPassword) {
      return false;
    }

    users[index] = {
      ...users[index],
      password: newPassword
    };
    localStorage.setItem(usersKey, JSON.stringify(users));
    return true;
  }

  function syncCurrentUserProfile(profile) {
    const currentEmail = getCurrentUserEmail();
    const targetEmail = String(profile.email || currentEmail || "").trim().toLowerCase();
    if (!targetEmail) {
      return;
    }

    const users = getUsers();
    const index = users.findIndex((user) => String(user.email || "").toLowerCase() === currentEmail);
    if (index < 0) {
      return;
    }

    users[index] = {
      ...users[index],
      name: profile.fullName || users[index].name || "",
      email: targetEmail,
      phone: typeof profile.phone === "string" ? profile.phone : users[index].phone,
      address: typeof profile.address === "string" ? profile.address : users[index].address,
      avatar: typeof profile.avatar === "string" ? profile.avatar : users[index].avatar,
      password: users[index].password
    };
    localStorage.setItem(usersKey, JSON.stringify(users));
    setCurrentUserEmail(targetEmail);
  }
});




