ARG BUILD_FROM=alpine:3.23.4

FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/ash", "-o", "pipefail", "-c"]

RUN \
    set -o pipefail \
    \
    && apk add --no-cache --virtual .build-dependencies \
        tar=1.35-r4 \
        xz=5.8.3-r0 \
    \
    && apk add --no-cache \
        bash=5.3.3-r1

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js (latest available in Alpine)
RUN \
    apk add --no-cache \
        nodejs \
        npm

# Copy application files
WORKDIR /app
COPY package*.json ./
COPY src ./src
COPY app-config.json ./

# Install dependencies
RUN npm ci --only=production

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]