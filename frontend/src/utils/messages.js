// frontend/src/utils/messages.js
export const MESSAGES = {
  // Успех
  COPY_SUCCESS: 'Текст скопирован в буфер обмена',
  MESSAGE_SENT: 'Сообщение отправлено',
  MESSAGE_EDITED: 'Сообщение отредактировано',
  MESSAGE_DELETED: 'Сообщение удалено',
  FILE_UPLOAD_SUCCESS: (count) => `${count} файлов загружено`,
  CHAT_PINNED: 'Чат закреплён в списке',
  CHAT_UNPINNED: 'Чат откреплён из списка',
  GROUP_CREATED: (name) => `Группа "${name}" создана`,
  GROUP_LEFT: (name) => `Вы вышли из группы "${name}"`,
  GROUP_DELETED: (name) => `Группа "${name}" удалена`,
  SUBSCRIPTION_APPROVED: 'Взаимная подписка установлена',
  SUBSCRIPTION_REQUESTED: 'Запрос на подписку отправлен',
  RENAME_SUCCESS: 'Чат переименован',
  SHARE_SUCCESS: 'Сообщение отправлено получателям',
  
  // Ошибки
  COPY_ERROR: 'Не удалось скопировать текст',
  SEND_ERROR: 'Ошибка отправки сообщения',
  DELETE_ERROR: 'Не удалось удалить сообщение',
  EDIT_ERROR: 'Ошибка редактирования сообщения',
  LOAD_ERROR: 'Не удалось загрузить данные',
  SUBSCRIPTION_ERROR: 'Ошибка при подписке',
  GROUP_CREATE_ERROR: 'Не удалось создать группу',
  GROUP_LEAVE_ERROR: 'Ошибка выхода из группы',
  GROUP_DELETE_ERROR: 'Не удалось удалить группу',
  RENAME_ERROR: 'Не удалось переименовать',
  
  // Предупреждения
  EMPTY_MESSAGE: 'Введите текст или выберите файл',
  EMPTY_GROUP_NAME: 'Введите название группы',
  EMPTY_GROUP_MEMBERS: 'Выберите хотя бы одного участника',
  EMPTY_CONTACTS: 'Выберите хотя бы один контакт',
  CHAT_DELETE_CONFIRM: 'Вы уверены, что хотите удалить этот чат?',
  GROUP_DELETE_CONFIRM: 'Вы уверены, что хотите удалить группу? Это действие необратимо!',
  GROUP_LEAVE_CONFIRM: (name) => `Вы уверены, что хотите выйти из группы "${name}"?`,
  MESSAGE_DELETE_CONFIRM: 'Вы уверены, что хотите удалить это сообщение?',
  MAX_PINNED: 'Максимум 5 чатов можно закрепить',
  NOT_AUTHORIZED: 'Вы не авторизованы',
  NOT_CONNECTED: 'Нет соединения с сервером',
  
  // Информация
  REPLY_STARTED: 'Вы отвечаете на сообщение',
  EDIT_STARTED: 'Редактирование сообщения',
  TYPING: 'Печатает...',
  ONLINE: 'Онлайн',
  OFFLINE: 'Офлайн',
  CONNECTED: 'Подключено к серверу',
  DISCONNECTED: 'Соединение потеряно',
  SEARCHING: 'Поиск...',
  NO_RESULTS: 'Ничего не найдено',
  NO_MESSAGES: 'Сообщений пока нет',
  NO_NOTIFICATIONS: 'Нет новых уведомлений',
  NO_CONTACTS: 'Нет доступных контактов',
  NO_MEDIA: 'В этой группе пока нет общих медиафайлов'
};

// Использование:
// import { MESSAGES } from '../utils/messages';
// addNotification(MESSAGES.COPY_SUCCESS, 'success', 2000);