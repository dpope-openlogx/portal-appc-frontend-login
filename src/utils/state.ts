// src/utils/state.ts
// using in-memory shared state, most secure

let email: string | null = null;
let password: string | null = null;

export function setEmail(value: string) {
  email = value;
}

export function getEmail(): string | null {
  return email;
}

export function clearEmail() {
  email = null;
}

export function setPassword(value: string) {
  password = value;
}

export function getPassword(): string | null {
  return password;
}

export function clearPassword() {
  password = null;
}