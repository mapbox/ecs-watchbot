FROM ubuntu:16.04

# Setup
RUN apt-get update -qq && apt-get install -y curl

# Install node.js
RUN curl -s https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh

# Setup application directory
RUN mkdir -p /usr/local/src/watchbot
WORKDIR /usr/local/src/watchbot

# npm installation
COPY ./package.json ./
RUN npm install --production

# Copy files into the container
COPY ./index.js ./
COPY ./lib ./lib
COPY ./bin ./bin

# Logging onto the host EC2
VOLUME /mnt/log

# Run the watcher
CMD ["/bin/sh", "-c", "npm start"]
