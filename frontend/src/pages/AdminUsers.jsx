import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { get, put, del } from '../utils/api';
import websocketService from '../services/websocket';

function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '' });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ===== ПРОВЕРКА СЕССИИ АДМИНА =====
  useEffect(() => {
    const adminSession = JSON.parse(localStorage.getItem('adminSession'));
    if (!adminSession || !adminSession.loggedIn) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ИЗ API =====
  const loadUsers = async () => {
    setLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const data = await get('/api/users/', {
        'X-User-ID': String(currentUser.id)
      });
      setUsers(data);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // ===== WEBSOCKET ДЛЯ ОБНОВЛЕНИЯ СТАТУСОВ =====
  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser) {
      // Подключаем WebSocket если ещё не подключён
      if (!websocketService.isConnected) {
        websocketService.connect(currentUser.id);
      }
    }

    const handleStatusUpdate = (data) => {
      // Обновляем при любом изменении статуса
      if (data.type === 'user_status_changed' || 
          data.type === 'connection_status' ||
          data.type === 'new_message') {
        loadUsers();
      }
    };

    // Подписываемся на сообщения
    if (typeof websocketService.onMessage === 'function') {
      const unsubscribe = websocketService.onMessage(handleStatusUpdate);
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  // ===== ОБНОВЛЕНИЕ КАЖДЫЕ 10 СЕКУНД (запасной вариант) =====
  useEffect(() => {
    const interval = setInterval(() => {
      loadUsers();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // ===== ФИЛЬТРАЦИЯ =====
  const filteredUsers = users.filter(user => {
    const matchSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'all' || user.role === roleFilter;
    const matchStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && !user.is_banned) ||
      (statusFilter === 'blocked' && user.is_banned);
    return matchSearch && matchRole && matchStatus;
  });

  // ===== СТАТИСТИКА =====
  const stats = {
    total: users.length,
    online: users.filter(u => u.is_online && !u.is_banned).length,
    blocked: users.filter(u => u.is_banned).length,
    admins: users.filter(u => u.role === 'admin').length,
    students: users.filter(u => u.role === 'student' || !u.role).length,
  };

  // ===== РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ =====
  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'student'
    });
    setShowEditModal(true);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      await put(`/api/users/${selectedUser.id}`, editForm, {
        'X-User-ID': String(currentUser.id)
      });
      setUsers(prev => prev.map(u =>
        u.id === selectedUser.id ? { ...u, ...editForm } : u
      ));
      setShowEditModal(false);
      alert('✅ Пользователь обновлён!');
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      alert('❌ Ошибка обновления пользователя');
    }
  };

  // ===== БЛОКИРОВКА/РАЗБЛОКИРОВКА =====
  const handleToggleBan = async (user) => {
    if (!window.confirm(`Вы уверены, что хотите ${user.is_banned ? 'разблокировать' : 'заблокировать'} пользователя "${user.name}"?`)) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      await put(`/api/users/${user.id}/toggle-ban`, {}, {
        'X-User-ID': String(currentUser.id)
      });
      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, is_banned: !u.is_banned } : u
      ));
      alert(`✅ Пользователь ${user.is_banned ? 'разблокирован' : 'заблокирован'}!`);
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      alert('❌ Ошибка изменения статуса');
    }
  };

  // ===== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ =====
  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Вы уверены, что хотите удалить пользователя "${user.name}"? Это действие необратимо!`)) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      await del(`/api/users/${user.id}`, {
        'X-User-ID': String(currentUser.id)
      });
      setUsers(prev => prev.filter(u => u.id !== user.id));
      alert('✅ Пользователь удалён!');
    } catch (error) {
      console.error('Ошибка удаления пользователя:', error);
      alert('❌ Ошибка удаления пользователя');
    }
  };

  // ===== БУЛК-ДЕЙСТВИЯ =====
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUsers(filteredUsers.map(u => u.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter(sid => sid !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  const handleBlockSelected = async () => {
    if (!selectedUsers.length) return;
    if (!window.confirm(`Заблокировать ${selectedUsers.length} пользователей?`)) return;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    for (const id of selectedUsers) {
      try {
        await put(`/api/users/${id}/toggle-ban`, {}, {
          'X-User-ID': String(currentUser.id)
        });
        setUsers(prev => prev.map(u =>
          u.id === id ? { ...u, is_banned: true } : u
        ));
      } catch (error) {
        console.error('Ошибка блокировки:', error);
      }
    }
    setSelectedUsers([]);
    alert('✅ Пользователи заблокированы!');
  };

  const handleUnblockSelected = async () => {
    if (!selectedUsers.length) return;
    if (!window.confirm(`Разблокировать ${selectedUsers.length} пользователей?`)) return;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    for (const id of selectedUsers) {
      try {
        await put(`/api/users/${id}/toggle-ban`, {}, {
          'X-User-ID': String(currentUser.id)
        });
        setUsers(prev => prev.map(u =>
          u.id === id ? { ...u, is_banned: false } : u
        ));
      } catch (error) {
        console.error('Ошибка разблокировки:', error);
      }
    }
    setSelectedUsers([]);
    alert('✅ Пользователи разблокированы!');
  };

  const handleDeleteSelected = async () => {
    if (!selectedUsers.length) return;
    if (!window.confirm(`Удалить ${selectedUsers.length} пользователей?`)) return;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    for (const id of selectedUsers) {
      try {
        await del(`/api/users/${id}`, {
          'X-User-ID': String(currentUser.id)
        });
        setUsers(prev => prev.filter(u => u.id !== id));
      } catch (error) {
        console.error('Ошибка удаления:', error);
      }
    }
    setSelectedUsers([]);
    alert('✅ Пользователи удалены!');
  };

  // ===== ВЫХОД =====
  const handleAdminLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти из админ-панели?')) {
      localStorage.removeItem('adminSession');
      navigate('/admin/login');
    }
  };

  // ===== ПОЛУЧИТЬ БЕЙДЖ РОЛИ =====
  const getRoleBadge = (role) => {
    if (role === 'admin') return <span className="role-badge admin">👑 Админ</span>;
    return <span className="role-badge student">🎓 Студент</span>;
  };

  // ===== ПОЛУЧИТЬ СТАТУС =====
  const getStatusBadge = (user) => {
    if (user.is_banned) return <span className="status-badge blocked">⛔ Заблокирован</span>;
    if (user.is_online) return <span className="status-badge online">🟢 Онлайн</span>;
    return <span className="status-badge offline">⚪ Офлайн</span>;
  };

  // ===== ФОРМАТ ДАТЫ =====
  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-sidebar">
          <div className="header"><img className="logo" src="/logo.png" alt="logo" /></div>
          <div className="admin-menu">
            <div className="admin-menu-title">Навигация</div>
            <Link to="/" className="admin-menu-item"><i className="fas fa-home"></i> На главную</Link>
            <Link to="/admin" className="admin-menu-item"><i className="fas fa-book"></i> Управление темами</Link>
            <Link to="/admin/users" className="admin-menu-item active"><i className="fas fa-users"></i> Пользователи</Link>
            <Link to="/admin/settings" className="admin-menu-item"><i className="fas fa-sliders-h"></i> Настройки</Link>
            <div className="admin-menu-divider"></div>
            <button className="admin-menu-item logout" onClick={handleAdminLogout}><i className="fas fa-sign-out-alt"></i> Выйти из админки</button>
          </div>
          <div className="footer"><img src="/user_logo_one.png" alt="user" className="user_logo" /><h3 className="username">Admin</h3></div>
        </div>
        <div className="admin-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ textAlign: 'center' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed' }}></i><p style={{ color: '#94a3b8', marginTop: '12px' }}>Загрузка пользователей...</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-sidebar">
        <div className="header"><img className="logo" src="/logo.png" alt="logo" /></div>
        <div className="admin-menu">
          <div className="admin-menu-title">Навигация</div>
          <Link to="/" className="admin-menu-item"><i className="fas fa-home"></i> На главную</Link>
          <Link to="/admin" className="admin-menu-item"><i className="fas fa-book"></i> Управление темами</Link>
          <Link to="/admin/users" className="admin-menu-item active"><i className="fas fa-users"></i> Пользователи</Link>
          <Link to="/admin/support" className="admin-menu-item"><i className="fas fa-headset"></i> Поддержка</Link>
          <Link to="/admin/settings" className="admin-menu-item"><i className="fas fa-sliders-h"></i> Настройки</Link>
          <div className="admin-menu-divider"></div>
          <button className="admin-menu-item logout" onClick={handleAdminLogout}><i className="fas fa-sign-out-alt"></i> Выйти из админки</button>
        </div>
        <div className="footer"><img src="/user_logo_one.png" alt="user" className="user_logo" /><h3 className="username">Admin</h3></div>
      </div>

      <div className="admin-content">
        <div className="admin-header">
          <div>
            <h1><i className="fas fa-users"></i> Список пользователей</h1>
            <p className="admin-subtitle">Управление пользователями платформы</p>
          </div>
          <button className="btn-submit" onClick={loadUsers}>
            <i className="fas fa-sync"></i> Обновить
          </button>
        </div>

        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-icon users"><i className="fas fa-users"></i></div>
            <div className="stat-info">
              <span className="stat-number">{stats.total}</span>
              <span className="stat-label">Всего пользователей</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon active"><i className="fas fa-user-check"></i></div>
            <div className="stat-info">
              <span className="stat-number">{stats.online}</span>
              <span className="stat-label">Онлайн</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blocked"><i className="fas fa-user-lock"></i></div>
            <div className="stat-info">
              <span className="stat-number">{stats.blocked}</span>
              <span className="stat-label">Заблокированных</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon new"><i className="fas fa-user-shield"></i></div>
            <div className="stat-info">
              <span className="stat-number">{stats.admins}</span>
              <span className="stat-label">Администраторов</span>
            </div>
          </div>
        </div>

        <div className="admin-toolbar">
          <div className="admin-filters">
            <div className="admin-search-container">
              <i className="fas fa-search admin-search-icon"></i>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Поиск по имени, email или username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="admin-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">Все роли</option>
              <option value="admin">👑 Администраторы</option>
              <option value="student">🎓 Студенты</option>
            </select>
            <select
              className="admin-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Все статусы</option>
              <option value="active">🟢 Активные</option>
              <option value="blocked">⛔ Заблокированные</option>
            </select>
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="admin-bulk-actions">
            <span className="bulk-count">Выбрано: <span>{selectedUsers.length}</span></span>
            <button className="btn-bulk block" onClick={handleBlockSelected}>
              <i className="fas fa-lock"></i> Заблокировать
            </button>
            <button className="btn-bulk unblock" onClick={handleUnblockSelected}>
              <i className="fas fa-unlock"></i> Разблокировать
            </button>
            <button className="btn-bulk delete" onClick={handleDeleteSelected}>
              <i className="fas fa-trash"></i> Удалить
            </button>
          </div>
        )}

        <div className="admin-list-wrapper">
          <div className="list-header">
            <h2><i className="fas fa-list"></i> Список пользователей</h2>
            <span className="list-count">{filteredUsers.length} пользователей</span>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th className="col-checkbox">
                    <input type="checkbox" onChange={handleSelectAll} checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length} />
                  </th>
                  <th>#</th>
                  <th>Пользователь</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Дата рег.</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Пользователи не найдены</td></tr>
                ) : (
                  filteredUsers.map((user, index) => (
                    <tr key={user.id} className={selectedUsers.includes(user.id) ? 'selected' : ''}>
                      <td className="col-checkbox">
                        <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => handleSelectOne(user.id)} />
                      </td>
                      <td className="col-id">{index + 1}</td>
                      <td className="col-title">
                        <span className="user-name">{user.name}</span>
                        <span className="user-last-active">@{user.username}</span>
                      </td>
                      <td className="col-email">{user.email || '—'}</td>
                      <td className="col-role">{getRoleBadge(user.role)}</td>
                      <td className="col-status">{getStatusBadge(user)}</td>
                      <td className="col-date">{user.registered || '—'}</td>
                      <td className="col-actions">
                        <button className="btn-edit-user" onClick={() => handleEditUser(user)} title="Редактировать">
                          <i className="fas fa-pen"></i>
                        </button>
                        <button className="btn-block-toggle" onClick={() => handleToggleBan(user)} title={user.is_banned ? 'Разблокировать' : 'Заблокировать'}>
                          <i className={`fas ${user.is_banned ? 'fa-unlock' : 'fa-lock'}`}></i>
                        </button>
                        <button className="btn-delete-small" onClick={() => handleDeleteUser(user)} title="Удалить">
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showEditModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-pen"></i> Редактировать пользователя</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Имя</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Роль</label>
                <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="student">Студент</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowEditModal(false)}>Отмена</button>
              <button className="btn-submit" onClick={handleSaveUser}><i className="fas fa-save"></i> Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;