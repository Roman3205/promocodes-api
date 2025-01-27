import { PrismaClient } from "@prisma/client";
import businessSchema from './schemas/businessSchema.js'
import { generateHash } from "./utils/hash.js";
import { createApp, createRouter, defineEventHandler, eventHandler, useBase, setResponseStatus, readValidatedBody, readBody, createError, useSession, getSession, getRequestURL, getRequestHeader, getRouterParams, setResponseHeader, getQuery, } from "h3";
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import jwt from 'jsonwebtoken'
// import { ofetch } from "ofetch";
import promoSchema from "./schemas/promoSchema.js";
import { randomUUID } from "node:crypto";
import userSchema from "./schemas/userSchema.js";
import commentSchema from "./schemas/commentSchema.js";
import redis from 'redis'

dayjs.extend(utc)
dotenv.config()
export const app = createApp({
    onError: (error) => {
        console.log(error)
    }
})

const client = redis.createClient({
    // url: 'redis://redis:6379',
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    },
    // password: 'password'
})
// client.on('error', (err) => console.log(err))

// (async () => {
//     await client.connect()
// })()

app.use(eventHandler(async (event) => {
    const protectedRoutes = ['/api/business/promo']

    const isProtected = protectedRoutes.some(route => {
        return event.path.startsWith(route)
    })

    if (!isProtected) {
        return
    }

    const token = getRequestHeader(event, 'Authorization')?.replace('Bearer ', '')
    if (!token) {
        throw createError({
            status: 401,
            data: { message: 'Unauthorized' }
        });
    }

    const id = jwt.verify(token, process.env.RANDOM_SECRET)

    if (id.person == 'user') {
        throw createError({
            status: 400,
            data: { message: 'Quit user account' }
        });
    }

    const business = await prisma.business.findFirst({ where: { id: id.id } })
    if (!business) {
        throw createError({
            status: 404,
            data: { message: 'Business account not found' }
        });
    }

    event.context.business = business
}))

app.use(eventHandler(async (event) => {
    const protectedRoutes = ['/api/user/promo', '/api/user/feed', '/api/user/profile']

    const isProtected = protectedRoutes.some(route => {
        return event.path.startsWith(route)
    })

    if (!isProtected) {
        return
    }

    const token = getRequestHeader(event, 'Authorization')?.replace('Bearer ', '')
    if (!token) {
        throw createError({
            status: 401,
            data: { message: 'Unauthorized' }
        });
    }
    const id = jwt.verify(token, process.env.RANDOM_SECRET)
    if (id.person == 'business') {
        throw createError({
            status: 400,
            data: { message: 'Quit business account' }
        });
    }

    const user = await prisma.user.findFirst({ where: { id: id.id } })
    if (!user) {
        throw createError({
            status: 404,
            data: { message: 'User not found' }
        });
    }

    event.context.user = user
}))
const router = createRouter()
app.use(router)
const api = createRouter()
const conn = process.env.POSTGRES_CONN.replace(/"/g, '')
console.log(conn);

const prisma = new PrismaClient()

const saveUserToken = async (id) => {
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

const saveBusinessToken = async (id) => {
    const token = jwt.sign({ id: id, person: 'business' }, process.env.RANDOM_SECRET, {
        expiresIn: '12h'
    })
    const savedToken = await prisma.tokenBusiness.create({
        data: {
            businessId: id,
            token: token
        }
    })
    return savedToken
}


api.get('/ping', eventHandler((event) => {
    return {
        status: "PROOOOOOOOOOOOOOOOOD",
    }
}))

api.post('/business/auth/sign-up', eventHandler(async (event) => {
    const { email, password, name } = await readBody(event)
    if (!email || !password || !name) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    const body = await readValidatedBody(event, businessSchema.parse)

    const existingEmail = await prisma.business.findFirst({ where: { email: body.email } })
    if (existingEmail) {
        throw createError({
            status: 409,
            data: { message: 'Email already registered' }
        });
    }
    const uuid = randomUUID()

    const business = await prisma.business.create({
        data: {
            email: body.email,
            password: await generateHash(body.password),
            name: body.name,
            uuid: uuid
        }
    })
    const savedToken = await saveBusinessToken(business.id)
    return {
        token: savedToken.token,
        company_id: business.id
    }
}))

api.post('/business/auth/sign-in', eventHandler(async (event) => {
    const body = await readBody(event)

    if (!body.email || !body.password) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    const business = await prisma.business.findFirst({
        where: {
            email: body.email
        }
    })

    if (!business) {
        throw createError({
            status: 404,
            data: { message: 'Business account not found' }
        })
    }

    let passwordCheck = bcrypt.compare(business.password, body.password)
    if (!passwordCheck) {
        throw createError({
            status: 401,
            data: { message: 'Incorrect password' }
        })
    }

    await prisma.tokenBusiness.deleteMany({
        where: {
            businessId: business.id
        }
    })

    const savedToken = await saveBusinessToken(business.id)

    return {
        token: savedToken.token,
    }
}))







api.post('/business/promo', eventHandler(async (event) => {
    const { business } = event.context

    const body = await readBody(event)

    if (!body.description || !body.max_count || !body.target || !body.mode) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    if (body.mode !== 'COMMON' && body.mode !== 'UNIQUE' || body.mode === 'COMMON' && !body.promo_common || body.mode === 'UNIQUE' && !body.promo_unique || body.mode === 'COMMON' && body.promo_unique || body.mode === 'UNIQUE' && body.promo_common) {
        throw createError({
            status: 400,
            data: { message: 'Incorrect mode' }
        });
    }

    const validatedBody = await readValidatedBody(event, promoSchema.parse)
    const uuid = randomUUID()
    const promo = await prisma.promocode.create({ data: { ...validatedBody, uuid: uuid, authorId: businessId.id } })
    await prisma.business.update({
        where: { id: business.id }, data: {
            promocodes: {
                connect: {
                    id: promo.id
                }
            }
        }
    })

    event.node.res.statusCode = 201
    return {
        id: uuid
    }
}))

api.get('/business/promo', eventHandler(async (event) => {

    return
}))

api.get('/business/promo/:id', eventHandler(async (event) => {
    const { id } = getRouterParams(event)
    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }
    const { business } = event.context
    const promo = await prisma.promocode.findFirst({ where: { uuid: id } })
    if (!promo) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    if (promo.authorId != business.id) {
        throw createError({
            status: 403,
            data: { message: 'It is not your promocode' }
        });
    }

    return promo
}))

api.patch('/business/promo/:id', eventHandler(async (event) => {
    const { business } = event.context

    const { id } = getRouterParams(event)

    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }
    const body = await readBody(event)
    const promo = await prisma.promocode.findFirst({ where: { uuid: id } })
    if (!promo) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    if (promo.authorId != businessId.id) {
        throw createError({
            status: 403,
            data: { message: 'It is not your promocode' }
        });
    }

    const validatedBody = await readValidatedBody(event, promoSchema.partial().parse)

    if (validatedBody.mode == 'UNIQUE' && promo.max_count > 1) {
        throw createError({
            status: 400,
            data: { message: 'It is unique promo' }
        });
    }

    if (promo.mode == 'UNIQUE' && validatedBody.max_count > 1) {
        throw createError({
            status: 400,
            data: { message: 'It is unique promo' }
        });
    }

    if (!validatedBody) {
        throw createError({
            status: 400,
            data: { message: 'Bad edit' }
        });
    }

    const updatedPromo = await prisma.promocode.update({
        where: { id: promo.id }, data: { ...validatedBody, target: validatedBody.target ? validatedBody.target : promo.target }
    })
    return updatedPromo
}))

api.get('/business/promo/list', eventHandler(async (event) => {
    return
}))
api.get('/business/promo/stat', eventHandler(async (event) => {
    return
}))





api.post('/user/auth/sign-up', eventHandler(async (event) => {
    const { email, password, name, surname, avatar_url, other } = await readBody(event)
    if (!email || !password || !name || !surname || !other?.age || !other?.country) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    const body = await readValidatedBody(event, userSchema.parse)

    const existingEmail = await prisma.user.findFirst({ where: { email: body.email } })
    if (existingEmail) {
        throw createError({
            status: 409,
            data: { message: 'Email already registered' }
        });
    }
    const user = await prisma.user.create({
        data: {
            email: body.email,
            password: await generateHash(body.password),
            name: body.name,
            surname: body.surname,
            avatar_url: body.avatar_url,
            other: body.other
        }
    })
    const savedToken = await saveUserToken(user.id)
    return {
        token: savedToken.token
    }
}))

api.post('/user/auth/sign-in', eventHandler(async (event) => {
    const body = await readBody(event)

    if (!body.email || !body.password) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    const user = await prisma.user.findFirst({
        where: {
            email: body.email
        }
    })

    if (!user) {
        throw createError({
            status: 404,
            data: { message: 'User not found' }
        })
    }

    let passwordCheck = bcrypt.compare(user.password, body.password)
    if (!passwordCheck) {
        throw createError({
            status: 401,
            data: { message: 'Incorrect password' }
        })
    }

    await prisma.tokenUser.deleteMany({
        where: {
            userId: user.id
        }
    })

    const savedToken = await saveUserToken(user.id)

    return {
        token: savedToken.token,
    }
}))

api.get('/user/profile', eventHandler(async (event) => {
    const { user } = event.context

    return user
}))

api.patch('/user/profile', eventHandler(async (event) => {
    const { user } = event.context

    const validatedBody = await readValidatedBody(event, userSchema.partial().parse)

    if (!validatedBody) {
        throw createError({
            status: 400,
            data: { message: 'Bad edit' }
        });
    }

    const existingEmail = await prisma.user.findFirst({ where: { email: validatedBody.email } })
    if (existingEmail) {
        throw createError({
            status: 409,
            data: { message: 'Email already registered' }
        });
    }

    const updatedUser = await prisma.user.update({
        where: { id: user.id }, data: { ...validatedBody, password: validatedBody.password ? await generateHash(validatedBody.password) : user.password }
    })
    return updatedUser
}))

api.get('/user/feed', eventHandler(async (event) => {
    const { user } = event.context

    const { limit, offset } = getQuery(event)

    let promocodes = await prisma.promocode.findMany({
        include: {
            author: true
        },
        skip: offset ? Number(offset) : 0,
        take: limit ? Number(limit) : 10,
    })

    promocodes = promocodes.filter((val) => {
        return ((val.mode == 'UNIQUE' && val.promo_unique.length > 0) ||
            (val.mode == 'COMMON' && val.used_count < val.max_count)) &&
            (((val.active_from ? dayjs().utc({ keepLocalTime: false }).isAfter(val.active_from) : false) || (val.active_until ? dayjs().utc({ keepLocalTime: false }).isAfter(val.active_until) : false)) || (val.active_until && val.active_from ? dayjs().utc({ keepLocalTime: false }).isAfter(val.active_from) && dayjs().utc({ keepLocalTime: false }).isBefore(val.active_until) : false))
    })
    const mappedPromocodes = promocodes.map((val) => ({
        promo_id: val.uuid,
        company_name: val.author.name,
        active: val.active,
    }))
    setResponseHeader(event, 'X-Total-Count', promocodes.length)
    return mappedPromocodes
}))

api.get('/user/promo/:id', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)
    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }, include: { author: true }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    return {
        promo_id: promocode.uuid,
        company_id: promocode.author.uuid,
        company_name: promocode.author.name,
        description: promocode.description,
        active: promocode.active,
        is_activated_by_user: user.activatedPromocodes.include(promocode.uuid) ? true : false,
        like_count: promocode.like_count,
        is_liked_by_user: user.likedPromocodes.include(promocode.uuid) ? true : false,
        comment_count: promocode.comments.length
    }
}))

api.post('/user/promo/:id/like', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)

    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }

    if (user.likedPromocodes.includes(promocode.uuid)) {
        event.node.res.statusCode = 200
        return 'Already liked'
    }
    await prisma.promocode.update({
        where: { uuid: promocode.uuid }, data: { like_count: { increment: 1 } }
    })

    await prisma.user.update({
        where: { id: user.id }, data: {
            likedPromocodes: { push: promocode.uuid }
        }
    })

    return 'Like has been set'
}))

api.delete('/user/promo/:id/like', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)

    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }

    if (user.likedPromocodes.includes(promocode.uuid)) {
        await prisma.promocode.update({
            where: { uuid: promocode.uuid }, data: { like_count: { decrement: 1 } }
        })

        await prisma.user.update({
            where: { id: user.id }, data: {
                likedPromocodes: user.likedPromocodes.filter((val) => val != promocode.uuid)
            }
        })

        event.node.res.statusCode = 200
        return 'Like has been deleted'
    }

    return 'You have not set the like'
}))

api.post('/user/promo/:id/comments', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)

    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    const body = await readBody(event)
    if (!body.text) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    const validatedBody = await readValidatedBody(event, commentSchema.parse)
    const comment = await prisma.comment.create({
        data: {
            uuid: randomUUID(),
            text: validatedBody.text,
            authorId: user.id,
            promocodeId: promocode.id,
        }
    })
    await prisma.user.update({
        where: { id: user.id }, data: {
            comments: { connect: { id: comment.id } }
        }
    })
    await prisma.promocode.update({
        where: { id: promocode.id }, data: {
            comments: { connect: { id: comment.id } }
        }
    })

    event.node.res.statusCode = 201
    return 'Comment has been created'
}))

api.get('/user/promo/:id/comments', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)

    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    const { limit, offset } = getQuery(event)
    let comments = await prisma.comment.findMany({
        where: { promocodeId: promocode.id }, skip: offset ? Number(offset) : 0,
        take: limit ? Number(limit) : 10
    })
    setResponseHeader(event, 'X-Total-Count', comments.length)

    return comments
}))

api.get('/user/promo/:id/comments/:comment_id', eventHandler(async (event) => {
    const { user } = event.context

    const { id, comment_id } = getRouterParams(event)

    if (!id || !comment_id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    const body = await readBody(event)
    if (!body.text) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    let comment = await prisma.comment.findFirst({
        where: { uuid: comment_id, promocodeId: promocode.id }
    })
    if (!promocode || !comment) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }
    return comment
}))

api.put('/user/promo/:id/comments/:comment_id', eventHandler(async (event) => {
    const { user } = event.context

    const { id, comment_id } = getRouterParams(event)

    if (!id || !comment_id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    const body = await readBody(event)
    if (!body.text) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    let comment = await prisma.comment.findFirst({
        where: { uuid: comment_id, promocodeId: promocode.id }
    })
    if (!promocode || !comment) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }

    if (comment.authorId != user.id) {
        throw createError({
            status: 403,
            data: { message: 'No access to comment' }
        });
    }

    const validatedBody = await readValidatedBody(event, commentSchema.parse)

    await prisma.comment.update({ where: { id: comment.id }, data: validatedBody })

    event.node.res.statusCode = 201
    return 'Comment has been updated'
}))

api.delete('/user/promo/:id/comments/:comment_id', eventHandler(async (event) => {
    const { user } = event.context

    const { id, comment_id } = getRouterParams(event)

    if (!id || !comment_id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    const body = await readBody(event)
    if (!body.text) {
        throw createError({
            status: 400,
            data: { message: 'Required data not provided' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }
    })
    let comment = await prisma.comment.findFirst({
        where: { uuid: comment_id, promocodeId: promocode.id }
    })
    if (!promocode || !comment) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }

    if (comment.authorId != user.id) {
        throw createError({
            status: 403,
            data: { message: 'No access to comment' }
        });
    }

    await prisma.user.update({
        where: { id: user.id }, data: {
            comments: user.comments?.filter((val) => val != comment.uuid)
        }
    })
    await prisma.promocode.update({
        where: { id: promocode.id }, data: {
            comments: promocode.comments?.filter((val) => val != comment.uuid)
        }
    })
    await prisma.comment.delete({ where: { id: comment.id } })
    return 'Deleted'
}))

api.post('/user/promo/:id/activate', eventHandler(async (event) => {
    const { user } = event.context

    const { id } = getRouterParams(event)
    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }

    let promocode = await prisma.promocode.findFirst({
        where: { uuid: id }, include: { author: true }
    })
    if (!promocode) {
        throw createError({
            status: 404,
            data: { message: 'Not found' }
        });
    }

    if (user.activatedPromocodes.includes(promocode.uuid)) {
        throw createError({
            status: 400,
            data: { message: 'You already activated this promocode' }
        });
    }
    let check = ((promocode.mode == 'UNIQUE' && promocode.promo_unique.length > 0) ||
        (promocode.mode == 'COMMON' && promocode.used_count < promocode.max_count))
    if (!promocode.active || user.other.country != promocode.target?.country || user.other.age < promocode.target?.age_from || user.other.age > promocode.target?.age_until) {
        throw createError({
            status: 400,
            data: { message: 'You are unable to activate this promocode' }
        });
    }
    let statusAF = 200;
    let response = { ok: true }
    // ${process.env.ANTIFRAUD_ADDRESS}/api/validate
    // const cachedData = await client.get('antifraud')
    // if (!cachedData) {
    // const response = await ofetch(`${process.env.ANTIFRAUD_ADDRESS}/api/validate`, {
    //     method: 'get',
    //     body: {
    //         user: user.email,
    //         promo_id: promocode.id
    //     },
    //     headers: {
    //         Accept: "application/json",
    //     },
    //     retry: 1,
    //     onResponse({ request, response, options }) {
    //         statusAF = response.status
    //     }
    // })
    // ok = response?.ok || response.data?.ok
    // await client.set('antifraud', response)
    // }

    if (!check || statusAF != 200 || !response.ok) {
        throw createError({
            status: 400,
            data: { message: 'You are unable to activate this promocode' }
        });
    }

    await prisma.promocode.update({
        where: { id: promocode.id }, data: {
            used_count: { increment: 1 }
        }
    })

    await prisma.user.update({
        where: { id: user.id }, data: {
            activatedPromocodes: { push: promocode.uuid }
        }
    })

    return promocode.mode == 'COMMON' ? promocode.promo_common : promocode.promo_unique
}))

api.get('/user/promo/history', eventHandler(async (event) => {
    const { user } = event.context

    const { limit, offset } = getQuery(event)

    const promocodes = await prisma.promocode.findMany({
        where: { uuid: { in: user.activatedPromocodes } }, skip: offset ? Number(offset) : 0,
        take: limit ? Number(limit) : 10,
        include: { author: true }
    })

    setResponseHeader(event, 'X-Total-Count', promocodes.length)

    const items = promocodes.map(promo => ({
        promo_id: promo.uuid,
        company_id: promo.author.uuid,
        company_name: promo.author.name,
        description: promo.description,
        active: promo.active,
        is_activated_by_user: user.activatedPromocodes.include(promo.uuid) ? true : false,
        like_count: promo.like_count,
        is_liked_by_user: user.likedPromocodes.include(promo.uuid) ? true : false,
        comment_count: promo.comments.length
    }))

    return items
}))

router.use('/api/**', useBase('/api', api.handler))