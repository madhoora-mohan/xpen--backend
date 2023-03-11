FROM node:lts-alpine
ENV MONGODB_URL mongodb+srv://madhoora:xIqfHzqMEobYI8aC@expensetracker.xpnck6h.mongodb.net/?retryWrites=true&w=majority
ENV JWTPRIVATEKEY 8b0c01ed5c25e6b29fc20957d5add938920b258e7d3c83a9992424d41b7c4700968c7550f6fb3b5bd68b56fa0a7a8692d80986c637c82525df6cf75836f3b637
ENV SALT 10
WORKDIR /usr/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD [ "npm", "start"]