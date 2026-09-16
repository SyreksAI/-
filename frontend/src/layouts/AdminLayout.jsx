import React from 'react';

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthProvider';

import NotificationToast from '../components/NotificationToast';



const NAV_ITEMS = [

  { to: '/', label: 'На главную', icon: 'fa-home' },

  { to: '/admin', label: 'Управление темами', icon: 'fa-book', end: true },

  { to: '/admin/users', label: 'Пользователи', icon: 'fa-users' },

  { to: '/admin/audit', label: 'Аудит', icon: 'fa-clipboard-list' },

  { to: '/admin/stats', label: 'Статистика', icon: 'fa-chart-bar' },

  { to: '/admin/settings', label: 'Настройки', icon: 'fa-sliders-h' },

  { to: '/admin/support', label: 'Поддержка', icon: 'fa-headset' },

];



export default function AdminLayout() {

  const { user, logout, toast, clearToast } = useAuth();

  const navigate = useNavigate();



  const handleLogout = async () => {

    await logout();

    navigate('/login');

  };



  return (

    <div className="admin-container">

      <aside className="admin-sidebar">

        <div className="header">

          <img className="logo" src="/logo.png" alt="logo" />

        </div>

        <div className="admin-menu">

          <div className="admin-menu-title">Навигация</div>

          {NAV_ITEMS.map((item) =>

            item.to === '/' ? (

              <Link key={item.to} to={item.to} className="admin-menu-item">

                <i className={`fas ${item.icon}`} /> {item.label}

              </Link>

            ) : (

              <NavLink

                key={item.to}

                to={item.to}

                end={item.end}

                className={({ isActive }) => (isActive ? 'admin-menu-item active' : 'admin-menu-item')}

              >

                <i className={`fas ${item.icon}`} /> {item.label}

              </NavLink>

            )

          )}

          <button type="button" className="admin-menu-item logout" onClick={handleLogout}>

            <i className="fas fa-sign-out-alt" /> Выйти из админки

          </button>

        </div>

        <div className="footer">

          <img src="/user_logo_one.png" alt="user" className="user_logo" />

          <h3 className="username">{user?.name || user?.username || 'Admin'}</h3>

        </div>

      </aside>

      <div className="admin-content">

        <Outlet />

      </div>

      {toast && (
        <div className="notification-container">
          <NotificationToast
            message={toast.message}
            type={toast.type}
            onClose={clearToast}
          />
        </div>
      )}

    </div>

  );

}

