const { z } = require('zod')

module.exports = z.object({
    text: z.string().min(10).max(1000)
})
