import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminPanel() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const editorRef = useRef(null);
  const [pendingFormat, setPendingFormat] = useState(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    color: false,
    size: false
  });
  
  // Структура: ЯП → темы (как на главной)
  const [categories, setCategories] = useState([
    {
      id: 1,
      name: 'Python',
      icon: 'fab fa-python',
      topics: [
        { id: 1, title: 'Введение в Python', technologies: ['Python'], description: 'Базовые понятия Python' },
        { id: 2, title: 'Типы данных', technologies: ['Python'], description: 'Строки, числа, списки' },
        { id: 3, title: 'Функции', technologies: ['Python'], description: 'Создание и использование функций' },
      ]
    },
    {
      id: 2,
      name: 'C++',
      icon: 'fas fa-code',
      topics: [
        { id: 4, title: 'Основы C++', technologies: ['C++'], description: 'Начало работы с C++' },
        { id: 5, title: 'Указатели', technologies: ['C++'], description: 'Работа с памятью' },
      ]
    },
    {
      id: 3,
      name: 'C#',
      icon: 'fas fa-shield-alt',
      topics: [
        { id: 6, title: 'Введение в C#', technologies: ['C#'], description: 'Основы C#' },
        { id: 7, title: 'LINQ', technologies: ['C#'], description: 'Язык запросов' },
      ]
    },
    {
      id: 4,
      name: 'Docker',
      icon: 'fab fa-docker',
      topics: [
        { id: 8, title: 'Введение в Docker', technologies: ['Docker'], description: 'Контейнеризация' },
        { id: 9, title: 'Docker Compose', technologies: ['Docker'], description: 'Мультиконтейнерные приложения' },
      ]
    }
  ]);

  const [newTopic, setNewTopic] = useState({ 
    title: '', 
    technologies: '', 
    description: '' 
  });

  // Палитра цветов как в Figma
  const colorPalette = [
    '#EF4444', '#F87171', '#FCA5A5', '#FECACA',
    '#F97316', '#FB923C', '#FDBA74', '#FED7AA',
    '#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A',
    '#10B981', '#34D399', '#6EE7B7', '#A7F3D0',
    '#06B6D4', '#22D3EE', '#67E8F9', '#A5F3FC',
    '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE',
    '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE',
    '#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8',
    '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB',
    '#000000', '#1F2937', '#374151', '#FFFFFF'
  ];

  // Фильтрация категорий
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
    } else {
      setActiveCategory(name);
    }
  };

  const handleAddTopic = (e) => {
    e.preventDefault();
    const category = categories.find(c => c.name === activeCategory);
    if (!category) {
      alert('Сначала выберите язык программирования');
      return;
    }

    const descriptionHTML = editorRef.current ? editorRef.current.innerHTML : '';

    if (editingId) {
      setCategories(categories.map(c => 
        c.name === activeCategory ? {
          ...c,
          topics: c.topics.map(t => 
            t.id === editingId ? { 
              ...t, 
              ...newTopic, 
              technologies: newTopic.technologies.split(',').map(s => s.trim()),
              description: descriptionHTML
            } : t
          )
        } : c
      ));
      setEditingId(null);
    } else {
      setCategories(categories.map(c => 
        c.name === activeCategory ? {
          ...c,
          topics: [...c.topics, { 
            id: Date.now(), 
            ...newTopic, 
            technologies: newTopic.technologies.split(',').map(s => s.trim()),
            description: descriptionHTML
          }]
        } : c
      ));
    }
    setNewTopic({ title: '', technologies: '', description: '' });
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  };

  const handleEdit = (topic) => {
    setEditingId(topic.id);
    setNewTopic({ 
      title: topic.title, 
      technologies: topic.technologies.join(', '), 
      description: topic.description || '' 
    });
    const category = categories.find(c => c.topics.some(t => t.id === topic.id));
    if (category) {
      setActiveCategory(category.name);
    }
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = topic.description || '';
      }
    }, 100);
  };

  const handleDelete = (id) => {
    if (window.confirm('Удалить тему?')) {
      setCategories(categories.map(c => 
        c.name === activeCategory ? {
          ...c,
          topics: c.topics.filter(t => t.id !== id)
        } : c
      ));
    }
  };

  const handleContextMenu = (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
      e.preventDefault();
      setSelectedText(text);
      
      // Проверяем активное форматирование у выделенного текста
      checkActiveFormats();
      
      setShowEditorModal(true);
    }
  };

  // Проверка активного форматирования у выделенного текста
  const checkActiveFormats = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const parentElement = range.commonAncestorContainer.parentElement;
    
    const formats = {
      bold: false,
      italic: false,
      underline: false,
      color: false,
      size: false
    };
    
    // Проверяем родительские элементы
    let el = parentElement;
    while (el && el !== editorRef.current) {
      if (el.tagName === 'STRONG' || el.style.fontWeight === 'bold' || el.style.fontWeight === '700') {
        formats.bold = true;
      }
      if (el.tagName === 'EM' || el.style.fontStyle === 'italic') {
        formats.italic = true;
      }
      if (el.tagName === 'U' || el.style.textDecoration === 'underline') {
        formats.underline = true;
      }
      if (el.style.color && el.style.color !== 'rgb(0, 0, 0)') {
        formats.color = true;
      }
      if (el.style.fontSize && el.style.fontSize !== '16px') {
        formats.size = true;
      }
      el = el.parentElement;
    }
    
    setActiveFormats(formats);
  };

  const applyFormatting = (format) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    if (!selectedText) return;
    
    if (format === 'color') {
      setPendingFormat('color');
      setShowColorPicker(true);
      return;
    }
    
    const span = document.createElement('span');
    
    switch(format) {
      case 'bold':
        span.style.fontWeight = activeFormats.bold ? 'normal' : 'bold';
        break;
      case 'italic':
        span.style.fontStyle = activeFormats.italic ? 'normal' : 'italic';
        break;
      case 'underline':
        span.style.textDecoration = activeFormats.underline ? 'none' : 'underline';
        break;
      case 'size':
        const size = prompt('Введите размер (1-7):', '3');
        if (size) {
          span.style.fontSize = `${size}em`;
        } else {
          return;
        }
        break;
      default:
        return;
    }
    
    span.textContent = selectedText;
    range.deleteContents();
    range.insertNode(span);
    
    selection.removeAllRanges();
    setShowEditorModal(false);
  };

  const applyColor = (color) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    if (!selectedText) return;
    
    const span = document.createElement('span');
    span.style.color = color;
    span.textContent = selectedText;
    range.deleteContents();
    range.insertNode(span);
    
    selection.removeAllRanges();
    setShowColorPicker(false);
    setShowEditorModal(false);
    setPendingFormat(null);
    
    // Обновляем активные форматы
    setActiveFormats(prev => ({ ...prev, color: true }));
  };

  const getActiveCategory = () => {
    return categories.find(c => c.name === activeCategory);
  };

  const activeCategoryData = getActiveCategory();
  const totalTopics = categories.reduce((acc, c) => acc + c.topics.length, 0);
  const totalTechs = [...new Set(categories.flatMap(c => c.topics.flatMap(t => t.technologies)))].length;

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
          <Link to="/admin" className="admin-menu-item active">
            <i className="fas fa-book"></i> Управление темами
          </Link>
          <Link to="/admin/modules" className="admin-menu-item">
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
            <h1><i className="fas fa-book"></i> Управление темами</h1>
            <p className="admin-subtitle">Управляй темами внутри каждого языка программирования</p>
          </div>
          <button className="btn-back" onClick={() => navigate('/')}>
            <i className="fas fa-arrow-left"></i> На главную
          </button>
        </div>

        {/* Статистика */}
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-file-alt"></i></div>
            <div className="stat-info">
              <span className="stat-number">{totalTopics}</span>
              <span className="stat-label">Всего тем</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-code"></i></div>
            <div className="stat-info">
              <span className="stat-number">{totalTechs}</span>
              <span className="stat-label">Технологий</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-folder"></i></div>
            <div className="stat-info">
              <span className="stat-number">{categories.length}</span>
              <span className="stat-label">Языков</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-layer-group"></i></div>
            <div className="stat-info">
              <span className="stat-number">0</span>
              <span className="stat-label">Модулей</span>
            </div>
          </div>
        </div>

        {/* Две колонки */}
        <div className="admin-two-columns-reversed">
          {/* Левая колонка - Форма */}
          <div className="admin-left-col">
            <div className="admin-form-top">
              <h2>
                <i className={`fas ${editingId ? 'fa-pen' : 'fa-plus-circle'}`}></i> 
                {editingId ? 'Редактировать тему' : 'Добавить тему'}
                {activeCategoryData && (
                  <span className="form-category-badge">
                    <i className={activeCategoryData.icon}></i> {activeCategoryData.name}
                  </span>
                )}
              </h2>
              <form className="admin-form-top" onSubmit={handleAddTopic}>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Технологии (через запятую)"
                    value={newTopic.technologies}
                    onChange={(e) => setNewTopic({ ...newTopic, technologies: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Название темы"
                    value={newTopic.title}
                    onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group full-width">
                  <div className="editor-label">Описание темы *</div>
                  <div
                    ref={editorRef}
                    className="editor-content"
                    contentEditable="true"
                    onContextMenu={handleContextMenu}
                    placeholder="Введите описание..."
                    dangerouslySetInnerHTML={editingId ? { __html: newTopic.description } : undefined}
                  />
                  <div className="editor-hint">
                    <i className="fas fa-info-circle"></i> Выделите текст левой кнопкой и нажмите правую кнопку мыши для форматирования
                  </div>
                </div>
                <div className="form-buttons">
                  <button type="submit" className="btn-submit">
                    <i className={`fas ${editingId ? 'fa-save' : 'fa-plus'}`}></i>
                    {editingId ? ' Сохранить' : ' Добавить'}
                  </button>
                  {editingId && (
                    <button type="button" className="btn-cancel" onClick={() => { 
                      setEditingId(null); 
                      setNewTopic({ title: '', technologies: '', description: '' }); 
                      if (editorRef.current) {
                        editorRef.current.innerHTML = '';
                      }
                    }}>
                      <i className="fas fa-times"></i> Отмена
                    </button>
                  )}
                </div>
              </form>
              {!activeCategoryData && (
                <div className="form-hint">
                  <i className="fas fa-info-circle"></i> Сначала выберите язык программирования справа
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка - Каталог */}
          <div className="admin-right-col">
            <div className="admin-catalog-wrapper">
              <div className="admin-search-container">
                <input 
                  type="text" 
                  className="admin-search-input" 
                  placeholder="Поиск темы или языка..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="catalog-title">
                <i className="fas fa-book"></i> Каталог языков
              </div>
              
              {filteredCategories.map((category) => (
                <div key={category.id} className="category-item">
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
                      {category.topics.map((topic, idx) => (
                        <div key={topic.id} className="topic-item-catalog">
                          <i className="fas fa-circle topic-dot"></i>
                          <span className="topic-title-catalog">{topic.title}</span>
                          <div className="topic-actions-catalog">
                            <button 
                              className="btn-edit-small" 
                              onClick={() => handleEdit(topic)} 
                              title="Редактировать"
                            >
                              <i className="fas fa-pen"></i>
                            </button>
                            <button 
                              className="btn-delete-small" 
                              onClick={() => handleDelete(topic.id)} 
                              title="Удалить"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                      {category.topics.length === 0 && (
                        <div className="empty-topics-catalog">
                          <p>Нет тем в этом языке</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно редактора */}
      {showEditorModal && (
        <div 
          className="editor-modal-overlay" 
          onClick={() => {
            setShowEditorModal(false);
            setShowColorPicker(false);
          }}
        >
          <div 
            className="editor-modal" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="editor-modal-header">
              <h3><i className="fas fa-edit"></i> Форматирование текста</h3>
              <button className="editor-modal-close" onClick={() => {
                setShowEditorModal(false);
                setShowColorPicker(false);
              }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="editor-modal-body">
              <p className="editor-selected-text">Выделенный текст: <span>"{selectedText}"</span></p>
              
              {showColorPicker ? (
                <div className="color-picker-container">
                  <p className="color-picker-title">Выберите цвет:</p>
                  <div className="color-palette">
                    {colorPalette.map((color, index) => (
                      <div
                        key={index}
                        className="color-swatch"
                        style={{ backgroundColor: color }}
                        onClick={() => applyColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                  <button 
                    className="color-picker-back"
                    onClick={() => setShowColorPicker(false)}
                  >
                    <i className="fas fa-arrow-left"></i> Назад
                  </button>
                </div>
              ) : (
                <div className="editor-tools">
                  <button 
                    className={`editor-tool-btn ${activeFormats.bold ? 'active' : ''}`} 
                    onClick={() => applyFormatting('bold')} 
                    title="Жирный"
                  >
                    <i className="fas fa-bold"></i>
                  </button>
                  <button 
                    className={`editor-tool-btn ${activeFormats.italic ? 'active' : ''}`} 
                    onClick={() => applyFormatting('italic')} 
                    title="Курсив"
                  >
                    <i className="fas fa-italic"></i>
                  </button>
                  <button 
                    className={`editor-tool-btn ${activeFormats.underline ? 'active' : ''}`} 
                    onClick={() => applyFormatting('underline')} 
                    title="Подчёркнутый"
                  >
                    <i className="fas fa-underline"></i>
                  </button>
                  <button 
                    className={`editor-tool-btn ${activeFormats.size ? 'active' : ''}`} 
                    onClick={() => applyFormatting('size')} 
                    title="Размер"
                  >
                    <i className="fas fa-font"></i>
                  </button>
                  <button 
                    className={`editor-tool-btn ${activeFormats.color ? 'active' : ''}`} 
                    onClick={() => applyFormatting('color')} 
                    title="Цвет"
                  >
                    <i className="fas fa-palette"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;