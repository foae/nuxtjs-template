import { getAuth } from '../lib/auth'

export default defineNitroPlugin(() => {
  getAuth(useDb())
})
