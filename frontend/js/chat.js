/**
 * Chat Application JavaScript Module
 * Handles real-time messaging, WebSocket connections, and UI updates
 */

const API_URL = 'http://localhost:8000/api';
let ws = null;                    // WebSocket connection
let currentUserId = null;         // Current user ID
let selectedUserId = null;        // Currently chatting with
let selectedUsername = null;      // Selected user's name
let reconnectAttempts = 0;        // WebSocket reconnection counter
const MAX_RECONNECT = 5;          // Max reconnection attempts

/**
 * Initialize chat on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    // Get current user info
    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Auth failed');
        
        const user = await response.json();
        currentUserId = user.id;
        localStorage.setItem('userId', user.id);
        document.getElementById('currentUser').textContent = user.username;
        
    } catch (error) {
        logout();
        return;
    }
    
    // Setup UI event listeners
    setupEventListeners();
    
    // Load users list
    await loadUsers();
    
    // Connect WebSocket for real-time messaging
    connectWebSocket();
    
    // Check unread messages periodically
    setInterval(checkUnreadMessages, 30000);
    
    // Refresh users list periodically
    setInterval(loadUsers, 60000);
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Mobile menu toggle
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    // Message form submission
    document.getElementById('messageForm').addEventListener('submit', sendMessage);
    
    // Enter key to send (already handled by form, but for extra safety)
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(e);
        }
    });
}

/**
 * Establish WebSocket connection for real-time messaging
 */
function connectWebSocket() {
    const wsUrl = `ws://localhost:8000/ws/${currentUserId}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        showNotification('Connected to chat server', 'success');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt reconnection
        if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 3000 * reconnectAttempts);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'message':
            // New message received
            if (data.sender_id === selectedUserId) {
                displayMessage(data, 'received');
                scrollToBottom();
            } else {
                // Message from another user - show notification
                showNotification(`New message from ${data.sender_username}`, 'info');
                // Update unread count
                checkUnreadMessages();
            }
            break;
            
        case 'sent_confirmation':
            // Message sent successfully
            console.log('Message sent:', data.message_id);
            break;
            
        case 'user_status':
            // User came online/offline
            updateUserStatus(data.user_id, data.status);
            break;
            
        case 'error':
            console.error('Server error:', data.error);
            showNotification(data.error, 'error');
            break;
    }
}

/**
 * Load all users from API
 */
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        renderUsersList(users);
        
        // Also fetch online users
        const onlineResponse = await fetch(`${API_URL}/users/online`, {
            headers: getAuthHeaders()
        });
        const onlineData = await onlineResponse.json();
        updateOnlineStatus(onlineData.online_users);
        
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

/**
 * Render users list in sidebar
 */
function renderUsersList(users) {
    const container = document.getElementById('usersList');
    container.innerHTML = '';
    
    // Filter out current user
    const otherUsers = users.filter(u => u.id !== currentUserId);
    
    otherUsers.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.dataset.userId = user.id;
        userDiv.onclick = () => selectUser(user.id, user.username);
        
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = user.username.charAt(0).toUpperCase();
        
        const info = document.createElement('div');
        info.className = 'user-info';
        
        const name = document.createElement('div');
        name.className = 'user-name';
        name.textContent = user.username;
        
        info.appendChild(name);
        
        const status = document.createElement('div');
        status.className = 'user-status offline';
        status.id = `status-${user.id}`;
        
        userDiv.appendChild(avatar);
        userDiv.appendChild(info);
        userDiv.appendChild(status);
        
        container.appendChild(userDiv);
    });
    
    document.getElementById('onlineCount').textContent = `${otherUsers.length} users`;
}

/**
 * Update online status indicators
 */
function updateOnlineStatus(onlineUserIds) {
    onlineUserIds.forEach(userId => {
        const statusEl = document.getElementById(`status-${userId}`);
        if (statusEl) {
            statusEl.classList.remove('offline');
        }
    });
    
    const onlineCount = onlineUserIds.length;
    document.getElementById('onlineCount').textContent = `${onlineCount} online`;
}

/**
 * Update specific user status
 */
function updateUserStatus(userId, status) {
    const statusEl = document.getElementById(`status-${userId}`);
    if (statusEl) {
        if (status === 'online') {
            statusEl.classList.remove('offline');
        } else {
            statusEl.classList.add('offline');
        }
    }
}

/**
 * Select a user to chat with
 */
async function selectUser(userId, username) {
    selectedUserId = userId;
    selectedUsername = username;
    
    // Update UI
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');
    
    document.getElementById('chatTitle').textContent = username;
    document.getElementById('chatStatus').textContent = 'Online';
    document.getElementById('chatStatus').className = 'status online';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('inputArea').style.display = 'block';
    
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    
    // Load chat history
    await loadChatHistory(userId);
}

/**
 * Load chat history with selected user
 */
async function loadChatHistory(userId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    
    try {
        const response = await fetch(`${API_URL}/messages/${userId}?limit=50`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load messages');
        
        const messages = await response.json();
        
        // Reverse to show oldest first
        messages.reverse().forEach(msg => {
            const type = msg.sender_id === currentUserId ? 'sent' : 'received';
            displayMessage(msg, type);
        });
        
        scrollToBottom();
        
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

/**
 * Display a message in the chat
 */
function displayMessage(msg, type) {
    const container = document.getElementById('messagesContainer');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // For received messages, show sender name
    if (type === 'received') {
        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = msg.sender_username || selectedUsername;
        messageDiv.appendChild(sender);
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.content;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    const timestamp = msg.timestamp || new Date().toISOString();
    time.textContent = new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.appendChild(content);
    messageDiv.appendChild(time);
    
    container.appendChild(messageDiv);
}

/**
 * Send a message via WebSocket
 */
function sendMessage(e) {
    e.preventDefault();
    
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !selectedUserId || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // Send via WebSocket
    ws.send(JSON.stringify({
        receiver_id: selectedUserId,
        content: content
    }));
    
    // Display immediately for better UX
    displayMessage({
        content: content,
        sender_id: currentUserId,
        timestamp: new Date().toISOString()
    }, 'sent');
    
    scrollToBottom();
    
    // Clear input
    input.value = '';
    input.focus();
}

/**
 * Scroll messages to bottom
 */
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

/**
 * Check unread message count
 */
async function checkUnreadMessages() {
    try {
        const response = await fetch(`${API_URL}/messages/unread/count`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        const badge = document.getElementById('unreadBadge');
        
        if (data.unread_count > 0) {
            badge.textContent = data.unread_count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error checking unread:', error);
    }
}

/**
 * Show notification (reused from auth.js but included for standalone)
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Get auth headers
 */
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Logout
 */
function logout() {
    if (ws) ws.close();
    localStorage.clear();
    window.location.href = 'login.html';
}