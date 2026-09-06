import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { get, post } from './utils/api';
import AdminPanel from './pages/AdminPanel';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import AdminLogin from './pages/AdminLogin';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Forum from './pages/Forum';
import './static/master.scss';
import AdminModules from './pages/AdminModules';
import Privacy from './pages/Privacy';
import Support from './pages/Support';
import AdminSupport from './pages/AdminSupport';
import useActivityTracker from './hooks/useActivityTracker';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import YandexAd from './components/YandexAd';


// ===== ЗАЩИТА ДЛЯ ПОЛЬЗОВАТЕЛЬСКИХ МАРШРУТОВ =====
const parseStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const ProtectedRoute = ({ children }) => {
  const currentUser = parseStoredJson('currentUser');
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  return children;
};

// ===== ЗАЩИТА ДЛЯ АДМИН-МАРШРУТОВ =====
const AdminRoute = ({ children }) => {
  const adminSession = parseStoredJson('adminSession');
  if (!adminSession || !adminSession.loggedIn) {
    return <Navigate to="/admin/login" />;
  }
  return children;
};

// ===== ЗАЩИТА ДЛЯ ПУБЛИЧНЫХ СТРАНИЦ (если пользователь уже авторизован) =====
const PublicRoute = ({ children }) => {
  const currentUser = parseStoredJson('currentUser');
  if (currentUser) {
    return <Navigate to="/" />;
  }
  return children;
};

// ===== КОМПОНЕНТ ГЛАВНОЙ СТРАНИЦЫ =====
function HomePage({ settings, setSettings }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [topicsMap, setTopicsMap] = useState({});
  const [loading, setLoading] = useState(true);
  
  // ===== СОСТОЯНИЯ ДЛЯ КОММЕНТАРИЕВ =====
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  
  const currentUser = parseStoredJson('currentUser');

  // 👈 ДОБАВЛЯЕМ ТРЕКЕР АКТИВНОСТИ
  useActivityTracker();

  // ✅ ЗАГРУЗКА НАСТРОЕК ИЗ БД
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
  }, [setSettings]);

  // ✅ Загружаем категории и темы из БД
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const cats = await get('/api/study/technologies');
        setCategories(cats);
        
        const topics = {};
        for (const cat of cats) {
          topics[cat.id] = cat.topics || [];
        }
        setTopicsMap(topics);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ===== ЗАГРУЗКА КОММЕНТАРИЕВ =====
  const loadComments = async (topicId, subtopicId) => {
    setLoadingComments(true);
    try {
      let url = '/api/comments/';
      if (subtopicId) {
        url += `subtopic/${subtopicId}`;
      } else if (topicId) {
        url += `topic/${topicId}`;
      } else {
        setLoadingComments(false);
        return;
      }
      const data = await get(url);
      setComments(data || []);
    } catch (error) {
      console.error('Ошибка загрузки комментариев:', error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  // ===== ОТПРАВКА КОММЕНТАРИЯ =====
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    if (!currentUser) {
      alert('Войдите, чтобы оставить комментарий');
      return;
    }

    try {
      const commentData = {
        content: newComment.trim()
      };
      
      if (selectedContent?.type === 'subtopic') {
        commentData.subtopic_id = selectedContent.id;
      } else if (selectedContent?.type === 'topic') {
        commentData.topic_id = selectedContent.id;
      } else {
        alert('Неизвестный тип контента');
        return;
      }
      
      await post('/api/comments/', commentData, {
        'X-User-ID': String(currentUser.id)
      });
      
      setNewComment('');
      
      const topicId = selectedContent?.type === 'topic' ? selectedContent.id : null;
      const subtopicId = selectedContent?.type === 'subtopic' ? selectedContent.id : null;
      loadComments(topicId, subtopicId);
      
    } catch (error) {
      console.error('Ошибка отправки комментария:', error);
      alert('Ошибка отправки комментария: ' + (error.message || ''));
    }
  };

  // ===== ПРИ ВЫБОРЕ КОНТЕНТА ЗАГРУЖАЕМ КОММЕНТАРИИ =====
  useEffect(() => {
    if (selectedContent) {
      const topicId = selectedContent?.type === 'topic' ? selectedContent.id : null;
      const subtopicId = selectedContent?.type === 'subtopic' ? selectedContent.id : null;
      loadComments(topicId, subtopicId);
    }
  }, [selectedContent]);

  // Фильтрация
  const filteredCategories = categories
    .map(cat => {
      const topics = (topicsMap[cat.id] || []).filter(topic =>
        topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cat.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return { ...cat, topics };
    })
    .filter(cat => cat.topics.length > 0 || searchTerm === '');

  const toggleCategory = (name) => {
    if (activeCategory === name) {
      setActiveCategory(null);
      setActiveTopic(null);
    } else {
      setActiveCategory(name);
      setActiveTopic(null);
    }
  };

  const toggleTopic = (title) => {
    if (activeTopic === title) {
      setActiveTopic(null);
    } else {
      setActiveTopic(title);
    }
  };

  const handleSelectTopic = (categoryName, topic) => {
    setSelectedContent({
      id: topic.id,
      type: 'topic',
      title: topic.title,
      description: topic.content || topic.description || 'Описание отсутствует',
      technologies: [categoryName]
    });
    setBreadcrumbs([
      { name: categoryName, type: 'category' },
      { name: topic.title, type: 'topic' }
    ]);
    if (activeTopic !== topic.title) {
      setActiveTopic(topic.title);
    }
  };

  const handleSelectSubTopic = (categoryName, topicTitle, subtopic) => {
    setSelectedContent({
      id: subtopic.id,
      type: 'subtopic',
      title: subtopic.title,
      description: subtopic.description || 'Описание отсутствует',
      parentTopic: topicTitle,
      parentCategory: categoryName
    });
    setBreadcrumbs([
      { name: categoryName, type: 'category' },
      { name: topicTitle, type: 'topic' },
      { name: subtopic.title, type: 'subtopic' }
    ]);
    if (activeTopic !== topicTitle) {
      setActiveTopic(topicTitle);
    }
  };

  // ===== ПРОВЕРКА СТАТУСА ПОЛЬЗОВАТЕЛЯ ПРИ ЗАГРУЗКЕ =====
  useEffect(() => {
    const checkUserStatus = async () => {
      const currentUser = parseStoredJson('currentUser');
      if (!currentUser) return;
      
      try {
        const userData = await get(`/api/users/${currentUser.id}`, {
          'X-User-ID': String(currentUser.id)
        });
        
        if (userData.is_banned) {
          alert('⛔ Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору.');
          localStorage.removeItem('currentUser');
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Ошибка проверки статуса:', error);
      }
    };
    
    checkUserStatus();
  }, []);

  // Показываем загрузку
  if (loading) {
    return (
      <div className="home-container">
        <div className="left_container">
          <div className="header">
            <img className='logo' src={settings?.logoUrl || '/logo.png'} alt="logo" />
          </div>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed' }}></i>
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>Загрузка...</p>
          </div>
        </div>
        <div className="main_content">
          <div className="content_area">
            <div className="content-empty-state">
              <i className="fas fa-spinner fa-spin"></i>
              <h3>Загрузка данных...</h3>
            </div>
          </div>
          <div className="right_sidebar" style={{ width: '300px', flexShrink: 0 }}>
            <YandexAd blockId="R-A-19991905-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="left_container">
        <div className="header">
          <img className='logo' src={settings?.logoUrl || '/logo.png'} alt="logo" />
        </div>
        
        <div className="search-container">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Поиск технологии или темы..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="main_menu">
          <Link to="/forum" className="forum-menu-item">
            <i className="fas fa-comments"></i> 
            <span>Forum разработчиков</span>
          </Link>
          <div className="catalog-title">
            <i className="fas fa-book"></i> Каталог технологий
          </div>
          
          {filteredCategories.map((category) => (
            <div key={category.id} className="category-item">
              <div 
                className={`category-header ${activeCategory === category.name ? 'active' : ''}`}
                onClick={() => toggleCategory(category.name)}
              >
                <i className={`${category.icon || 'fas fa-folder'} category-icon`}></i>
                <span className="category-name">{category.name}</span>
                <span className="topic-count">{category.topics.length} тем</span>
                <i className={`fas fa-chevron-${activeCategory === category.name ? 'down' : 'right'} category-arrow`}></i>
              </div>
              
              {activeCategory === category.name && (
                <div className="topics-list">
                  {category.topics.map((topic) => {
                    const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;
                    return (
                      <div key={topic.id} className="topic-item-wrapper">
                        <div 
                          className={`topic-header ${activeTopic === topic.title ? 'active' : ''}`}
                          onClick={() => {
                            if (hasSubtopics) {
                              toggleTopic(topic.title);
                            }
                            handleSelectTopic(category.name, topic);
                          }}
                          style={{ cursor: hasSubtopics ? 'pointer' : 'default' }}
                        >
                          <i className="fas fa-circle topic-dot"></i>
                          <span className="topic-title">{topic.title}</span>
                          {hasSubtopics && (
                            <>
                              <span className="topic-count">{topic.subtopics.length} подтем</span>
                              <i className={`fas fa-chevron-${activeTopic === topic.title ? 'down' : 'right'} topic-arrow`}></i>
                            </>
                          )}
                        </div>

                        {activeTopic === topic.title && hasSubtopics && (
                          <div className="subtopics-list">
                            {topic.subtopics.map((subtopic) => (
                              <div 
                                key={subtopic.id} 
                                className="subtopic-item"
                                onClick={() => handleSelectSubTopic(category.name, topic.title, subtopic)}
                              >
                                <i className="fas fa-circle subtopic-dot"></i>
                                <span className="subtopic-title">{subtopic.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {category.topics.length === 0 && (
                    <div className="empty-topics">
                      <p>Нет тем в этой технологии</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="footer">
          {currentUser ? (
            <>
              <img src="/user_logo_one.png" alt="user_logo_one" className="user_logo" />
              <div className="user-info">
                <Link to="/profile" className="username-link">
                  <h3 className="username">{currentUser.name}</h3>
                </Link>
              </div>
            </>
          ) : (
            <>
              <img src="/user_logo_one.png" alt="user_logo_one" className="user_logo" />
              <Link to="/login" className="username-link">
                <h3 className="username">Войти</h3>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="main_content">
        <div className="content_area">
          {selectedContent ? (
            <div className="content-viewer">
              <div className="content-breadcrumbs">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index}>
                    {index > 0 && <span className="breadcrumb-separator"> / </span>}
                    <span className={`breadcrumb-${crumb.type}`}>
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>

              <div className="content-header">
                <div className="content-header-top">
                  <h2 className="content-title">{selectedContent.title}</h2>
                  {settings.enableComments !== false && (
                    <button 
                      className="comments-toggle-btn"
                      onClick={() => setShowCommentsModal(true)}
                      title="Комментарии"
                    >
                      <i className="fas fa-comment"></i>
                      <span className="comments-count">{comments.length}</span>
                    </button>
                  )}
                </div>
                {selectedContent.technologies && selectedContent.technologies.length > 0 && (
                  <div className="content-techs">
                    {selectedContent.technologies.map((tech, i) => (
                      <span key={i} className="tech-tag">{tech}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="content-body">
                {selectedContent.description ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedContent.description }} />
                ) : (
                  <p className="content-empty">Описание отсутствует</p>
                )}
              </div>

              {/* ===== МОДАЛЬНОЕ ОКНО КОММЕНТАРИЕВ ===== */}
              {showCommentsModal && (
                <div className="comments-modal-overlay" onClick={() => setShowCommentsModal(false)}>
                  <div className="comments-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="comments-modal-header">
                      <h3>
                        <i className="fas fa-comments"></i> 
                        Комментарии ({comments.length})
                      </h3>
                      <button className="comments-modal-close" onClick={() => setShowCommentsModal(false)}>
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                    
                    <div className="comments-modal-body">
                      {/* ФОРМА ДЛЯ КОММЕНТАРИЯ */}
                      {currentUser ? (
                        <form className="comment-form" onSubmit={handleAddComment}>
                          <textarea
                            className="comment-input"
                            placeholder="Напишите комментарий..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows="2"
                          />
                          <button type="submit" className="btn-submit" disabled={!newComment.trim()}>
                            <i className="fas fa-paper-plane"></i> Отправить
                          </button>
                        </form>
                      ) : (
                        <div className="comment-login-hint">
                          <Link to="/login" onClick={() => setShowCommentsModal(false)}>Войдите</Link>, чтобы оставить комментарий
                        </div>
                      )}

                      {/* СПИСОК КОММЕНТАРИЕВ */}
                      {loadingComments ? (
                        <div className="comments-loading">
                          <i className="fas fa-spinner fa-spin"></i> Загрузка...
                        </div>
                      ) : comments.length > 0 ? (
                        <div className="comments-list">
                          {comments.map(comment => (
                            <div key={comment.id} className="comment-item">
                              <div className="comment-avatar">
                                <i className="fas fa-user-circle"></i>
                              </div>
                              <div className="comment-content">
                                <div className="comment-author">
                                  {comment.author?.name || comment.author?.username || 'Пользователь'}
                                  <span className="comment-date">
                                    {new Date(comment.created_at).toLocaleDateString('ru-RU', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <div className="comment-text">{comment.content}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="comments-empty">
                          <p>Нет комментариев. Будьте первым! 😊</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="content-empty-state">
              <i className="fas fa-hand-pointer"></i>
              <h3>Выберите тему или подтему</h3>
              <p>Нажмите на тему или подтему слева, чтобы увидеть её содержание</p>
            </div>
          )}
        </div>
        <div className="right_sidebar" style={{ width: '300px', flexShrink: 0 }}>
          <YandexAd blockId="R-A-19991905-1" />
        </div>
      </div>
    </div>
  );
}

// ===== ГЛАВНЫЙ КОМПОНЕНТ APP =====
function App() {
  const [settings, setSettings] = useState({
    siteName: 'ДубльПар.рф',
    siteDescription: 'Образовательный проект по РПО',
    logoUrl: '/logo.png',
    primaryColor: '#7c3aed',
    registrationEnabled: true,
    maintenanceMode: false,
    enableComments: true,
    enableProgressTracking: true,
    emailNotifications: true,
    newTopicsNotifications: true,
    newUsersNotifications: true,
    systemNotifications: true
  });

  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await get('/api/study/technologies');
        if (data && data.length > 0) {
          setCategories(data);
        }
      } catch (error) {
        console.error('Ошибка загрузки категорий для админки:', error);
        setCategories([
          { id: 1, name: 'Python', icon: 'fab fa-python', topics: [] },
          { id: 2, name: 'C++', icon: 'fas fa-code', topics: [] },
          { id: 3, name: 'C#', icon: 'fas fa-shield-alt', topics: [] },
          { id: 4, name: 'Docker', icon: 'fab fa-docker', topics: [] }
        ]);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const primaryColor = settings?.primaryColor || '#7c3aed';
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--primary-color-rgb', hexToRgb(primaryColor));
  }, [settings?.primaryColor]);

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '124, 58, 237';
  };

  return (
    <div className="app">
      <Routes>
        {/* 🔒 ЗАЩИЩЁННЫЕ МАРШРУТЫ (только для авторизованных) */}
        <Route path="/" element={
          <ProtectedRoute>
            <HomePage settings={settings} setSettings={setSettings} />
          </ProtectedRoute>
        } />
        
        <Route path="/forum" element={
          <ProtectedRoute>
            <Forum />
          </ProtectedRoute>
        } />
        
        <Route path="/profile/:userId?" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />

        {/* 🔓 ПУБЛИЧНЫЕ МАРШРУТЫ (доступны без авторизации) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/terms" element={<Privacy />} />
        <Route path="/about" element={<Privacy />} />

        {/* 🔐 АДМИН-МАРШРУТЫ */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={
          <AdminRoute>
            <AdminPanel categories={categories} setCategories={setCategories} settings={settings} />
          </AdminRoute>
        } />
        <Route path="/admin/users" element={
          <AdminRoute>
            <AdminUsers settings={settings} />
          </AdminRoute>
        } />
        <Route path="/admin/settings" element={
          <AdminRoute>
            <AdminSettings settings={settings} setSettings={setSettings} />
          </AdminRoute>
        } />
        <Route path="/admin/modules" element={
          <AdminRoute>
            <AdminModules />
          </AdminRoute>
        } />
        <Route path="/admin/support" element={
          <AdminRoute>
            <AdminSupport />
          </AdminRoute>
        } />

        {/* 👇 НОВЫЕ МАРШРУТЫ ВНУТРИ <Routes>! */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ДОПОЛНИТЕЛЬНЫЕ СТРАНИЦЫ */}
        <Route path="/topic/:language/:topic" element={
          <ProtectedRoute>
            <div className="topic-page">
              <button className="btn-back" onClick={() => window.history.back()}>← Назад</button>
              <h1>Страница темы</h1>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

export default App;