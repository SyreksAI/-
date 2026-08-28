import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { get } from './utils/api';
import AdminPanel from './pages/AdminPanel';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import AdminLogin from './pages/AdminLogin';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Forum from './pages/Forum';
import './static/master.scss';

// Компонент для защиты пользовательских маршрутов
const ProtectedRoute = ({ children }) => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  return children;
};

// Компонент для защиты админ-маршрутов (ТОЛЬКО АДМИН-СЕССИЯ!)
const AdminRoute = ({ children }) => {
  const adminSession = JSON.parse(localStorage.getItem('adminSession'));
  if (!adminSession || !adminSession.loggedIn) {
    return <Navigate to="/admin/login" />;
  }
  return children;
};

function HomePage({ categories, settings }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));

  // Фильтрация
  const filteredCategories = categories.map(cat => ({
    ...cat,
    topics: cat.topics.filter(topic => 
      topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.topics.length > 0 || searchTerm === '');

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
      type: 'topic',
      title: topic.title,
      description: topic.description || 'Описание отсутствует',
      technologies: topic.technologies || []
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

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
    window.location.reload();
  };

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
          
          {filteredCategories.map((category, index) => (
            <div key={index} className="category-item">
              <div 
                className={`category-header ${activeCategory === category.name ? 'active' : ''}`}
                onClick={() => toggleCategory(category.name)}
              >
                <i className={`${category.icon} category-icon`}></i>
                <span className="category-name">{category.name}</span>
                <span className="topic-count">{category.topics.length} тем</span>
                <i className={`fas fa-chevron-${activeCategory === category.name ? 'down' : 'right'} category-arrow`}></i>
              </div>
              
              {activeCategory === category.name && (
                <div className="topics-list">
                  {category.topics.map((topic, idx) => {
                    const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;
                    return (
                      <div key={idx} className="topic-item-wrapper">
                        <div 
                          className={`topic-header ${activeTopic === topic.title ? 'active' : ''}`}
                          onClick={() => {
                            if (hasSubtopics) {
                              toggleTopic(topic.title);
                            }
                            handleSelectTopic(category.name, topic);
                          }}
                          style={{ cursor: 'pointer' }}
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
                            {topic.subtopics.map((subtopic, subIdx) => (
                              <div 
                                key={subIdx} 
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

        <div className="footer" to="/profile">
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

      <div className="right_content">
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
              <div className="content-badge">
                {selectedContent.parentTopic && (
                  <span className="content-parent"> в {selectedContent.parentTopic}</span>
                )}
              </div>
              <h2 className="content-title">{selectedContent.title}</h2>
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
          </div>
        ) : (
          <div className="content-empty-state">
            <i className="fas fa-hand-pointer"></i>
            <h3>Выберите тему или подтему</h3>
            <p>Нажмите на тему или подтему слева, чтобы увидеть её содержание</p>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  // ===== ОБЩИЙ СТЕЙТ ДЛЯ КАТЕГОРИЙ =====
  const [categories, setCategories] = useState([
    {
      id: 1,
      name: 'Python',
      icon: 'fab fa-python',
      topics: [
        { 
          id: 1, 
          title: 'FastAPI', 
          technologies: ['Python'], 
          description: 'Современный веб-фреймворк для Python. Позволяет быстро создавать REST API с минимальным количеством кода.',
          subtopics: [
            { id: 101, title: 'GET запросы', description: 'Обработка GET запросов в FastAPI. GET используется для получения данных с сервера.' },
            { id: 102, title: 'POST запросы', description: 'Обработка POST запросов в FastAPI. POST используется для создания новых данных на сервере.' },
            { id: 103, title: 'PUT запросы', description: 'Обработка PUT запросов в FastAPI. PUT используется для полного обновления данных.' }
          ]
        },
        { 
          id: 2, 
          title: 'Django', 
          technologies: ['Python'], 
          description: 'Полноценный веб-фреймворк для Python. Включает всё необходимое для разработки крупных проектов.',
          subtopics: [
            { id: 201, title: 'Модели', description: 'Работа с моделями в Django. Модели описывают структуру данных в базе.' },
            { id: 202, title: 'Представления', description: 'Контроллеры в Django. Представления обрабатывают запросы и возвращают ответы.' }
          ]
        },
      ]
    },
    {
      id: 2,
      name: 'C++',
      icon: 'fas fa-code',
      topics: [
        { 
          id: 3, 
          title: 'STL', 
          technologies: ['C++'], 
          description: 'Стандартная библиотека шаблонов C++. Предоставляет готовые структуры данных и алгоритмы.',
          subtopics: [
            { id: 301, title: 'Векторы', description: 'Работа с векторами в STL. Вектор — динамический массив, который может изменять свой размер.' },
            { id: 302, title: 'Списки', description: 'Работа со списками в STL. Список — двунаправленный связанный список.' }
          ]
        },
      ]
    },
    {
      id: 3,
      name: 'C#',
      icon: 'fas fa-shield-alt',
      topics: [
        { 
          id: 4, 
          title: 'ASP.NET Core', 
          technologies: ['C#'], 
          description: 'Веб-фреймворк для C#. Позволяет создавать современные веб-приложения и API.',
          subtopics: [
            { id: 401, title: 'Контроллеры', description: 'Работа с контроллерами в ASP.NET Core. Контроллеры обрабатывают HTTP-запросы.' },
            { id: 402, title: 'Middleware', description: 'Промежуточное ПО в ASP.NET Core. Обрабатывает запросы и ответы на разных этапах.' }
          ]
        },
      ]
    },
    {
      id: 4,
      name: 'Docker',
      icon: 'fab fa-docker',
      topics: [
        { 
          id: 5, 
          title: 'Docker Compose', 
          technologies: ['Docker'], 
          description: 'Инструмент для запуска многоконтейнерных приложений. Позволяет описывать и запускать все сервисы в одном файле.',
          subtopics: [
            { id: 501, title: 'docker-compose.yml', description: 'Основной файл конфигурации Docker Compose. Описывает все сервисы, сети и тома.' },
            { id: 502, title: 'Сети в Compose', description: 'Настройка сетей в Docker Compose. Позволяет контейнерам общаться друг с другом.' }
          ]
        },
      ]
    }
  ]);

  // ===== НАСТРОЙКИ =====
  const [settings, setSettings] = useState({
    siteName: 'ДубльПар.ru',
    siteDescription: 'Образовательный проект по РПО',
    logoUrl: '/logo.png',
    primaryColor: '#7c3aed',
    theme: 'light',
    language: 'ru',
    registrationEnabled: true,
    maintenanceMode: false,
    enableComments: true,
    enableProgressTracking: true,
    emailNotifications: true,
    newTopicsNotifications: true,
    newUsersNotifications: true,
    systemNotifications: true
  });

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await get('/api/categories/');
        if (data.length > 0) {
          setCategories(data);
        }
      } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        // Используем локальные данные как fallback
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
        <Route path="/" element={<HomePage categories={categories} settings={settings} />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile/:userId?" element={<Profile />} />
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
        <Route path="/topic/:language/:topic" element={
          <div className="topic-page">
            <button className="btn-back" onClick={() => window.history.back()}>← Назад</button>
            <h1>Страница темы</h1>
          </div>
        } />
      </Routes>
    </div>
  );
}

export default App;