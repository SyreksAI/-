import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, put, del } from '../utils/api';

function AdminSupport() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // ===== ПРОВЕРКА СЕССИИ АДМИНА =====
  useEffect(() => {
    const adminSession = JSON.parse(localStorage.getItem('adminSession'));
    if (!adminSession || !adminSession.loggedIn) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // ===== ЗАГРУЗКА ОБРАЩЕНИЙ =====
  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const url = filter === 'all' ? '/api/support/' : `/api/support/?status=${filter}`;
      const data = await get(url, {
        'X-User-ID': String(currentUser.id)
      });
      setRequests(data || []);
    } catch (error) {
      console.error('Ошибка загрузки обращений:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  // ===== ОБНОВЛЕНИЕ СТАТУСА =====
  const updateStatus = async (id, status) => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      await put(`/api/support/${id}`, { status }, {
        'X-User-ID': String(currentUser.id)
      });
      loadRequests();
      alert('✅ Статус обновлён!');
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      alert('❌ Ошибка обновления статуса');
    }
  };

  // ===== УДАЛЕНИЕ ОБРАЩЕНИЯ =====
  const deleteRequest = async (id) => {
    if (!window.confirm('Удалить обращение?')) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      await del(`/api/support/${id}`, {
        'X-User-ID': String(currentUser.id)
      });
      loadRequests();
      alert('✅ Обращение удалено!');
    } catch (error) {
      console.error('Ошибка удаления:', error);
      alert('❌ Ошибка удаления');
    }
  };

  // ===== ПРОСМОТР ОБРАЩЕНИЯ =====
  const openRequest = (req) => {
    setSelectedRequest(req);
    setShowModal(true);
  };

  // ===== СТАТУСЫ =====
  const getStatusBadge = (status) => {
    const badges = {
      'new': <span className="status-badge new">🆕 Новое</span>,
      'in_progress': <span className="status-badge progress">⏳ В работе</span>,
      'resolved': <span className="status-badge resolved">✅ Решено</span>,
      'closed': <span className="status-badge closed">🔒 Закрыто</span>
    };
    return badges[status] || badges['new'];
  };

  // ===== ВЫХОД =====
  const handleAdminLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти из админ-панели?')) {
      localStorage.removeItem('adminSession');
      navigate('/admin/login');
    }
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
            <Link to="/admin/users" className="admin-menu-item"><i className="fas fa-users"></i> Пользователи</Link>
            <Link to="/admin/support" className="admin-menu-item active"><i className="fas fa-headset"></i> Поддержка</Link>
            <Link to="/admin/settings" className="admin-menu-item"><i className="fas fa-sliders-h"></i> Настройки</Link>
            <div className="admin-menu-divider"></div>
            <button className="admin-menu-item logout" onClick={handleAdminLogout}>
              <i className="fas fa-sign-out-alt"></i> Выйти из админки
            </button>
          </div>
          <div className="footer"><img src="/user_logo_one.png" alt="user" className="user_logo" /><h3 className="username">Admin</h3></div>
        </div>
        <div className="admin-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed' }}></i>
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>Загрузка обращений...</p>
          </div>
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
          <Link to="/admin/users" className="admin-menu-item"><i className="fas fa-users"></i> Пользователи</Link>
          <Link to="/admin/support" className="admin-menu-item active"><i className="fas fa-headset"></i> Поддержка</Link>
          <Link to="/admin/settings" className="admin-menu-item"><i className="fas fa-sliders-h"></i> Настройки</Link>
          <div className="admin-menu-divider"></div>
          <button className="admin-menu-item logout" onClick={handleAdminLogout}>
            <i className="fas fa-sign-out-alt"></i> Выйти из админки
          </button>
        </div>
        <div className="footer"><img src="/user_logo_one.png" alt="user" className="user_logo" /><h3 className="username">Admin</h3></div>
      </div>

      <div className="admin-content">
        <div className="admin-header">
          <div>
            <h1><i className="fas fa-headset"></i> Обращения в поддержку</h1>
            <p className="admin-subtitle">Управление обращениями пользователей</p>
          </div>
        </div>

        <div className="admin-toolbar">
          <div className="admin-filters">
            <select
              className="admin-filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Все обращения</option>
              <option value="new">🆕 Новые</option>
              <option value="in_progress">⏳ В работе</option>
              <option value="resolved">✅ Решённые</option>
              <option value="closed">🔒 Закрытые</option>
            </select>
          </div>
          <div className="admin-toolbar-actions">
            <button className="btn-submit" onClick={loadRequests}>
              <i className="fas fa-sync"></i> Обновить
            </button>
          </div>
        </div>

        <div className="admin-list-wrapper">
          <div className="list-header">
            <h2><i className="fas fa-list"></i> Список обращений</h2>
            <span className="list-count">{requests.length} обращений</span>
          </div>

          <div className="table-responsive">
            {requests.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-inbox"></i>
                <p>Нет обращений</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Пользователь</th>
                    <th>Тема</th>
                    <th>Статус</th>
                    <th>Дата</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req, index) => (
                    <tr key={req.id} className={req.status === 'new' ? 'highlight-new' : ''}>
                      <td>{index + 1}</td>
                      <td>
                        <div>
                          <strong>{req.name}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{req.email}</div>
                        </div>
                      </td>
                      <td>
                        <span 
                          style={{ cursor: 'pointer', color: '#7c3aed' }}
                          onClick={() => openRequest(req)}
                        >
                          {req.subject}
                        </span>
                      </td>
                      <td>
                        <select
                          className="admin-filter-select"
                          value={req.status}
                          onChange={(e) => updateStatus(req.id, e.target.value)}
                          style={{ padding: '4px 8px', fontSize: '0.8rem', minWidth: '110px' }}
                        >
                          <option value="new">🆕 Новое</option>
                          <option value="in_progress">⏳ В работе</option>
                          <option value="resolved">✅ Решено</option>
                          <option value="closed">🔒 Закрыто</option>
                        </select>
                      </td>
                      <td>{new Date(req.created_at).toLocaleDateString('ru-RU')}</td>
                      <td>
                        <div className="col-actions">
                          <button className="btn-edit-user" onClick={() => openRequest(req)} title="Просмотр">
                            <i className="fas fa-eye"></i>
                          </button>
                          <button className="btn-delete-small" onClick={() => deleteRequest(req.id)} title="Удалить">
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПРОСМОТРА */}
      {showModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-envelope"></i> Обращение #{selectedRequest.id}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>От:</span>
                  <span>{selectedRequest.name}</span>
                  <span style={{ color: '#94a3b8' }}>|</span>
                  <span style={{ color: '#94a3b8' }}>{selectedRequest.email}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {new Date(selectedRequest.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>Тема</div>
                <div style={{ fontSize: '1rem', fontWeight: 500 }}>{selectedRequest.subject}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>Сообщение</div>
                <div style={{ 
                  background: '#f8fafc', 
                  padding: '12px 16px', 
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {selectedRequest.message}
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>Статус</div>
                <select
                  className="admin-filter-select"
                  value={selectedRequest.status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    updateStatus(selectedRequest.id, newStatus);
                    setSelectedRequest({ ...selectedRequest, status: newStatus });
                  }}
                  style={{ width: '100%', padding: '8px 12px', marginTop: '4px' }}
                >
                  <option value="new">🆕 Новое</option>
                  <option value="in_progress">⏳ В работе</option>
                  <option value="resolved">✅ Решено</option>
                  <option value="closed">🔒 Закрыто</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSupport;