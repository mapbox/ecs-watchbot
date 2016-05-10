#!/usr/bin/env bash

set -eux

# Log docker client into ECR
eval "$(aws ecr get-login --region us-east-1)"

# Make sure the ECR repository exists
aws ecr describe-repositories --region us-east-1 --repository-names ecs-watchbot > /dev/null 2>&1 || \
  aws ecr create-repository --region us-east-1 --repository-name ecs-watchbot > /dev/null

# Fetch the ECR repository URI
desc=$(aws ecr describe-repositories --region us-east-1 --repository-names ecs-watchbot)
uri=$(node -e "console.log(${desc}.repositories[0].repositoryUri);")

# Build the docker image
docker build -t ecs-watchbot ./

# Tag the image into the ECR repository
docker tag ecs-watchbot "${uri}:$(git rev-parse head)"

# Push the image into the ECR repository
docker push "${uri}:$(git rev-parse head)"
