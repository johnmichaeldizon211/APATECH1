const profileBtn = document.querySelector(".profile-btn");
const dropdown = document.querySelector(".dropdown");

profileBtn.addEventListener("click", (e) => {
    e.stopPropagation(); 
    dropdown.classList.toggle("show");
});

document.addEventListener("click", () => {
    dropdown.classList.remove("show");
});

(function(){
    const toggle = document.getElementById('chatbot-toggle');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const body = document.getElementById('chat-body');
    const STORAGE_KEY = 'ecodrive_chat_messages_v1';

    let messages = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }

    function appendMessage(msg) {
        messages.push(msg);
        save();
        renderMessage(msg);
    }

    function renderMessage(msg){
        const el = document.createElement('div');
        el.className = 'chat-message ' + (msg.from === 'user' ? 'user' : 'bot');
        el.textContent = msg.text;
        body.appendChild(el);
        body.scrollTop = body.scrollHeight;
    }

    function renderAll(){
        body.innerHTML = '';
        messages.forEach(renderMessage);
    }

    function botReply(text){
        const t = text.toLowerCase();
        let reply = "Thanks! We'll get back to you shortly.";
        if (t.includes('hi') || t.includes('hello')) reply = 'Hi there! How can I help you today?';
        else if (t.includes('price') || t.includes('cost')) reply = 'Our prices vary by model. Which model are you interested in?';
        else if (t.includes('delivery')) reply = 'We offer pickup and delivery options—which would you prefer?';
        // Simulate typing delay
        renderTyping();
        setTimeout(()=>{
            removeTyping();
            appendMessage({from:'bot', text: reply, time: Date.now()});
        }, 800 + Math.random()*600);
    }

    function renderTyping(){
        const el = document.createElement('div');
        el.className = 'chat-message bot typing';
        el.textContent = 'Typing...';
        el.dataset.typing = '1';
        body.appendChild(el);
        body.scrollTop = body.scrollHeight;
    }

    function removeTyping(){
        const t = body.querySelector('[data-typing]');
        if (t) t.remove();
    }

    function openPanel(){
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        input.focus();
        renderAll();
    }

    function closePanel(){
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    }

    toggle.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (panel.classList.contains('open')) closePanel(); else openPanel();
    });

    closeBtn.addEventListener('click', (e)=>{ e.stopPropagation(); closePanel(); });

    // Submit
    form.addEventListener('submit', (e)=>{
        e.preventDefault();
        const text = input.value && input.value.trim();
        if (!text) return;
        appendMessage({from:'user', text, time: Date.now()});
        input.value = '';
        botReply(text);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape') closePanel();
    });

    // Load previous messages (show greeting if none)
    if (messages.length === 0) {
        messages = [{from:'bot', text: 'Hello! I\'m Ecodrive Bot. Ask me about our products or services.', time: Date.now()}];
        save();
    }

})();
