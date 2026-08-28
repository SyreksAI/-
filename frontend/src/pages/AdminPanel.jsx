import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminPanel({ categories, setCategories, settings }) {
  const navigate = useNavigate();

  // ===== ПРОВЕРКА СЕССИИ АДМИНА =====
  useEffect(() => {
    const adminSession = JSON.parse(localStorage.getItem('adminSession'));
    if (!adminSession || !adminSession.loggedIn) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // ===== ВЫХОД ИЗ АДМИНКИ =====
  const handleAdminLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти из админ-панели?')) {
      localStorage.removeItem('adminSession');
      navigate('/admin/login');
    }
  };

  // ===== СОСТОЯНИЯ =====
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingSubTopicId, setEditingSubTopicId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
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
  const [showTechDropdown, setShowTechDropdown] = useState(false);

  // ===== СОСТОЯНИЯ ДЛЯ КОНТЕКСТНОГО МЕНЮ =====
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    type: null,
    data: null,
    element: null
  });

  // ===== СОСТОЯНИЯ ДЛЯ ИНЛАЙН-ДОБАВЛЕНИЯ ПОДТЕМЫ =====
  const [showSubTopicField, setShowSubTopicField] = useState(false);
  const [subTopicTitle, setSubTopicTitle] = useState('');

  const [newTopic, setNewTopic] = useState({
    title: '',
    technologies: '',
    description: ''
  });

  const [newSubTopic, setNewSubTopic] = useState({
    title: '',
    description: ''
  });

  // ===== REFS =====
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const techInputRef = useRef(null);

  // ===== КОНСТАНТЫ =====
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

  const fontSizes = [10, 12, 14, 16, 18, 24];
  const allTechNames = useMemo(() => categories.map(c => c.name), [categories]);

  // ===== ФИЛЬТРАЦИЯ ТЕХНОЛОГИЙ ДЛЯ ДРОПДАУНА =====
  const filteredTechs = useMemo(() => {
    const search = newTopic.technologies.trim().toLowerCase();
    if (!search) return [];
    return allTechNames.filter(name => 
      name.toLowerCase().includes(search) && 
      name.toLowerCase() !== search
    );
  }, [allTechNames, newTopic.technologies]);

  // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
  const getActiveCategory = useCallback(() => {
    return categories.find(c => c.name === activeCategory);
  }, [categories, activeCategory]);

  const activeCategoryData = getActiveCategory();

  const getActiveTopic = useCallback(() => {
    if (!activeCategoryData || !activeTopic) return null;
    return activeCategoryData.topics.find(t => t.title === activeTopic);
  }, [activeCategoryData, activeTopic]);

  const activeTopicData = getActiveTopic();

  // ===== АВТОЗАПОЛНЕНИЕ ТЕХНОЛОГИЙ =====
  useEffect(() => {
    if (activeCategoryData && !editingId && !editingSubTopicId && !editingCategoryId) {
      setNewTopic(prev => ({
        ...prev,
        technologies: activeCategoryData.name
      }));
    }
  }, [activeCategoryData, editingId, editingSubTopicId, editingCategoryId]);

  // ===== РАБОТА С ВЫДЕЛЕНИЕМ =====
  const saveSelection = useCallback(() => {
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
          savedRangeRef.current = range.cloneRange();
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }, []);

  const restoreSelection = useCallback(() => {
    try {
      if (savedRangeRef.current && editorRef.current) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }, []);

  // ===== ПРОВЕРКА АКТИВНЫХ ФОРМАТОВ =====
  const checkActiveFormats = useCallback(() => {
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setActiveFormats({ bold: false, italic: false, underline: false, color: false, size: false });
        return;
      }

      const bold = document.queryCommandState('bold');
      const italic = document.queryCommandState('italic');
      const underline = document.queryCommandState('underline');

      let color = false;
      try {
        const colorVal = document.queryCommandValue('foreColor');
        if (colorVal && colorVal !== 'rgb(0, 0, 0)' && colorVal !== '#000000') {
          color = true;
        }
      } catch (e) {}

      let size = false;
      try {
        const sizeVal = document.queryCommandValue('fontSize');
        if (sizeVal && sizeVal !== '3') {
          size = true;
        }
      } catch (e) {}

      setActiveFormats({ bold, italic, underline, color, size });
    } catch (error) {
      console.error('Ошибка проверки форматов:', error);
    }
  }, []);

  // ===== ПРИМЕНЕНИЕ ФОРМАТИРОВАНИЯ =====
  const applyFormatting = useCallback((format) => {
    if (!editorRef.current) return;

    editorRef.current.focus();

    if (format === 'color') {
      setShowColorPicker(true);
      setShowSizePicker(false);
      return;
    }

    if (format === 'size') {
      setShowSizePicker(true);
      setShowColorPicker(false);
      return;
    }

    const restored = restoreSelection();
    if (!restored) {
      saveSelection();
      return;
    }

    try {
      if (document.queryCommandSupported(format)) {
        document.execCommand(format, false, null);
        
        setTimeout(() => {
          checkActiveFormats();
          if (editorRef.current) {
            if (editingSubTopicId !== null) {
              setNewSubTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
            } else {
              setNewTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
            }
          }
        }, 50);
      }
    } catch (error) {
      console.error('Ошибка применения форматирования:', error);
    }
  }, [restoreSelection, saveSelection, checkActiveFormats, editingSubTopicId]);

  // ===== ПРИМЕНЕНИЕ ЦВЕТА =====
  const applyColor = useCallback((color) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    const restored = restoreSelection();
    if (!restored) return;

    try {
      document.execCommand('foreColor', false, color);
      setShowColorPicker(false);
      setTimeout(() => {
        checkActiveFormats();
        if (editorRef.current) {
          if (editingSubTopicId !== null) {
            setNewSubTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          } else {
            setNewTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          }
        }
      }, 50);
    } catch (error) {
      console.error('Ошибка применения цвета:', error);
    }
  }, [restoreSelection, checkActiveFormats, editingSubTopicId]);

  // ===== ПРИМЕНЕНИЕ РАЗМЕРА =====
  const applyFontSize = useCallback((size) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    const restored = restoreSelection();
    if (!restored) return;

    try {
      const sizeMap = { 10: '1', 12: '2', 14: '3', 16: '4', 18: '5', 24: '6' };
      document.execCommand('fontSize', false, sizeMap[size] || '3');
      setShowSizePicker(false);
      setTimeout(() => {
        checkActiveFormats();
        if (editorRef.current) {
          if (editingSubTopicId !== null) {
            setNewSubTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          } else {
            setNewTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          }
        }
      }, 50);
    } catch (error) {
      console.error('Ошибка применения размера:', error);
    }
  }, [restoreSelection, checkActiveFormats, editingSubTopicId]);

  // ===== ОЧИСТКА ФОРМАТИРОВАНИЯ =====
  const clearFormatting = useCallback(() => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    const restored = restoreSelection();
    if (!restored) return;

    try {
      document.execCommand('removeFormat', false, null);
      setActiveFormats({ bold: false, italic: false, underline: false, color: false, size: false });
      setTimeout(() => {
        checkActiveFormats();
        if (editorRef.current) {
          if (editingSubTopicId !== null) {
            setNewSubTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          } else {
            setNewTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
          }
        }
      }, 50);
    } catch (error) {
      console.error('Ошибка очистки форматирования:', error);
    }
  }, [restoreSelection, checkActiveFormats, editingSubTopicId]);

  // ===== ОТКРЫТИЕ МОДАЛКИ ДЛЯ ФОРМАТИРОВАНИЯ =====
  const openEditorModal = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) return;

    const text = selection.toString().trim();
    if (!text) return;

    savedRangeRef.current = range.cloneRange();
    setSelectedText(text);
    setShowColorPicker(false);
    setShowSizePicker(false);
    setShowEditorModal(true);

    setTimeout(() => checkActiveFormats(), 100);
  }, [checkActiveFormats]);

  // ===== ОБРАБОТЧИКИ ДЛЯ РЕДАКТОРА =====
  const handleContextMenu = useCallback((e) => {
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) return;
    if (!editorRef.current || !editorRef.current.contains(selection.anchorNode)) return;
    e.preventDefault();
    openEditorModal();
  }, [openEditorModal]);

  const handleEditorMouseUp = useCallback(() => {
    saveSelection();
    setTimeout(() => checkActiveFormats(), 50);
  }, [saveSelection, checkActiveFormats]);

  const handleEditorKeyUp = useCallback(() => {
    saveSelection();
    setTimeout(() => checkActiveFormats(), 50);
  }, [saveSelection, checkActiveFormats]);

  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      if (editingSubTopicId !== null) {
        setNewSubTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
      } else {
        setNewTopic(prev => ({ ...prev, description: editorRef.current.innerHTML }));
      }
    }
  }, [editingSubTopicId]);

  const closeModal = useCallback(() => {
    setShowEditorModal(false);
    setShowColorPicker(false);
    setShowSizePicker(false);
    setSelectedText('');
    savedRangeRef.current = null;
    setActiveFormats({ bold: false, italic: false, underline: false, color: false, size: false });
    window.getSelection().removeAllRanges();
  }, []);

  // ===== КОНТЕКСТНОЕ МЕНЮ =====
  const handleItemContextMenu = useCallback((e, type, data) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (contextMenu.element) {
      contextMenu.element.classList.remove('context-selected');
    }
    
    const target = e.currentTarget;
    target.classList.add('context-selected');
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: type,
      data: data,
      element: target
    });
  }, [contextMenu.element]);

  const closeContextMenu = useCallback(() => {
    if (contextMenu.element) {
      contextMenu.element.classList.remove('context-selected');
    }
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      type: null,
      data: null,
      element: null
    });
  }, [contextMenu.element]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, closeContextMenu]);

  // ===== CRUD ДЛЯ КАТЕГОРИЙ (ТЕХНОЛОГИЙ) =====
  const handleEditCategory = useCallback((category) => {
    setEditingCategoryId(category.id);
    setNewCategoryName(category.name);
    setEditingId(null);
    setEditingSubTopicId(null);
    closeContextMenu();
  }, [closeContextMenu]);

  const handleSaveCategory = useCallback(() => {
    if (!newCategoryName.trim()) {
      alert('Введите название технологии');
      return;
    }
    
    const oldCategory = categories.find(c => c.id === editingCategoryId);
    const oldName = oldCategory?.name;
    
    setCategories(prev => prev.map(c => 
      c.id === editingCategoryId ? { ...c, name: newCategoryName.trim() } : c
    ));
    
    if (activeCategory === oldName) {
      setActiveCategory(newCategoryName.trim());
    }
    
    setEditingCategoryId(null);
    setNewCategoryName('');
  }, [categories, editingCategoryId, newCategoryName, activeCategory, setCategories]);

  const handleCancelEditCategory = useCallback(() => {
    setEditingCategoryId(null);
    setNewCategoryName('');
  }, []);

  const handleDeleteCategory = useCallback((id) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;
    if (!window.confirm(`Удалить технологию "${category.name}" со всеми темами?`)) return;
    setCategories(prev => prev.filter(c => c.id !== id));
    if (activeCategory === category.name) {
      setActiveCategory(null);
    }
    closeContextMenu();
  }, [categories, activeCategory, closeContextMenu, setCategories]);

  // ===== CRUD ДЛЯ ТЕМ =====
  const handleEditTopic = useCallback((topic) => {
    const category = categories.find(c => c.topics.some(t => t.id === topic.id));
    if (!category) return;

    setEditingId(topic.id);
    setEditingSubTopicId(null);
    setEditingCategoryId(null);
    setActiveCategory(category.name);
    setActiveTopic(topic.title);
    setNewTopic({
      title: topic.title || '',
      technologies: Array.isArray(topic.technologies) ? topic.technologies.join(', ') : '',
      description: topic.description || ''
    });
    setShowSubTopicField(false);
    setSubTopicTitle('');
    setShowTechDropdown(false);
    closeContextMenu();
    closeModal();
  }, [categories, closeModal, closeContextMenu]);

  const handleAddTopic = useCallback((e) => {
    e.preventDefault();

    const title = newTopic.title.trim();
    const techInput = newTopic.technologies.trim();
    const description = editorRef.current?.innerHTML || '';

    if (!title) { alert('Введите название темы'); return; }
    if (!techInput) { alert('Укажите технологию'); return; }
    if (!description || description === '<br>') { alert('Введите описание темы'); return; }

    const techList = techInput.split(',').map(s => s.trim()).filter(Boolean);
    const mainTech = techList[0];

    const existingCategory = categories.find(c => c.name.toLowerCase() === mainTech.toLowerCase());

    const newSubtopics = [];
    if (showSubTopicField && subTopicTitle.trim()) {
      newSubtopics.push({
        id: Date.now() + 1,
        title: subTopicTitle.trim(),
        description: ''
      });
    }

    if (editingId !== null) {
      setCategories(prev => prev.map(c => {
        if (c.name !== activeCategory) return c;
        return {
          ...c,
          topics: c.topics.map(t => t.id === editingId ? { 
            ...t, 
            title, 
            technologies: techList, 
            description, 
            subtopics: [...(t.subtopics || []), ...newSubtopics] 
          } : t)
        };
      }));
      setActiveTopic(title);
    } else {
      if (existingCategory) {
        const existingTopic = existingCategory.topics.find(t => t.title.toLowerCase() === title.toLowerCase());

        if (existingTopic) {
          setCategories(prev => prev.map(c => {
            if (c.id !== existingCategory.id) return c;
            return {
              ...c,
              topics: c.topics.map(t => {
                if (t.id !== existingTopic.id) return t;
                const mergedSubtopics = [...(t.subtopics || [])];
                newSubtopics.forEach(st => {
                  const exists = mergedSubtopics.some(existingSt => 
                    existingSt.title.toLowerCase() === st.title.toLowerCase()
                  );
                  if (!exists) {
                    mergedSubtopics.push(st);
                  }
                });
                return {
                  ...t,
                  subtopics: mergedSubtopics
                };
              })
            };
          }));
          setActiveCategory(existingCategory.name);
          setActiveTopic(title);
        } else {
          setCategories(prev => prev.map(c => {
            if (c.id !== existingCategory.id) return c;
            return {
              ...c,
              topics: [...c.topics, { 
                id: Date.now(), 
                title, 
                technologies: techList, 
                description, 
                subtopics: newSubtopics 
              }]
            };
          }));
          setActiveCategory(existingCategory.name);
          setActiveTopic(title);
        }
      } else {
        const newCategory = {
          id: Date.now(),
          name: mainTech,
          icon: 'fas fa-code',
          topics: [{ 
            id: Date.now(), 
            title, 
            technologies: techList, 
            description, 
            subtopics: newSubtopics 
          }]
        };
        setCategories(prev => [...prev, newCategory]);
        setActiveCategory(newCategory.name);
        setActiveTopic(title);
      }
    }

    setEditingId(null);
    setNewTopic({ title: '', technologies: '', description: '' });
    setShowSubTopicField(false);
    setSubTopicTitle('');
    setShowTechDropdown(false);
    if (editorRef.current) editorRef.current.innerHTML = '';
  }, [activeCategory, categories, editingId, newTopic, showSubTopicField, subTopicTitle, setCategories]);

  const selectTech = useCallback((techName) => {
    setNewTopic(prev => ({ ...prev, technologies: techName }));
    setShowTechDropdown(false);
    const category = categories.find(c => c.name === techName);
    if (category) {
      setActiveCategory(category.name);
    }
  }, [categories]);

  const handleDeleteTopic = useCallback((id) => {
    if (!window.confirm('Удалить тему со всеми подтемами?')) return;
    setCategories(prev => prev.map(c => {
      if (c.name !== activeCategory) return c;
      return { ...c, topics: c.topics.filter(t => t.id !== id) };
    }));
    if (activeTopic) setActiveTopic(null);
    closeContextMenu();
  }, [activeCategory, activeTopic, closeContextMenu, setCategories]);

  const toggleTopic = useCallback((title) => {
    setActiveTopic(prev => prev === title ? null : title);
  }, []);

  // ===== CRUD ДЛЯ ПОДТЕМ =====
  const handleEditSubTopic = useCallback((subtopic) => {
    setEditingSubTopicId(subtopic.id);
    setEditingId(null);
    setEditingCategoryId(null);
    setNewSubTopic({
      title: subtopic.title || '',
      description: subtopic.description || ''
    });
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = subtopic.description || '';
      }
    }, 100);
    closeContextMenu();
    closeModal();
  }, [closeModal, closeContextMenu]);

  const handleAddSubTopic = useCallback((e) => {
    e.preventDefault();

    if (!activeTopicData) {
      alert('Сначала выберите тему');
      return;
    }

    const title = newSubTopic.title.trim();
    const description = editorRef.current?.innerHTML || '';

    if (!title) { alert('Введите название подтемы'); return; }
    if (!description || description === '<br>') { alert('Введите описание подтемы'); return; }

    if (editingSubTopicId !== null) {
      setCategories(prev => prev.map(c => {
        if (c.name !== activeCategory) return c;
        return {
          ...c,
          topics: c.topics.map(t => {
            if (t.title !== activeTopic) return t;
            return {
              ...t,
              subtopics: t.subtopics.map(st => st.id === editingSubTopicId ? { ...st, title, description } : st)
            };
          })
        };
      }));
    } else {
      setCategories(prev => prev.map(c => {
        if (c.name !== activeCategory) return c;
        return {
          ...c,
          topics: c.topics.map(t => {
            if (t.title !== activeTopic) return t;
            return {
              ...t,
              subtopics: [...(t.subtopics || []), { id: Date.now(), title, description }]
            };
          })
        };
      }));
    }

    setEditingSubTopicId(null);
    setNewSubTopic({ title: '', description: '' });
    if (editorRef.current) editorRef.current.innerHTML = '';
  }, [activeCategory, activeTopic, activeTopicData, editingSubTopicId, newSubTopic, setCategories]);

  const handleDeleteSubTopic = useCallback((id) => {
    if (!window.confirm('Удалить подтему?')) return;
    setCategories(prev => prev.map(c => {
      if (c.name !== activeCategory) return c;
      return {
        ...c,
        topics: c.topics.map(t => {
          if (t.title !== activeTopic) return t;
          return { ...t, subtopics: t.subtopics.filter(st => st.id !== id) };
        })
      };
    }));
    closeContextMenu();
  }, [activeCategory, activeTopic, closeContextMenu, setCategories]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingSubTopicId(null);
    setEditingCategoryId(null);
    setNewCategoryName('');
    setNewTopic({ title: '', technologies: '', description: '' });
    setNewSubTopic({ title: '', description: '' });
    setShowSubTopicField(false);
    setSubTopicTitle('');
    setShowTechDropdown(false);
    if (editorRef.current) editorRef.current.innerHTML = '';
    savedRangeRef.current = null;
    setActiveFormats({ bold: false, italic: false, underline: false, color: false, size: false });
    window.getSelection().removeAllRanges();
  }, []);

  const toggleCategory = useCallback((name) => {
    setActiveCategory(prev => prev === name ? null : name);
  }, []);

  // ===== ОБРАБОТЧИКИ ДЛЯ КОНТЕКСТНОГО МЕНЮ =====
  const handleEditFromContext = useCallback(() => {
    if (contextMenu.type === 'category') {
      handleEditCategory(contextMenu.data);
    } else if (contextMenu.type === 'topic') {
      handleEditTopic(contextMenu.data);
    } else if (contextMenu.type === 'subtopic') {
      handleEditSubTopic(contextMenu.data);
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu, handleEditCategory, handleEditTopic, handleEditSubTopic]);

  const handleDeleteFromContext = useCallback(() => {
    if (contextMenu.type === 'category') {
      handleDeleteCategory(contextMenu.data.id);
    } else if (contextMenu.type === 'topic') {
      handleDeleteTopic(contextMenu.data.id);
    } else if (contextMenu.type === 'subtopic') {
      handleDeleteSubTopic(contextMenu.data.id);
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu, handleDeleteCategory, handleDeleteTopic, handleDeleteSubTopic]);

  // ===== EFFECTS =====
  useEffect(() => {
    if (editorRef.current && editingId !== null) {
      editorRef.current.innerHTML = newTopic.description || '';
    }
  }, [editingId, newTopic.description]);

  useEffect(() => {
    if (editorRef.current && editingSubTopicId !== null) {
      editorRef.current.innerHTML = newSubTopic.description || '';
    }
  }, [editingSubTopicId, newSubTopic.description]);

  useEffect(() => {
    if (showEditorModal) {
      setTimeout(() => checkActiveFormats(), 100);
    }
  }, [showEditorModal, checkActiveFormats]);

  useEffect(() => {
    let timeoutId;
    const handleSelectionChange = () => {
      if (showEditorModal) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => checkActiveFormats(), 50);
      }
    };

    if (showEditorModal) {
      document.addEventListener('selectionchange', handleSelectionChange);
    }

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [showEditorModal, checkActiveFormats]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (techInputRef.current && !techInputRef.current.contains(e.target)) {
        setShowTechDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ===== MEMO =====
  const filteredCategories = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return categories;
    return categories
      .map(c => ({ ...c, topics: c.topics.filter(t => t.title.toLowerCase().includes(search) || c.name.toLowerCase().includes(search)) }))
      .filter(c => c.topics.length > 0);
  }, [categories, searchTerm]);

  const totalTopics = useMemo(() => categories.reduce((acc, c) => acc + c.topics.length, 0), [categories]);
  const totalSubTopics = useMemo(() => categories.reduce((acc, c) => acc + c.topics.reduce((s, t) => s + (t.subtopics?.length || 0), 0), 0), [categories]);

  return (
    <div className="admin-container">
      {/* SIDEBAR */}
      <div className="admin-sidebar">
        <div className="header">
          <img className="logo" src="/logo.png" alt="logo" />
        </div>
        <div className="admin-menu">
          <div className="admin-menu-title">Навигация</div>
          <Link to="/" className="admin-menu-item"><i className="fas fa-home"></i> На главную</Link>
          <Link to="/admin" className="admin-menu-item active"><i className="fas fa-book"></i> Управление темами</Link>
          <Link to="/admin/users" className="admin-menu-item"><i className="fas fa-users"></i> Пользователи</Link>
          <Link to="/admin/settings" className="admin-menu-item"><i className="fas fa-sliders-h"></i> Настройки</Link>
          <div className="admin-menu-divider"></div>
          <button className="admin-menu-item logout" onClick={handleAdminLogout}>
            <i className="fas fa-sign-out-alt"></i> Выйти из админки
          </button>
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
            <h1><i className="fas fa-book"></i> Управление темами</h1>
            <p className="admin-subtitle">Управляй темами и подтемами внутри каждой технологии</p>
          </div>
          <button className="btn-back" onClick={() => navigate('/')} type="button">
            <i className="fas fa-arrow-left"></i> На главную
          </button>
        </div>

        {/* STATS */}
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
              <span className="stat-number">{categories.length}</span>
              <span className="stat-label">Технологий</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-folder-open"></i></div>
            <div className="stat-info">
              <span className="stat-number">{totalSubTopics}</span>
              <span className="stat-label">Подтем</span>
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

        {/* TWO COLUMNS */}
        <div className="admin-two-columns-reversed">
          {/* FORM */}
          <div className="admin-left-col">
            {editingCategoryId !== null ? (
              // ФОРМА РЕДАКТИРОВАНИЯ ТЕХНОЛОГИИ
              <div className="admin-form-top">
                <h2>
                  <i className="fas fa-pen"></i> Редактировать технологию
                </h2>
                <form onSubmit={(e) => { e.preventDefault(); handleSaveCategory(); }}>
                  <div className="form-group">
                    <label className="form-label">Название технологии</label>
                    <input
                      type="text"
                      placeholder="Введите название технологии"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-buttons">
                    <button type="submit" className="btn-submit">
                      <i className="fas fa-save"></i> Сохранить
                    </button>
                    <button type="button" className="btn-cancel" onClick={handleCancelEditCategory}>
                      <i className="fas fa-times"></i> Отмена
                    </button>
                  </div>
                </form>
              </div>
            ) : editingSubTopicId !== null ? (
              // ФОРМА РЕДАКТИРОВАНИЯ ПОДТЕМЫ
              <div className="admin-form-top">
                <h2>
                  <i className="fas fa-pen"></i> Редактировать подтему
                  {activeTopic && <span className="form-category-badge">в {activeTopic}</span>}
                </h2>
                <form onSubmit={handleAddSubTopic}>
                  <div className="form-group">
                    <label className="form-label">Название подтемы</label>
                    <input
                      type="text"
                      placeholder="Например: GET запросы"
                      value={newSubTopic.title}
                      onChange={e => setNewSubTopic(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group full-width">
                    <div className="editor-label">Описание подтемы *</div>
                    <div
                      ref={editorRef}
                      className="editor-content"
                      contentEditable
                      suppressContentEditableWarning
                      onContextMenu={handleContextMenu}
                      onMouseUp={handleEditorMouseUp}
                      onKeyUp={handleEditorKeyUp}
                      onInput={handleEditorInput}
                      data-placeholder="Введите описание подтемы..."
                    />
                    <div className="editor-hint">
                      <i className="fas fa-info-circle"></i>
                      Выделите текст левой кнопкой мыши и нажмите правую кнопку для форматирования
                    </div>
                  </div>

                  <div className="form-buttons">
                    <button type="submit" className="btn-submit">
                      <i className="fas fa-save"></i> Сохранить подтему
                    </button>
                    <button type="button" className="btn-cancel" onClick={() => {
                      setEditingSubTopicId(null);
                      setNewSubTopic({ title: '', description: '' });
                      if (editorRef.current) editorRef.current.innerHTML = '';
                    }}>
                      <i className="fas fa-times"></i> Отмена
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              // ФОРМА ДОБАВЛЕНИЯ/РЕДАКТИРОВАНИЯ ТЕМЫ
              <div className="admin-form-top">
                <h2>
                  <i className={`fas ${editingId !== null ? 'fa-pen' : 'fa-plus-circle'}`}></i>
                  {editingId !== null ? 'Редактировать тему' : 'Добавить тему'}
                  {activeCategoryData && (
                    <span className="form-category-badge">
                      <i className={activeCategoryData.icon}></i> {activeCategoryData.name}
                    </span>
                  )}
                </h2>

                <form onSubmit={handleAddTopic}>
                  <div className="form-group">
                    <label className="form-label">Технология <span className="form-label-hint">(язык или инструмент)</span></label>
                    <div className="form-group-with-button" ref={techInputRef}>
                      <div className="tech-input-wrapper">
                        <input
                          type="text"
                          placeholder="Например: Python, Docker, Nginx, или напишите свою"
                          value={newTopic.technologies}
                          onChange={e => {
                            setNewTopic(prev => ({ ...prev, technologies: e.target.value }));
                            if (e.target.value.length > 0) {
                              setShowTechDropdown(true);
                            } else {
                              setShowTechDropdown(false);
                            }
                          }}
                          onFocus={() => {
                            if (newTopic.technologies.length > 0) {
                              setShowTechDropdown(true);
                            }
                          }}
                          required
                        />
                        {showTechDropdown && filteredTechs.length > 0 && (
                          <div className="tech-dropdown">
                            {filteredTechs.map(tech => (
                              <div 
                                key={tech} 
                                className="tech-dropdown-item"
                                onClick={() => selectTech(tech)}
                              >
                                {tech}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`btn-add-subtopic-circle ${showSubTopicField ? 'active' : ''}`}
                        onClick={() => setShowSubTopicField(!showSubTopicField)}
                        title="Добавить подтему"
                      >
                        <i className={`fas ${showSubTopicField ? 'fa-minus' : 'fa-plus'}`}></i>
                      </button>
                    </div>
                    <div className="form-hint-inline">
                      {activeCategoryData ? (
                        <span>
                          <strong>{activeCategoryData.name}</strong> выбрана. 
                          Можете дописать другие технологии через запятую
                        </span>
                      ) : (
                        <span>
                          <strong>Выберите из списка</strong> или <strong>напишите свою</strong> технологию
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Тема <span className="form-label-hint">(фреймворк/библиотека/инструмент)</span></label>
                    <input
                      type="text"
                      placeholder="Например: FastAPI, Django, React, STL"
                      value={newTopic.title}
                      onChange={e => setNewTopic(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                    <div className="form-hint-inline">
                      <i className="fas fa-info-circle" style={{ color: '#7c3aed' }}></i>
                      <strong> Тема</strong> — это раздел внутри технологии
                    </div>
                  </div>

                  {showSubTopicField && (
                    <div className="subtopic-form-fields">
                      <div className="form-group">
                        <label className="form-label">Название подтемы</label>
                        <input
                          type="text"
                          placeholder="Например: GET запросы"
                          value={subTopicTitle}
                          onChange={e => setSubTopicTitle(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-group full-width">
                    <div className="editor-label">Описание темы *</div>
                    <div
                      ref={editorRef}
                      className="editor-content"
                      contentEditable
                      suppressContentEditableWarning
                      onContextMenu={handleContextMenu}
                      onMouseUp={handleEditorMouseUp}
                      onKeyUp={handleEditorKeyUp}
                      onInput={handleEditorInput}
                      data-placeholder="Введите описание темы..."
                    />
                    <div className="editor-hint">
                      <i className="fas fa-info-circle"></i>
                      Выделите текст левой кнопкой мыши и нажмите правую кнопку для форматирования
                    </div>
                  </div>

                  <div className="form-buttons">
                    <button type="submit" className="btn-submit">
                      <i className={`fas ${editingId !== null ? 'fa-save' : 'fa-plus'}`}></i>
                      {editingId !== null ? 'Сохранить тему' : 'Добавить тему'}
                    </button>
                    {editingId !== null && (
                      <button type="button" className="btn-cancel" onClick={handleCancelEdit}>
                        <i className="fas fa-times"></i> Отмена
                      </button>
                    )}
                  </div>
                </form>

                {!activeCategoryData && (
                  <div className="form-hint">
                    <i className="fas fa-info-circle"></i>
                    Выберите технологию из списка (начните вводить) или напишите свою
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CATALOG */}
          <div className="admin-right-col">
            <div className="admin-catalog-wrapper">
              <div className="admin-search-container">
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Поиск технологии или темы..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="catalog-title">
                <i className="fas fa-book"></i> Каталог технологий
              </div>

              {filteredCategories.map(category => (
                <div key={category.id} className="category-item">
                  <div
                    className={`category-header ${activeCategory === category.name ? 'active' : ''}`}
                    onClick={() => toggleCategory(category.name)}
                    onContextMenu={(e) => handleItemContextMenu(e, 'category', category)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCategory(category.name);
                      }
                    }}
                  >
                    <i className={`${category.icon} category-icon`}></i>
                    <span className="category-name">{category.name}</span>
                    <span className="topic-count">{category.topics.length} тем</span>
                    <i className={`fas fa-chevron-${activeCategory === category.name ? 'down' : 'right'} category-arrow`}></i>
                  </div>
                  {activeCategory === category.name && (
                    <div className="topics-list">
                      {category.topics.map(topic => {
                        const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;
                        return (
                          <div key={topic.id} className="topic-item-catalog-wrapper">
                            <div
                              className={`topic-header ${activeTopic === topic.title ? 'active' : ''}`}
                              onClick={() => {
                                if (hasSubtopics) {
                                  toggleTopic(topic.title);
                                }
                              }}
                              onContextMenu={(e) => handleItemContextMenu(e, 'topic', topic)}
                              style={{ 
                                cursor: hasSubtopics ? 'pointer' : 'default'
                              }}
                            >
                              <i className="fas fa-circle topic-dot"></i>
                              <span className="topic-title-catalog">{topic.title}</span>
                              {hasSubtopics && (
                                <>
                                  <span className="topic-count">{topic.subtopics.length} подтем</span>
                                  <i className={`fas fa-chevron-${activeTopic === topic.title ? 'down' : 'right'} topic-arrow`}></i>
                                </>
                              )}
                            </div>

                            {activeTopic === topic.title && hasSubtopics && (
                              <div className="subtopics-list">
                                {topic.subtopics.map(subtopic => (
                                  <div 
                                    key={subtopic.id} 
                                    className="subtopic-item"
                                    onContextMenu={(e) => handleItemContextMenu(e, 'subtopic', subtopic)}
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
                        <div className="empty-topics-catalog">
                          <p>Нет тем в этой технологии</p>
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

      {/* КОНТЕКСТНОЕ МЕНЮ */}
      {contextMenu.visible && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999
          }}
        >
          <div className="context-menu-item" onClick={handleEditFromContext}>
            <i className="fas fa-pen"></i> Редактировать
          </div>
          <div className="context-menu-item delete" onClick={handleDeleteFromContext}>
            <i className="fas fa-trash"></i> Удалить
          </div>
        </div>
      )}

      {/* MODAL ДЛЯ ФОРМАТИРОВАНИЯ */}
      {showEditorModal && (
        <div className="editor-modal-overlay" onClick={closeModal}>
          <div className="editor-modal" onClick={e => e.stopPropagation()}>
            <div className="editor-modal-header">
              <h3><i className="fas fa-edit"></i> Форматирование текста</h3>
              <button className="editor-modal-close" onClick={closeModal} type="button">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="editor-modal-body">
              <p className="editor-selected-text">
                Выделенный текст: <span>"{selectedText}"</span>
              </p>

              {showColorPicker ? (
                <div className="color-picker-container">
                  <p className="color-picker-title">Выберите цвет:</p>
                  <div className="color-palette">
                    {colorPalette.map(color => (
                      <button
                        key={color}
                        type="button"
                        className="color-swatch"
                        style={{ backgroundColor: color }}
                        onClick={() => applyColor(color)}
                      />
                    ))}
                  </div>
                  <button className="color-picker-back" onClick={() => { setShowColorPicker(false); setShowSizePicker(false); }}>
                    <i className="fas fa-arrow-left"></i> Назад
                  </button>
                </div>
              ) : showSizePicker ? (
                <div className="size-picker-container">
                  <p className="size-picker-title">Выберите размер шрифта:</p>
                  <div className="size-options">
                    {fontSizes.map(size => (
                      <button
                        key={size}
                        type="button"
                        className="size-option"
                        style={{ fontSize: `${size}px` }}
                        onClick={() => applyFontSize(size)}
                      >
                        {size}px
                      </button>
                    ))}
                  </div>
                  <button className="size-picker-back" onClick={() => { setShowSizePicker(false); setShowColorPicker(false); }}>
                    <i className="fas fa-arrow-left"></i> Назад
                  </button>
                </div>
              ) : (
                <div className="editor-tools">
                  <button
                    type="button"
                    className={`editor-tool-btn ${activeFormats.bold ? 'active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      saveSelection();
                      applyFormatting('bold');
                    }}
                    title="Жирный"
                  >
                    <i className="fas fa-bold"></i>
                  </button>

                  <button
                    type="button"
                    className={`editor-tool-btn ${activeFormats.italic ? 'active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      saveSelection();
                      applyFormatting('italic');
                    }}
                    title="Курсив"
                  >
                    <i className="fas fa-italic"></i>
                  </button>

                  <button
                    type="button"
                    className={`editor-tool-btn ${activeFormats.underline ? 'active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      saveSelection();
                      applyFormatting('underline');
                    }}
                    title="Подчёркнутый"
                  >
                    <i className="fas fa-underline"></i>
                  </button>

                  <button
                    type="button"
                    className={`editor-tool-btn ${activeFormats.size ? 'active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      saveSelection();
                      setShowSizePicker(true);
                      setShowColorPicker(false);
                    }}
                    title="Размер шрифта"
                  >
                    <i className="fas fa-font"></i>
                  </button>

                  <button
                    type="button"
                    className={`editor-tool-btn ${activeFormats.color ? 'active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      saveSelection();
                      setShowColorPicker(true);
                      setShowSizePicker(false);
                    }}
                    title="Цвет текста"
                  >
                    <i className="fas fa-palette"></i>
                  </button>

                  <div className="editor-tool-divider"></div>

                  <button
                    type="button"
                    className="editor-tool-btn clear-format"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
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

            <div className="editor-modal-footer">
              <button className="btn-submit" onClick={closeModal} type="button">
                <i className="fas fa-check"></i> Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;