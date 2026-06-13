FROM docker:27-cli

RUN apk add --no-cache bash curl git jq wget

COPY wait-for-ci.sh health-check.sh sync-production.sh entrypoint-sync.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/wait-for-ci.sh \
  /usr/local/bin/health-check.sh \
  /usr/local/bin/sync-production.sh \
  /usr/local/bin/entrypoint-sync.sh

WORKDIR /repo

ENTRYPOINT ["/usr/local/bin/entrypoint-sync.sh"]
