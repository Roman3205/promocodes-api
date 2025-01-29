import { z } from "zod";
export default z.object({
    description: z.string().min(10).max(300),
    target: z.object({
        age_from: z.number().min(0).max(100).optional(),
        age_until: z.number().min(0).max(100).optional(),
        country: z.string().toLowerCase().optional(),
        categories: z.array(z.string().toLowerCase().min(2).max(20)).max(20).optional()
    }).refine((val) => !val.country || val.country.length == 2).refine((val) => !val.age_from || !val.age_until || val.age_from < val.age_until),
    max_count: z.number().min(1),
    active_from: z.string().date().max(10).optional(),
    active_until: z.string().date().max(10).optional(),
    mode: z.string().refine((val) => val === 'COMMON' || val === 'UNIQUE'),
    promo_common: z.string().min(5).max(30).optional(),
    promo_unique: z.array(z.string().min(3).max(30)).min(1).max(5000).optional(),
    image_url: z.string().max(350).optional(),
    active: z.boolean().optional(),
    used_count: z.number().min(0).optional(),
    like_count: z.number().min(0).optional()
})