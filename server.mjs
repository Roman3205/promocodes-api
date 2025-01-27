import { toNodeListener } from "h3";
import { app } from "./app.mjs";
import { createServer } from 'node:http'
import dotenv from 'dotenv'
dotenv.config()
createServer(toNodeListener(app)).listen(process.env.SERVER_PORT, () => console.log(`Server is running on ${process.env.SERVER_PORT} port`))