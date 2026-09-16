export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
export const PASSWORD_HINT =
  'Минимум 8 символов: заглавная и строчная буква, цифра и спецсимвол (!@#$%)';

export function getPasswordValidationError(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'Пароль должен содержать минимум 8 символов';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Пароль должен содержать заглавную букву';
  }
  if (!/[a-z]/.test(password)) {
    return 'Пароль должен содержать строчную букву';
  }
  if (!/\d/.test(password)) {
    return 'Пароль должен содержать цифру';
  }
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    return 'Пароль должен содержать спецсимвол (!@#$% и т.д.)';
  }
  return null;
}

export function validatePassword(password) {
  return getPasswordValidationError(password) === null;
}
