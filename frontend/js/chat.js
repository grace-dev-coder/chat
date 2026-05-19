// Note: API_URL and WS_URL are defined in auth.js which loads first
// Do NOT redeclare them here to avoid "already declared" error

let ws = null;
let currentUser = null;
let selectedReceiver = null;

document.addEventListener('DOMContentLoaded', () => {
    const userData = localStorage.getItem('user');
    if (userData) {
        currentUser = JSON.parse(userData);
        document.getElementById('currentUser').textContent = currentUser.username || 'User';
    }
    
    if (!currentUser || !currentUser.id) {
        console.error('No user ID found. Cannot connect to WebSocket.');
        document.getElementById('chatMessages').innerHTML = 
            '<div class="message received"><div class="content">Error: Please log in again</div></div>';
        return;
    }
    
    // Bind buttons by ID (chat.html uses id="sendBtn" and id="logoutBtn")
    const sendBtn = document.getElementById('sendBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const msgInput = document.getElementById('messageInput');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
        console.log('Send button bound');
    } else {
        console.error('sendBtn not found in DOM');
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
        console.log('Logout button bound');
    }
    
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    connectWebSocket();
    loadOnlineUsers();
});

function connectWebSocket() {
    if (!currentUser || !currentUser.id) {
        console.error('Cannot connect: no user ID');
        return;
    }
    
    ws = new WebSocket(`${WS_URL}/ws/${currentUser.id}`);
    
    ws.onopen = () => {
        console.log('Connected to chat');
        addSystemMessage('Connected to chat server');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        
        if (data.type === 'message') {
            displayMessage(data);
        } else if (data.type === 'user_status') {
            loadOnlineUsers();
        } else if (data.error) {
            console.error('Server error:', data.error);
            addSystemMessage('Error: ' + data.error);
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected, reconnecting...');
        addSystemMessage('Disconnected. Reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) {
        addSystemMessage('Not connected. Please wait...');
        return;
    }
    
    if (!selectedReceiver) {
        addSystemMessage('Please select a user from the sidebar first');
        return;
    }
    
    ws.send(JSON.stringify({
        receiver_id: selectedReceiver.id,
        content: content
    }));
    
    displayMessage({
        sender_id: currentUser.id,
        sender_username: currentUser.username,
        content: content,
        timestamp: new Date().toISOString()
    });
    
    input.value = '';
}

function displayMessage(data) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    
    const isSent = currentUser && data.sender_id === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '';
    
    messageDiv.innerHTML = `
        <div class="sender">${escapeHtml(data.sender_username || 'Unknown')}</div>
        <div class="content">${escapeHtml(data.content)}</div>
        ${time ? `<div class="time">${time}</div>` : ''}
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message received';
    messageDiv.innerHTML = `<div class="content"><em>${escapeHtml(text)}</em></div>`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    
    const userArray = Array.isArray(users) ? users : (users?.users || []);
    
    if (!userArray || userArray.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No users online';
        userList.appendChild(li);
        return;
    }
    
    userArray.forEach(user => {
        if (user.id === currentUser?.id) return;
        
        const li = document.createElement('li');
        li.textContent = user.username || user.email || `User ${user.id}`;
        li.style.cursor = 'pointer';
        li.style.padding = '8px';
        li.style.margin = '5px 0';
        li.style.background = '#0f3460';
        li.style.borderRadius = '5px';
        li.onclick = () => selectReceiver(user);
        
        if (selectedReceiver && selectedReceiver.id === user.id) {
            li.style.background = '#e94560';
        }
        
        userList.appendChild(li);
    });
}

function selectReceiver(user) {
    selectedReceiver = user;
    document.getElementById('messageInput').placeholder = `Message to ${user.username}...`;
    loadOnlineUsers();
}

async function loadOnlineUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users/online`, {
            headers: getHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            const users = data.users || [];
            updateUserList(users);
        }
    } catch (err) {
        console.error('Failed to load users:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
