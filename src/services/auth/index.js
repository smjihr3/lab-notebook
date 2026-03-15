/**
 * Google OAuth 유틸리티
 * access token은 메모리(authStore)에만 보관. localStorage 사용 금지.
 */

/**
 * Google ID 토큰을 디코딩해 유저 정보 추출
 * @param {string} credential - JWT credential from Google
 */
export function parseGoogleCredential(credential) {
  const payload = JSON.parse(atob(credential.split('.')[1]))
  return {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
  }
}
