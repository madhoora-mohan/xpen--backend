FROM node:lts-alpine
ENV MONGODB_URL process.env.MONGO_URL
ENV JWTPRIVATEKEY process.env.JWTPRIVATEKEY
ENV SALT process.env.SALT_ROUNDS
WORKDIR /usr/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD [ "npm", "start"]