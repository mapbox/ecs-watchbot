from ubuntu

RUN apt-get update -qq && apt-get install -y curl
RUN curl https://s3.amazonaws.com/mapbox/apps/install-node/v2.0.0/run | NV=4.4.2 NP=linux-x64 OD=/usr/local sh
RUN npm install -g fastlog

CMD ["/bin/sh", "-c", "echo \"MessageId: $MessageId | Subject: $Subject | Message: $Message\" | FASTLOG_PREFIX='[${timestamp}] [watchbot-integration-test] '[${MessageId}] fastlog info >> /mnt/log/application.log"]
