FROM xataz/node:7-onbuild
MAINTAINER xataz <https://github.com/xataz>

ENV GID=991 \
    UID=991 \
    USERNAME="t411" \
    PASSWORD="t411" \
    ONLYVERIFIED=true \
    DEBUGVERIFIED=false

ADD startup /usr/local/bin/startup
RUN chmod +x /usr/local/bin/startup

EXPOSE 9876

CMD ["/usr/local/bin/startup"]
