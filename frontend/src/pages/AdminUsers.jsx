import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminUsers() {
  const navigate = useNavigate();

  // ===== ДАННЫЕ =====
  const [users, setUsers] = useState([
    { 
      id: 1, 
      name: 'Алексей Иванов', 
      email: 'alex@example.com', 
      role: 'admin', 
      status: 'active', 
      registered: '2024-01-15',
      languages: [
        { name: 'Python', progress: 80 },
        { name: 'Docker', progress: 60 },
        { name: 'C++', progress: 30 }
      ]
    },
    { 
      id: 2, 
      name: 'Мария Петрова', 
      email: 'maria@example.com', 
      role: 'student', 
      status: 'active', 
      registered: '2024-02-20',
      languages: [
        { name: 'Python', progress: 95 },
        { name: 'C++', progress: 85 },
        { name: 'C#', progress: 70 }
      ]
    },
    { 
      id: 3, 
      name: 'Дмитрий Сидоров', 
      email: 'dmitry@example.com', 
      role: 'student', 
      status: 'blocked', 
      registered: '2024-03-10',
      languages: [
        { name: 'Python', progress: 20 }
      ]
    },
    { 
      id: 4, 
      name: 'Елена Козлова', 
      email: 'elena@example.com', 
      role: 'student', 
      status: 'active', 
      registered: '2024-04-05',
      languages: [
        { name: 'C++', progress: 50 },
        { name: 'C#', progress: 45 },
        { name: 'Docker', progress: 30 }
      ]
    },
    { 
      id: 5, 
      name: 'Сергей Новиков', 
      email: 'sergey@example.com', 
      role: 'admin', 
      status: 'active', 
      registered: '2024-05-12',
      languages: [
        { name: 'Python', progress: 100 },
        { name: 'C++', progress: 100 },
        { name: 'C#', progress: 100 },
        { name: 'Docker', progress: 100 }
      ]
    },
    { 
      id: 6, 
      name: 'Анна Смирнова', 
      email: 'anna@example.com', 
      role: 'student', 
      status: 'active', 
      registered: '2024-05-25',
      languages: [
        { name: 'JavaScript', progress: 30 }
      ]
    },
    { 
      id: 7, 
      name: 'Павел Фёдоров', 
      email: 'pavel@example.com', 
      role: 'student', 
      status: 'blocked', 
      registered: '2024-06-01',
      languages: [
        { name: 'C#', progress: 15 },
        { name: 'Docker', progress: 10 }
      ]
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserForModal, setSelectedUserForModal] = useState(null);

  // ===== НОВЫЙ ПОЛЬЗОВАТЕЛЬ =====
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'student',
    status: 'active',
    languages: []
  });

  // ===== ЦВЕТА ДЛЯ ЯЗЫКОВ =====
  const getLanguageColor = (lang) => {
    const colors = {
      'Python': '#3776AB',
      'C++': '#00599C',
      'C#': '#239120',
      'Docker': '#2496ED',
      'JavaScript': '#F7DF1E',
      'Java': '#007396',
      'PHP': '#777BB4',
      'Go': '#00ADD8',
      'Rust': '#DEA584',
      'TypeScript': '#3178C6'
    };
    return colors[lang] || '#7c3aed';
  };

  const getLanguageIcon = (lang) => {
    const icons = {
      'Python': 'fab fa-python',
      'C++': 'fas fa-code',
      'C#': 'fas fa-shield-alt',
      'Docker': 'fab fa-docker',
      'JavaScript': 'fab fa-js-square',
      'Java': 'fab fa-java',
      'PHP': 'fab fa-php',
      'Go': 'fas fa-code',
      'Rust': 'fas fa-cog',
      'TypeScript': 'fab fa-js-square'
    };
    return icons[lang] || 'fas fa-code';
  };

  // ===== СТАТИСТИКА ПО ЯЗЫКАМ =====
  const languageStats = () => {
    const stats = {};
    users.forEach(user => {
      user.languages.forEach(lang => {
        stats[lang.name] = (stats[lang.name] || 0) + 1;
      });
    });
    const total = users.length;
    return Object.entries(stats)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  };

  const languageData = languageStats();
  const totalUsers = users.length;

  // ===== ФИЛЬТРАЦИЯ =====
  const filteredUsers = users.filter(user => {
    const matchSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'all' || user.role === roleFilter;
    const matchStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // ===== СТАТИСТИКА =====
  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    blocked: users.filter(u => u.status === 'blocked').length,
    admins: users.filter(u => u.role === 'admin').length,
    students: users.filter(u => u.role === 'student').length,
    newThisMonth: users.filter(u => {
      const date = new Date(u.registered);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length
  };

  // ===== РАСЧЁТ ОБЩЕГО ПРОГРЕССА =====
  const getTotalProgress = (languages) => {
    if (!languages || languages.length === 0) return 0;
    const total = languages.reduce((sum, lang) => sum + lang.progress, 0);
    return Math.round(total / languages.length);
  };

  // ===== CRUD =====
  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim()) {
      alert('Заполните имя и email');
      return;
    }
    setUsers([...users, {
      id: Date.now(),
      ...newUser,
      registered: new Date().toISOString().split('T')[0],
      languages: []
    }]);
    setNewUser({ name: '', email: '', role: 'student', status: 'active', languages: [] });
    setShowAddForm(false);
  };

  const handleDeleteUser = (id) => {
    if (window.confirm('Удалить пользователя?')) {
      setUsers(users.filter(u => u.id !== id));
      setSelectedUsers(selectedUsers.filter(sid => sid !== id));
    }
  };

  const handleBlockUser = (id) => {
    setUsers(users.map(u =>
      u.id === id ? { ...u, status: u.status === 'blocked' ? 'active' : 'blocked' } : u
    ));
  };

  const handleRoleToggle = (id) => {
    setUsers(users.map(u =>
      u.id === id ? { ...u, role: u.role === 'admin' ? 'student' : 'admin' } : u
    ));
  };

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

  const handleDeleteSelected = () => {
    if (!selectedUsers.length) return;
    if (window.confirm(`Удалить ${selectedUsers.length} пользователей?`)) {
      setUsers(users.filter(u => !selectedUsers.includes(u.id)));
      setSelectedUsers([]);
    }
  };

  const handleBlockSelected = () => {
    if (!selectedUsers.length) return;
    if (window.confirm(`Заблокировать ${selectedUsers.length} пользователей?`)) {
      setUsers(users.map(u =>
        selectedUsers.includes(u.id) ? { ...u, status: 'blocked' } : u
      ));
      setSelectedUsers([]);
    }
  };

  const handleUnblockSelected = () => {
    if (!selectedUsers.length) return;
    if (window.confirm(`Разблокировать ${selectedUsers.length} пользователей?`)) {
      setUsers(users.map(u =>
        selectedUsers.includes(u.id) ? { ...u, status: 'active' } : u
      ));
      setSelectedUsers([]);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      languages: user.languages || []
    });
    setShowAddForm(true);
  };

  // ===== ЭКСПОРТ =====
  const exportCSV = () => {
    const headers = ['Имя', 'Email', 'Роль', 'Статус', 'Языки', 'Прогресс', 'Дата регистрации'];
    const rows = filteredUsers.map(u => [
      u.name, 
      u.email, 
      u.role, 
      u.status, 
      u.languages.map(l => l.name).join(', '),
      getTotalProgress(u.languages) + '%',
      u.registered
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== МОДАЛЬНОЕ ОКНО =====
  const openProgressModal = (user) => {
    setSelectedUserForModal(user);
  };

  const closeProgressModal = () => {
    setSelectedUserForModal(null);
  };

  return (
    <div className="admin-container">
      {/* SIDEBAR */}
      <div className="admin-sidebar">
        <div className="header">
          <img className="logo" src="/logo.png" alt="logo" />
        </div>
        <div className="admin-menu">
          <div className="admin-menu-title">Навигация</div>
          <Link to="/" className="admin-menu-item">
            <i className="fas fa-home"></i> На главную
          </Link>
          <Link to="/admin" className="admin-menu-item">
            <i className="fas fa-book"></i> Управление темами
          </Link>
          <Link to="/admin/users" className="admin-menu-item active">
            <i className="fas fa-users"></i> Пользователи
          </Link>
          <Link to="/admin/settings" className="admin-menu-item">
            <i className="fas fa-sliders-h"></i> Настройки
          </Link>
        </div>
        <div className="footer">
          <img src="/public/user_logo_one.png" alt="user_logo_one" className="user_logo" />
          <h3 className="username">Костя</h3>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="admin-content">
        {/* HEADER */}
        <div className="admin-header">
          <div>
            <h1><i className="fas fa-users"></i> Управление пользователями</h1>
            <p className="admin-subtitle">Управляй студентами и администраторами платформы</p>
          </div>
          <button className="btn-back" onClick={() => navigate('/admin')} type="button">
            <i className="fas fa-arrow-left"></i> Назад
          </button>
        </div>

        {/* STATS */}
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
              <span className="stat-number">{stats.active}</span>
              <span className="stat-label">Активных</span>
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
            <div className="stat-icon new"><i className="fas fa-user-plus"></i></div>
            <div className="stat-info">
              <span className="stat-number">{stats.newThisMonth}</span>
              <span className="stat-label">Новых за месяц</span>
            </div>
          </div>
        </div>

        {/* LANGUAGE STATISTICS */}
        {languageData.length > 0 && (
          <div className="language-stats">
            <div className="language-stats-header">
              <h3><i className="fas fa-code"></i> Популярность языков программирования</h3>
              <span className="language-stats-count">{totalUsers} пользователей</span>
            </div>
            <div className="language-bars">
              {languageData.map((lang, index) => (
                <div key={index} className="language-bar-item">
                  <div className="language-bar-label">
                    <i className={getLanguageIcon(lang.name)} style={{ color: getLanguageColor(lang.name) }}></i>
                    <span className="language-name">{lang.name}</span>
                    <span className="language-count">{lang.count} чел.</span>
                  </div>
                  <div className="language-bar-track">
                    <div 
                      className="language-bar-fill"
                      style={{ 
                        width: `${lang.percentage}%`,
                        background: getLanguageColor(lang.name)
                      }}
                    >
                      <span className="language-bar-percent">{lang.percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOOLBAR */}
        <div className="admin-toolbar">
          <div className="admin-filters">
            <div className="admin-search-container">
              <i className="fas fa-search admin-search-icon"></i>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Поиск по имени или email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="admin-filter-select"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">Все роли</option>
              <option value="admin">👑 Администраторы</option>
              <option value="student">🎓 Студенты</option>
            </select>
            <select
              className="admin-filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Все статусы</option>
              <option value="active">🟢 Активные</option>
              <option value="blocked">🔴 Заблокированные</option>
            </select>
          </div>
          <div className="admin-toolbar-actions">
            <button className="btn-submit" onClick={() => {
              setEditingUser(null);
              setNewUser({ name: '', email: '', role: 'student', status: 'active', languages: [] });
              setShowAddForm(!showAddForm);
            }}>
              <i className="fas fa-plus"></i> Добавить
            </button>
            <button className="btn-export" onClick={exportCSV}>
              <i className="fas fa-file-export"></i> Экспорт CSV
            </button>
          </div>
        </div>

        {/* ADD/EDIT FORM */}
        {showAddForm && (
          <div className="admin-form-wrapper">
            <h3>
              <i className={`fas ${editingUser ? 'fa-pen' : 'fa-user-plus'}`}></i>
              {editingUser ? 'Редактировать пользователя' : 'Добавить пользователя'}
            </h3>
            <form className="admin-form" onSubmit={handleAddUser}>
              <div className="form-group">
                <label>Имя <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="Введите имя"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email <span className="required">*</span></label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Роль</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="student">🎓 Студент</option>
                  <option value="admin">👑 Администратор</option>
                </select>
              </div>
              <div className="form-group">
                <label>Статус</label>
                <select
                  value={newUser.status}
                  onChange={e => setNewUser({ ...newUser, status: e.target.value })}
                >
                  <option value="active">🟢 Активен</option>
                  <option value="blocked">🔴 Заблокирован</option>
                </select>
              </div>
              <div className="form-buttons">
                <button type="submit" className="btn-submit">
                  <i className="fas fa-save"></i> {editingUser ? 'Сохранить' : 'Добавить'}
                </button>
                <button type="button" className="btn-cancel" onClick={() => {
                  setShowAddForm(false);
                  setEditingUser(null);
                  setNewUser({ name: '', email: '', role: 'student', status: 'active', languages: [] });
                }}>
                  <i className="fas fa-times"></i> Отмена
                </button>
              </div>
            </form>
          </div>
        )}

        {/* BULK ACTIONS */}
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

        {/* USERS TABLE */}
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
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length}
                    />
                  </th>
                  <th>#</th>
                  <th>Пользователь</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Прогресс</th>
                  <th>Дата рег.</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => {
                  const totalProgress = getTotalProgress(user.languages);
                  return (
                    <tr key={user.id} className={selectedUsers.includes(user.id) ? 'selected' : ''}>
                      <td className="col-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => handleSelectOne(user.id)}
                        />
                      </td>
                      <td className="col-id">{index + 1}</td>
                      <td className="col-title">
                        <span className="user-name">{user.name}</span>
                        <span className="user-last-active">Роль: {user.role === 'admin' ? 'Администратор' : 'Студент'}</span>
                      </td>
                      <td className="col-email">{user.email}</td>
                      <td className="col-role">
                        <span className={`role-badge ${user.role}`}>
                          {user.role === 'admin' ? '👑 Админ' : '🎓 Студент'}
                        </span>
                      </td>
                      <td className="col-status">
                        <span 
                          className={`status-badge ${user.status}`}
                          onClick={() => handleBlockUser(user.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          {user.status === 'active' ? '🟢 Активен' : '🔴 Заблок.'}
                        </span>
                      </td>
                      <td className="col-progress">
                        <div 
                          className="progress-bar-multi"
                          onClick={() => openProgressModal(user)}
                          style={{ cursor: 'pointer' }}
                          title="Нажмите для просмотра деталей"
                        >
                          {user.languages && user.languages.length > 0 ? (
                            <>
                              {user.languages.map((lang, i) => {
                                const color = getLanguageColor(lang.name);
                                return (
                                  <div 
                                    key={i}
                                    className="progress-segment"
                                    style={{ 
                                      width: `${lang.progress}%`,
                                      background: color,
                                      borderRight: i < user.languages.length - 1 ? '2px solid #ffffff' : 'none'
                                    }}
                                  />
                                );
                              })}
                              <span className="progress-text">{totalProgress}%</span>
                            </>
                          ) : (
                            <span className="progress-text">0%</span>
                          )}
                        </div>
                      </td>
                      <td className="col-date">{user.registered}</td>
                      <td className="col-actions">
                        <button 
                          className="btn-edit-user"
                          onClick={() => handleEditUser(user)}
                          title="Редактировать"
                        >
                          <i className="fas fa-pen"></i>
                        </button>
                        <button 
                          className="btn-role-toggle"
                          onClick={() => handleRoleToggle(user.id)}
                          title="Сменить роль"
                        >
                          <i className="fas fa-exchange-alt"></i>
                        </button>
                        <button 
                          className="btn-block-toggle"
                          onClick={() => handleBlockUser(user.id)}
                          title={user.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
                        >
                          <i className={`fas ${user.status === 'active' ? 'fa-lock' : 'fa-unlock'}`}></i>
                        </button>
                        <button 
                          className="btn-delete-small" 
                          onClick={() => handleDeleteUser(user.id)} 
                          title="Удалить"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="empty-state">
                <i className="fas fa-users"></i>
                <p>Пользователи не найдены</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПРОГРЕССА */}
      {selectedUserForModal && (
        <div className="modal-overlay-progress" onClick={closeProgressModal}>
          <div className="modal-content-progress" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-progress">
              <h3>
                <i className="fas fa-chart-line"></i> 
                Прогресс: {selectedUserForModal.name}
              </h3>
              <button className="modal-close-progress" onClick={closeProgressModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body-progress">
              <div className="modal-user-info">
                <span className="modal-user-email">{selectedUserForModal.email}</span>
                <span className={`modal-user-status ${selectedUserForModal.status}`}>
                  {selectedUserForModal.status === 'active' ? '🟢 Активен' : '🔴 Заблокирован'}
                </span>
              </div>
              <div className="modal-progress-details">
                {selectedUserForModal.languages && selectedUserForModal.languages.length > 0 ? (
                  selectedUserForModal.languages.map((lang, i) => (
                    <div key={i} className="modal-progress-item">
                      <div className="modal-progress-label">
                        <i className={getLanguageIcon(lang.name)} style={{ color: getLanguageColor(lang.name) }}></i>
                        <span className="modal-progress-name">{lang.name}</span>
                        <span className="modal-progress-percent">{lang.progress}%</span>
                      </div>
                      <div className="modal-progress-track">
                        <div 
                          className="modal-progress-fill"
                          style={{ 
                            width: `${lang.progress}%`,
                            background: getLanguageColor(lang.name)
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="modal-empty-progress">
                    <i className="fas fa-book-open"></i>
                    <p>Пользователь ещё не начал изучение</p>
                  </div>
                )}
              </div>
              <div className="modal-progress-total">
                <span>Общий прогресс:</span>
                <strong>{getTotalProgress(selectedUserForModal.languages)}%</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;