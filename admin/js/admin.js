const API_URL = 'http://localhost:8000';

// Check auth on load
if (!localStorage.getItem('adminToken') && !window.location.href.includes('login.html')) {
    window.location.href = 'login.html';
}

// Admin Login
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageDiv = document.getElementById('message');
        
        try {
            const formData = new URLSearchParams();
            formData.append('username', document.getElementById('email').value);
            formData.append('password', document.getElementById('password').value);

            const response = await fetch(`${API_URL}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            if (!response.ok) throw new Error('Invalid credentials');
            
            const data = await response.json();
            
            if (!data.user.is_admin) {
                throw new Error('Access denied. Admin only.');
            }
            
            localStorage.setItem('adminToken', data.access_token);
            window.location.href = 'index.html';
        } catch (error) {
            messageDiv.className = 'error';
            messageDiv.textContent = error.message;
        }
    });
}

// Admin Dashboard
if (document.querySelector('.admin-layout')) {
    loadDashboard();
}

async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
    
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            adminLogout();
            return;
        }
        throw new Error('Request failed');
    }
    
    return response.json();
}

async function loadDashboard() {
    try {
        // Load stats
        const stats = await apiRequest('/admin/stats');
        document.getElementById('statTotalUsers').textContent = stats.total_users;
        document.getElementById('statVerifiedUsers').textContent = stats.verified_users;
        document.getElementById('statOnlineUsers').textContent = stats.online_users;
        document.getElementById('statTotalMessages').textContent = stats.total_messages;
        
        // Load users
        const users = await apiRequest('/admin/users');
        renderUsers(users);
        
        // Load messages
        const messages = await apiRequest('/admin/messages');
        renderMessages(messages);
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="badge ${user.is_verified ? 'badge-success' : 'badge-danger'}">${user.is_verified ? 'Yes' : 'No'}</span></td>
            <td class="${user.is_online ? 'status-online' : 'status-offline'}">${user.is_online ? 'Online' : 'Offline'}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-small btn-delete" onclick="deleteUser(${user.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function renderMessages(messages) {
    const tbody = document.getElementById('messagesTableBody');
    tbody.innerHTML = messages.map(msg => `
        <tr>
            <td>${msg.id}</td>
            <td>${msg.sender ? msg.sender.name : 'Unknown'}</td>
            <td>${msg.receiver ? msg.receiver.name : 'Unknown'}</td>
            <td>${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}</td>
            <td>${new Date(msg.timestamp).toLocaleString()}</td>
            <td>
                <button class="btn btn-small btn-delete" onclick="deleteMessage(${msg.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    
    try {
        await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
        loadDashboard();
    } catch (error) {
        alert('Failed to delete user');
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        await apiRequest(`/admin/messages/${messageId}`, { method: 'DELETE' });
        loadDashboard();
    } catch (error) {
        alert('Failed to delete message');
    }
}

function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.admin-sidebar nav a').forEach(a => a.classList.remove('active'));
    
    // Show selected
    document.getElementById(`${section}-section`).style.display = 'block';
    event.target.classList.add('active');
}

function adminLogout() {
    localStorage.removeItem('adminToken');
    window.location.href = 'login.html';
}