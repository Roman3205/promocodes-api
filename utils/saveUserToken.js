import { prisma } from "../app.mjs";
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

export default async (id) => {
    const token = jwt.sign({ id: id, person: 'user' }, process.env.RANDOM_SECRET, {
        expiresIn: '12h'
    })
    const savedToken = await prisma.tokenUser.create({
        data: {
            userId: id,
            token: token
        }
    })
    return savedToken
}