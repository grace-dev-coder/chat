/**
 * Admin Panel JavaScript Module
 * Handles admin authentication, user management, and message monitoring
 */

const API_URL = 'http://localhost:8000/api';
let currentSection = 'users';

/**
 * Initialize admin panel on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    const adminToken = localStorage.getItem('adminToken');
    const currentPage = window.location.pathname;
    
    // Redirect logic
    if (currentPage.includes('login.html')) {
        // Already on login page
        const form = document.getElementById('adminLoginForm');
        if (form) form.addEventListener('submit', handleAdminLogin);
    } else {
        // On dashboard - check auth
        if (!adminToken) {
            window.location.href = 'login.html';
            return;
        }
        
        // Setup dashboard
        setupDashboard();
        loadUsers();
        loadStats();
    }
});

/**
 * Handle admin login form submission
 */
async function handleAdminLogin(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '';
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }
        
        const data = await response.json();
        localStorage.setItem('adminToken', data.access_token);
        localStorage.setItem('adminUser', username);
        
        window.location.href = 'index.html';
        
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

/**
 * Setup dashboard event listeners and navigation
 */
function setupDashboard() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
        });
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // Display admin name
    const adminName = localStorage.getItem('adminUser');
    if (adminName) {
        document.getElementById('adminName').textContent = adminName;
    }
}

/**
 * Switch between dashboard sections
 */
function switchSection(section) {
    currentSection = section;
    
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === section) {
            item.classList.add('active');
        }
    });
    
    // Show/hide sections
    document.querySelectorAll('.admin-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(`${section}Section`).classList.add('active');
    
    // Update title
    const titles = {
        users: 'User Management',
        messages: 'Message History',
        stats: 'Dashboard Statistics'
    };
    document.getElementById('pageTitle').textContent = titles[section];
    
    // Load section data
    if (section === 'users') loadUsers();
    if (section === 'messages') loadMessages();
    if (section === 'stats') loadStats();
}

/**
 * Load all users (admin view - includes banned)
 */
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: getAdminHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                adminLogout();
                return;
            }
            throw new Error('Failed to load users');
        }
        
        const users = await response.json();
        renderUsersTable(users);
        
    } catch (error) {
        console.error('Error loading users:', error);
        showAdminError('Failed to load users');
    }
}

/**
 * Render users table
 */
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        
        // ID
        tr.appendChild(createCell(user.id));
        
        // Username
        tr.appendChild(createCell(user.username));
        
        // Email
        tr.appendChild(createCell(user.email));
        
        // Created
        const created = new Date(user.created_at).toLocaleDateString();
        tr.appendChild(createCell(created));
        
        // Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${user.is_active ? 'status-active' : 'status-banned'}`;
        statusBadge.textContent = user.is_active ? 'Active' : 'Banned';
        statusCell.appendChild(statusBadge);
        tr.appendChild(statusCell);
        
        // Admin
        const adminCell = document.createElement('td');
        if (user.is_admin) {
            const adminBadge = document.createElement('span');
            adminBadge.className = 'admin-badge';
            adminBadge.textContent = 'ADMIN';
            adminCell.appendChild(adminBadge);
        } else {
            adminCell.textContent = '-';
        }
        tr.appendChild(adminCell);
        
        // Actions
        const actionsCell = document.createElement('td');
        const actionBtns = document.createElement('div');
        actionBtns.className = 'action-btns';
        
        // Ban/Unban button
        const banBtn = document.createElement('button');
        banBtn.className = `btn btn-small ${user.is_active ? 'btn-warning' : 'btn-success'}`;
        banBtn.textContent = user.is_active ? 'Ban' : 'Unban';
        banBtn.onclick = () => toggleBanUser(user.id, !user.is_active);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteUser(user.id);
        
        actionBtns.appendChild(banBtn);
        actionBtns.appendChild(deleteBtn);
        actionsCell.appendChild(actionBtns);
        tr.appendChild(actionsCell);
        
        tbody.appendChild(tr);
    });
}

/**
 * Toggle ban status of a user
 */
async function toggleBanUser(userId, shouldBan) {
    if (!confirm(`Are you sure you want to ${shouldBan ? 'ban' : 'unban'} this user?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/ban`, {
            method: 'PUT',
            headers: getAdminHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to update user');
        
        const result = await response.json();
        showAdminNotification(result.message, 'success');
        loadUsers(); // Refresh table
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Delete a user permanently
 */
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to permanently delete this user? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete user');
        
        showAdminNotification('User deleted successfully', 'success');
        loadUsers(); // Refresh table
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Load messages with optional filters
 */
async function loadMessages(search = '', userId = '') {
    try {
        let url = `${API_URL}/admin/messages?limit=100`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (userId) url += `&user_id=${userId}`;
        
        const response = await fetch(url, {
            headers: getAdminHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load messages');
        
        const messages = await response.json();
        renderMessagesTable(messages);
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showAdminError('Failed to load messages');
    }
}

/**
 * Render messages table
 */
function renderMessagesTable(messages) {
    const tbody = document.getElementById('messagesTableBody');
    tbody.innerHTML = '';
    
    messages.forEach(msg => {
        const tr = document.createElement('tr');
        
        tr.appendChild(createCell(msg.id));
        tr.appendChild(createCell(msg.sender_id));
        tr.appendChild(createCell(msg.receiver_id));
        
        // Content (truncated)
        const contentCell = document.createElement('td');
        contentCell.textContent = msg.content.length > 50 
            ? msg.content.substring(0, 50) + '...' 
            : msg.content;
        contentCell.title = msg.content; // Full text on hover
        tr.appendChild(contentCell);
        
        // Time
        const time = new Date(msg.timestamp).toLocaleString();
        tr.appendChild(createCell(time));
        
        // Read status
        const readCell = document.createElement('td');
        readCell.textContent = msg.read_status ? '✓' : '○';
        tr.appendChild(readCell);
        
        tbody.appendChild(tr);
    });
}

/**
 * Apply message filters
 */
function filterMessages() {
    const userId = document.getElementById('filterUserId').value;
    const search = document.getElementById('filterSearch').value;
    loadMessages(search, userId);
}

/**
 * Load dashboard statistics
 */
async function loadStats() {
    try {
        // Get all users
        const usersResponse = await fetch(`${API_URL}/admin/users`, {
            headers: getAdminHeaders()
        });
        const users = await usersResponse.json();
        
        // Get online users
        const onlineResponse = await fetch(`${API_URL}/users/online`, {
            headers: getAdminHeaders()
        });
        const onlineData = await onlineResponse.json();
        
        // Get messages (just count)
        const messagesResponse = await fetch(`${API_URL}/admin/messages?limit=1`, {
            headers: getAdminHeaders()
        });
        // Note: For accurate count, you'd need a dedicated count endpoint
        // Here we estimate or you can add a count endpoint
        
        document.getElementById('totalUsers').textContent = users.length;
        document.getElementById('activeUsers').textContent = users.filter(u => u.is_active).length;
        document.getElementById('onlineNow').textContent = (onlineData && onlineData.users ? onlineData.users.length : 0);
        
        // For messages, we'd need a count endpoint. Setting placeholder:
        document.getElementById('totalMessages').textContent = '-';
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Handle search input
 */
function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    
    if (currentSection === 'users') {
        // Filter users table
        const rows = document.querySelectorAll('#usersTableBody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    }
}

/**
 * Refresh current section data
 */
function refreshData() {
    if (currentSection === 'users') loadUsers();
    if (currentSection === 'messages') loadMessages();
    if (currentSection === 'stats') loadStats();
}

/**
 * Get admin auth headers
 */
function getAdminHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Admin logout
 */
function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = 'login.html';
}

/**
 * Helper: Create table cell
 */
function createCell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
}

/**
 * Debounce function for search input
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Show notification in admin panel
 */
function showAdminNotification(message, type = 'info') {
    // Create notification element
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#1e40af'};
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => notif.remove(), 3000);
}

/**
 * Show error notification
 */
function showAdminError(message) {
    showAdminNotification(message, 'error');
}