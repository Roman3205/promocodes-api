import { z } from "zod";
export default z.object({
    text: z.string().min(10).max(1000)
})
