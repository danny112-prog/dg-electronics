(function() {
  var sessionId = localStorage.getItem('dg_chat_session') || 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('dg_chat_session', sessionId);
  var isOpen = false;
  var userName = '';
  var userEmail = '';

  function createWidget() {
    var btn = document.createElement('button');
    btn.className = 'chat-widget-btn';
    btn.id = 'chatWidgetBtn';
    btn.setAttribute('aria-label', 'Open live chat');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.onclick = toggleChat;
    document.body.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'chat-widget-panel';
    panel.id = 'chatPanel';
    panel.style.display = 'none';
    panel.innerHTML = '<div class="chat-header"><div class="chat-header-info"><div class="chat-header-avatar">DG</div><div><h4>DG Electronics Support</h4><span class="chat-status">Online</span></div></div><button class="chat-close" id="chatClose" aria-label="Close chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="chat-messages" id="chatMessages"><div class="chat-welcome"><p>Welcome to DG Electronics! How can we help you today?</p></div></div><div class="chat-input-area" id="chatInputArea"><div class="chat-user-info" id="chatUserInfo" style="display:none"><input type="text" id="chatName" placeholder="Your name" class="chat-info-input" /><input type="email" id="chatEmail" placeholder="Your email" class="chat-info-input" /></div><div class="chat-input-row"><input type="text" id="chatInput" placeholder="Type your message..." /><button id="chatSendBtn" aria-label="Send message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div></div>';
    document.body.appendChild(panel);

    document.getElementById('chatClose').onclick = toggleChat;
    document.getElementById('chatSendBtn').onclick = sendMessage;
    document.getElementById('chatInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMessage(); });
  }

  function toggleChat() {
    isOpen = !isOpen;
    var panel = document.getElementById('chatPanel');
    var btn = document.getElementById('chatWidgetBtn');
    if (isOpen) {
      panel.style.display = 'flex';
      btn.style.display = 'none';
      loadChatHistory();
      var input = document.getElementById('chatInput');
      if (input) input.focus();
    } else {
      panel.style.display = 'none';
      btn.style.display = 'flex';
    }
  }

  async function loadChatHistory() {
    try {
      var resp = await fetch('/api/chat/' + sessionId);
      var data = await resp.json();
      if (data.messages && data.messages.length > 0) {
        var container = document.getElementById('chatMessages');
        container.innerHTML = '';
        data.messages.forEach(function(msg) {
          appendMessage(msg.sender, msg.text, false);
        });
        if (data.name && data.name !== 'Guest') userName = data.name;
        if (data.email) userEmail = data.email;
        scrollChat();
      }
    } catch (err) {}
  }

  function appendMessage(sender, text, animate) {
    var container = document.getElementById('chatMessages');
    var div = document.createElement('div');
    div.className = 'chat-msg chat-msg-' + sender + (animate ? ' chat-msg-new' : '');
    div.innerHTML = '<div class="chat-msg-text">' + escapeHtmlChat(text) + '</div><div class="chat-msg-time">' + new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) + '</div>';
    container.appendChild(div);
    scrollChat();
  }

  function escapeHtmlChat(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollChat() {
    var container = document.getElementById('chatMessages');
    var last = container.lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
    else container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';

    var userInfo = document.getElementById('chatUserInfo');
    if (userInfo && userInfo.style.display !== 'none') {
      userName = document.getElementById('chatName').value.trim() || 'Guest';
      userEmail = document.getElementById('chatEmail').value.trim() || '';
      userInfo.style.display = 'none';
    }

    appendMessage('user', text, true);

    var typing = document.createElement('div');
    typing.className = 'chat-msg chat-msg-admin chat-typing';
    typing.innerHTML = '<div class="chat-msg-text"><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>';
    document.getElementById('chatMessages').appendChild(typing);
    scrollChat();

    try {
      var resp = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, name: userName, email: userEmail, text: text })
      });
      var result = await resp.json();
      var typingEl = document.querySelector('.chat-typing');
      if (typingEl) typingEl.remove();
      if (result.text) {
        setTimeout(function() { appendMessage('admin', result.text, true); }, 500);
      }
    } catch (err) {
      var typingEl2 = document.querySelector('.chat-typing');
      if (typingEl2) typingEl2.remove();
      appendMessage('admin', 'Sorry, we could not send your message. Please try again or contact us via WhatsApp.', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }

  // Mobile keyboard: keep chat panel visible when virtual keyboard opens
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var panel = document.getElementById('chatPanel');
      if (!panel || panel.style.display === 'none') return;
      var kb = window.visualViewport.height < window.innerHeight * 0.75;
      if (kb) {
        setTimeout(function() {
          var input = document.getElementById('chatInput');
          if (input) input.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
      }
    });
  }
})();