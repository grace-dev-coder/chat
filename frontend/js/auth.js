/**
 * Authentication JavaScript Module
 * Handles login, registration, and token management
 */

const API_URL = 'http://localhost:8000/api';  // Backend URL

/**
 * Check if user is already logged in (token exists)
 * Redirect to chat if authenticated
 */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const currentPage = window.location.pathname;
    
    // If on auth pages and has token, redirect to chat
    if (token && (currentPage.includes('login.html') || currentPage.includes('register.html') || currentPage.includes('index.html'))) {
        window.location.href = 'chat.html';
    }
    
    // Setup forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '';
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        // Create form data for OAuth2 format
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        // FIXED: Use /api/login (not /api/auth/login)
        const response = await fetch(`${API_URL}/login`, {
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
        
        // Store token in localStorage
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', username);
        
        // Redirect to chat
        window.location.href = 'chat.html';
        
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

/**
 * Handle registration form submission
 */
async function handleRegister(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '';
    
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate passwords match
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }
    
    try {
        // FIXED: Use /api/register (not /api/auth/register)
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                password
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
        }
        
        // Auto-login after successful registration
        showNotification('Registration successful! Logging in...', 'success');
        
        // Login automatically
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        // FIXED: Use /api/login
        const loginResponse = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        
        const data = await loginResponse.json();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', username);
        
        setTimeout(() => {
            window.location.href = 'chat.html';
        }, 1000);
        
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

/**
 * Logout user - clear token and redirect
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    window.location.href = 'login.html';
}

/**
 * Get auth headers for API requests
 */
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer') || document.body;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}