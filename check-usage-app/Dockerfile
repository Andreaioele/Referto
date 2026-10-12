FROM python:3.12-alpine
WORKDIR /app
COPY server.py index.html ./
RUN adduser -D app
USER app
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["python", "-u", "server.py"]
