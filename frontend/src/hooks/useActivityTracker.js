import { useEffect, useRef } from 'react';
import { post } from '../utils/api';
import { useAuth } from '../context/AuthProvider';

function useActivityTracker() {
  const { user } = useAuth();
  const pingIntervalRef = useRef(null);
  const isPingingRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Функция отправки PING
    const sendPing = async () => {
      if (isPingingRef.current) return;
      isPingingRef.current = true;

      try {
        await post('/api/users/ping', {});
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Ping error:', error);
        }
      } finally {
        isPingingRef.current = false;
      }
    };

    pingIntervalRef.current = setInterval(sendPing, 90000);

    // Очистка при размонтировании
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [user?.id]);

  return null;
}

export default useActivityTracker;