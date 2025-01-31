const { z } = require('zod')

module.exports = z.object({
    name: z.string().min(1).max(100),
    surname: z.string().min(1).max(120),
    avatar_url: z.string().min(1).max(350).optional(),
    other: z.object({
        age: z.number().min(0).max(100),
        country: z.string().toLowerCase().max(2).min(2)
    }),
    email: z.string().email().min(8).max(120),
    password: z.string().min(8).max(60).regex(/[!@#$%^&*()_+\-=\[\]]/).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
})
