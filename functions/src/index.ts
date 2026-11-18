import { initializeApp } from 'firebase-admin/app'

// Region and limits are set on each function through lib/options.ts (see the note there).
initializeApp()

export { updateProfile } from './profile/updateProfile.js'
