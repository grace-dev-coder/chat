// Check if user is already logged in
if (localStorage.getItem('token') && !window.location.href.includes('chat.html')) {
    window.location.href = 'chat.html';
}

// Register form
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageDiv = document.getElementById('message');
        
        try {
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const result = await API.register(name, email, password);
            messageDiv.className = 'message success';
            messageDiv.textContent = result.message;
            registerForm.reset();
            
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } catch (error) {
            messageDiv.className = 'message error';
            messageDiv.textContent = error.message;
        }
    });
}

// Login form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageDiv = document.getElementById('message');
        
        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const result = await API.login(email, password);
            localStorage.setItem('token', result.access_token);
            localStorage.setItem('user', JSON.stringify(result.user));
            
            window.location.href = 'chat.html';
        } catch (error) {
            messageDiv.className = 'message error';
            messageDiv.textContent = error.message;
        }
    });
}