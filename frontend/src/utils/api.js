// src/utils/api.js

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
      throw new Error(data.detail || data.message || 'Ошибка запроса');
    }
    
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


