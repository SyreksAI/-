import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminModules() {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState(null);
  
  // Данные модулей
  const [modules, setModules] = useState([
    { id: 1, name: 'Основы программирования', description: 'Базовые понятия и первые шаги', order: 1, topicsCount: 3 },
    { id: 2, name: 'Продвинутый уровень', description: 'Углублённое изучение языка', order: 2, topicsCount: 2 },
    { id: 3, name: 'Специализация', description: 'Профессиональные навыки', order: 3, topicsCount: 2 },
    { id: 4, name: 'Финальный проект', description: 'Создание полноценного приложения', order: 4, topicsCount: 0 },
  ]);

  const [newModule, setNewModule] = useState({ 
    name: '', 
    description: '', 
    order: '' 
  });

  const handleAddModule = (e) => {
    e.preventDefault();
    if (editingId) {
      setModules(modules.map(m => 
        m.id === editingId ? { ...m, ...newModule, order: parseInt(newModule.order) } : m
      ));
      setEditingId(null);
    } else {
      setModules([...modules, { 
        id: Date.now(), 
        ...newModule, 
        order: parseInt(newModule.order),
        topicsCount: 0 
      }]);
    }
    setNewModule({ name: '', description: '', order: '' });
  };

  const handleEdit = (module) => {
    setEditingId(module.id);
    setNewModule({ 
      name: module.name, 
      description: module.description, 
      order: module.order 
    });
  };

  const handleDelete = (id) => {
    if (window.confirm('Удалить модуль? Все темы из этого модуля останутся без модуля.')) {
      setModules(modules.filter(m => m.id !== id));
    }
  };

  // Статистика
  const totalModules = modules.length;
  const totalTopics = modules.reduce((acc, m) => acc + m.topicsCount, 0);

  return (
    <div className="admin-container">
      {/* Левая панель */}
      <div className="admin-sidebar">
        <div className="header">
          <img className='logo' src="/public/logo.png" alt="logo" />
        </div>
        
        <div className="admin-menu">
          <div className="admin-menu-title">Навигация</div>
          <Link to="/" className="admin-menu-item">
            <i className="fas fa-home"></i> На главную
          </Link>
          <Link to="/admin" className="admin-menu-item">
            <i className="fas fa-book"></i> Управление темами
          </Link>
          <Link to="/admin/modules" className="admin-menu-item active">
            <i className="fas fa-layer-group"></i> Модули
          </Link>
          <Link to="/admin/users" className="admin-menu-item">
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

      {/* Правая часть */}
      <div className="admin-content">
        <div className="admin-header">
          <div>
            <h1><i className="fas fa-layer-group"></i> Управление модулями</h1>
            <p className="admin-subtitle">Создавай модули и группируй в них темы</p>
          </div>
          <button className="btn-back" onClick={() => navigate('/admin')}>
            <i className="fas fa-arrow-left"></i> Назад к темам
          </button>
        </div>

        {/* Статистика */}
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-layer-group"></i></div>
            <div className="stat-info">
              <span className="stat-number">{totalModules}</span>
              <span className="stat-label">Всего модулей</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-file-alt"></i></div>
            <div className="stat-info">
              <span className="stat-number">{totalTopics}</span>
              <span className="stat-label">Всего тем в модулях</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-info">
              <span className="stat-number">{modules.filter(m => m.topicsCount > 0).length}</span>
              <span className="stat-label">Активных модулей</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-empty"></i></div>
            <div className="stat-info">
              <span className="stat-number">{modules.filter(m => m.topicsCount === 0).length}</span>
              <span className="stat-label">Пустых модулей</span>
            </div>
          </div>
        </div>

        {/* Две колонки */}
        <div className="admin-modules-wrapper">
          {/* Левая колонка - Форма */}
          <div className="admin-form-wrapper">
            <h2>
              <i className={`fas ${editingId ? 'fa-pen' : 'fa-plus-circle'}`}></i> 
              {editingId ? 'Редактировать модуль' : 'Создать модуль'}
            </h2>
            <form className="admin-form" onSubmit={handleAddModule}>
              <div className="form-group">
                <label>Название модуля <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="Например: Основы программирования"
                  value={newModule.name}
                  onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Порядок <span className="required">*</span></label>
                <input
                  type="number"
                  placeholder="1"
                  min="1"
                  value={newModule.order}
                  onChange={(e) => setNewModule({ ...newModule, order: e.target.value })}
                  required
                />
              </div>
              <div className="form-group full-width">
                <label>Описание</label>
                <textarea
                  placeholder="Краткое описание модуля"
                  value={newModule.description}
                  onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                  rows="2"
                />
              </div>
              <div className="form-buttons">
                <button type="submit" className="btn-submit">
                  <i className={`fas ${editingId ? 'fa-save' : 'fa-plus'}`}></i>
                  {editingId ? ' Сохранить' : ' Создать'}
                </button>
                {editingId && (
                  <button type="button" className="btn-cancel" onClick={() => { 
                    setEditingId(null); 
                    setNewModule({ name: '', description: '', order: '' }); 
                  }}>
                    <i className="fas fa-times"></i> Отмена
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Правая колонка - Список модулей */}
          <div className="admin-modules-list">
            <div className="list-header">
              <h2><i className="fas fa-list"></i> Список модулей</h2>
              <span className="list-count">{modules.length} модулей</span>
            </div>
            <div className="table-responsive">
              {modules.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Название</th>
                      <th>Описание</th>
                      <th>Порядок</th>
                      <th>Тем</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules
                      .sort((a, b) => a.order - b.order)
                      .map((module, index) => (
                        <tr key={module.id}>
                          <td className="col-id">{index + 1}</td>
                          <td className="col-title">
                            <div className="module-title">{module.name}</div>
                          </td>
                          <td className="col-desc">
                            {module.description || <span className="text-muted">—</span>}
                          </td>
                          <td className="col-order">
                            <span className="order-badge">#{module.order}</span>
                          </td>
                          <td className="col-topics">
                            <span className={`topics-badge ${module.topicsCount > 0 ? 'active' : 'empty'}`}>
                              {module.topicsCount}
                            </span>
                          </td>
                          <td className="col-actions">
                            <button className="btn-edit" onClick={() => handleEdit(module)} title="Редактировать">
                              <i className="fas fa-pen"></i>
                            </button>
                            <button className="btn-delete" onClick={() => handleDelete(module.id)} title="Удалить">
                              <i className="fas fa-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <i className="fas fa-layer-group"></i>
                  <p>Нет созданных модулей</p>
                  <small>Создайте модуль, чтобы начать группировать темы</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminModules;