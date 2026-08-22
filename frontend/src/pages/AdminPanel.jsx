import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback
} from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminPanel() {
  const navigate = useNavigate();

  /* =========================================================
     STATE
  ========================================================= */

  const [activeCategory, setActiveCategory] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  const [selectedText, setSelectedText] = useState('');

  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    color: false,
    size: false
  });

  const [categories, setCategories] = useState([
    {
      id: 1,
      name: 'Python',
      icon: 'fab fa-python',
      topics: [
        {
          id: 1,
          title: 'Введение в Python',
          technologies: ['Python'],
          description: '<p>Базовые понятия Python</p>'
        },
        {
          id: 2,
          title: 'Типы данных',
          technologies: ['Python'],
          description: '<p>Строки, числа, списки</p>'
        },
        {
          id: 3,
          title: 'Функции',
          technologies: ['Python'],
          description: '<p>Создание и использование функций</p>'
        }
      ]
    },
    {
      id: 2,
      name: 'C++',
      icon: 'fas fa-code',
      topics: [
        {
          id: 4,
          title: 'Основы C++',
          technologies: ['C++'],
          description: '<p>Начало работы с C++</p>'
        },
        {
          id: 5,
          title: 'Указатели',
          technologies: ['C++'],
          description: '<p>Работа с памятью</p>'
        }
      ]
    },
    {
      id: 3,
      name: 'C#',
      icon: 'fas fa-shield-alt',
      topics: [
        {
          id: 6,
          title: 'Введение в C#',
          technologies: ['C#'],
          description: '<p>Основы C#</p>'
        },
        {
          id: 7,
          title: 'LINQ',
          technologies: ['C#'],
          description: '<p>Язык запросов</p>'
        }
      ]
    },
    {
      id: 4,
      name: 'Docker',
      icon: 'fab fa-docker',
      topics: [
        {
          id: 8,
          title: 'Введение в Docker',
          technologies: ['Docker'],
          description: '<p>Контейнеризация</p>'
        },
        {
          id: 9,
          title: 'Docker Compose',
          technologies: ['Docker'],
          description: '<p>Мультиконтейнерные приложения</p>'
        }
      ]
    }
  ]);

  const [newTopic, setNewTopic] = useState({
    title: '',
    technologies: '',
    description: ''
  });

  /* =========================================================
     REFS
  ========================================================= */

  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const selectionTimeoutRef = useRef(null);

  /* =========================================================
     PALETTE
  ========================================================= */

  const colorPalette = [
    '#EF4444',
    '#F87171',
    '#FCA5A5',
    '#FECACA',

    '#F97316',
    '#FB923C',
    '#FDBA74',
    '#FED7AA',

    '#F59E0B',
    '#FBBF24',
    '#FCD34D',
    '#FDE68A',

    '#10B981',
    '#34D399',
    '#6EE7B7',
    '#A7F3D0',

    '#06B6D4',
    '#22D3EE',
    '#67E8F9',
    '#A5F3FC',

    '#3B82F6',
    '#60A5FA',
    '#93C5FD',
    '#BFDBFE',

    '#8B5CF6',
    '#A78BFA',
    '#C4B5FD',
    '#DDD6FE',

    '#EC4899',
    '#F472B6',
    '#F9A8D4',
    '#FBCFE8',

    '#6B7280',
    '#9CA3AF',
    '#D1D5DB',
    '#E5E7EB',

    '#000000',
    '#1F2937',
    '#374151',
    '#FFFFFF'
  ];

  const fontSizes = [10, 12, 14, 16, 18, 24];

  /* =========================================================
     ACTIVE CATEGORY
  ========================================================= */

  const getActiveCategory = useCallback(() => {
    return categories.find(
      category => category.name === activeCategory
    );
  }, [categories, activeCategory]);

  const activeCategoryData = getActiveCategory();

  /* =========================================================
     EDITOR HTML
     
     ВАЖНО:
     Мы больше НЕ используем textContent для HTML.
     Форматирование должно сохраняться как HTML.
  ========================================================= */

  const getEditorHTML = useCallback(() => {
    if (!editorRef.current) {
      return '';
    }

    return editorRef.current.innerHTML;
  }, []);

  const syncEditorToState = useCallback(() => {
    if (!editorRef.current) {
      return;
    }

    const html = editorRef.current.innerHTML;

    setNewTopic(prev => ({
      ...prev,
      description: html
    }));
  }, []);

  /* =========================================================
     SELECTION
  ========================================================= */

  const saveSelection = useCallback(() => {
    try {
      const selection = window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed
      ) {
        return false;
      }

      const range = selection.getRangeAt(0);

      if (!editorRef.current) {
        return false;
      }

      const editor = editorRef.current;

      if (
        !editor.contains(range.commonAncestorContainer)
      ) {
        return false;
      }

      savedRangeRef.current = range.cloneRange();

      return true;
    } catch (error) {
      console.error(
        'Ошибка сохранения выделения:',
        error
      );

      return false;
    }
  }, []);

  const restoreSelection = useCallback(() => {
    try {
      if (
        !editorRef.current ||
        !savedRangeRef.current
      ) {
        return false;
      }

      const selection = window.getSelection();

      selection.removeAllRanges();

      selection.addRange(
        savedRangeRef.current
      );

      return true;
    } catch (error) {
      console.error(
        'Ошибка восстановления выделения:',
        error
      );

      return false;
    }
  }, []);

  const clearSavedSelection = useCallback(() => {
    savedRangeRef.current = null;

    try {
      const selection = window.getSelection();

      if (selection) {
        selection.removeAllRanges();
      }
    } catch (error) {
      console.error(
        'Ошибка очистки выделения:',
        error
      );
    }
  }, []);

  /* =========================================================
     ACTIVE FORMATS
  ========================================================= */

  const checkActiveFormats = useCallback(() => {
    try {
      if (!editorRef.current) {
        return;
      }

      const selection = window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0
      ) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (
        !editorRef.current.contains(
          range.commonAncestorContainer
        )
      ) {
        return;
      }

      const bold =
        document.queryCommandState('bold');

      const italic =
        document.queryCommandState('italic');

      const underline =
        document.queryCommandState('underline');

      let color = false;

      try {
        const value =
          document.queryCommandValue('foreColor');

        if (
          value &&
          value !== 'rgb(0, 0, 0)' &&
          value !== '#000000' &&
          value !== 'black'
        ) {
          color = true;
        }
      } catch {
        color = false;
      }

      let size = false;

      try {
        const value =
          document.queryCommandValue('fontSize');

        if (
          value &&
          value !== '3'
        ) {
          size = true;
        }
      } catch {
        size = false;
      }

      setActiveFormats({
        bold,
        italic,
        underline,
        color,
        size
      });
    } catch (error) {
      console.error(
        'Ошибка проверки форматирования:',
        error
      );
    }
  }, []);

  /* =========================================================
     EXECUTE FORMAT COMMAND
  ========================================================= */

  const executeFormatCommand = useCallback(
    command => {
      if (!editorRef.current) {
        return;
      }

      try {
        editorRef.current.focus();

        const restored =
          restoreSelection();

        if (!restored) {
          return;
        }

        document.execCommand(
          command,
          false,
          null
        );

        syncEditorToState();

        requestAnimationFrame(() => {
          checkActiveFormats();
        });
      } catch (error) {
        console.error(
          `Ошибка команды ${command}:`,
          error
        );
      }
    },
    [
      restoreSelection,
      syncEditorToState,
      checkActiveFormats
    ]
  );

  /* =========================================================
     OPEN FORMAT MODAL
  ========================================================= */

  const openEditorModal = useCallback(() => {
    if (!editorRef.current) {
      return;
    }

    const selection =
      window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed
    ) {
      return;
    }

    const range =
      selection.getRangeAt(0);

    if (
      !editorRef.current.contains(
        range.commonAncestorContainer
      )
    ) {
      return;
    }

    const text =
      selection.toString().trim();

    if (!text) {
      return;
    }

    savedRangeRef.current =
      range.cloneRange();

    setSelectedText(text);

    setShowColorPicker(false);
    setShowSizePicker(false);

    setShowEditorModal(true);

    requestAnimationFrame(() => {
      checkActiveFormats();
    });
  }, [checkActiveFormats]);

  /* =========================================================
     CONTEXT MENU
  ========================================================= */

  const handleContextMenu = useCallback(
    event => {
      const selection =
        window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0
      ) {
        return;
      }

      const text =
        selection.toString().trim();

      if (!text) {
        return;
      }

      if (
        !editorRef.current?.contains(
          selection.anchorNode
        )
      ) {
        return;
      }

      event.preventDefault();

      openEditorModal();
    },
    [openEditorModal]
  );

  /* =========================================================
     MOUSE UP
  ========================================================= */

  const handleEditorMouseUp =
    useCallback(() => {
      saveSelection();

      if (selectionTimeoutRef.current) {
        clearTimeout(
          selectionTimeoutRef.current
        );
      }

      selectionTimeoutRef.current =
        setTimeout(() => {
          checkActiveFormats();
        }, 50);
    }, [
      saveSelection,
      checkActiveFormats
    ]);

  /* =========================================================
     KEY UP
  ========================================================= */

  const handleEditorKeyUp =
    useCallback(() => {
      saveSelection();

      if (selectionTimeoutRef.current) {
        clearTimeout(
          selectionTimeoutRef.current
        );
      }

      selectionTimeoutRef.current =
        setTimeout(() => {
          checkActiveFormats();
        }, 50);
    }, [
      saveSelection,
      checkActiveFormats
    ]);

  /* =========================================================
     INPUT
  ========================================================= */

  const handleEditorInput =
    useCallback(() => {
      syncEditorToState();
    }, [syncEditorToState]);

  /* =========================================================
     FOCUS
  ========================================================= */

  const handleEditorFocus =
    useCallback(() => {
      saveSelection();
    }, [saveSelection]);

  /* =========================================================
     COLOR
  ========================================================= */

  const applyColor = useCallback(
    color => {
      if (!editorRef.current) {
        return;
      }

      try {
        editorRef.current.focus();

        const restored =
          restoreSelection();

        if (!restored) {
          return;
        }

        document.execCommand(
          'foreColor',
          false,
          color
        );

        syncEditorToState();

        setShowColorPicker(false);
        setShowSizePicker(false);

        requestAnimationFrame(() => {
          checkActiveFormats();
        });
      } catch (error) {
        console.error(
          'Ошибка применения цвета:',
          error
        );
      }
    },
    [
      restoreSelection,
      syncEditorToState,
      checkActiveFormats
    ]
  );

  /* =========================================================
     FONT SIZE
  ========================================================= */

  const applyFontSize = useCallback(
    size => {
      if (!editorRef.current) {
        return;
      }

      const sizeMap = {
        10: '1',
        12: '2',
        14: '3',
        16: '4',
        18: '5',
        24: '6'
      };

      try {
        editorRef.current.focus();

        const restored =
          restoreSelection();

        if (!restored) {
          return;
        }

        document.execCommand(
          'fontSize',
          false,
          sizeMap[size] || '3'
        );

        syncEditorToState();

        setShowSizePicker(false);
        setShowColorPicker(false);

        requestAnimationFrame(() => {
          checkActiveFormats();
        });
      } catch (error) {
        console.error(
          'Ошибка применения размера:',
          error
        );
      }
    },
    [
      restoreSelection,
      syncEditorToState,
      checkActiveFormats
    ]
  );

  /* =========================================================
     CLEAR FORMATTING
  ========================================================= */

  const clearFormatting =
    useCallback(() => {
      if (!editorRef.current) {
        return;
      }

      try {
        editorRef.current.focus();

        const restored =
          restoreSelection();

        if (!restored) {
          return;
        }

        document.execCommand(
          'removeFormat',
          false,
          null
        );

        syncEditorToState();

        setActiveFormats({
          bold: false,
          italic: false,
          underline: false,
          color: false,
          size: false
        });

        requestAnimationFrame(() => {
          checkActiveFormats();
        });
      } catch (error) {
        console.error(
          'Ошибка очистки форматирования:',
          error
        );
      }
    }, [
      restoreSelection,
      syncEditorToState,
      checkActiveFormats
    ]);

  /* =========================================================
     CLOSE MODAL
  ========================================================= */

  const closeModal =
    useCallback(() => {
      setShowEditorModal(false);
      setShowColorPicker(false);
      setShowSizePicker(false);
      setSelectedText('');

      setActiveFormats({
        bold: false,
        italic: false,
        underline: false,
        color: false,
        size: false
      });

      clearSavedSelection();
    }, [clearSavedSelection]);

  /* =========================================================
     EDIT TOPIC
  ========================================================= */

  const handleEdit =
    useCallback(
      topic => {
        const category =
          categories.find(
            c =>
              c.topics.some(
                t => t.id === topic.id
              )
          );

        if (!category) {
          return;
        }

        setEditingId(topic.id);

        setActiveCategory(
          category.name
        );

        setNewTopic({
          title: topic.title || '',
          technologies:
            Array.isArray(
              topic.technologies
            )
              ? topic.technologies.join(', ')
              : '',
          description:
            topic.description || ''
        });

        setShowEditorModal(false);
        setShowColorPicker(false);
        setShowSizePicker(false);

        setActiveFormats({
          bold: false,
          italic: false,
          underline: false,
          color: false,
          size: false
        });

        clearSavedSelection();
      },
      [
        categories,
        clearSavedSelection
      ]
    );

  /* =========================================================
     LOAD HTML INTO EDITOR ONLY WHEN EDITING STARTS
     
     ВАЖНО:
     Здесь больше НЕТ зависимости от newTopic.description.
     Поэтому React не перезаписывает редактор во время печати.
  ========================================================= */

  useEffect(() => {
    if (
      !editorRef.current ||
      editingId === null
    ) {
      return;
    }

    editorRef.current.innerHTML =
      newTopic.description || '';
  }, [editingId]);

  /* =========================================================
     ADD / SAVE TOPIC
  ========================================================= */

  const handleAddTopic =
    useCallback(
      event => {
        event.preventDefault();

        if (!activeCategoryData) {
          alert(
            'Сначала выберите язык программирования'
          );
          return;
        }

        const title =
          newTopic.title.trim();

        const technologies =
          newTopic.technologies
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        const descriptionHTML =
          getEditorHTML();

        const descriptionText =
          editorRef.current?.innerText
            ?.replace(/\s+/g, ' ')
            .trim() || '';

        if (!title) {
          alert(
            'Введите название темы'
          );
          return;
        }

        if (technologies.length === 0) {
          alert(
            'Укажите хотя бы одну технологию'
          );
          return;
        }

        if (!descriptionText) {
          alert(
            'Введите описание темы'
          );
          return;
        }

        if (editingId !== null) {
          setCategories(prev =>
            prev.map(category => {
              if (
                category.name !==
                activeCategory
              ) {
                return category;
              }

              return {
                ...category,
                topics:
                  category.topics.map(
                    topic => {
                      if (
                        topic.id !==
                        editingId
                      ) {
                        return topic;
                      }

                      return {
                        ...topic,
                        title,
                        technologies,
                        description:
                          descriptionHTML
                      };
                    }
                  )
              };
            })
          );
        } else {
          setCategories(prev =>
            prev.map(category => {
              if (
                category.name !==
                activeCategory
              ) {
                return category;
              }

              return {
                ...category,
                topics: [
                  ...category.topics,
                  {
                    id: Date.now(),
                    title,
                    technologies,
                    description:
                      descriptionHTML
                  }
                ]
              };
            })
          );
        }

        setEditingId(null);

        setNewTopic({
          title: '',
          technologies: '',
          description: ''
        });

        if (editorRef.current) {
          editorRef.current.innerHTML =
            '';
        }

        clearSavedSelection();

        setActiveFormats({
          bold: false,
          italic: false,
          underline: false,
          color: false,
          size: false
        });
      },
      [
        activeCategoryData,
        activeCategory,
        editingId,
        newTopic,
        getEditorHTML,
        clearSavedSelection
      ]
    );

  /* =========================================================
     DELETE TOPIC
  ========================================================= */

  const handleDelete =
    useCallback(
      id => {
        if (
          !window.confirm(
            'Удалить тему?'
          )
        ) {
          return;
        }

        setCategories(prev =>
          prev.map(category => {
            if (
              category.name !==
              activeCategory
            ) {
              return category;
            }

            return {
              ...category,
              topics:
                category.topics.filter(
                  topic =>
                    topic.id !== id
                )
            };
          })
        );

        if (editingId === id) {
          setEditingId(null);

          setNewTopic({
            title: '',
            technologies: '',
            description: ''
          });

          if (editorRef.current) {
            editorRef.current.innerHTML =
              '';
          }
        }
      },
      [
        activeCategory,
        editingId
      ]
    );

  /* =========================================================
     CANCEL EDIT
  ========================================================= */

  const handleCancelEdit =
    useCallback(() => {
      setEditingId(null);

      setNewTopic({
        title: '',
        technologies: '',
        description: ''
      });

      if (editorRef.current) {
        editorRef.current.innerHTML =
          '';
      }

      clearSavedSelection();

      setActiveFormats({
        bold: false,
        italic: false,
        underline: false,
        color: false,
        size: false
      });
    }, [clearSavedSelection]);

  /* =========================================================
     CATEGORY TOGGLE
  ========================================================= */

  const toggleCategory =
    useCallback(name => {
      setActiveCategory(prev =>
        prev === name
          ? null
          : name
      );
    }, []);

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredCategories =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      if (!search) {
        return categories;
      }

      return categories
        .map(category => ({
          ...category,
          topics:
            category.topics.filter(
              topic =>
                topic.title
                  .toLowerCase()
                  .includes(search) ||
                category.name
                  .toLowerCase()
                  .includes(search)
            )
        }))
        .filter(
          category =>
            category.topics.length > 0
        );
    }, [
      categories,
      searchTerm
    ]);

  /* =========================================================
     STATS
  ========================================================= */

  const totalTopics =
    useMemo(() => {
      return categories.reduce(
        (total, category) =>
          total +
          category.topics.length,
        0
      );
    }, [categories]);

  const totalTechs =
    useMemo(() => {
      return new Set(
        categories.flatMap(
          category =>
            category.topics.flatMap(
              topic =>
                topic.technologies
            )
        )
      ).size;
    }, [categories]);

  /* =========================================================
     SELECTION CHANGE
  ========================================================= */

  useEffect(() => {
    if (!showEditorModal) {
      return;
    }

    const handleSelectionChange =
      () => {
        if (!editorRef.current) {
          return;
        }

        const selection =
          window.getSelection();

        if (
          !selection ||
          selection.rangeCount === 0
        ) {
          return;
        }

        const range =
          selection.getRangeAt(0);

        if (
          !editorRef.current.contains(
            range.commonAncestorContainer
          )
        ) {
          return;
        }

        if (
          selection.isCollapsed
        ) {
          return;
        }

        savedRangeRef.current =
          range.cloneRange();

        checkActiveFormats();
      };

    document.addEventListener(
      'selectionchange',
      handleSelectionChange
    );

    return () => {
      document.removeEventListener(
        'selectionchange',
        handleSelectionChange
      );
    };
  }, [
    showEditorModal,
    checkActiveFormats
  ]);

  /* =========================================================
     CLEANUP TIMEOUT
  ========================================================= */

  useEffect(() => {
    return () => {
      if (
        selectionTimeoutRef.current
      ) {
        clearTimeout(
          selectionTimeoutRef.current
        );
      }
    };
  }, []);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="admin-container">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <div className="admin-sidebar">

        <div className="header">
          <img
            className="logo"
            src="/logo.png"
            alt="logo"
          />
        </div>

        <div className="admin-menu">

          <div className="admin-menu-title">
            Навигация
          </div>

          <Link
            to="/"
            className="admin-menu-item"
          >
            <i className="fas fa-home"></i>
            На главную
          </Link>

          <Link
            to="/admin"
            className="admin-menu-item active"
          >
            <i className="fas fa-book"></i>
            Управление темами
          </Link>

          <Link
            to="/admin/modules"
            className="admin-menu-item"
          >
            <i className="fas fa-layer-group"></i>
            Модули
          </Link>

          <Link
            to="/admin/users"
            className="admin-menu-item"
          >
            <i className="fas fa-users"></i>
            Пользователи
          </Link>

          <Link
            to="/admin/settings"
            className="admin-menu-item"
          >
            <i className="fas fa-sliders-h"></i>
            Настройки
          </Link>

        </div>

        <div className="footer">

          <img
            src="/user_logo_one.png"
            alt="user_logo_one"
            className="user_logo"
          />

          <h3 className="username">
            Костя
          </h3>

        </div>

      </div>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <div className="admin-content">

        {/* HEADER */}

        <div className="admin-header">

          <div>

            <h1>
              <i className="fas fa-book"></i>
              Управление темами
            </h1>

            <p className="admin-subtitle">
              Управляй темами внутри каждого
              языка программирования
            </p>

          </div>

          <button
            className="btn-back"
            onClick={() =>
              navigate('/')
            }
            type="button"
          >
            <i className="fas fa-arrow-left"></i>
            На главную
          </button>

        </div>

        {/* ===================================================
            STATS
        =================================================== */}

        <div className="admin-stats">

          <div className="stat-card">

            <div className="stat-icon">
              <i className="fas fa-file-alt"></i>
            </div>

            <div className="stat-info">

              <span className="stat-number">
                {totalTopics}
              </span>

              <span className="stat-label">
                Всего тем
              </span>

            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              <i className="fas fa-code"></i>
            </div>

            <div className="stat-info">

              <span className="stat-number">
                {totalTechs}
              </span>

              <span className="stat-label">
                Технологий
              </span>

            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              <i className="fas fa-folder"></i>
            </div>

            <div className="stat-info">

              <span className="stat-number">
                {categories.length}
              </span>

              <span className="stat-label">
                Языков
              </span>

            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              <i className="fas fa-layer-group"></i>
            </div>

            <div className="stat-info">

              <span className="stat-number">
                0
              </span>

              <span className="stat-label">
                Модулей
              </span>

            </div>

          </div>

        </div>

        {/* ===================================================
            TWO COLUMNS
        =================================================== */}

        <div className="admin-two-columns-reversed">

          {/* =================================================
              FORM
          ================================================= */}

          <div className="admin-left-col">

            <div className="admin-form-top">

              <h2>

                <i
                  className={`fas ${
                    editingId !== null
                      ? 'fa-pen'
                      : 'fa-plus-circle'
                  }`}
                ></i>

                {editingId !== null
                  ? 'Редактировать тему'
                  : 'Добавить тему'}

                {activeCategoryData && (
                  <span className="form-category-badge">

                    <i
                      className={
                        activeCategoryData.icon
                      }
                    ></i>

                    {activeCategoryData.name}

                  </span>
                )}

              </h2>

              <form
                onSubmit={
                  handleAddTopic
                }
              >

                {/* TECHNOLOGIES */}

                <div className="form-group">

                  <input
                    type="text"
                    placeholder="Технологии (через запятую)"
                    value={
                      newTopic.technologies
                    }
                    onChange={event =>
                      setNewTopic(
                        prev => ({
                          ...prev,
                          technologies:
                            event.target.value
                        })
                      )
                    }
                    required
                  />

                </div>

                {/* TITLE */}

                <div className="form-group">

                  <input
                    type="text"
                    placeholder="Название темы"
                    value={
                      newTopic.title
                    }
                    onChange={event =>
                      setNewTopic(
                        prev => ({
                          ...prev,
                          title:
                            event.target.value
                        })
                      )
                    }
                    required
                  />

                </div>

                {/* EDITOR */}

                <div className="form-group full-width">

                  <div className="editor-label">
                    Описание темы *
                  </div>

                  <div
                    ref={editorRef}
                    className="editor-content"
                    contentEditable
                    suppressContentEditableWarning
                    onContextMenu={
                      handleContextMenu
                    }
                    onMouseUp={
                      handleEditorMouseUp
                    }
                    onKeyUp={
                      handleEditorKeyUp
                    }
                    onInput={
                      handleEditorInput
                    }
                    onFocus={
                      handleEditorFocus
                    }
                    data-placeholder="Введите описание темы..."
                  />

                  <div className="editor-hint">

                    <i className="fas fa-info-circle"></i>

                    Выделите текст левой кнопкой
                    мыши и нажмите правую кнопку
                    для форматирования

                  </div>

                </div>

                {/* BUTTONS */}

                <div className="form-buttons">

                  <button
                    type="submit"
                    className="btn-submit"
                  >

                    <i
                      className={`fas ${
                        editingId !== null
                          ? 'fa-save'
                          : 'fa-plus'
                      }`}
                    ></i>

                    {editingId !== null
                      ? 'Сохранить'
                      : 'Добавить'}

                  </button>

                  {editingId !== null && (
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={
                        handleCancelEdit
                      }
                    >

                      <i className="fas fa-times"></i>

                      Отмена

                    </button>
                  )}

                </div>

              </form>

              {!activeCategoryData && (
                <div className="form-hint">

                  <i className="fas fa-info-circle"></i>

                  Сначала выберите язык
                  программирования справа

                </div>
              )}

            </div>

          </div>

          {/* =================================================
              CATALOG
          ================================================= */}

          <div className="admin-right-col">

            <div className="admin-catalog-wrapper">

              <div className="admin-search-container">

                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Поиск темы или языка..."
                  value={searchTerm}
                  onChange={event =>
                    setSearchTerm(
                      event.target.value
                    )
                  }
                />

              </div>

              <div className="catalog-title">

                <i className="fas fa-book"></i>

                Каталог языков

              </div>

              {filteredCategories.map(
                category => (

                  <div
                    key={category.id}
                    className="category-item"
                  >

                    {/* CATEGORY */}

                    <div
                      className={`category-header ${
                        activeCategory ===
                        category.name
                          ? 'active'
                          : ''
                      }`}
                      onClick={() =>
                        toggleCategory(
                          category.name
                        )
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key ===
                            ' '
                        ) {
                          event.preventDefault();

                          toggleCategory(
                            category.name
                          );
                        }
                      }}
                    >

                      <i
                        className={`${category.icon} category-icon`}
                      ></i>

                      <span className="category-name">
                        {category.name}
                      </span>

                      <span className="topic-count">
                        {category.topics.length}{' '}
                        тем
                      </span>

                      <i
                        className={`fas fa-chevron-${
                          activeCategory ===
                          category.name
                            ? 'down'
                            : 'right'
                        } category-arrow`}
                      ></i>

                    </div>

                    {/* TOPICS */}

                    {activeCategory ===
                      category.name && (

                      <div className="topics-list">

                        {category.topics.map(
                          topic => (

                            <div
                              key={topic.id}
                              className="topic-item-catalog"
                            >

                              <i className="fas fa-circle topic-dot"></i>

                              <span className="topic-title-catalog">
                                {topic.title}
                              </span>

                              <div className="topic-actions-catalog">

                                <button
                                  type="button"
                                  className="btn-edit-small"
                                  onClick={() =>
                                    handleEdit(
                                      topic
                                    )
                                  }
                                  title="Редактировать"
                                >
                                  <i className="fas fa-pen"></i>
                                </button>

                                <button
                                  type="button"
                                  className="btn-delete-small"
                                  onClick={() =>
                                    handleDelete(
                                      topic.id
                                    )
                                  }
                                  title="Удалить"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>

                              </div>

                            </div>

                          )
                        )}

                        {category.topics.length ===
                          0 && (

                          <div className="empty-topics-catalog">
                            <p>
                              Нет тем в этом
                              языке
                            </p>
                          </div>

                        )}

                      </div>

                    )}

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          EDITOR MODAL
      ===================================================== */}

      {showEditorModal && (

        <div
          className="editor-modal-overlay"
          onMouseDown={event => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >

          <div
            className="editor-modal"
            onMouseDown={event =>
              event.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="editor-modal-header">

              <h3>

                <i className="fas fa-edit"></i>

                Форматирование текста

              </h3>

              <button
                className="editor-modal-close"
                onClick={closeModal}
                type="button"
              >
                <i className="fas fa-times"></i>
              </button>

            </div>

            {/* BODY */}

            <div className="editor-modal-body">

              <p className="editor-selected-text">

                Выделенный текст:{' '}

                <span>
                  "{selectedText}"
                </span>

              </p>

              {/* =================================================
                  COLOR PICKER
              ================================================= */}

              {showColorPicker && (

                <div className="color-picker-container">

                  <p className="color-picker-title">
                    Выберите цвет:
                  </p>

                  <div className="color-palette">

                    {colorPalette.map(
                      color => (

                        <button
                          key={color}
                          type="button"
                          className="color-swatch"
                          style={{
                            backgroundColor:
                              color
                          }}
                          onMouseDown={event => {
                            event.preventDefault();

                            applyColor(
                              color
                            );
                          }}
                          title={color}
                          aria-label={`Цвет ${color}`}
                        />

                      )
                    )}

                  </div>

                  <button
                    className="color-picker-back"
                    type="button"
                    onMouseDown={event =>
                      event.preventDefault()
                    }
                    onClick={() => {
                      setShowColorPicker(
                        false
                      );

                      setShowSizePicker(
                        false
                      );
                    }}
                  >

                    <i className="fas fa-arrow-left"></i>

                    Назад

                  </button>

                </div>

              )}

              {/* =================================================
                  SIZE PICKER
              ================================================= */}

              {showSizePicker && (

                <div className="size-picker-container">

                  <p className="size-picker-title">
                    Выберите размер шрифта:
                  </p>

                  <div className="size-options">

                    {fontSizes.map(
                      size => (

                        <button
                          key={size}
                          type="button"
                          className="size-option"
                          style={{
                            fontSize:
                              `${size}px`
                          }}
                          onMouseDown={event => {
                            event.preventDefault();

                            applyFontSize(
                              size
                            );
                          }}
                        >
                          {size}px
                        </button>

                      )
                    )}

                  </div>

                  <button
                    className="size-picker-back"
                    type="button"
                    onMouseDown={event =>
                      event.preventDefault()
                    }
                    onClick={() => {
                      setShowSizePicker(
                        false
                      );

                      setShowColorPicker(
                        false
                      );
                    }}
                  >

                    <i className="fas fa-arrow-left"></i>

                    Назад

                  </button>

                </div>

              )}

              {/* =================================================
                  MAIN TOOLS
              ================================================= */}

              {!showColorPicker &&
                !showSizePicker && (

                  <div className="editor-tools">

                    {/* BOLD */}

                    <button
                      type="button"
                      className={`editor-tool-btn ${
                        activeFormats.bold
                          ? 'active'
                          : ''
                      }`}
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        executeFormatCommand(
                          'bold'
                        );
                      }}
                      title="Жирный"
                    >

                      <i className="fas fa-bold"></i>

                    </button>

                    {/* ITALIC */}

                    <button
                      type="button"
                      className={`editor-tool-btn ${
                        activeFormats.italic
                          ? 'active'
                          : ''
                      }`}
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        executeFormatCommand(
                          'italic'
                        );
                      }}
                      title="Курсив"
                    >

                      <i className="fas fa-italic"></i>

                    </button>

                    {/* UNDERLINE */}

                    <button
                      type="button"
                      className={`editor-tool-btn ${
                        activeFormats.underline
                          ? 'active'
                          : ''
                      }`}
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        executeFormatCommand(
                          'underline'
                        );
                      }}
                      title="Подчёркнутый"
                    >

                      <i className="fas fa-underline"></i>

                    </button>

                    {/* SIZE */}

                    <button
                      type="button"
                      className={`editor-tool-btn ${
                        activeFormats.size
                          ? 'active'
                          : ''
                      }`}
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        setShowSizePicker(
                          true
                        );

                        setShowColorPicker(
                          false
                        );
                      }}
                      title="Размер шрифта"
                    >

                      <i className="fas fa-font"></i>

                    </button>

                    {/* COLOR */}

                    <button
                      type="button"
                      className={`editor-tool-btn ${
                        activeFormats.color
                          ? 'active'
                          : ''
                      }`}
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        setShowColorPicker(
                          true
                        );

                        setShowSizePicker(
                          false
                        );
                      }}
                      title="Цвет текста"
                    >

                      <i className="fas fa-palette"></i>

                    </button>

                    {/* DIVIDER */}

                    <div className="editor-tool-divider"></div>

                    {/* CLEAR */}

                    <button
                      type="button"
                      className="editor-tool-btn clear-format"
                      onMouseDown={event => {
                        event.preventDefault();

                        saveSelection();

                        clearFormatting();
                      }}
                      title="Очистить форматирование"
                    >

                      <i className="fas fa-eraser"></i>

                    </button>

                  </div>

                )}

            </div>

            {/* FOOTER */}

            <div className="editor-modal-footer">

              <button
                className="btn-submit"
                onClick={closeModal}
                type="button"
              >

                <i className="fas fa-check"></i>

                Готово

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default AdminPanel;