/** Registration date: DD.MM.YYYY without time. */
export function formatRegisteredDate(value) {
  if (!value) return '';

  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    return raw;
  }

  const datePart = raw.replace('T', ' ').split(' ')[0].slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [year, month, day] = datePart.split('-');
    return `${day}.${month}.${year}`;
  }

  return datePart;
}
