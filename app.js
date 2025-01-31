const { PrismaClient } = require("@prisma/client")
const businessSchema = require('./schemas/businessSchema')
const generateHash = require("./utils/hash")
const { createApp, createRouter, eventHandler, useBase, readValidatedBody, readBody, createError, getRequestHeader, getRouterParams, setResponseHeader, getQuery, } = require("h3")
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const promoSchema = require("./schemas/promoSchema")
const { randomUUID } = require("node:crypto")
const userSchema = require("./schemas/userSchema")
const commentSchema = require("./schemas/commentSchema")
// import redis =require( 'redis')
const saveUserToken = require("./utils/saveUserToken")
const saveBusinessToken = require("./utils/saveBusinessToken")
const checkPromoStatus = require("./utils/checkPromoStatus")
const checkPromoActiveViaDate = require('./utils/checkPromoActiveViaDate')
const dotEnv = require('dotenv')
dotEnv.config({ path: __dirname + '/.env' });
// import { ofetch } =require( "ofetch")

const app = createApp({
    onError: (error) => {
        console.log(error)
    }
})

// const client = redis.createClient({
// url: 'redis://redis:6379',
// socket: {
//     host: process.env.REDIS_HOST,
//     port: process.env.REDIS_PORT
// },
// password: 'password'
// })

// const connectRedis = async () => {
//     await client.connect()
// }
// connectRedis()

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
            data: { message: 'No authorization token passed' }

        });
    }

    const id = jwt.verify(token, process.env.RANDOM_SECRET, (error, decoded) => {
        if (error) {
            throw createError({
                status: 401,
                data: { message: 'Unauthorized' }
            });
        }

        return decoded
    })

    if (id.person == 'user') {
        throw createError({
            status: 400,
            data: { message: 'Quit user account' }
        });
    }

    const business = await prisma.business.findFirst({ where: { id: id.id }, omit: { password: false } })
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
            data: { message: 'No authorization token passed' }
        });
    }

    const id = jwt.verify(token, process.env.RANDOM_SECRET, (error, decoded) => {
        if (error) {
            throw createError({
                status: 401,
                data: { message: 'Unauthorized' }
            });
        }
        return decoded
    })

    if (id.person == 'business') {
        throw createError({
            status: 400,
            data: { message: 'Quit business account' }
        });
    }

    const user = await prisma.user.findFirst({ where: { id: id.id }, omit: { password: true } })
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

const prisma = new PrismaClient()

module.exports.prisma = prisma
module.exports.app = app

api.get('/ping', eventHandler(() => {
    return {
        status: "Works",
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

    if (validatedBody.mode == 'UNIQUE' && validatedBody.max_count > 1) {
        throw createError({
            status: 400,
            data: { message: 'It is unique promo' }
        });
    }

    const uuid = randomUUID()

    const promo = await prisma.promocode.create({ data: { ...validatedBody, uuid: uuid, authorId: business.id, active: checkPromoActiveViaDate(validatedBody.active_from, validatedBody.active_until) } })

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
    const { business } = event.context
    const { limit, offset, sort_by, country } = getQuery(event)

    let promocodes = await prisma.promocode.findMany({
        where: { authorId: business.id },
        skip: offset ? Number(offset) : 0,
        take: limit ? Number(limit) : 10,
        orderBy: sort_by == 'from' ? [{
            active_from: 'desc',
        }] : sort_by == 'until' ? [{
            active_until: 'desc',
        }] : [{ createdAt: 'desc' }]
    })

    if (country) {
        let countries = country?.split(',')
        countries = countries.map((country) => { return country.toLowerCase() })
        promocodes = promocodes.filter((promo) => {
            return countries.includes(promo.target?.country)
        })
    }

    setResponseHeader(event, 'X-Total-Count', promocodes.length)

    return promocodes
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
    const promo = await prisma.promocode.findFirst({ where: { uuid: id }, include: { author: true } })
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

    return {
        promo_id: promo.uuid,
        company_id: promo.author.uuid,
        company_name: promo.author.name,
        active: promo.active,
        image_url: promo.image_url,
        like_count: promo.like_count,
        used_count: promo.used_count
    }
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

    if (body.mode || body.promo_unique || body.promo_common || body.active || body.used_count || body.like_count) {
        throw createError({
            status: 400,
            data: { message: 'You can not edit mode settings or promo counts' }
        });
    }

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

    const validatedBody = await readValidatedBody(event, promoSchema.partial().parse)

    if (promo.mode == 'UNIQUE' && validatedBody.max_count > 1) {
        throw createError({
            status: 400,
            data: { message: 'It is unique promo' }
        });
    }

    if (promo.mode == 'COMMON' && promo.used_count > validatedBody.max_count) {
        throw createError({
            status: 400,
            data: { message: 'Used count exceeds max count' }
        });
    }

    const updatedPromo = await prisma.promocode.update({
        where: { id: promo.id }, data: {
            ...validatedBody,
            active: (validatedBody.max_count == promo.used_count || !checkPromoActiveViaDate(validatedBody.active_from, validatedBody.active_until)) ? false : true,
            target: validatedBody.target ? validatedBody.target : promo.target,
        },
        include: { author: true }
    })

    return {
        promo_id: updatedPromo.uuid,
        company_id: updatedPromo.author.uuid,
        company_name: updatedPromo.author.name,
        active: updatedPromo.active,
        image_url: promo.image_url,
        like_count: updatedPromo.like_count,
        used_count: updatedPromo.used_count
    }
}))

api.get('/business/promo/:id/stat', eventHandler(async (event) => {
    const { id } = getRouterParams(event)
    if (!id) {
        throw createError({
            status: 400,
            data: { message: 'No id passed' }
        });
    }
    const { business } = event.context
    const promo = await prisma.promocode.findFirst({ where: { uuid: id }, include: { author: true } })
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

    let countries = await prisma.user.findMany({ where: { activatedPromocodes: { has: promo.uuid } }, select: { other: true } })
    countries = countries.map(country => ({
        country: country.other?.country,
        activations_count: countries.filter(c => c.other?.country == country.other?.country).length
    }))

    let uniqueCountries = countries.filter((c, o, arr) => arr.findIndex((item) => JSON.stringify(item) === JSON.stringify(c)) === o)
    return {
        activations_count: uniqueCountries.reduce((acc, i) => acc + i.activations_count, 0),
        countries: uniqueCountries.sort((a, b) => {
            if (a.country < b.country) {
                return -1;
            }
            if (a.country > b.country) {
                return 1;
            }
            return 0;
        })
    }
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
    const body = await readBody(event)

    if (body.other || body.email) {
        throw createError({
            status: 400,
            data: { message: 'You can not edit email or other settings' }
        });
    }

    const validatedBody = await readValidatedBody(event, userSchema.partial().parse)

    const updatedUser = await prisma.user.update({
        where: { id: user.id }, data: { ...validatedBody, password: validatedBody.password ? await generateHash(validatedBody.password) : user.password }, omit: { password: false }
    })
    return updatedUser
}))

api.get('/user/feed', eventHandler(async (event) => {
    const { user } = event.context

    const { limit, offset, category, active } = getQuery(event)
    let promocodes = await prisma.promocode.findMany({
        include: {
            author: true
        },
        skip: offset ? Number(offset) : 0,
        take: limit ? Number(limit) : 10,
    })

    if (active == 'true' && category) {
        promocodes = promocodes.filter((val) => val.target.categories?.includes(category.toLowerCase()) && checkPromoStatus(val.active_from, val.active_until, val.mode, val.promo_unique, val.max_count, val.used_count, val.active))
    } else if (category && active != 'true') {
        promocodes = promocodes.filter((val) => val.target.categories?.includes(category.toLowerCase()))
    } else if (active == 'true' && !category) {
        promocodes = promocodes.filter((val) => {
            return checkPromoStatus(val.active_from, val.active_until, val.mode, val.promo_unique, val.max_count, val.used_count, val.active)
        })
    }

    const mappedPromocodes = promocodes.map((promo) => ({
        promo_id: promo.uuid,
        company_id: promo.author.uuid,
        company_name: promo.author.name,
        description: promo.description,
        active: promo.active,
        is_activated_by_user: user.activatedPromocodes.includes(promo.uuid) ? true : false,
        like_count: promo.like_count,
        is_liked_by_user: user.likedPromocodes.includes(promo.uuid) ? true : false,
        comment_count: promo.comments?.length,
        image_url: promo.image_url
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
        is_activated_by_user: user.activatedPromocodes.includes(promocode.uuid) ? true : false,
        like_count: promocode.like_count,
        image_url: promo.image_url,
        is_liked_by_user: user.likedPromocodes.includes(promocode.uuid) ? true : false,
        comment_count: promocode.comments?.length
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

    if (!promocode.active || (promocode.target.country && user.other.country != promocode.target.country) || (promocode.target.age_from && user.other.age < promocode.target?.age_from) || (promocode.target.age_until && user.other.age > promocode.target?.age_until)) {
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

    if (!checkPromoStatus(promocode.active_from, promocode.active_until, promocode.mode, promocode.promo_unique, promocode.max_count, promocode.used_count, promocode.active) || statusAF != 200 || !response.ok) {
        throw createError({
            status: 400,
            data: { message: 'You are unable to activate this promocode' }
        });
    }
    let promoValue;

    if (promocode.mode == 'COMMON') {
        await prisma.promocode.update({
            where: { id: promocode.id }, data: {
                used_count: { increment: 1 }
            }
        })

        promoValue = promocode.promo_common
    } else if (promocode.mode == 'UNIQUE') {
        let uniquePromo = promocode.promo_unique[0]
        await prisma.promocode.update({
            where: { id: promocode.id }, data: {
                promo_unique: promocode.promo_unique?.filter((val) => val != uniquePromo)
            }
        })

        promoValue = uniquePromo
    }

    await prisma.user.update({
        where: { id: user.id }, data: {
            activatedPromocodes: { push: promocode.uuid }
        }
    })

    return promoValue
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
        is_activated_by_user: user.activatedPromocodes.includes(promo.uuid) ? true : false,
        like_count: promo.like_count,
        is_liked_by_user: user.likedPromocodes.includes(promo.uuid) ? true : false,
        comment_count: promo.comments?.length,
        image_url: promo.image_url
    }))

    return items
}))

router.use('/api/**', useBase('/api', api.handler))