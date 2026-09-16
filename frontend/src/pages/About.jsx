import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout';
import { OperatorContacts, OperatorRequisites } from '../components/OperatorInfo';
import { LEGAL_INFO } from '../utils/legalInfo';
import CopyrightNotice from '../components/CopyrightNotice';

function About() {
  return (
    <LegalLayout
      badge="О проекте"
      title={LEGAL_INFO.platformName}
      date={LEGAL_INFO.policyDate}
    >
      <section>
        <h2>Что такое {LEGAL_INFO.platformName}</h2>
        <p>
          <strong>{LEGAL_INFO.platformName}</strong> — образовательная платформа для изучения
          технологий программирования и смежных дисциплин. Здесь собраны учебные материалы,
          модули, комментарии, форум (чат) для общения и личный кабинет с прогрессом обучения.
        </p>
        <p>
          Платформа развивается и поддерживается компанией <strong>{LEGAL_INFO.operatorName}</strong>.
        </p>
      </section>

      <section>
        <h2>Возможности платформы</h2>
        <ul>
          <li>Каталог технологий и учебных тем с подтемами</li>
          <li>Отслеживание прогресса изучения материалов</li>
          <li>Forum — общий, личный и групповой чат между пользователями</li>
          <li>Комментарии к учебным материалам</li>
          <li>Личный профиль и настройки аккаунта</li>
          <li>Служба поддержки пользователей</li>
        </ul>
      </section>

      <section>
        <h2>Оператор и правообладатель</h2>
        <OperatorRequisites />
        <OperatorContacts />
      </section>

      <section>
        <h2>Юридические документы</h2>
        <ul>
          <li>
            <Link to="/privacy">Политика обработки персональных данных</Link>
          </li>
          <li>
            <Link to="/terms">Публичная оферта (пользовательское соглашение)</Link>
          </li>
          <li>
            <Link to="/support">Служба поддержки</Link>
          </li>
        </ul>
      </section>

      <section>
        <CopyrightNotice className="legal-about-copy" />
      </section>
    </LegalLayout>
  );
}

export default About;
