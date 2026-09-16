import React from 'react';
import { LEGAL_INFO, hasOperatorRequisites } from '../utils/legalInfo';

export function OperatorContacts() {
  return (
    <p>
      Контактные данные Оператора: email —{' '}
      <a href={`mailto:${LEGAL_INFO.privacyEmail}`}>{LEGAL_INFO.privacyEmail}</a>,
      служба поддержки —{' '}
      <a href={`mailto:${LEGAL_INFO.supportEmail}`}>{LEGAL_INFO.supportEmail}</a>.
      Сайт:{' '}
      <a href={LEGAL_INFO.siteUrl} target="_blank" rel="noopener noreferrer">
        {LEGAL_INFO.siteUrl}
      </a>.
    </p>
  );
}

export function OperatorRequisites() {
  if (!hasOperatorRequisites()) {
    return (
      <p>
        Оператор персональных данных: компания <strong>{LEGAL_INFO.operatorName}</strong>,
        правообладатель платформы <strong>{LEGAL_INFO.platformName}</strong>.
      </p>
    );
  }

  return (
    <div className="legal-requisites">
      <p>
        <strong>{LEGAL_INFO.operatorName}</strong>
        {LEGAL_INFO.inn && <> · ИНН {LEGAL_INFO.inn}</>}
        {LEGAL_INFO.ogrn && <> · ОГРН {LEGAL_INFO.ogrn}</>}
      </p>
      {LEGAL_INFO.legalAddress && <p>Адрес: {LEGAL_INFO.legalAddress}</p>}
      {LEGAL_INFO.phone && <p>Телефон: {LEGAL_INFO.phone}</p>}
      {LEGAL_INFO.roskomnadzorNumber && (
        <p>
          Реестр операторов Роскомнадзора: {LEGAL_INFO.roskomnadzorNumber}
          {LEGAL_INFO.roskomnadzorOrder && ` · ${LEGAL_INFO.roskomnadzorOrder}`}
          {LEGAL_INFO.roskomnadzorRegisteredAt && ` · дата уведомления: ${LEGAL_INFO.roskomnadzorRegisteredAt}`}
          {LEGAL_INFO.processingStartedAt && ` · дата начала обработки: ${LEGAL_INFO.processingStartedAt}`}
        </p>
      )}
    </div>
  );
}
