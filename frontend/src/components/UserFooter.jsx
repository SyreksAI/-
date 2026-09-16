import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

function UserFooter() {
  const { user, isAuthenticated } = useAuth();
  const displayName = user?.name?.trim() || user?.username?.trim();

  if (isAuthenticated) {
    return (
      <>
        <img src="/user_logo_one.png" alt="user_logo_one" className="user_logo" />
        <div className="user-info">
          <Link to="/profile" className="username-link">
            <h3 className="username">{displayName || 'Профиль'}</h3>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <img src="/user_logo_one.png" alt="user_logo_one" className="user_logo" />
      <Link to="/login" className="username-link">
        <h3 className="username">Войти</h3>
      </Link>
    </>
  );
}

export default UserFooter;
