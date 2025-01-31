ARG NODE_VERSION=20.17.0

FROM node:${NODE_VERSION}

WORKDIR /

COPY package.json ./

RUN npm install
COPY . ./

RUN npx tsc
RUN npx prisma generate
RUN npx prisma db push
COPY .env ./dist/

EXPOSE 3030
CMD node ./dist/server.js


# if you are unable to get .env entirely while executing build, use

# CMD ["sh", "-c", "npx tsc && npx prisma generate && npx prisma db push && move .env ./dist/ && node ./server.js"]