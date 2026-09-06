// src/utils/api.js

// Глобальный счётчик попыток
let banAttempts = 0;
const MAX_BAN_ATTEMPTS = 5;

/**
 * Безопасный fetch-запрос с обработкой ошибок
 * @param {string} url - URL запроса
 * @param {object} options - Опции fetch
 * @returns {Promise<any>} - Данные ответа
 */
export const safeFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    
    // Проверяем Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ Не JSON ответ:', text.substring(0, 200));
      throw new Error(`Сервер вернул ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      const status = response.status;
      const message = data.detail || data.message || 'Ошибка запроса';
      
      // ✅ ОБРАБОТКА БЛОКИРОВКИ (403) С СЧЁТЧИКОМ
      if (status === 403 && (
        message.includes('забанен') || 
        message.includes('заблокирован') ||
        message.toLowerCase().includes('banned')
      )) {
        // Увеличиваем счётчик
        banAttempts++;
        const remaining = MAX_BAN_ATTEMPTS - banAttempts;
        
        // Показываем предупреждение
        if (remaining > 0) {
          alert(`⛔ Ваш аккаунт заблокирован! Осталось ${remaining} попыток до выхода.`);
        }
        
        // Если достигнут лимит — принудительный выход
        if (banAttempts >= MAX_BAN_ATTEMPTS) {
          alert('⛔ Превышен лимит попыток. Вы будете перенаправлены на страницу входа.');
          localStorage.removeItem('currentUser');
          localStorage.removeItem('adminSession');
          window.location.href = '/login';
          return;
        }
        
        throw new Error(message);
      }
      
      // Обработка 401 (неавторизован)
      if (status === 401) {
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login') && 
            !currentPath.includes('/register') && 
            !currentPath.includes('/admin/login')) {
          localStorage.removeItem('currentUser');
          localStorage.removeItem('adminSession');
          window.location.href = '/login';
        }
        throw new Error(message);
      }
      
      throw new Error(message);
    }
    
    // ✅ Сбрасываем счётчик при успешном запросе
    banAttempts = 0;
    return data;
  } catch (error) {
    console.error('❌ Fetch error:', error);
    throw error;
  }
};

/**
 * GET запрос
 */
export const get = (url, headers = {}) => {
  return safeFetch(url, { 
    method: 'GET', 
    headers: { 'Content-Type': 'application/json', ...headers } 
  });
};

/**
 * POST запрос
 */
export const post = (url, data, headers = {}) => {
  return safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data)
  });
};

/**
 * PUT запрос
 */
export const put = (url, data, headers = {}) => {
  return safeFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data)
  });
};

/**
 * DELETE запрос
 */
export const del = (url, headers = {}) => {
  return safeFetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers }
  });
};

// ============================================================
// 🆕 API ДЛЯ АУТЕНТИФИКАЦИИ (с reCAPTCHA)
// ============================================================

/**
 * API для авторизации и регистрации
 */
export const authAPI = {
  /**
   * Регистрация нового пользователя
   * @param {Object} data - Данные пользователя
   * @param {string} data.name - Имя
   * @param {string} data.username - Имя пользователя
   * @param {string} data.email - Email
   * @param {string} data.password - Пароль
   * @param {string} data.recaptcha_token - Токен reCAPTCHA (обязательно!)
   * @returns {Promise<Object>} - Данные пользователя и токен
   */
  register: async (data) => {
    return post('/api/auth/register', data);
  },

  /**
   * Вход в систему
   * @param {Object} data - Данные для входа
   * @param {string} data.email - Email или username
   * @param {string} data.password - Пароль
   * @returns {Promise<Object>} - Данные пользователя и токен
   */
  login: async (data) => {
    return post('/api/auth/login', data);
  },

  /**
   * Проверка текущего пользователя
   * @param {number} userId - ID пользователя
   * @returns {Promise<Object>} - Данные пользователя
   */
  getCurrentUser: async (userId) => {
    return get(`/api/users/${userId}`, {
      'X-User-ID': String(userId)
    });
  },

  /**
   * Обновление профиля пользователя
   * @param {number} userId - ID пользователя
   * @param {Object} data - Данные для обновления
   * @returns {Promise<Object>} - Обновлённые данные
   */
  updateUser: async (userId, data) => {
    return put(`/api/users/${userId}`, data, {
      'X-User-ID': String(userId)
    });
  },

  /**
   * Обновление онлайн-статуса (ping)
   * @param {number} userId - ID пользователя
   * @returns {Promise<Object>} - Статус
   */
  ping: async (userId) => {
    return post('/api/users/ping', {}, {
      'X-User-ID': String(userId)
    });
  }
};