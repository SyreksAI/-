const API_URL = '/api';

async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    // Для отладки
    console.log(`📡 ${options.method || 'GET'} ${endpoint} -> Status: ${response.status}`);
    
    if (!response.ok) {
        const error = await response.json();
        console.error('❌ API Error:', error);
        throw new Error(error.detail || JSON.stringify(error) || 'Ошибка запроса');
    }
    
    return response.json();
}

// Auth API
export const authAPI = {
    register: (data) => {
        console.log('📤 Register API called with:', data);
        return fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    login: (data) => fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    
    me: (token) => fetchAPI('/auth/me?token=' + token, {
        method: 'GET'
    })
};