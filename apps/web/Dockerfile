# Placeholder — Frontend substitui pela imagem real da SPA
FROM alpine:3.20
RUN apk add --no-cache nginx
RUN printf 'server { listen 80; location / { return 200 "web placeholder — Frontend owns apps/web\\n"; } }\n' > /etc/nginx/http.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
