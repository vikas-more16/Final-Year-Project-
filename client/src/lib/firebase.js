import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

const auth = getAuth(app)
const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: 'select_account' })

const MESSAGES = {
  'auth/popup-blocked': 'Your browser blocked the Google popup. Allow popups and try again.',
  'auth/unauthorized-domain': 'This domain is not authorised for Google sign-in in Firebase.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project.',
  'auth/network-request-failed': 'Network error while contacting Google. Check your connection.',
}

/** Opens the Google popup and returns a Firebase ID token, or null if the user closed it. */
export async function getGoogleIdToken() {
  try {
    const { user } = await signInWithPopup(auth, provider)
    const idToken = await user.getIdToken()
    // Orchestra keeps its own session cookie, so the Firebase session is not needed afterwards.
    await signOut(auth)
    return idToken
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return null
    throw new Error(MESSAGES[err.code] || 'Google sign-in failed. Please try again.', { cause: err })
  }
}
