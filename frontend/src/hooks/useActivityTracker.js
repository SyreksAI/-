import { useEffect, useRef } from 'react';
import { post } from '../utils/api';

function useActivityTracker() {
  const pingIntervalRef = useRef(null);
  const isPingingRef = useRef(false);

  useEffect(() => {
    let currentUser = null;
    try {
      const raw = localStorage.getItem('currentUser');
      currentUser = raw ? JSON.parse(raw) : null;
    } catch {
      currentUser = null;
    }
    
    if (!currentUser) {
      console.log('❌ Пользователь не авторизован, активность не отслеживается');
      return;
    }

    // Функция отправки PING
    const sendPing = async () => {
      if (isPingingRef.current) return;
      isPingingRef.current = true;

      try {
        await post('/api/users/ping', {}, {
          'X-User-ID': String(currentUser.id)
        });
        console.log('🟢 PING отправлен');
      } catch (error) {
        console.error('❌ Ошибка отправки PING:', error);
      } finally {
        isPingingRef.current = false;
      }
    };

    // Отправляем PING сразу при загрузке страницы
    sendPing();

    // Отправляем PING каждые 30 секунд
    pingIntervalRef.current = setInterval(sendPing, 30000);

    // Очистка при размонтировании
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, []);

  return null;
}

export default useActivityTracker;