import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../utils/api';
import {
  buildTopicsMap,
  fetchTechnologies,
  invalidateTechnologiesCache,
  readTechnologiesSnapshot,
} from '../utils/studyData';
import { sanitizeHtml } from '../utils/sanitize';
import YandexAd from '../components/YandexAd';
import { YANDEX_RTB_BLOCK_ID } from '../config/env';
import { useAuth } from '../context/AuthProvider';
import UserFooter from '../components/UserFooter';
import { SITE_LOGO_URL } from '../utils/brand';

export default function HomePage({ settings }) {
  const { user: currentUser, logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [categories, setCategories] = useState(() => readTechnologiesSnapshot() || []);
  const [topicsMap, setTopicsMap] = useState(() => {
    const snapshot = readTechnologiesSnapshot();
    return snapshot ? buildTopicsMap(snapshot) : {};
  });
  const [loading, setLoading] = useState(() => !readTechnologiesSnapshot());

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!readTechnologiesSnapshot()) {
        setLoading(true);
      }

      try {
        const cats = await fetchTechnologies();
        if (cancelled) return;
        setCategories(cats);
        setTopicsMap(buildTopicsMap(cats));
      } catch (error) {
        if (!cancelled) {
          console.error('Ошибка загрузки данных:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    const reloadFresh = () => {
      invalidateTechnologiesCache();
      loadData();
    };

    window.addEventListener('focus', reloadFresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reloadFresh();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('focus', reloadFresh);
    };
  }, []);

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

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    if (!currentUser) {
      alert('Войдите, чтобы оставить комментарий');
      return;
    }

    try {
      const commentData = {
        content: newComment.trim(),
      };

      if (selectedContent?.type === 'subtopic') {
        commentData.subtopic_id = selectedContent.id;
      } else if (selectedContent?.type === 'topic') {
        commentData.topic_id = selectedContent.id;
      } else {
        alert('Неизвестный тип контента');
        return;
      }

      const created = await post('/api/comments/', commentData);

      setNewComment('');
      setComments((prev) => [created, ...prev]);
    } catch (error) {
      console.error('Ошибка отправки комментария:', error);
      alert('Ошибка отправки комментария: ' + (error.message || ''));
    }
  };

  useEffect(() => {
    if (selectedContent) {
      const topicId = selectedContent?.type === 'topic' ? selectedContent.id : null;
      const subtopicId = selectedContent?.type === 'subtopic' ? selectedContent.id : null;
      loadComments(topicId, subtopicId);
    }
  }, [selectedContent]);

  const filteredCategories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return categories.map((cat) => ({
        ...cat,
        topics: topicsMap[cat.id] || cat.topics || [],
      }));
    }

    return categories
      .map((cat) => {
        const topics = (topicsMap[cat.id] || cat.topics || []).filter((topic) => {
          const topicMatch = topic.title.toLowerCase().includes(query);
          const subtopicMatch = (topic.subtopics || []).some((st) =>
            st.title.toLowerCase().includes(query),
          );
          return topicMatch || subtopicMatch || cat.name.toLowerCase().includes(query);
        });
        return { ...cat, topics };
      })
      .filter((cat) => cat.topics.length > 0 || cat.name.toLowerCase().includes(query));
  }, [categories, topicsMap, searchTerm]);

  const toggleCategory = (categoryId) => {
    if (activeCategoryId === categoryId) {
      setActiveCategoryId(null);
      setActiveTopicId(null);
    } else {
      setActiveCategoryId(categoryId);
      setActiveTopicId(null);
    }
  };

  const toggleTopic = (topicId) => {
    setActiveTopicId((prev) => (prev === topicId ? null : topicId));
  };

  const handleSelectTopic = (categoryName, topic) => {
    setSelectedContent({
      id: topic.id,
      type: 'topic',
      title: topic.title,
      description: topic.description || 'Описание отсутствует',
      technologies: [categoryName],
    });
    setBreadcrumbs([
      { name: categoryName, type: 'category' },
      { name: topic.title, type: 'topic' },
    ]);
    if (topic.subtopics?.length) {
      setActiveTopicId(topic.id);
    }
  };

  const handleSelectSubTopic = (categoryName, topic, subtopic) => {
    setSelectedContent({
      id: subtopic.id,
      type: 'subtopic',
      title: subtopic.title,
      description: subtopic.description || 'Описание отсутствует',
      parentTopic: topic.title,
      parentCategory: categoryName,
    });
    setBreadcrumbs([
      { name: categoryName, type: 'category' },
      { name: topic.title, type: 'topic' },
      { name: subtopic.title, type: 'subtopic' },
    ]);
    setActiveTopicId(topic.id);
  };

  useEffect(() => {
    if (!currentUser?.id || !currentUser.is_banned) return;
    alert('⛔ Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору.');
    logout().finally(() => {
      window.location.href = '/login';
    });
  }, [currentUser?.id, currentUser?.is_banned, logout]);

  if (loading) {
    return (
      <div className="home-container">
        <div className="left_container">
          <div className="header">
            <img className="logo" src={SITE_LOGO_URL} alt="дубльпар.online" />
          </div>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#14b8a6' }}></i>
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
            {YANDEX_RTB_BLOCK_ID && <YandexAd blockId={YANDEX_RTB_BLOCK_ID} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="left_container">
        <div className="header">
          <img className="logo" src={SITE_LOGO_URL} alt="дубльпар.online" />
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
                className={`category-header ${activeCategoryId === category.id ? 'active' : ''}`}
                onClick={() => toggleCategory(category.id)}
              >
                <i className={`${category.icon || 'fas fa-folder'} category-icon`}></i>
                <span className="category-name">{category.name}</span>
                <span className="topic-count">{category.topics.length} тем</span>
                <i className={`fas fa-chevron-${activeCategoryId === category.id ? 'down' : 'right'} category-arrow`}></i>
              </div>

              {activeCategoryId === category.id && (
                <div className="topics-list">
                  {category.topics.map((topic) => {
                    const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;
                    const isExpanded = activeTopicId === topic.id;
                    return (
                      <div key={topic.id} className="topic-item-wrapper">
                        <div
                          className={`topic-header ${selectedContent?.type === 'topic' && selectedContent?.id === topic.id ? 'active' : ''}`}
                          onClick={() => handleSelectTopic(category.name, topic)}
                          style={{ cursor: 'pointer' }}
                        >
                          <i className="fas fa-circle topic-dot"></i>
                          <span className="topic-title">{topic.title}</span>
                          {hasSubtopics && (
                            <>
                              <span className="topic-count">{topic.subtopics.length} подтем</span>
                              <i
                                className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} topic-arrow`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTopic(topic.id);
                                }}
                              ></i>
                            </>
                          )}
                        </div>

                        {isExpanded && hasSubtopics && (
                          <div className="subtopics-list">
                            {topic.subtopics.map((subtopic) => (
                              <div
                                key={subtopic.id}
                                className={`subtopic-item ${selectedContent?.type === 'subtopic' && selectedContent?.id === subtopic.id ? 'active' : ''}`}
                                onClick={() => handleSelectSubTopic(category.name, topic, subtopic)}
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
          <UserFooter />
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
                    <span className={`breadcrumb-${crumb.type}`}>{crumb.name}</span>
                  </span>
                ))}
              </div>

              <div className="content-header">
                <div className="content-header-top">
                  <h2 className="content-title">{selectedContent.title}</h2>
                  {settings.enableComments !== false && (
                    <button
                      type="button"
                      className="comments-toggle-btn"
                      onClick={() => setShowCommentsModal(true)}
                      title="Комментарии"
                    >
                      <i className="fas fa-comment"></i>
                      <span className="comments-label">Комментарии</span>
                      <span className="comments-count">{comments.length}</span>
                    </button>
                  )}
                </div>
                {selectedContent.technologies && selectedContent.technologies.length > 0 && (
                  <div className="content-techs">
                    {selectedContent.technologies.map((tech, i) => (
                      <span key={i} className="tech-tag">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="content-body">
                {selectedContent.description ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedContent.description) }} />
                ) : (
                  <p className="content-empty">Описание отсутствует</p>
                )}
              </div>

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
                          <Link to="/login" onClick={() => setShowCommentsModal(false)}>
                            Войдите
                          </Link>
                          , чтобы оставить комментарий
                        </div>
                      )}

                      {loadingComments ? (
                        <div className="comments-loading">
                          <i className="fas fa-spinner fa-spin"></i> Загрузка...
                        </div>
                      ) : comments.length > 0 ? (
                        <div className="comments-list">
                          {comments.map((comment) => (
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
                                      minute: '2-digit',
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
          {YANDEX_RTB_BLOCK_ID && <YandexAd blockId={YANDEX_RTB_BLOCK_ID} />}
        </div>
      </div>
    </div>
  );
}
