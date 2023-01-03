FROM node:18.12-slim AS builder
COPY ./ /app
WORKDIR /app
RUN npm ci && npm run bootstrap && npm run build-all

FROM ubuntu:focal
RUN mkdir -p /scripts/actions_runner_container_hooks
COPY --from=builder /app/packages/docker/dist/index.js /scripts/actions_runner_container_hooks/docker.js
COPY --from=builder /app/packages/k8s/dist/index.js /scripts/actions_runner_container_hooks/k8s.js

ARG UID=1001
ARG GID=1000
RUN groupadd --gid "${GID}" docker \
  && useradd -m -u "${UID}" -g "${GID}" docker \
  && apt-get update

RUN apt-get install -y curl 

RUN mkdir /actions-runner
WORKDIR /actions-runner

# Download the latest runner package
RUN curl -o actions-runner-linux-x64-2.300.2.tar.gz -L https://github.com/actions/runner/releases/download/v2.300.2/actions-runner-linux-x64-2.300.2.tar.gz

# Extract the installer
RUN tar xzf ./actions-runner-linux-x64-2.300.2.tar.gz
# Install the dependencies
RUN ./bin/installdependencies.sh

# There is a bug at the moment that the requires docker to be installed on the runner even when containers aren't required
# https://github.com/actions/runner-container-hooks/issues/30
RUN curl -o docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb https://download.docker.com/linux/ubuntu/dists/focal/pool/stable/amd64/docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb
RUN dpkg -i ./docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb

# Copy drone script and change owner of script folder
COPY ./scripts/drone.sh /scripts/drone.sh
RUN chown -R docker:docker /scripts

# Clean up downloaded files
RUN rm -rf ./actions-runner-linux-x64-2.300.2.tar.gz
RUN rm -rf ./docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb

USER 1001

