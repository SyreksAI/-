import React from 'react';
import { Link } from 'react-router-dom';

function LegalLayout({ badge, title, date, children }) {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-top">
          <Link to="/" className="legal-back">
            <i className="fas fa-arrow-left" /> На главную
          </Link>
          <div className="legal-header">
            {badge && <div className="legal-badge">{badge}</div>}
            <h1>{title}</h1>
            {date && <p className="legal-date">Редакция от {date}</p>}
          </div>
        </div>

        <div className="legal-content">
          {children}
        </div>

        <div className="legal-footer">
          <Link to="/" className="btn-submit">
            <i className="fas fa-arrow-left" /> Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LegalLayout;
