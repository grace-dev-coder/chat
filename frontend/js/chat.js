let currentUser = null;
let selectedUser = null;
let ws = null;
let typingTimeout = null;
let conversations = [];

// Initialize
async function init() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        currentUser = JSON.parse(localStorage.getItem('user'));
        document.getElementById('currentUserName').textContent = currentUser.name;
        
        await loadConversations();
        connectWebSocket(token);
    } catch (error) {
        console.error('Init error:', error);
        logout();
    }
}

// WebSocket connection
function connectWebSocket(token) {
    ws = new WebSocket(`ws://localhost:8000/ws/${token}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        // Start ping interval
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(() => connectWebSocket(token), 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_message':
            if (selectedUser && data.message.sender_id === selectedUser.id) {
                displayMessage(data.message, false);
                scrollToBottom();
            }
            loadConversations(); // Refresh list
            break;
            
        case 'user_status':
            updateUserStatus(data.user_id, data.is_online);
            break;
            
        case 'typing':
            if (selectedUser && data.user_id === selectedUser.id) {
                showTypingIndicator(data.is_typing);
            }
            break;
    }
}

// Load conversations
async function loadConversations() {
    try {
        conversations = await API.getConversations();
        renderConversations();
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

function renderConversations() {
    const container = document.getElementById('conversationsList');
    container.innerHTML = '';

    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        if (selectedUser && selectedUser.id === conv.user.id) {
            div.classList.add('active');
        }
        
        const initials = conv.user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const time = conv.last_message.timestamp ? 
            new Date(conv.last_message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        
        div.innerHTML = `
            <div class="conversation-avatar">${initials}</div>
            <div class="conversation-info">
                <div class="conversation-name">
                    ${conv.user.name}
                    <span class="status-indicator ${conv.user.is_online ? 'online' : 'offline'}"></span>
                </div>
                <div class="conversation-preview">
                    ${conv.last_message.is_from_me ? 'You: ' : ''}${conv.last_message.content || 'No messages yet'}
                </div>
            </div>
            <div class="conversation-meta">
                <div class="conversation-time">${time}</div>
                ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
            </div>
        `;
        
        div.onclick = () => selectUser(conv.user);
        container.appendChild(div);
    });
}

// Select user to chat with
async function selectUser(user) {
    selectedUser = user;
    document.getElementById('chatHeader').style.display = 'block';
    document.getElementById('messageInputArea').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    
    document.getElementById('chatUserName').textContent = user.name;
    updateUserStatus(user.id, user.is_online);
    
    renderConversations(); // Update active state
    
    // Load messages
    try {
        const messages = await API.getMessages(user.id);
        displayMessages(messages);
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const isSent = msg.sender_id === currentUser.id;
        displayMessage(msg, isSent);
    });
    
    scrollToBottom();
}

function displayMessage(msg, isSent) {
    const container = document.getElementById('messagesContainer');
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    bubble.innerHTML = `
        ${!isSent ? `<div class="message-sender">${msg.sender_name}</div>` : ''}
        <div class="message-content">${escapeHtml(msg.content)}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(bubble);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !selectedUser) return;
    
    try {
        const message = await API.sendMessage(selectedUser.id, content);
        displayMessage({
            ...message,
            sender_name: currentUser.name
        }, true);
        input.value = '';
        scrollToBottom();
        loadConversations();
    } catch (error) {
        console.error('Failed to send message:', error);
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Typing indicator
function handleTyping() {
    if (!selectedUser || !ws) return;
    
    ws.send(JSON.stringify({
        type: 'typing',
        receiver_id: selectedUser.id,
        is_typing: true
    }));
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'typing',
            receiver_id: selectedUser.id,
            is_typing: false
        }));
    }, 1000);
}

function showTypingIndicator(isTyping) {
    const indicator = document.getElementById('typingIndicator');
    indicator.textContent = isTyping ? `${selectedUser.name} is typing...` : '';
}

// Search users
async function searchUsers() {
    const query = document.getElementById('searchUsers').value;
    if (!query) {
        loadConversations();
        return;
    }
    
    try {
        const users = await API.getUsers(query);
        // Filter out existing conversations and show as new
        const container = document.getElementById('conversationsList');
        container.innerHTML = '';
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'conversation-item';
            const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
            
            div.innerHTML = `
                <div class="conversation-avatar">${initials}</div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${user.name}
                        <span class="status-indicator ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="conversation-preview">Click to start conversation</div>
                </div>
            `;
            
            div.onclick = () => selectUser(user);
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Search failed:', error);
    }
}

function updateUserStatus(userId, isOnline) {
    if (selectedUser && selectedUser.id === userId) {
        document.getElementById('chatUserStatus').textContent = isOnline ? 'Online' : 'Offline';
        document.getElementById('chatUserStatus').style.color = isOnline ? '#4caf50' : '#999';
    }
    
    // Update in conversations list
    const conv = conversations.find(c => c.user.id === userId);
    if (conv) {
        conv.user.is_online = isOnline;
        renderConversations();
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

async function logout() {
    try {
        await API.logout();
    } catch (e) {
        console.error('Logout error:', e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Initialize on load
init();