// Shared utilities for Chat System

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notif.style.background = type === 'error' ? '#e94560' : '#0f3460';
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

async function apiCall(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const config = {
        headers: getHeaders(),
        ...options
    };
    
    const response = await fetch(url, config);
    
    if (!response.ok) {
        if (response.status === 401) {
            logout();
            throw new Error('Session expired');
        }
        throw new Error(await response.text());
    }
    
    return response.json();
}