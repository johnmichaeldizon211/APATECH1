const profileBtn = document.querySelector(".profile-btn");
const dropdown = document.querySelector(".dropdown");

if (profileBtn && dropdown) {
    profileBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        dropdown.classList.toggle("show");
    });

    document.addEventListener("click", function () {
        dropdown.classList.remove("show");
    });
}

(function () {
    const toggle = document.getElementById("chatbot-toggle");
    const panel = document.getElementById("chat-panel");
    const closeBtn = document.getElementById("chat-close");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const body = document.getElementById("chat-body");
    const STORAGE_KEY = "ecodrive_chat_messages_v1";
    const MAX_MESSAGES = 80;
    const smartReply = (window.EcodriveChatbotBrain && typeof window.EcodriveChatbotBrain.createResponder === "function")
        ? window.EcodriveChatbotBrain.createResponder()
        : null;

    if (!(toggle && panel && closeBtn && form && input && body)) {
        return;
    }

    let messages = [];
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(parsed)) {
            messages = parsed
                .filter(function (entry) {
                    return entry && (entry.from === "user" || entry.from === "bot") && typeof entry.text === "string";
                })
                .slice(-MAX_MESSAGES);
        }
    } catch (_error) {
        messages = [];
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }

    function appendMessage(msg) {
        messages.push(msg);
        if (messages.length > MAX_MESSAGES) {
            messages = messages.slice(messages.length - MAX_MESSAGES);
        }
        save();
        renderMessage(msg);
    }

    function renderMessage(msg) {
        const el = document.createElement("div");
        el.className = "chat-message " + (msg.from === "user" ? "user" : "bot");
        el.textContent = msg.text;
        body.appendChild(el);
        body.scrollTop = body.scrollHeight;
    }

    function renderAll() {
        body.innerHTML = "";
        messages.forEach(renderMessage);
    }

    function botReply(text) {
        const reply = smartReply
            ? smartReply(text)
            : "I can help with ebike models, prices, booking status, payment, installment, delivery, and repair.";

        renderTyping();
        setTimeout(function () {
            removeTyping();
            appendMessage({ from: "bot", text: reply, time: Date.now() });
        }, 700 + Math.random() * 450);
    }

    function renderTyping() {
        const el = document.createElement("div");
        el.className = "chat-message bot typing";
        el.textContent = "Typing...";
        el.dataset.typing = "1";
        body.appendChild(el);
        body.scrollTop = body.scrollHeight;
    }

    function removeTyping() {
        const typing = body.querySelector("[data-typing]");
        if (typing) typing.remove();
    }

    function openPanel() {
        panel.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
        input.focus();
        renderAll();
    }

    function closePanel() {
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden", "true");
    }

    toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        if (panel.classList.contains("open")) closePanel();
        else openPanel();
    });

    closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closePanel();
    });

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        const text = (input.value || "").trim();
        if (!text) return;

        appendMessage({ from: "user", text: text, time: Date.now() });
        input.value = "";
        botReply(text);
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closePanel();
    });

    if (messages.length === 0) {
        messages = [{ from: "bot", text: "Hi! I'm Ecodrive Bot. Ask me about Ecodrive ebikes, prices, booking status, payment, or repair.", time: Date.now() }];
        save();
    }
})();
