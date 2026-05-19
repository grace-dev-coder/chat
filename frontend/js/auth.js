const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

function isAuthenticated() {
    return !!localStorage.getItem('token');
}

function getHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Login
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                localStorage.setItem('token', data.access_token);
                // Fetch user info after login
                const userResponse = await fetch(`${API_URL}/api/users/me`, {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                });
                if (userResponse.ok) {
                    const user = await userResponse.json();
                    localStorage.setItem('user', JSON.stringify(user));
                }
                window.location.href = '/chat.html';
            } else {
                document.getElementById('error').textContent = data.detail || 'Login failed';
            }
        } catch (err) {
            document.getElementById('error').textContent = 'Server error. Is backend running?';
        }
    });
}

// Register
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
            document.getElementById('error').textContent = 'Passwords do not match';
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                window.location.href = '/login.html';
            } else {
                document.getElementById('error').textContent = data.detail || 'Registration failed';
            }
        } catch (err) {
            document.getElementById('error').textContent = 'Server error. Is backend running?';
        }
    });
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Route guards
if (window.location.pathname === '/chat.html' && !isAuthenticated()) {
    window.location.href = '/login.html';
}

if ((window.location.pathname === '/login.html' || window.location.pathname === '/register.html') && isAuthenticated()) {
    window.location.href = '/chat.html';
}
