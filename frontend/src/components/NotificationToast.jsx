// frontend/src/components/NotificationToast.jsx
import React, { useCallback, useEffect, useState } from 'react';

const EXIT_ANIMATION_MS = 400;

const NotificationToast = ({ message, type = 'info', duration = 4000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  const dismiss = useCallback(() => {
    setIsExiting(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  useEffect(() => {
    if (!isExiting) return undefined;

    const timer = setTimeout(() => {
      onClose?.();
    }, EXIT_ANIMATION_MS);

    return () => clearTimeout(timer);
  }, [isExiting, onClose]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          background: '#f0fdf4',
          borderColor: '#22c55e',
          color: '#166534',
          label: 'Успешно',
        };
      case 'error':
        return {
          background: '#fef2f2',
          borderColor: '#ef4444',
          color: '#991b1b',
          label: 'Ошибка',
        };
      case 'warning':
        return {
          background: '#fffbeb',
          borderColor: '#f59e0b',
          color: '#92400e',
          label: 'Внимание',
        };
      case 'subscription':
        return {
          background: '#ede9fe',
          borderColor: '#7c3aed',
          color: '#5b21b6',
          label: 'Подписка',
        };
      case 'message':
        return {
          background: '#eff6ff',
          borderColor: '#3b82f6',
          color: '#1e40af',
          label: 'Сообщение',
        };
      default:
        return {
          background: '#f1f5f9',
          borderColor: '#64748b',
          color: '#1e293b',
          label: 'Информация',
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      className={`notification-toast notification-toast--slide ${isExiting ? 'exiting' : ''}`}
      style={{
        padding: '14px 20px',
        marginBottom: '10px',
        borderRadius: '12px',
        background: styles.background,
        borderLeft: `4px solid ${styles.borderColor}`,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        minWidth: '320px',
        maxWidth: '450px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: styles.borderColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '2px',
          }}
        >
          {styles.label}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: styles.color,
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {message}
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '18px',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '6px',
          transition: '0.2s',
          flexShrink: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f1f5f9';
          e.currentTarget.style.color = '#475569';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.color = '#94a3b8';
        }}
        aria-label="Закрыть уведомление"
      >
        ✕
      </button>
    </div>
  );
};

export default NotificationToast;
