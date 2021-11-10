FROM node:14-bullseye

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm install -g npm
RUN npm install

COPY ./lib ./lib
COPY ./test ./test
COPY ./bin ./bin
COPY index.js index.js
