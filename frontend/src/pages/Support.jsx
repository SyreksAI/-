import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../utils/api';

function Support() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser'));
      
      // ✅ Отправляем реальный запрос на сервер
      const response = await post('/api/support/', {
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
        user_id: currentUser?.id || null
      });

      setSuccess(response.message || '✅ Ваше сообщение успешно отправлено!');
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      
      setTimeout(() => setSuccess(''), 5000);
      
    } catch (err) {
      console.error('❌ Ошибка отправки:', err);
      setError(err.message || '❌ Ошибка отправки сообщения. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-top">
          <Link to="/" className="legal-back">
            <i className="fas fa-arrow-left"></i> На главную
          </Link>
          <div className="legal-header">
            <h1>🆘 Поддержка</h1>
            <p className="legal-date">Мы всегда рады помочь вам!</p>
          </div>
        </div>

        <div className="legal-content">
          <section>
            <h2>📞 Способы связи</h2>
            <div className="support-channels">
              <div className="support-channel">
                <i className="fas fa-envelope"></i>
                <div>
                  <strong>Email</strong>
                  <p>support@dubpar.ru</p>
                </div>
              </div>
              <div className="support-channel">
                <i className="fas fa-telegram"></i>
                <div>
                  <strong>Telegram</strong>
                  <p>@dubpar_support</p>
                </div>
              </div>
              <div className="support-channel">
                <i className="fas fa-clock"></i>
                <div>
                  <strong>Время работы</strong>
                  <p>Пн-Пт: 10:00 – 20:00 (МСК)</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2>❓ Часто задаваемые вопросы</h2>
            
            <div className="faq-item">
              <details>
                <summary>Как восстановить пароль?</summary>
                <p>На странице входа нажмите «Забыли пароль?», введите email, и мы отправим инструкцию по восстановлению.</p>
              </details>
            </div>

            <div className="faq-item">
              <details>
                <summary>Можно ли удалить аккаунт?</summary>
                <p>Да, напишите нам в поддержку с запросом на удаление аккаунта. Мы обработаем запрос в течение 3 рабочих дней.</p>
              </details>
            </div>

            <div className="faq-item">
              <details>
                <summary>Как добавить свой материал на платформу?</summary>
                <p>Если вы хотите стать автором, напишите нам — мы обсудим возможности сотрудничества.</p>
              </details>
            </div>

            <div className="faq-item">
              <details>
                <summary>Где посмотреть прогресс изучения?</summary>
                <p>Прогресс отображается в вашем профиле. Также вы можете видеть прогресс по каждой теме в каталоге.</p>
              </details>
            </div>
          </section>

          <section>
            <h2>✉️ Написать в поддержку</h2>
            
            {error && <div className="auth-error" style={{ marginBottom: '16px' }}>{error}</div>}
            {success && <div className="auth-success" style={{ marginBottom: '16px' }}>{success}</div>}
            
            {submitted ? (
              <div className="support-success">
                <i className="fas fa-check-circle"></i>
                <h3>Спасибо за обращение!</h3>
                <p>Мы ответим вам в ближайшее время.</p>
                <button className="btn-submit" onClick={() => {
                  setSubmitted(false);
                  setSuccess('');
                  setError('');
                }}>
                  Написать ещё
                </button>
              </div>
            ) : (
              <form className="support-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Ваше имя *</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Введите имя"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="Введите email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Тема *</label>
                  <input
                    type="text"
                    name="subject"
                    placeholder="Кратко опишите вопрос"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Сообщение *</label>
                  <textarea
                    name="message"
                    placeholder="Опишите подробно вашу проблему..."
                    rows="5"
                    value={formData.message}
                    onChange={handleChange}
                    required
                  />
                </div>
                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-paper-plane"></i>
                  )}
                  {loading ? ' Отправка...' : ' Отправить'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Support;