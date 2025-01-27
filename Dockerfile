ARG NODE_VERSION=20.17.0

FROM node:${NODE_VERSION}

WORKDIR /

COPY package.json ./

RUN npm install
COPY . ./

RUN npx prisma generate
RUN npx prisma db push

EXPOSE 3030
CMD node ./server.mjs