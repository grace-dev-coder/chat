const API_URL = 'https://chat-backend-ui3c.onrender.com';

class API {
    static async request(endpoint, options = {}) {
        const url = `${API_URL}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || 'Something went wrong');
            }
            
            return data;
        } catch (error) {
            throw error;
        }
    }

    static async register(name, email, password) {
        return this.request('/register', {
            method: 'POST',
            body: { name, email, password }
        });
    }

    static async login(email, password) {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/token`, {
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

        return response.json();
    }

    static async logout() {
        return this.request('/logout', { method: 'POST' });
    }

    static async getUsers(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return this.request(`/users${query}`);
    }

    static async getConversations() {
        return this.request('/conversations');
    }

    static async getMessages(userId) {
        return this.request(`/messages/${userId}`);
    }

    static async sendMessage(receiverId, content) {
        return this.request('/messages', {
            method: 'POST',
            body: { receiver_id: receiverId, content }
        });
    }

    static async getCurrentUser() {
        return this.request('/users/me');
    }
}
