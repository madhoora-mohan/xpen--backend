FROM node:lts-alpine
WORKDIR /usr/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "app.js"]
