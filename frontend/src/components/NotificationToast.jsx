// frontend/src/components/NotificationToast.jsx
import React, { useState, useEffect } from 'react';

function NotificationToast({ message, type, duration = 5000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
    subscription: 'fa-user-plus',
    message: 'fa-comment'
  };

  const colors = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    subscription: '#7c3aed',
    message: '#3b82f6'
  };

  return (
    <div 
      className={`notification-toast ${isVisible ? 'show' : 'hide'}`}
      style={{ borderLeft: `4px solid ${colors[type] || colors.info}` }}
    >
      <div className="notification-toast-icon">
        <i className={`fas ${icons[type] || icons.info}`} style={{ color: colors[type] || colors.info }}></i>
      </div>
      <div className="notification-toast-content">
        <div className="notification-toast-message">{message}</div>
      </div>
      <button className="notification-toast-close" onClick={() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }}>
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
}

export default NotificationToast;