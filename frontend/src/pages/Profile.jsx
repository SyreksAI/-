import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { get, put } from '../utils/api';  // ✅ Уже импортировано

function Profile() {
  const navigate = useNavigate();
  const { userId } = useParams(); 
  
  const [currentUser, setCurrentUser] = useState(null);
  const [targetUser, setTargetUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subStatus, setSubStatus] = useState('none');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // ===== ЗАГРУЗКА ПРОФИЛЯ =====
  useEffect(() => {
    const curr = JSON.parse(localStorage.getItem('currentUser'));
    if (!curr) {
      navigate('/login');
      return;
    }
    setCurrentUser(curr);

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        if (userId && parseInt(userId) !== curr.id) {
          // ✅ ИСПРАВЛЕНО: Используем get() вместо fetch
          const data = await get(`/api/users/${userId}`);
          setTargetUser(data);

          // ✅ ИСПРАВЛЕНО: Проверяем статус подписки через get()
          const subData = await get(`/api/users/subscriptions/status/${userId}`, {
            'X-User-ID': String(curr.id)
          });
          setSubStatus(subData.status || 'none');
          
        } else {
          // Загружаем свой профиль
          setTargetUser(curr);
          setSubStatus('approved');
        }
      } catch (err) {
        console.error(err);
        setError(err.message || 'Не удалось загрузить профиль');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [userId, navigate]);

  // ===== ОТПРАВКА ЗАПРОСА НА ПОДПИСКУ =====
  const handleSubscribe = async () => {
    if (!currentUser || !targetUser) return;
    setError('');
    setSuccess('');
    
    try {
      // ✅ ИСПРАВЛЕНО: Используем put() или post() из utils
      const data = await put(
        '/api/users/subscribe',
        { following_id: targetUser.id },
        { 'X-User-ID': String(currentUser.id) }
      );
      
      setSubStatus('pending');
      setSuccess(`📨 Запрос отправлен пользователю ${targetUser.name}`);
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      setError(err.message || 'Ошибка при отправке запроса');
    }
  };

  // ===== ПЕРЕХОД В ЧАТ =====
  const handleGoToChat = () => {
    if (!currentUser || !targetUser) return;
    
    const chatId = `private_${Math.min(currentUser.id, targetUser.id)}_${Math.max(currentUser.id, targetUser.id)}`;
    
    const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
    if (!savedChats.some(u => u.id === targetUser.id)) {
      savedChats.push(targetUser);
      localStorage.setItem('userChats', JSON.stringify(savedChats));
    }
    
    localStorage.setItem('selectedChat', chatId);
    navigate('/forum');
  };

  // ===== РЕДАКТИРОВАНИЕ ПРОФИЛЯ (ТОЛЬКО ДЛЯ СЕБЯ) =====
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Валидация
    if (editData.username && !/^[a-zA-Z0-9_]+$/.test(editData.username)) {
      return setError('Только буквы, цифры и _');
    }
    if (editData.username && editData.username.length < 3) {
      return setError('Минимум 3 символа');
    }
    if (editData.password && editData.password.length < 6) {
      return setError('Пароль мин. 6 символов');
    }
    if (editData.password && editData.password !== editData.confirmPassword) {
      return setError('Пароли не совпадают');
    }

    try {
      // ✅ ИСПРАВЛЕНО: Отправляем PUT запрос на сервер
      const updatedUser = await put(
        `/api/users/${currentUser.id}`,
        {
          name: editData.name || currentUser.name,
          username: editData.username || currentUser.username,
          email: editData.email || currentUser.email,
          password: editData.password || undefined
        },
        { 'X-User-ID': String(currentUser.id) }
      );

      // Обновляем localStorage
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      
      // Обновляем список пользователей
      const allUsers = JSON.parse(localStorage.getItem('users') || '[]');
      const userIndex = allUsers.findIndex(u => u.id === currentUser.id);
      if (userIndex !== -1) {
        allUsers[userIndex] = updatedUser;
        localStorage.setItem('users', JSON.stringify(allUsers));
      }

      setCurrentUser(updatedUser);
      setTargetUser(updatedUser);
      setSuccess('✅ Профиль обновлен!');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      setError(err.message || 'Ошибка при обновлении профиля');
    }
  };

  // ===== ИНИЦИАЛИЗАЦИЯ ФОРМЫ РЕДАКТИРОВАНИЯ =====
  useEffect(() => {
    if (isEditing && currentUser) {
      setEditData({
        name: currentUser.name || '',
        username: currentUser.username || '',
        email: currentUser.email || '',
        password: '',
        confirmPassword: ''
      });
    }
  }, [isEditing, currentUser]);

  // ===== ОТОБРАЖЕНИЕ ЗАГРУЗКИ =====
  if (isLoading) {
    return (
      <div className="profile-page" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh'}}>
        <div style={{textAlign: 'center'}}>
          <i className="fas fa-circle-notch fa-spin" style={{fontSize: '3rem', color: '#7c3aed'}}></i>
          <p style={{marginTop: '16px', color: '#64748b'}}>Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <button className="btn-back-profile" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> Назад
          </button>
          <div className="profile-header"><h1>Пользователь не найден</h1></div>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === targetUser.id;

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-back">
          <button className="btn-back-profile" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> Назад
          </button>
        </div>

        {/* ===== ШАПКА ПРОФИЛЯ ===== */}
        <div className="profile-header-modern">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-large">
              <i className="fas fa-user-circle"></i>
            </div>
            <div className="profile-status-dot"></div>
          </div>
          
          <div className="profile-info-block">
            <h1 className="profile-name">{targetUser.name}</h1>
            <p className="profile-username-modern">@{targetUser.username}</p>
            <span className={`profile-role-badge ${targetUser.role}`}>
              {targetUser.role === 'admin' ? '👑 Администратор' : '🎓 Студент'}
            </span>
          </div>

          {/* ===== КНОПКИ ДЕЙСТВИЙ ===== */}
          <div className="profile-actions-modern">
            {!isOwnProfile ? (
              <>
                {subStatus === 'none' || subStatus === 'rejected' ? (
                  <button className="btn-action-primary" onClick={handleSubscribe}>
                    <i className="fas fa-user-plus"></i> Подписаться
                  </button>
                ) : subStatus === 'pending' ? (
                  <button className="btn-action-secondary" disabled>
                    <i className="fas fa-clock"></i> Ожидает
                  </button>
                ) : (
                  <button className="btn-action-secondary" disabled>
                    <i className="fas fa-check"></i> Подписан
                  </button>
                )}
                <button className="btn-action-primary" onClick={handleGoToChat}>
                  <i className="fas fa-comment-dots"></i> Написать
                </button>
              </>
            ) : (
              <button className="btn-action-primary" onClick={() => setIsEditing(true)}>
                <i className="fas fa-pen"></i> Редактировать профиль
              </button>
            )}
          </div>
        </div>

        {error && <div className="auth-error" style={{marginTop: '16px'}}>{error}</div>}
        {success && <div className="auth-success" style={{marginTop: '16px'}}>{success}</div>}

        {/* ===== СТАТИСТИКА ===== */}
        <div className="profile-stats-modern">
          <div className="stat-box">
            <span className="stat-box-number">{targetUser.languages?.length || 0}</span>
            <span className="stat-box-label">Языков</span>
          </div>
          <div className="stat-box-divider"></div>
          <div className="stat-box">
            <span className="stat-box-number">{targetUser.topics_count || targetUser.topicsCount || 0}</span>
            <span className="stat-box-label">Тем</span>
          </div>
          <div className="stat-box-divider"></div>
          <div className="stat-box">
            <span className="stat-box-number">{targetUser.progress || 0}%</span>
            <span className="stat-box-label">Прогресс</span>
          </div>
        </div>

        {/* ===== ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ===== */}
        <div className="profile-details-card">
          <div className="detail-row">
            <i className="fas fa-envelope"></i>
            <span>{targetUser.email}</span>
          </div>
          <div className="detail-row">
            <i className="fas fa-calendar-alt"></i>
            <span>Регистрация: {targetUser.registered || 'Не указана'}</span>
          </div>
        </div>

        {targetUser.languages && targetUser.languages.length > 0 && (
          <div className="profile-languages-modern">
            <h3>Изучаемые технологии</h3>
            <div className="profile-language-tags">
              {targetUser.languages.map((lang, i) => (
                <span key={i} className="tech-tag-modern">
                  <i className="fas fa-code"></i> {typeof lang === 'string' ? lang : lang.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ===== ФОРМА РЕДАКТИРОВАНИЯ ===== */}
        {isOwnProfile && isEditing && (
          <div className="profile-edit-form">
            <h3><i className="fas fa-user-edit"></i> Редактирование</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Имя</label>
                <input 
                  type="text" 
                  name="name" 
                  value={editData.name} 
                  onChange={(e) => setEditData({...editData, name: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text" 
                  name="username" 
                  value={editData.username} 
                  onChange={(e) => setEditData({...editData, username: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  name="email" 
                  value={editData.email} 
                  onChange={(e) => setEditData({...editData, email: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Новый пароль (необязательно)</label>
                <input 
                  type="password" 
                  name="password" 
                  placeholder="Минимум 6 символов" 
                  value={editData.password} 
                  onChange={(e) => setEditData({...editData, password: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label>Подтвердите пароль</label>
                <input 
                  type="password" 
                  name="confirmPassword" 
                  placeholder="Повторите пароль" 
                  value={editData.confirmPassword} 
                  onChange={(e) => setEditData({...editData, confirmPassword: e.target.value})} 
                />
              </div>
              <div className="profile-edit-actions">
                <button type="submit" className="btn-submit">
                  <i className="fas fa-save"></i> Сохранить
                </button>
                <button 
                  type="button" 
                  className="btn-cancel" 
                  onClick={() => { 
                    setIsEditing(false); 
                    setError(''); 
                    setSuccess(''); 
                  }}
                >
                  <i className="fas fa-times"></i> Отмена
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===== КНОПКИ ДЛЯ СВОЕГО ПРОФИЛЯ ===== */}
        {isOwnProfile && !isEditing && (
          <div className="profile-actions">
            {currentUser.role === 'admin' && (
              <Link to="/admin" className="btn-submit" style={{flex: 1, justifyContent: 'center'}}>
                <i className="fas fa-cog"></i> Админ-панель
              </Link>
            )}
            <button 
              className="btn-logout" 
              onClick={() => { 
                localStorage.removeItem('currentUser'); 
                navigate('/'); 
                window.location.reload(); 
              }}
            >
              <i className="fas fa-sign-out-alt"></i> Выйти
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;