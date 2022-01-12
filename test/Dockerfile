# We use the ECR version of this package to avoid any problems hitting rate
# limits fetching from DockerHub with the `ubuntu:20.04` image
FROM public.ecr.aws/ubuntu/ubuntu:20.04

RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y python3 curl xz-utils

ENV NODE_VERSION 14.18.1

RUN curl -L -o node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" && \
        tar -xJf node.tar.xz -C /usr/local --strip-components=1 && \
        rm node.tar.xz && \
        ln -s /usr/local/bin/node /usr/local/bin/nodejs

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm install -g npm
RUN npm install

COPY ./lib ./lib
COPY ./test ./test
COPY ./bin ./bin
COPY index.js index.js
