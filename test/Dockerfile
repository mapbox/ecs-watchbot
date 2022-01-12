# We use the AWS ECR version of this package to avoid any problems hitting rate
# limits fetching from DockerHub with the `node:12` image
FROM public.ecr.aws/docker/library/node:12

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm install -g npm
RUN npm install

COPY ./lib ./lib
COPY ./test ./test
COPY ./bin ./bin
COPY index.js index.js
