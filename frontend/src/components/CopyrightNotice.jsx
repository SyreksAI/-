import React from 'react';

import { COPYRIGHT_COMPANY, COPYRIGHT_SITE, COPYRIGHT_YEAR } from '../utils/copyright';

export default function CopyrightNotice({ className = '' }) {
  return (
    <div className={`auth-copyright${className ? ` ${className}` : ''}`}>
      <p className="auth-copyright__line">
        © {COPYRIGHT_YEAR}{' '}
        <span className="auth-copyright__brand">{COPYRIGHT_SITE}</span>
      </p>
      <p className="auth-copyright__line auth-copyright__rights">
        Все права защищены компанией{' '}
        <span className="auth-copyright__company">{COPYRIGHT_COMPANY}</span>
      </p>
    </div>
  );
}
