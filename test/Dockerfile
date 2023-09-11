# We use the AWS ECR version of this package to avoid any problems hitting rate
# limits fetching from DockerHub with the `node:18` image
FROM public.ecr.aws/docker/library/node:18

WORKDIR /usr/local/src/ecs-watchbot

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm ci

COPY . ./
