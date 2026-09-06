import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { get, put } from '../utils/api';

function AdminSettings({ settings, setSettings }) {
  const navigate = useNavigate();
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // ===== ЗАГРУЗКА НАСТРОЕК ПРИ ЗАХОДЕ =====
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await get('/api/settings/');
        if (data && Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
      }
    };
    loadSettings();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings({
      ...settings,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleColorChange = (e) => {
    setSettings({
      ...settings,
      primaryColor: e.target.value
    });
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewAvatar(reader.result);
        setSettings({
          ...settings,
          logoUrl: reader.result
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // ===== СОХРАНЕНИЕ НАСТРОЕК В БД =====
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      if (!currentUser) {
        alert('Пожалуйста, войдите в аккаунт');
        setSaving(false);
        return;
      }

      // Подготавливаем настройки для отправки
      const settingsToSave = {
        siteName: settings.siteName,
        siteDescription: settings.siteDescription,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        theme: settings.theme,
        language: settings.language,
        registrationEnabled: Boolean(settings.registrationEnabled),
        maintenanceMode: Boolean(settings.maintenanceMode),
        enableComments: Boolean(settings.enableComments),
        enableProgressTracking: Boolean(settings.enableProgressTracking),
        emailNotifications: Boolean(settings.emailNotifications !== false),
        newTopicsNotifications: Boolean(settings.newTopicsNotifications !== false),
        newUsersNotifications: Boolean(settings.newUsersNotifications !== false),
        systemNotifications: Boolean(settings.systemNotifications !== false)
      };

      await put('/api/settings/', settingsToSave, {
        'X-User-ID': String(currentUser.id)
      });

      setSaveMessage('✅ Настройки успешно сохранены!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      setSaveMessage('❌ Ошибка сохранения: ' + (error.message || 'Неизвестная ошибка'));
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setSaving(false);
    }
  };

  // ===== ВЫХОД ИЗ АДМИНКИ =====
  const handleAdminLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти из админ-панели?')) {
      localStorage.removeItem('adminSession');
      navigate('/admin/login');
    }
  };
  
  return (
    <div className="admin-container">
      <div className="admin-sidebar">
        <div className="header">
          <img className="logo" src="/logo.png" alt="logo" />
        </div>
        <div className="admin-menu">
          <div className="admin-menu-title">Навигация</div>
          <Link to="/" className="admin-menu-item"><i className="fas fa-home"></i> На главную</Link>
          <Link to="/admin" className="admin-menu-item"><i className="fas fa-book"></i> Управление темами</Link>
          <Link to="/admin/users" className="admin-menu-item"><i className="fas fa-users"></i> Пользователи</Link>
          <Link to="/admin/support" className="admin-menu-item"><i className="fas fa-headset"></i> Поддержка</Link>
          <Link to="/admin/settings" className="admin-menu-item active"><i className="fas fa-sliders-h"></i> Настройки</Link>
          <button className="admin-menu-item logout" onClick={handleAdminLogout}>
            <i className="fas fa-sign-out-alt"></i> Выйти из админки
          </button>
        </div>
        <div className="footer">
          <img src="/user_logo_one.png" alt="user_logo_one" className="user_logo" />
          <h3 className="username">Admin</h3>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-header">
          <div>
            <h1><i className="fas fa-sliders-h"></i> Настройки платформы</h1>
            <p className="admin-subtitle">Управляй основными параметрами сайта</p>
          </div>
        </div>

        {saveMessage && (
          <div className={`save-message ${saveMessage.includes('✅') ? 'success' : 'error'}`}>
            <i className={`fas ${saveMessage.includes('✅') ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
            {saveMessage.replace('✅ ', '').replace('❌ ', '')}
          </div>
        )}

        <div className="settings-tabs">
          <button 
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <i className="fas fa-home"></i> Основные
          </button>
          {/* <button 
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <i className="fas fa-palette"></i> Внешний вид
          </button> */}
          <button 
            className={`settings-tab ${activeTab === 'features' ? 'active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            <i className="fas fa-cogs"></i> Функции
          </button>
          <button 
            className={`settings-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <i className="fas fa-bell"></i> Уведомления
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              <h3><i className="fas fa-home"></i> Основные настройки</h3>
              <div className="settings-form">
                <div className="form-group">
                  <label>Название сайта</label>
                  <input
                    type="text"
                    name="siteName"
                    value={settings.siteName || ''}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label>Описание сайта</label>
                  <textarea
                    name="siteDescription"
                    value={settings.siteDescription || ''}
                    onChange={handleInputChange}
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label>Логотип</label>
                  <div className="logo-upload">
                    <div className="logo-preview">
                      {previewAvatar ? (
                        <img src={previewAvatar} alt="Логотип" />
                      ) : (
                        <img src={settings.logoUrl || '/logo.png'} alt="Логотип" />
                      )}
                    </div>
                    <div className="logo-upload-actions">
                      <button 
                        className="btn-upload"
                        onClick={() => document.getElementById('logoInput').click()}
                      >
                        <i className="fas fa-upload"></i> Выбрать файл
                      </button>
                      <input
                        id="logoInput"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        style={{ display: 'none' }}
                      />
                      <span className="upload-hint">PNG, JPG до 2MB</span>
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Основной цвет</label>
                  <div className="color-picker-wrapper">
                    <input
                      type="color"
                      value={settings.primaryColor || '#7c3aed'}
                      onChange={handleColorChange}
                      className="color-picker"
                    />
                    <input
                      type="text"
                      value={settings.primaryColor || '#7c3aed'}
                      onChange={handleColorChange}
                      className="color-hex"
                    />
                  </div>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  <i className="fas fa-save"></i> {saving ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>
          )}

          {/* {activeTab === 'appearance' && (
            <div className="settings-section">
              <h3><i className="fas fa-palette"></i> Внешний вид</h3>
              <div className="settings-form">
                
                <div className="form-group">
                  <label>Язык</label>
                  <select
                    name="language"
                    value={settings.language || 'ru'}
                    onChange={handleInputChange}
                  >
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  <i className="fas fa-save"></i> {saving ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>
          )} */}

          {activeTab === 'features' && (
            <div className="settings-section">
              <h3><i className="fas fa-cogs"></i> Функции платформы</h3>
              <div className="settings-form">
                {/* <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Регистрация новых пользователей</label>
                    <span className="toggle-desc">Разрешить регистрацию на сайте</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="registrationEnabled"
                      checked={settings.registrationEnabled !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div> */}
                {/* <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Режим обслуживания</label>
                    <span className="toggle-desc">Сайт временно недоступен для пользователей</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="maintenanceMode"
                      checked={settings.maintenanceMode || false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div> */}
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Комментарии</label>
                    <span className="toggle-desc">Разрешить комментарии под темами</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="enableComments"
                      checked={settings.enableComments !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Отслеживание прогресса</label>
                    <span className="toggle-desc">Показывать прогресс изучения</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="enableProgressTracking"
                      checked={settings.enableProgressTracking !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  <i className="fas fa-save"></i> {saving ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="settings-section">
              <h3><i className="fas fa-bell"></i> Уведомления</h3>
              <div className="settings-form">
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Email уведомления</label>
                    <span className="toggle-desc">Отправлять письма пользователям</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="emailNotifications"
                      checked={settings.emailNotifications !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Новые темы</label>
                    <span className="toggle-desc">Уведомлять о добавлении новых тем</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="newTopicsNotifications"
                      checked={settings.newTopicsNotifications !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Новые пользователи</label>
                    <span className="toggle-desc">Уведомлять о новых регистрациях</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="newUsersNotifications"
                      checked={settings.newUsersNotifications !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="form-group toggle">
                  <div className="toggle-info">
                    <label>Системные уведомления</label>
                    <span className="toggle-desc">Уведомления об ошибках и проблемах</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      name="systemNotifications"
                      checked={settings.systemNotifications !== false}
                      onChange={handleInputChange}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  <i className="fas fa-save"></i> {saving ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;