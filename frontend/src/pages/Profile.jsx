import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { authAPI, get, post, put } from '../utils/api';
import { useAuth } from '../context/AuthProvider';
import { getStoredAuthToken } from '../utils/authToken';
import AppLoadingScreen from '../components/AppLoadingScreen';
import PasswordInput from '../components/PasswordInput';
import { getPasswordValidationError, PASSWORD_HINT } from '../utils/passwordValidation';
import { loadCachedUserChats, saveCachedUserChats, saveSelectedChat } from '../utils/chatCache';
import { formatRegisteredDate } from '../utils/formatDate';

function Profile() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user: currentUser, loading: authLoading, refreshUser, applyAuthResponse, logout } = useAuth();

  const profileId = useMemo(() => {
    if (userId) {
      const parsed = Number.parseInt(userId, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return currentUser?.id ?? null;
  }, [userId, currentUser?.id]);

  const [targetUser, setTargetUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subStatus, setSubStatus] = useState('none');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // ===== ЗАГРУЗКА ПРОФИЛЯ =====
  useEffect(() => {
    if (authLoading) return;

    if (!currentUser?.id || !profileId) {
      setIsLoading(false);
      setTargetUser(null);
      return;
    }

    const isOwnProfile = profileId === currentUser.id;

    const loadProfile = async () => {
      setIsLoading(true);
      setError('');

      if (isOwnProfile) {
        setTargetUser(currentUser);
      }

      try {
        if (isOwnProfile) {
          const me = await authAPI.getCurrentUser({ suppressLogout: true });
          setTargetUser(me);
          setSubStatus('approved');
          return;
        }

        const data = await get(`/api/users/${profileId}`);
        setTargetUser(data);
        const subData = await get(`/api/users/subscriptions/status/${profileId}`);
        setSubStatus(subData.status || 'none');
      } catch (err) {
        console.error(err);
        if (isOwnProfile) {
          setTargetUser(currentUser);
          setSubStatus('approved');
          return;
        }
        setTargetUser(null);
        setError(err.message || 'Не удалось загрузить профиль');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [authLoading, profileId, currentUser?.id, currentUser]);

  // ===== ОТПРАВКА ЗАПРОСА НА ПОДПИСКУ =====
  const handleSubscribe = async () => {
    if (!currentUser || !targetUser) return;
    setError('');
    setSuccess('');
    
    try {
      await post('/api/users/subscribe', { following_id: targetUser.id });
      
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
    
    const savedChats = loadCachedUserChats(currentUser.id);
    if (!savedChats.some(u => u.id === targetUser.id)) {
      savedChats.push(targetUser);
      saveCachedUserChats(currentUser.id, savedChats);
    }

    saveSelectedChat(currentUser.id, chatId);
    navigate('/forum', { state: { chatId } });
  };

  // ===== РЕДАКТИРОВАНИЕ ПРОФИЛЯ (ТОЛЬКО ДЛЯ СЕБЯ) =====
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    setError('');
    setSuccess('');

    const name = editData.name.trim();
    const username = editData.username.trim();
    const email = editData.email.trim().toLowerCase();

    if (name.length < 2) {
      return setError('Имя должно содержать минимум 2 символа');
    }
    if (username.length < 3) {
      return setError('Username должен содержать минимум 3 символа');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return setError('Username может содержать только буквы, цифры и _');
    }
    if (!email || !email.includes('@')) {
      return setError('Введите корректный email');
    }
    if (editData.password) {
      const passwordError = getPasswordValidationError(editData.password);
      if (passwordError) {
        return setError(passwordError);
      }
      if (editData.password !== editData.confirmPassword) {
        return setError('Пароли не совпадают');
      }
    } else if (editData.confirmPassword) {
      return setError('Введите новый пароль или очистите подтверждение');
    }

    const payload = { name, username, email };
    if (editData.password) {
      payload.password = editData.password;
    }

    setIsSaving(true);
    try {
      const updatedUser = await put(`/api/users/${currentUser.id}`, payload);

      const token = getStoredAuthToken();
      if (token) {
        applyAuthResponse({ access_token: token, user: updatedUser });
      } else {
        await refreshUser();
      }

      setTargetUser(updatedUser);
      setEditData({ name: '', username: '', email: '', password: '', confirmPassword: '' });
      setSuccess('✅ Профиль обновлён');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Ошибка при обновлении профиля');
    } finally {
      setIsSaving(false);
    }
  };

  // ===== ИНИЦИАЛИЗАЦИЯ ФОРМЫ РЕДАКТИРОВАНИЯ =====
  useEffect(() => {
    if (isEditing && targetUser) {
      setEditData({
        name: targetUser.name || '',
        username: targetUser.username || '',
        email: targetUser.email || '',
        password: '',
        confirmPassword: ''
      });
    }
  }, [isEditing, targetUser]);

  // ===== ОТОБРАЖЕНИЕ ЗАГРУЗКИ =====
  if (authLoading || isLoading) {
    return <AppLoadingScreen fullscreen={false} alt="Загрузка профиля" />;
  }

  if (!targetUser) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <button className="btn-back-profile" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> Назад
          </button>
          <div className="profile-header">
            <h1>{error || 'Пользователь не найден'}</h1>
          </div>
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
            <span>Регистрация: {formatRegisteredDate(targetUser.registered) || 'Не указана'}</span>
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
                <PasswordInput
                  name="password"
                  placeholder="Мин. 8 символов: Aa1!"
                  value={editData.password}
                  onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                />
                <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                  {PASSWORD_HINT}
                </small>
              </div>
              <div className="form-group">
                <label>Подтвердите пароль</label>
                <PasswordInput
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Повторите пароль"
                  value={editData.confirmPassword}
                  onChange={(e) => setEditData({ ...editData, confirmPassword: e.target.value })}
                />
              </div>
              <div className="profile-edit-actions">
                <button type="submit" className="btn-submit" disabled={isSaving}>
                  {isSaving ? (
                    <><i className="fas fa-spinner fa-spin"></i> Сохранение...</>
                  ) : (
                    <><i className="fas fa-save"></i> Сохранить</>
                  )}
                </button>
                <button 
                  type="button" 
                  className="btn-cancel" 
                  disabled={isSaving}
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
              onClick={async () => {
                await logout();
                navigate('/login');
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