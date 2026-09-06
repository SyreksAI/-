import React from 'react';
import { Link } from 'react-router-dom';

function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-top">
          <Link to="/" className="legal-back">
            <i className="fas fa-arrow-left"></i> На главную
          </Link>
          <div className="legal-header">
            <h1>🔒 Политика конфиденциальности</h1>
            <p className="legal-date">Последнее обновление: 4 сентября 2026 г.</p>
          </div>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. Общие положения</h2>
            <p>
              Настоящая Политика конфиденциальности определяет порядок сбора, хранения,
              обработки и использования персональных данных пользователей платформы
              <strong> ДубльПар.рф</strong> (далее — «Платформа»).
            </p>
            <p>
              Используя Платформу, вы соглашаетесь с условиями настоящей Политики.
            </p>
          </section>

          <section>
            <h2>2. Какие данные мы собираем</h2>
            <ul>
              <li><strong>Имя и фамилия</strong> — для идентификации пользователя</li>
              <li><strong>Email</strong> — для входа и уведомлений</li>
              <li><strong>Имя пользователя (@username)</strong> — для отображения в чате и на форуме</li>
              <li><strong>IP-адрес и данные браузера</strong> — для защиты от мошенничества</li>
              <li><strong>Прогресс изучения</strong> — для отслеживания ваших успехов</li>
            </ul>
          </section>

          <section>
            <h2>3. Как мы используем ваши данные</h2>
            <ul>
              <li>Обеспечение работы Платформы</li>
              <li>Отправка уведомлений о новых материалах</li>
              <li>Персонализация контента</li>
              <li>Аналитика для улучшения Платформы</li>
              <li>Защита от мошенничества и спама</li>
            </ul>
          </section>

          <section>
            <h2>4. Передача данных третьим лицам</h2>
            <p>
              Мы <strong>не передаём</strong> ваши персональные данные третьим лицам,
              за исключением случаев, предусмотренных законодательством РФ.
            </p>
          </section>

          <section>
            <h2>5. Хранение и защита данных</h2>
            <p>
              Ваши данные хранятся на защищённых серверах в России.
              Мы используем современные методы шифрования для защиты вашей информации.
            </p>
          </section>

          <section>
            <h2>6. Ваши права</h2>
            <ul>
              <li>Просматривать свои данные в профиле</li>
              <li>Редактировать свои данные</li>
              <li>Удалить аккаунт (обратитесь в поддержку)</li>
              <li>Отписаться от уведомлений</li>
            </ul>
          </section>

          <section>
            <h2>7. Изменения в Политике</h2>
            <p>
              Мы оставляем за собой право обновлять данную Политику.
              Обновления публикуются на этой странице с указанием даты.
            </p>
          </section>

          <section>
            <h2>8. Контакты</h2>
            <p>
              По всем вопросам, связанным с конфиденциальностью, обращайтесь:
            </p>
            <p>
              <strong>Email:</strong> <a href="mailto:privacy@dubpar.ru">privacy@dubpar.ru</a>
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link to="/" className="btn-submit">
            <i className="fas fa-arrow-left"></i> Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Privacy;