const { z } = require('zod')
module.exports = z.object({
  name: z.string().min(5).max(50),
  email: z.string().email().min(8).max(120),
  password: z.string().min(8).max(60).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[!@#$%^&*()_+\-=\[\]]/),
})
